from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404, HttpResponse
from django.utils.text import slugify
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from blueprint_core import (TARGETS, compile_ir, generate, has_errors, library_as_dict, list_templates,
                            load_template, simulate, validate, zip_project)
from blueprint_core.generators.base import GeneratedFile

from . import ai
from .models import Project
from .serializers import DiagramVersionSerializer, ProjectSerializer, parse_diagram, save_version


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer

    def _owner(self):
        u = self.request.user
        return u if u.is_authenticated else None

    def get_queryset(self):
        return Project.objects.filter(owner=self._owner())

    def perform_create(self, serializer):
        serializer.save(owner=self._owner())

    @action(detail=True, methods=["get", "post"])
    def versions(self, request, pk=None):
        project = self.get_object()
        if request.method == "GET":
            return Response(DiagramVersionSerializer(project.versions.all()[:50], many=True).data)
        ser = DiagramVersionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        v = save_version(project, ser.validated_data["diagram"], ser.validated_data.get("note", ""))
        return Response(DiagramVersionSerializer(v).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def latest(self, request, pk=None):
        v = self.get_object().versions.first()
        if v is None:
            raise Http404
        return Response(DiagramVersionSerializer(v).data)


class BlockLibraryView(APIView):
    def get(self, request):
        return Response(library_as_dict())


class TemplateListView(APIView):
    def get(self, request):
        return Response(list_templates())


class TemplateDetailView(APIView):
    def get(self, request, template_id):
        try:
            return Response(load_template(template_id))
        except KeyError:
            raise Http404


class DiagramInput(serializers.Serializer):
    diagram = serializers.JSONField()

    def validate_diagram(self, value):
        return parse_diagram(value)


class ValidateView(APIView):
    def post(self, request):
        s = DiagramInput(data=request.data)
        s.is_valid(raise_exception=True)
        issues = validate(s.validated_data["diagram"])
        return Response({"issues": [i.to_dict() for i in issues], "has_errors": has_errors(issues)})


class SimulateInput(DiagramInput):
    event = serializers.CharField(max_length=80)
    payload = serializers.JSONField(required=False, default=dict)

    def validate_payload(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("payload must be an object")
        return value


class SimulateView(APIView):
    def post(self, request):
        s = SimulateInput(data=request.data)
        s.is_valid(raise_exception=True)
        diagram = s.validated_data["diagram"]
        issues = validate(diagram)
        if has_errors(issues):
            return Response({"detail": "Fix the errors first.", "issues": [i.to_dict() for i in issues]}, status=400)
        result = simulate(compile_ir(diagram), s.validated_data["event"], s.validated_data["payload"])
        return Response(result.to_dict(), status=200 if result.ok else 400)


class GenerateInput(DiagramInput):
    target = serializers.ChoiceField(choices=sorted(TARGETS), default="fastapi")


class GenerateView(APIView):
    throttle_scope = "generate"

    def post(self, request):
        s = GenerateInput(data=request.data)
        s.is_valid(raise_exception=True)
        diagram = s.validated_data["diagram"]
        issues = validate(diagram)
        if has_errors(issues):
            return Response({"detail": "Fix the errors first.", "issues": [i.to_dict() for i in issues]}, status=400)
        files = generate(compile_ir(diagram), s.validated_data["target"])
        slug = slugify(diagram.name) or "project"
        resp = HttpResponse(zip_project(files, root=slug), content_type="application/zip")
        resp["Content-Disposition"] = f'attachment; filename="{slug}-{s.validated_data["target"]}.zip"'
        return resp


class AIGenerateInput(DiagramInput):
    target = serializers.ChoiceField(choices=sorted(TARGETS))


class AIGenerateView(APIView):
    throttle_scope = "ai"

    def post(self, request):
        s = AIGenerateInput(data=request.data)
        s.is_valid(raise_exception=True)
        diagram = s.validated_data["diagram"]
        issues = validate(diagram)
        if has_errors(issues):
            return Response({"detail": "Fix the errors first.", "issues": [i.to_dict() for i in issues]}, status=400)
        target = s.validated_data["target"]
        try:
            files = generate(compile_ir(diagram), target)
            assisted_files = ai.generate_project_assist(diagram, target)
            allowed = {f.path for f in files}
            for path in assisted_files:
                if path != "AI_GENERATION_REVIEW.md" and path not in allowed:
                    raise ai.AIError("The assistant returned an unexpected project file.")
            replacements = {f.path: f.content for f in files}
            replacements.update(assisted_files)
            result = [GeneratedFile(path, content) for path, content in replacements.items()]
            slug = slugify(diagram.name) or "project"
            response = HttpResponse(zip_project(result, root=slug), content_type="application/zip")
            response["Content-Disposition"] = f'attachment; filename="{slug}-{target}-ai.zip"'
            return response
        except ai.AIUnavailable as exc:
            return Response({"detail": str(exc)}, status=503)
        except ai.AIError as exc:
            return Response({"detail": str(exc)}, status=502)


class AIInput(DiagramInput):
    mode = serializers.ChoiceField(choices=["explain", "suggest"])
    question = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")


class AIView(APIView):
    throttle_scope = "ai"

    def post(self, request):
        s = AIInput(data=request.data)
        s.is_valid(raise_exception=True)
        diagram = s.validated_data["diagram"].to_dict()
        try:
            fn = ai.explain if s.validated_data["mode"] == "explain" else ai.suggest
            return Response(fn(diagram, s.validated_data["question"]))
        except ai.AIUnavailable as exc:
            return Response({"detail": str(exc)}, status=503)
        except ai.AIError as exc:
            return Response({"detail": str(exc)}, status=502)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        User = get_user_model()
        username, password = str(request.data.get("username", "")).strip(), str(request.data.get("password", ""))
        if not username or User.objects.filter(username=username).exists():
            return Response({"detail": "Username missing or taken."}, status=400)
        try:
            validate_password(password)
        except DjangoValidationError as exc:
            return Response({"detail": list(exc.messages)}, status=400)
        User.objects.create_user(username=username, password=password)
        return Response({"detail": "Account created. POST /api/auth/token/ to log in."}, status=201)

from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework import serializers

from blueprint_core import Diagram, DiagramFormatError, load_template

from .models import DiagramVersion, Project


def parse_diagram(value) -> Diagram:
    try:
        d = Diagram.from_dict(value)
    except DiagramFormatError as exc:
        raise serializers.ValidationError(str(exc))
    if len(d.nodes) > settings.BLUEPRINT_MAX_NODES:
        raise serializers.ValidationError(f"Too many blocks (max {settings.BLUEPRINT_MAX_NODES})")
    return d


class DiagramField(serializers.JSONField):
    def to_internal_value(self, data):
        return parse_diagram(super().to_internal_value(data)).to_dict()


def save_version(project: Project, diagram: dict, note: str = "") -> DiagramVersion:
    for _ in range(3):  # retry if two saves race for the same number
        try:
            with transaction.atomic():
                last = project.versions.order_by("-number").first()
                v = DiagramVersion.objects.create(project=project, number=(last.number + 1) if last else 1,
                                                  diagram=diagram, note=note)
                project.save(update_fields=["updated_at"])
                return v
        except IntegrityError:
            continue
    raise serializers.ValidationError("Could not save; please retry")


class DiagramVersionSerializer(serializers.ModelSerializer):
    diagram = DiagramField()

    class Meta:
        model = DiagramVersion
        fields = ["number", "diagram", "note", "created_at"]
        read_only_fields = ["number", "created_at"]


class ProjectSerializer(serializers.ModelSerializer):
    latest_version = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ["id", "name", "template", "created_at", "updated_at", "latest_version"]
        read_only_fields = ["created_at", "updated_at"]

    def get_latest_version(self, obj) -> int | None:
        v = obj.versions.order_by("-number").first()
        return v.number if v else None

    def validate_template(self, value):
        if value:
            try:
                load_template(value)
            except KeyError:
                raise serializers.ValidationError(f"Unknown template '{value}'")
        return value

    def create(self, validated_data):
        project = super().create(validated_data)
        if project.template:
            diagram = load_template(project.template)
            diagram["name"] = project.name
        else:
            diagram = {"schema_version": "1", "name": project.name, "nodes": [], "edges": []}
        save_version(project, diagram, note="Created" + (f" from template {project.template}" if project.template else ""))
        return project

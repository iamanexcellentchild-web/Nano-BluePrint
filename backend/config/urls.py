from django.contrib import admin
from django.urls import include, path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from drf_spectacular.utils import extend_schema


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def authenticated_api_schema(request):
    return SpectacularAPIView.as_view()(request._request)


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def authenticated_api_docs(request):
    return SpectacularSwaggerView.as_view(url_name="schema")(request._request)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("projects.urls")),
    path("api/schema/", authenticated_api_schema, name="schema"),
    path("api/docs/", authenticated_api_docs, name="docs"),
]

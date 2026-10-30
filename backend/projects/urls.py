from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("projects", views.ProjectViewSet, basename="project")

urlpatterns = [
    path("", include(router.urls)),
    path("blocks/", views.BlockLibraryView.as_view()),
    path("templates/", views.TemplateListView.as_view()),
    path("templates/<str:template_id>/", views.TemplateDetailView.as_view()),
    path("schemas/", views.PublishedSchemaListView.as_view()),
    path("schemas/<slug:slug>/", views.PublishedSchemaDetailView.as_view()),
    path("schemas/<slug:slug>/use/", views.UsePublishedSchemaView.as_view()),
    path("validate/", views.ValidateView.as_view()),
    path("simulate/", views.SimulateView.as_view()),
    path("generate/", views.GenerateView.as_view()),
    path("generate/ai/", views.AIGenerateView.as_view()),
    path("ai/", views.AIView.as_view()),
    path("auth/register/", views.RegisterView.as_view()),
    path("auth/token/", obtain_auth_token),
]

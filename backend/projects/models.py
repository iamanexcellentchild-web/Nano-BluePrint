from django.conf import settings
from django.db import models


class Project(models.Model):
    # Nullable so anonymous projects work in DEBUG. Production endpoints require auth.
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
                              related_name="projects")
    name = models.CharField(max_length=120)
    template = models.CharField(max_length=60, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


class DiagramVersion(models.Model):
    """Every save is a new immutable version: undo, history, safe regeneration."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField()
    diagram = models.JSONField()
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-number"]
        constraints = [models.UniqueConstraint(fields=["project", "number"], name="uniq_project_version")]

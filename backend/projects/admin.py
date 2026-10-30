from django.contrib import admin

from .models import DiagramVersion, Project

admin.site.register(Project)
admin.site.register(DiagramVersion)

from django.contrib import admin

from .models import DiagramVersion, Project, PublishedSchema

admin.site.register(Project)
admin.site.register(DiagramVersion)
admin.site.register(PublishedSchema)

from django.conf import settings
from rest_framework.permissions import BasePermission


class DevOrAuthenticated(BasePermission):
    """Anonymous access only when DEBUG=1. Production requires a logged-in user."""

    def has_permission(self, request, view):
        return bool(settings.DEBUG or (request.user and request.user.is_authenticated))


class PublishedSchemaPermission(BasePermission):
    """Anyone can read published schemas; only their publisher can change them."""

    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return bool(settings.DEBUG or (request.user and request.user.is_authenticated))

    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        if request.user and request.user.is_authenticated:
            return obj.owner_id == request.user.pk
        return bool(settings.DEBUG and obj.owner_id is None)

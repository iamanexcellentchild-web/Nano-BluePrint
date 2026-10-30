from django.conf import settings
from rest_framework.permissions import BasePermission


class DevOrAuthenticated(BasePermission):
    """Anonymous access only when DEBUG=1. Production requires a logged-in user."""

    def has_permission(self, request, view):
        return bool(settings.DEBUG or (request.user and request.user.is_authenticated))

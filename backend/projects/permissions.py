from rest_framework.permissions import BasePermission


class PublishedSchemaPermission(BasePermission):
    """Signed-in users can browse schemas; only their publisher can change them."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        if request.user and request.user.is_authenticated:
            return obj.owner_id == request.user.pk
        return False

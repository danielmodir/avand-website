"""Consistent error bodies: {"error": "<code>", "detail": ...}.

`error` is a stable machine-readable code the client can switch on (and
translate); `detail` is for humans and field errors.
"""
from django.db import IntegrityError
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler


class ApiError(APIException):
    """Raise with a stable code: ApiError("task.subtask_depth", 400)."""

    def __init__(self, code, status_code=status.HTTP_400_BAD_REQUEST, detail=None, extra=None):
        self.status_code = status_code
        self.code = code
        self.extra = extra or {}
        super().__init__(detail or code, code)


class VersionConflict(ApiError):
    def __init__(self, current):
        super().__init__("version_conflict", status.HTTP_409_CONFLICT, "The item changed on another device.", {"current": current})


def api_exception_handler(exc, context):
    if isinstance(exc, IntegrityError):
        return Response({"error": "conflict", "detail": "The request conflicts with existing data."}, status=status.HTTP_409_CONFLICT)
    response = exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, ApiError):
        response.data = {"error": exc.code, "detail": str(exc.detail), **exc.extra}
    else:
        code = getattr(exc, "default_code", "error")
        response.data = {"error": code, "detail": response.data}
    return response

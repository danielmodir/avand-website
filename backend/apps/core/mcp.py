"""Connect to AI: each person's own MCP server (Streamable HTTP transport),
so Claude Code, Claude and other MCP clients can read and change that
person's tasks, habits and events (the tools: apps/planning/mcp.py).

  POST /api/v1/mcp/u/<key>   the personal link (Profile → Connect to AI)
  POST /api/v1/mcp           the same, with "Authorization: Bearer <key>"
  GET/POST/DELETE /me/mcp    the app: show, make (replaces) or remove the link

The key is the only credential, so it is stored hashed (lookup) and
encrypted (the app shows the link again); a new one kills the old.
Same behavior as the live PHP API: backend-php/lib/mcp.php.
"""
import hashlib
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.planning import mcp as tools

from .models import McpKey
from .security import new_secret_token, sha256_hex

KEY_PREFIX = "tjm_"
VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"]
BAD_LINK = "This Toojibee link is not valid (any more). Make a new one in the Toojibee app: Profile → Connect to AI."


def _box():
    return AESGCM(hashlib.sha256(f"toojibee-mcp-link:{settings.SECRET_KEY}".encode()).digest())


def _seal(key, user_id):
    nonce = os.urandom(12)
    return nonce + _box().encrypt(nonce, key.encode(), str(user_id).encode())


def _open(blob, user_id):
    blob = bytes(blob)
    try:
        return _box().decrypt(blob[:12], blob[12:], str(user_id).encode()).decode()
    except Exception:  # SECRET_KEY changed: the link can't be shown, make a new one
        return None


def link_url(request, key):
    return request.build_absolute_uri(f"/api/v1/mcp/u/{key}")


def link_state(request, user):
    row = McpKey.objects.filter(user=user).first()
    key = _open(row.key_enc, user.id) if row else None
    if key is None:
        return {"connected": False, "url": None, "created_at": None, "last_used_at": None}
    return {"connected": True, "url": link_url(request, key), "created_at": row.created_at, "last_used_at": row.last_used_at}


class McpLinkView(APIView):
    """GET /me/mcp, POST /me/mcp (a new link), DELETE /me/mcp."""

    throttle_scope = "mcp_link"

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == "POST" else super().get_throttles()

    def get(self, request):
        return Response(link_state(request, request.user))

    def post(self, request):
        key = KEY_PREFIX + new_secret_token()
        with transaction.atomic(using="default"):
            McpKey.objects.filter(user=request.user).delete()
            McpKey.objects.create(user=request.user, key_hash=sha256_hex(key), key_enc=_seal(key, request.user.id))
        return Response(link_state(request, request.user))

    def delete(self, request):
        McpKey.objects.filter(user=request.user).delete()
        return Response(link_state(request, request.user))


def _rpc(rid, result=None, error=None, status=200):
    body = {"jsonrpc": "2.0", "id": rid}
    body.update({"error": error} if error else {"result": result})
    return JsonResponse(body, status=status, json_dumps_params={"ensure_ascii": False})


def _user_for(request, key):
    if key is None:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            key = header[7:].strip()
    if not key or not key.startswith(KEY_PREFIX) or len(key) > 100:
        return None
    row = McpKey.objects.select_related("user").filter(key_hash=sha256_hex(key)).first()
    if row is None or not row.user.can_use_api:
        return None
    McpKey.objects.filter(pk=row.pk).update(last_used_at=timezone.now())
    return row.user


class _Throttle(ScopedRateThrottle):
    """ScopedRateThrottle for a plain Django view: keyed by the account."""

    def __init__(self, ident):
        self.ident = ident
        super().__init__()

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.ident}


@method_decorator(csrf_exempt, name="dispatch")
class McpView(View):
    """The JSON-RPC endpoint. Not a DRF view: the Bearer token here is an
    MCP key, not an access token (AccessTokenAuthentication would refuse it)."""

    def _allowed(self, request, scope, ident):
        t = _Throttle(ident)
        t.scope = scope
        t.rate = t.get_rate()
        t.num_requests, t.duration = t.parse_rate(t.rate)
        return t.allow_request(request, self)

    def get(self, request, key=None):
        return JsonResponse({"error": "method_not_allowed"}, status=405, headers={"Allow": "POST"})

    delete = get

    def post(self, request, key=None):
        try:
            msg = json.loads(request.body or b"null")
        except ValueError:
            msg = None
        if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
            return _rpc(None, error={"code": -32700, "message": "Parse error"}, status=400)
        user = _user_for(request, key)
        if user is None:
            from .security import client_ip
            if not self._allowed(request, "mcp_bad", client_ip(request) or "unknown"):
                return JsonResponse({"error": "throttled"}, status=429)
            return _rpc(msg.get("id"), error={"code": -32001, "message": BAD_LINK}, status=401)
        if not self._allowed(request, "mcp", str(user.id)):
            return JsonResponse({"error": "throttled"}, status=429)

        method = msg.get("method") if isinstance(msg.get("method"), str) else ""
        # Notifications and client responses carry no id: 202, no body.
        if "id" not in msg or not method:
            return HttpResponse(status=202)
        rid = msg["id"]
        params = msg.get("params") if isinstance(msg.get("params"), dict) else {}

        if method == "initialize":
            asked = str(params.get("protocolVersion", ""))
            return _rpc(rid, {
                "protocolVersion": asked if asked in VERSIONS else VERSIONS[1],
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "toojibee", "title": "Toojibee", "version": "1.0.0"},
                "instructions": tools.INSTRUCTIONS,
            })
        if method == "ping":
            return _rpc(rid, {})
        if method == "tools/list":
            return _rpc(rid, {"tools": tools.TOOLS})
        if method == "tools/call":
            name = str(params.get("name", ""))
            args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
            if name not in tools.TOOL_NAMES:
                return _rpc(rid, error={"code": -32602, "message": f"Unknown tool: {name}"})
            try:
                out = tools.call(user.id, name, args)
            except tools.ToolError as e:
                return _rpc(rid, {"content": [{"type": "text", "text": str(e)}], "isError": True})
            text = json.dumps(out, ensure_ascii=False, separators=(",", ":"), default=str)
            return _rpc(rid, {"content": [{"type": "text", "text": text}], "isError": False})
        return _rpc(rid, error={"code": -32601, "message": "Method not found"})

"""Smart TV v3 API. Local TV and TLS phone applications share bounded services.

The TLS application intentionally contains no legacy REST/editor/CDP proxy routes.
"""
from __future__ import annotations

import asyncio
from collections import OrderedDict
import hmac
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import secrets
import ssl
import time
import unicodedata
from urllib.parse import urlsplit

from aiohttp import web, WSMsgType

from browser_ctl import ChromiumController, LAUNCHER_URL
from smart_tv_ha import HAError, HomeAssistant
from smart_tv_store import Store, DEFAULT_SETTINGS, DEFAULT_PROFILE

VERSION = "3.0.0"
PREFIX = "/api/v3"
COOKIE = "__Host-smarttv"
ROOT = Path(__file__).resolve().parent
HEADERS = {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
}
TYPES = {"html": "text/html", "js": "application/javascript", "css": "text/css",
         "svg": "image/svg+xml", "png": "image/png", "webp": "image/webp",
         "woff2": "font/woff2", "webmanifest": "application/manifest+json", "json": "application/json"}
ASSET = re.compile(r"(?:(?:icons|fonts|img)/)?[a-z0-9][a-z0-9_-]*\.(?:html|js|css|svg|png|webp|woff2|webmanifest|json)")
ENTITY = re.compile(r"(light|switch|scene|script|sensor|climate|weather|media_player)\.[a-z0-9_]{1,100}")
IDENTIFIER = re.compile(r"[a-z0-9][a-z0-9_-]{0,39}")
COLOR = re.compile(r"#[0-9a-fA-F]{6}")
APPS = [
    {"id": "netflix", "name": "Netflix", "url": "https://www.netflix.com/"},
    {"id": "max", "name": "Max", "url": "https://play.max.com/"},
    {"id": "prime", "name": "Prime Video", "url": "https://www.primevideo.com/"},
    {"id": "youtube", "name": "YouTube", "url": "https://www.youtube.com/"},
    {"id": "spotify", "name": "Spotify", "url": "https://open.spotify.com/"},
    {"id": "home_assistant", "name": "Home Assistant", "url": "http://localhost:8123"},
    {"id": "browser", "name": "Przeglądarka", "url": None},
]
HA_SETTINGS = {"tv_entity", "tv_source", "weather_entity", "entities", "movie_scene", "movie_lights",
               "movie_brightness", "movie_app", "movie_volume", "assist_enabled"}
TV_READY_STATES = {"on", "playing", "paused", "idle", "buffering"}


class APIError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def error_payload(code, message):
    return {"error": {"code": code, "message": message}}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value, lower, upper):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and lower <= value <= upper


def valid_url(value):
    require(isinstance(value, str) and len(value) <= 2048 and not any(ord(c) < 33 for c in value), "Invalid URL")
    parts = urlsplit(value)
    require(parts.scheme in {"http", "https"} and parts.hostname and not parts.username and not parts.password, "Use an http(s) URL without credentials")
    # Accessing port validates malformed ports as well.
    require(parts.port is None or 1 <= parts.port <= 65535, "Invalid URL port")
    return value


def validate_settings(patch):
    require(isinstance(patch, dict) and not set(patch) - DEFAULT_SETTINGS.keys(), "Unknown settings")
    for key, value in patch.items():
        if key == "safe_area": require(number(value, 0, 10), "safe_area must be 0..10")
        elif key == "touchpad_speed": require(number(value, .25, 3), "Invalid touchpad speed")
        elif key == "accent": require(isinstance(value, str) and COLOR.fullmatch(value), "Invalid accent")
        elif key == "animation": require(value in ("full", "reduced", "off"), "Invalid animation")
        elif key == "wallpaper": require(value in ("dusk", "aurora", "midnight", "slate"), "Invalid wallpaper")
        elif key in ("night_mode", "assist_enabled"): require(isinstance(value, bool), "Expected boolean")
        elif key in ("tv_entity", "weather_entity", "movie_scene"):
            domain = {"tv_entity": "media_player", "weather_entity": "weather", "movie_scene": "scene"}[key]
            require(isinstance(value, str) and (not value or ENTITY.fullmatch(value) and value.startswith(domain + ".")), "Invalid entity")
        elif key in ("entities", "movie_lights"):
            require(isinstance(value, list) and len(value) <= 24 and len(set(map(str, value))) == len(value), "At most 24 distinct entities")
            require(all(isinstance(e, str) and ENTITY.fullmatch(e) and (key != "movie_lights" or e.startswith("light.")) for e in value), "Invalid entities")
        elif key == "tv_source": require(isinstance(value, str) and len(value) <= 120, "Invalid TV source")
        elif key == "movie_brightness": require(number(value, 0, 100), "Invalid movie brightness")
        elif key == "movie_volume": require(value is None or number(value, 0, 1), "Invalid movie volume")
        elif key == "movie_app": require(isinstance(value, str) and IDENTIFIER.fullmatch(value), "Invalid app ID")
        elif key == "shortcuts":
            require(isinstance(value, list) and len(value) <= 20, "At most 20 shortcuts")
            seen = {a["id"] for a in APPS}
            for item in value:
                require(isinstance(item, dict) and set(item) == {"id", "name", "url"}, "Invalid shortcut")
                require(isinstance(item["id"], str) and IDENTIFIER.fullmatch(item["id"]) and item["id"] not in seen, "Duplicate/invalid shortcut ID")
                require(isinstance(item["name"], str) and 1 <= len(item["name"].strip()) <= 60, "Invalid shortcut name")
                valid_url(item["url"])
                seen.add(item["id"])
    return patch


class Limiter:
    """Fixed windows, bounded keys; clients cannot allocate unbounded peer state."""
    def __init__(self):
        self.windows = OrderedDict()

    def check(self, key, limit, seconds):
        now = time.monotonic()
        start, count = self.windows.pop(key, (now, 0))
        if now - start >= seconds:
            start, count = now, 0
        self.windows[key] = (start, count + 1)
        if len(self.windows) > 512:
            self.windows.popitem(last=False)
        if count >= limit:
            raise APIError("rate_limited", "Too many requests; try again later", 429)


class SmartTV:
    def __init__(self, store=None, ha=None, browser=None, *, remote_origin=None):
        self.store = store or Store(os.getenv("SMART_TV_DB", "/config/smart-tv/state.sqlite3"))
        self.ha = ha or HomeAssistant()
        self.browser = browser or ChromiumController()
        self.remote_origin = (remote_origin if remote_origin is not None else os.getenv("SMART_TV_ORIGIN", "")).rstrip("/")
        if self.remote_origin:
            parsed = urlsplit(valid_url(self.remote_origin))
            require(parsed.scheme == "https" and parsed.path == "" and not parsed.query and not parsed.fragment, "remote origin must be https://hostname:port")
            # Remote listener is LAN-only in configuration; never trust forwarding headers.
        self.pin = None
        self.limiter = Limiter()
        self.sockets = {}
        self.operation = None
        self.operations = OrderedDict()
        self.launch_task = None
        self.input_lock = asyncio.Lock()
        self.input_pending = 0
        self.state_lock = asyncio.Lock()
        self.state_cache = None
        self.state_cached_at = 0
        self.tv_timeout = 40
        self.closed = False
        self.remote_enabled = False
        self.refresh_task = None

    def local(self, request):
        return (not request.secure and not request.get("remote_app", False)
                and request.remote in ("127.0.0.1", "::1")
                and re.fullmatch(r"127\.0\.0\.1(?::\d+)?", request.host) is not None)

    def authorize(self, request):
        local = self.local(request)
        origin = request.headers.get("Origin")
        expected = f"http://{request.host}" if local else self.remote_origin
        if not local and (not request.secure or not expected or f"https://{request.host}" != expected):
            raise APIError("forbidden", "Use the configured local HTTPS address", 403)
        if not local:
            try:
                peer = ipaddress.ip_address(request.remote or "")
                require(peer.is_private or peer.is_loopback, "Private LAN required")
            except ValueError:
                raise APIError("private_lan", "Remote access is limited to private LAN peers", 403) from None
        if origin and origin != expected:
            raise APIError("origin", "Foreign origin rejected", 403)
        if request.headers.get("Sec-Fetch-Site") == "cross-site":
            raise APIError("origin", "Cross-site requests rejected", 403)
        mutation = request.method not in {"GET", "HEAD"} or request.path == PREFIX + "/ws"
        if mutation and origin != expected:
            raise APIError("origin", "An exact Origin header is required", 403)
        if request.method in {"POST", "PUT", "PATCH"} and request.content_type != "application/json":
            raise APIError("content_type", "Use application/json", 415)
        request["local_tv"] = local
        public = request.path in {PREFIX + "/health", PREFIX + "/pairing/complete"}
        if public:
            return
        device = {"id": "local-tv", "name": "TV", "created_at": 0, "expires_at": 0} if local else self.store.authenticate(request.cookies.get(COOKIE))
        if not device:
            raise APIError("unauthorized", "Pair this device at the TV", 401)
        request["device"] = device
        self.limiter.check(("api", device["id"]), 600, 10)

    @web.middleware
    async def middleware(self, request, handler):
        if not request.path.startswith(PREFIX + "/") and not request.path.startswith("/remote"):
            return await handler(request)
        try:
            if request.path.startswith(PREFIX + "/"):
                self.authorize(request)
            elif not self.local(request) and (not request.secure or f"https://{request.host}" != self.remote_origin):
                raise APIError("forbidden", "Use configured HTTPS address", 403)
            response = await handler(request)
        except APIError as exc:
            response = web.json_response(error_payload(exc.code, exc.message), status=exc.status)
            if exc.status == 429:
                response.headers["Retry-After"] = "60"
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            response = web.json_response(error_payload("invalid_request", "Invalid request or unsupported action"), status=400)
        except HAError:
            response = web.json_response(error_payload("ha_unavailable", "Home Assistant unavailable or action failed"), status=502)
        except web.HTTPException as exc:
            response = web.json_response(error_payload("http_error", exc.reason), status=exc.status)
        except Exception:
            # Do not echo upstream URLs, payloads, cookies or credentials.
            response = web.json_response(error_payload("unavailable", "Controller unavailable; check local services"), status=503)
        if not response.prepared:
            for key, value in HEADERS.items():
                response.headers.setdefault(key, value)
        return response

    async def payload(self, request):
        if request.content_length is not None and request.content_length > 16384:
            raise web.HTTPRequestEntityTooLarge(max_size=16384, actual_size=request.content_length)
        raw = await asyncio.wait_for(request.content.read(16385), timeout=5)
        if len(raw) > 16384:
            raise web.HTTPRequestEntityTooLarge(max_size=16384, actual_size=len(raw))
        value = json.loads(raw)
        require(isinstance(value, dict), "JSON object required")
        return value

    def tv_only(self, request):
        if not request.get("local_tv"):
            raise APIError("tv_only", "Change this setting on the TV", 403)

    def apps(self):
        apps = [dict(a, icon=a["id"], kind="builtin") for a in APPS]
        destination = (os.getenv("HA_URL", "http://localhost:8123").rstrip("/") + "/" + os.getenv("HA_DASHBOARD", "").lstrip("/"))
        try:
            apps[5]["url"] = valid_url(destination)
        except ValueError:
            apps[5]["url"] = "http://localhost:8123/"
        apps += [dict(a, icon="shortcut", kind="shortcut") for a in self.store.settings()["shortcuts"]]
        return apps

    async def tv_state(self):
        try:
            result = await self.ha.tv(self.store.settings())
            result["is_muted"] = result.get("is_volume_muted")
            return result
        except HAError:
            return {"configured": bool(self.store.settings()["tv_entity"]), "state": "unavailable",
                    "entity_id": self.store.settings()["tv_entity"], "source": None, "source_list": [],
                    "capabilities": {"power": False, "volume": False, "mute": False, "source": False},
                    "error": "Home Assistant unavailable"}

    async def snapshot(self, local=False):
        # Cache/serialize upstream work across concurrent phones and WS reconnects.
        async with self.state_lock:
            if self.state_cache is None or time.monotonic() - self.state_cached_at >= 5:
                settings = self.store.settings()
                tv, home = await asyncio.gather(self.tv_state(), self.ha.home(settings))
                self.state_cache = {"tv": tv, "home": home}
                self.state_cached_at = time.monotonic()
        result = {"version": VERSION, "apps": self.apps(), "recent": self.store.get("recent", []),
                  "profiles": self.store.profiles(), "active_profile_id": self.store.get("active_profile_id", "default"),
                  "settings": self.store.settings(), **self.state_cache, "operation": self.operation,
                  "capabilities": {"voice": "assist_text" if self.store.settings()["assist_enabled"] else "text",
                                   "audio_stt": False, "remote_https": self.remote_enabled}}
        if local:
            active = self.pin is not None and self.pin["expires_at"] > time.time()
            result["pairing"] = {"active": active, **({"pin": self.pin["value"], "expires_at": self.pin["expires_at"]} if active else {})}
        return result

    async def broadcast(self, payload, *, local_only=False):
        # At most eight small queues; lagging clients are disconnected by writer.
        for ws, info in list(self.sockets.items()):
            if local_only and not info["local"]:
                continue
            queue = info["queue"]
            if queue.full():
                info["overflow"] = True
            else:
                queue.put_nowait(payload)

    async def changed(self):
        self.state_cache = None
        await self.broadcast({"type": "state_changed"})

    async def health(self, _):
        return web.json_response({"status": "ok", "version": VERSION})

    async def pairing_start(self, request):
        self.tv_only(request)
        await self.payload(request)
        self.limiter.check("pin_start", 5, 60)
        self.pin = {"value": f"{secrets.randbelow(1000000):06d}", "expires_at": time.time() + 120, "attempts": 0}
        await self.changed()
        return web.json_response({"pin": self.pin["value"], "expires_at": self.pin["expires_at"],
                                  "remote_url": self.remote_origin + "/remote/" if self.remote_origin else ""})

    async def pairing_cancel(self, request):
        self.tv_only(request)
        await self.payload(request)
        self.pin = None
        await self.changed()
        return web.json_response({"ok": True})

    async def pairing_complete(self, request):
        # Must never set a Secure cookie via the loopback HTTP listener.
        if not request.secure:
            raise APIError("https_required", "Pair through HTTPS", 403)
        self.limiter.check("pair_global", 20, 60)
        self.limiter.check(("pair", request.remote), 5, 60)
        data = await self.payload(request)
        pin = data.get("pin")
        name = data.get("device_name", "Telefon")
        require(isinstance(pin, str) and re.fullmatch(r"\d{6}", pin), "Invalid PIN")
        require(isinstance(name, str) and 1 <= len(name.strip()) <= 60 and not any(ord(c) < 32 for c in name), "Invalid device name")
        current = self.pin
        if not current or current["expires_at"] <= time.time():
            raise APIError("invalid_pin", "PIN invalid or expired", 401)
        current["attempts"] += 1
        matches = hmac.compare_digest(pin, current["value"])
        if current["attempts"] >= 5 or matches:
            self.pin = None
        if not matches:
            raise APIError("invalid_pin", "PIN invalid or expired", 401)
        device, token = self.store.add_device(name.strip())
        response = web.json_response({"device": device})
        response.set_cookie(COOKIE, token, max_age=30 * 86400, secure=True, httponly=True, samesite="Strict", path="/")
        await self.broadcast({"type": "pairing", "state": "completed", "device": {"id": device["id"], "name": device["name"]}}, local_only=True)
        await self.changed()
        return response

    async def session(self, request):
        return web.json_response({"device": request["device"], "local": request["local_tv"]})

    async def logout(self, request):
        await self.payload(request)
        self.store.revoke(request["device"]["id"])
        await self.close_device(request["device"]["id"])
        response = web.json_response({"ok": True})
        response.set_cookie(COOKIE, "", max_age=0, expires="Thu, 01 Jan 1970 00:00:00 GMT",
                            path="/", secure=True, httponly=True, samesite="Strict")
        return response

    async def devices(self, _):
        return web.json_response({"devices": self.store.devices()})

    async def revoke(self, request):
        target = request.match_info["id"]
        if not request["local_tv"] and target != request["device"]["id"]:
            raise APIError("tv_only", "Revoke other phones at the TV", 403)
        self.store.revoke(target)
        await self.close_device(target)
        return web.json_response({"ok": True})

    async def close_device(self, device_id):
        for ws, info in list(self.sockets.items()):
            if info["id"] == device_id:
                await ws.close(code=1008, message=b"Session revoked")

    async def state(self, request):
        return web.json_response(await self.snapshot(request["local_tv"]))

    async def get_apps(self, _):
        return web.json_response({"apps": self.apps(), "recent": self.store.get("recent", [])})

    async def profiles(self, _):
        return web.json_response({"profiles": self.store.profiles(), "active_profile_id": self.store.get("active_profile_id", "default")})

    async def profile_put(self, request):
        data = await self.payload(request)
        pid = request.match_info["id"]
        require(IDENTIFIER.fullmatch(pid), "Invalid profile ID")
        require(not set(data) - {"id", "name", "avatar", "color", "favorites", "app_order", "preferences"}, "Unknown profile field")
        profiles = self.store.profiles()
        existing = next((p for p in profiles if p["id"] == pid), None)
        require(existing is not None or len(profiles) < 12, "Profile limit reached")
        profile = {**(existing or DEFAULT_PROFILE), **data, "id": pid}
        require(isinstance(profile["name"], str) and 1 <= len(profile["name"].strip()) <= 40, "Invalid profile name")
        require(isinstance(profile["avatar"], str) and re.fullmatch(r"a(?:[1-9]|1[0-2])", profile["avatar"]), "Invalid avatar")
        require("color" not in profile or isinstance(profile["color"], str) and COLOR.fullmatch(profile["color"]), "Invalid color")
        app_ids = {a["id"] for a in self.apps()}
        for key in ("favorites", "app_order"):
            value = profile[key]
            require(isinstance(value, list) and len(value) <= 27 and all(isinstance(v, str) and v in app_ids for v in value) and len(set(value)) == len(value), "Invalid app list")
        prefs = profile["preferences"]
        require(isinstance(prefs, dict) and not set(prefs) - {"accent", "wallpaper", "animation"}, "Invalid preferences")
        validate_settings(prefs)
        self.store.put("profiles", [p for p in profiles if p["id"] != pid] + [profile])
        await self.changed()
        return web.json_response({"profile": profile})

    async def profile_delete(self, request):
        profiles = [p for p in self.store.profiles() if p["id"] != request.match_info["id"]]
        require(profiles, "At least one profile must remain")
        self.store.put("profiles", profiles)
        if self.store.get("active_profile_id", "default") not in {p["id"] for p in profiles}:
            self.store.put("active_profile_id", profiles[0]["id"])
        await self.changed()
        return web.json_response({"ok": True})

    async def profile_active(self, request):
        pid = (await self.payload(request)).get("profile_id")
        require(pid in {p["id"] for p in self.store.profiles()}, "Unknown profile")
        self.store.put("active_profile_id", pid)
        await self.changed()
        return web.json_response({"active_profile_id": pid})

    async def settings(self, request):
        if request.method == "PATCH":
            patch = validate_settings(await self.payload(request))
            if set(patch) & HA_SETTINGS:
                self.tv_only(request)
            merged = {**self.store.settings(), **patch}
            self.store.put("settings", merged)
            if "shortcuts" in patch:
                ids = {a["id"] for a in self.apps()}
                profiles = self.store.profiles()
                for profile in profiles:
                    for key in ("favorites", "app_order"):
                        profile[key] = [a for a in profile[key] if a in ids]
                self.store.put("profiles", profiles)
                self.store.put("recent", [a for a in self.store.get("recent", []) if a in ids])
            await self.changed()
        return web.json_response({"settings": self.store.settings()})

    async def tv(self, request):
        if request.method == "POST":
            data = await self.payload(request)
            result = await self.ha.tv_action(self.store.settings(), data.get("action"), source=data.get("source"), muted=data.get("muted"))
            result["is_muted"] = result.get("is_volume_muted")
            await self.changed()
            return web.json_response({"tv": result})
        return web.json_response(await self.tv_state())

    async def home(self, _):
        return web.json_response(await self.ha.home(self.store.settings()))

    async def home_available(self, request):
        self.tv_only(request)
        states = await self.ha.request("GET", "/states")
        require(isinstance(states, list), "Invalid upstream state list")
        entities = []
        for state in states:
            entity = state.get("entity_id", "")
            if not ENTITY.fullmatch(entity):
                continue
            domain = entity.split(".")[0]
            attrs = state.get("attributes", {})
            if domain == "sensor" and attrs.get("device_class") not in {"temperature", "humidity"}:
                continue
            entities.append({"entity_id": entity, "name": str(attrs.get("friendly_name", entity))[:120],
                             "domain": domain, "state": str(state.get("state", "unknown"))[:100]})
            if len(entities) == 500:
                break
        return web.json_response({"entities": entities})

    async def home_action(self, request):
        data = await self.payload(request)
        await self.ha.home_action(self.store.settings(), data.get("entity_id"), data.get("action"), data.get("brightness_pct"))
        await self.changed()
        return web.json_response({"ok": True})

    async def operation_get(self, request):
        operation = self.operations.get(request.match_info["id"])
        if not operation:
            raise web.HTTPNotFound()
        return web.json_response({"operation": operation})

    async def stage(self, operation, name):
        operation["stage"] = name
        await self.broadcast({"type": "operation", "operation": dict(operation)})

    def launch(self, data, *, movie=False):
        if self.launch_task and not self.launch_task.done():
            raise APIError("busy", "Another launch is in progress", 409)
        app_id = data.get("app_id", self.store.settings()["movie_app"] if movie else None)
        if "url" in data:
            url = valid_url(data["url"])
            app_id = "browser"
        else:
            app = next((a for a in self.apps() if a["id"] == app_id), None)
            require(app and app["url"], "Unknown app or URL required")
            url = valid_url(app["url"])
        pid = data.get("profile_id", self.store.get("active_profile_id", "default"))
        require(pid in {p["id"] for p in self.store.profiles()}, "Unknown profile")
        operation = {"id": secrets.token_hex(10), "state": "running", "stage": "queued", "app_id": app_id, "error": None}
        self.operations[operation["id"]] = operation
        if len(self.operations) > 20:
            self.operations.popitem(last=False)
        self.operation = operation
        self.launch_task = asyncio.create_task(self.run_launch(operation, url, pid, movie))
        return dict(operation)

    async def launch_endpoint(self, request):
        data = await self.payload(request)
        return web.json_response({"operation": self.launch(data, movie=request.path.endswith("/movie"))}, status=202)

    async def run_launch(self, operation, url, pid, movie):
        try:
            settings = self.store.settings()
            if settings["tv_entity"]:
                tv = await self.ha.tv(settings, fresh=True)
                if tv["state"] not in TV_READY_STATES:
                    await self.stage(operation, "powering_on")
                    await self.ha.tv_action(settings, "on")
                    await self.stage(operation, "waiting_tv")
                    deadline = time.monotonic() + self.tv_timeout
                    while time.monotonic() < deadline:
                        tv = await self.ha.tv(settings, fresh=True)
                        if tv["state"] in TV_READY_STATES:
                            break
                        await asyncio.sleep(1)
                    else:
                        raise HAError("TV readiness timeout")
                if settings["tv_source"] and tv.get("source") != settings["tv_source"]:
                    await self.stage(operation, "selecting_source")
                    # Fails explicitly if HA does not advertise source capability.
                    await self.ha.tv_action(settings, "source", source=settings["tv_source"])
            if movie:
                await self.stage(operation, "scene")
                # TV-only movie selection is a separate capability: do not expose
                # those entities as direct phone controls unless also selected there.
                movie_settings = {**settings, "entities": settings["movie_lights"] + ([settings["movie_scene"]] if settings["movie_scene"] else [])}
                if settings["movie_scene"]:
                    await self.ha.home_action(movie_settings, settings["movie_scene"], "turn_on")
                for entity in settings["movie_lights"]:
                    await self.ha.home_action(movie_settings, entity, "turn_on", settings["movie_brightness"])
                if settings["movie_volume"] is not None and settings["tv_entity"]:
                    tv = await self.ha.tv(settings, fresh=True)
                    require(tv.get("supported_features", 0) & 4, "TV volume setting unsupported")
                    await self.ha.service("media_player", "volume_set", settings["tv_entity"], volume_level=settings["movie_volume"])
            await self.stage(operation, "launching")
            await self.browser.navigate(url)
            recent = [operation["app_id"]] + [a for a in self.store.get("recent", []) if a != operation["app_id"]]
            self.store.put("recent", recent[:10])
            self.store.put("active_profile_id", pid)
            operation["state"] = "completed"
            await self.stage(operation, "completed")
        except asyncio.CancelledError:
            operation.update(state="failed", stage="failed", error={"code": "cancelled", "message": "Server stopped"})
            raise
        except Exception as exc:
            code = "ha_unavailable" if isinstance(exc, HAError) else "launch_failed"
            operation.update(state="failed", error={"code": code, "message": "Launch failed; check TV configuration and Chrome"})
            await self.stage(operation, "failed")
        finally:
            await self.changed()

    async def xinput(self, *args):
        process = await asyncio.create_subprocess_exec("xdotool", *args,
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        try:
            await asyncio.wait_for(process.wait(), timeout=2)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise RuntimeError("X input timed out") from None
        if process.returncode:
            raise RuntimeError("X input unavailable")

    async def input(self, data, device_id):
        if self.input_pending >= 12:
            raise APIError("busy", "Input queue full", 429)
        self.input_pending += 1
        try:
            async with asyncio.timeout(8):
                await self._input(data, device_id)
        finally:
            self.input_pending -= 1

    async def _input(self, data, device_id):
        require(isinstance(data, dict), "Invalid input")
        self.limiter.check(("input", device_id), 60, 1)
        self.limiter.check("input_global", 180, 1)
        kind = data.get("type")
        async with self.input_lock:
            if kind in {"pointer", "scroll"}:
                require(number(data.get("dx", 0), -500, 500) and number(data.get("dy", 0), -500, 500), "Invalid delta")
                dx, dy = round(data.get("dx", 0)), round(data.get("dy", 0))
                if kind == "pointer":
                    await self.xinput("mousemove_relative", "--", str(dx), str(dy))
                else:
                    for delta, positive, negative in ((dy, "5", "4"), (dx, "7", "6")):
                        if delta:
                            await self.xinput("click", "--repeat", str(min(10, max(1, abs(delta) // 40))), "--delay", "0", positive if delta > 0 else negative)
            elif kind == "click":
                require(data.get("button", "left") in {"left", "right"}, "Invalid mouse button")
                await self.xinput("click", "1" if data.get("button", "left") == "left" else "3")
            elif kind == "text":
                text = data.get("text")
                require(isinstance(text, str) and len(text) <= 2000 and not any(ord(c) < 32 and c not in "\n\t" for c in text), "Invalid text")
                async def insert(page, _):
                    return await page.call("Input.insertText", {"text": text})
                await self.browser._with_page(insert)
            elif kind == "key":
                key = data.get("key")
                keys = {"up": ("ArrowUp", 38), "down": ("ArrowDown", 40), "left": ("ArrowLeft", 37),
                        "right": ("ArrowRight", 39), "ok": ("Enter", 13), "backspace": ("Backspace", 8),
                        "play_pause": ("MediaPlayPause", 179)}
                if key == "home":
                    await self.browser.navigate(LAUNCHER_URL)
                elif key == "back":
                    async def back(page, target):
                        parsed = urlsplit(target.get("url", ""))
                        local_page = parsed.hostname == "127.0.0.1" and parsed.path.startswith("/launcher")
                        result = await page.call("Runtime.evaluate", {"expression": "Boolean(document.fullscreenElement)", "returnByValue": True})
                        if local_page or result.get("result", {}).get("value"):
                            for event in ("keyDown", "keyUp"):
                                await page.call("Input.dispatchKeyEvent", {"type": event, "key": "Escape", "windowsVirtualKeyCode": 27})
                        else:
                            history = await page.call("Page.getNavigationHistory")
                            index = history.get("currentIndex", 0)
                            if index > 0:
                                await page.call("Page.navigateToHistoryEntry", {"entryId": history["entries"][index - 1]["id"]})
                    await self.browser._with_page(back)
                else:
                    require(isinstance(key, str) and key in keys, "Unsupported key")
                    name, code = keys[key]
                    async def dispatch(page, _):
                        for event in ("keyDown", "keyUp"):
                            await page.call("Input.dispatchKeyEvent", {"type": event, "key": name,
                                "code": name if name != "Enter" else "Enter", "windowsVirtualKeyCode": code,
                                **({"text": "\r"} if key == "ok" and event == "keyDown" else {})})
                    await self.browser._with_page(dispatch)
            else:
                raise ValueError("Unknown input type")

    async def input_endpoint(self, request):
        await self.input(await self.payload(request), request["device"]["id"])
        return web.json_response({"ok": True})

    async def voice(self, request):
        data = await self.payload(request)
        text = data.get("text")
        require(isinstance(text, str) and 1 <= len(text.strip()) <= 500, "Invalid command")
        normalized = unicodedata.normalize("NFKD", text.lower().replace("ł", "l"))
        normalized = "".join(c for c in normalized if not unicodedata.combining(c))
        normalized = re.sub(r"[^a-z0-9 ]", " ", normalized)
        command = " ".join(normalized.split())
        aliases = {"netflix": "netflix", "youtube": "youtube", "you tube": "youtube", "max": "max",
                   "prime video": "prime", "spotify": "spotify", "home assistant": "home_assistant"}
        result = {"handled": True, "command": command}
        for name, app_id in aliases.items():
            if command in {"otworz " + name, "wlacz " + name, "uruchom " + name}:
                result["operation"] = self.launch({"app_id": app_id})
                return web.json_response(result)
        settings = self.store.settings()
        if command in {"wroc do menu", "menu", "ekran glowny"}:
            await self.input({"type": "key", "key": "home"}, request["device"]["id"])
        elif command in {"pauza", "wznow", "odtwarzaj"}:
            await self.input({"type": "key", "key": "play_pause"}, request["device"]["id"])
        elif command in {"wlacz telewizor", "wylacz telewizor", "zwieksz glosnosc", "zmniejsz glosnosc"}:
            action = {"wlacz telewizor": "on", "wylacz telewizor": "off", "zwieksz glosnosc": "volume_up", "zmniejsz glosnosc": "volume_down"}[command]
            await self.ha.tv_action(settings, action)
        elif command in {"wlacz swiatlo", "wylacz swiatlo"}:
            lights = [e for e in settings["entities"] if e.startswith("light.")]
            require(lights, "Select lights on TV first")
            for entity in lights:
                await self.ha.home_action(settings, entity, "turn_on" if command.startswith("wlacz") else "turn_off")
        elif command in {"wlacz tryb filmowy", "wieczor filmowy"}:
            result["operation"] = self.launch({}, movie=True)
        elif settings["assist_enabled"]:
            # Explicit TV opt-in: Assist can control entities exposed to HA's agent.
            response = await self.ha.request("POST", "/conversation/process", {"text": text, "language": "pl"})
            speech = response.get("response", {}).get("speech", {}).get("plain", {}).get("speech", "")
            result.update(command="assist", response=str(speech)[:1000])
        else:
            raise APIError("unknown_command", "Polecenie nierozpoznane. Użyj przycisków lub skonfiguruj Assist.", 400)
        await self.changed()
        return web.json_response(result)

    async def websocket(self, request):
        local, device_id = request["local_tv"], request["device"]["id"]
        if len(self.sockets) >= 8 or sum(i["id"] == device_id for i in self.sockets.values()) >= 2:
            raise APIError("connection_limit", "Too many connections", 429)
        ws = web.WebSocketResponse(heartbeat=25, receive_timeout=65, max_msg_size=16384)
        await ws.prepare(request)
        info = {"id": device_id, "local": local, "queue": asyncio.Queue(maxsize=16), "overflow": False}
        self.sockets[ws] = info
        async def writer():
            try:
                while not ws.closed:
                    token = request.cookies.get(COOKIE)
                    if info["overflow"] or (not local and not self.store.authenticate(token)):
                        await ws.close(code=1008, message=b"Session invalid or client too slow")
                        return
                    try:
                        payload = await asyncio.wait_for(info["queue"].get(), 5)
                    except asyncio.TimeoutError:
                        continue
                    await asyncio.wait_for(ws.send_json(payload), 5)
            except (asyncio.TimeoutError, OSError):
                await ws.close(code=1008, message=b"Client too slow or disconnected")
        task = asyncio.create_task(writer())
        try:
            info["queue"].put_nowait({"type": "state", "state": await self.snapshot(local)})
            async for message in ws:
                if message.type != WSMsgType.TEXT:
                    break
                message_id = None
                try:
                    require(local or self.store.authenticate(request.cookies.get(COOKIE)), "Session revoked")
                    payload = json.loads(message.data)
                    require(isinstance(payload, dict), "Invalid message")
                    message_id = payload.get("id")
                    require(isinstance(message_id, (str, int)) and not isinstance(message_id, bool) and len(str(message_id)) <= 64, "Invalid message ID")
                    self.limiter.check(("ws", device_id), 70, 1)
                    if payload.get("type") == "ping":
                        info["queue"].put_nowait({"type": "pong", "id": message_id})
                    elif payload.get("type") == "input":
                        await self.input(payload.get("input"), device_id)
                        info["queue"].put_nowait({"type": "ack", "id": message_id, "ok": True})
                    else:
                        raise ValueError("Unknown message type")
                except Exception as exc:
                    code = exc.code if isinstance(exc, APIError) else "invalid_input"
                    if info["queue"].full():
                        await ws.close(code=1008, message=b"Too many pending messages")
                        break
                    info["queue"].put_nowait({"type": "error", "id": message_id,
                        "error": {"code": code, "message": "Input rejected or controller unavailable"}})
        finally:
            self.sockets.pop(ws, None)
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        return ws

    async def asset(self, request):
        name = request.match_info.get("asset", "index.html")
        if not ASSET.fullmatch(name):
            raise web.HTTPNotFound()
        path = ROOT / "remote" / name
        if not path.is_file() or not path.resolve().is_relative_to((ROOT / "remote").resolve()):
            raise web.HTTPNotFound()
        return web.Response(body=path.read_bytes(), content_type=TYPES[name.rsplit(".", 1)[1]], headers=HEADERS)

    def routes(self, app):
        handlers = [("GET", "/health", self.health), ("POST", "/pairing/start", self.pairing_start),
            ("POST", "/pairing/cancel", self.pairing_cancel), ("POST", "/pairing/complete", self.pairing_complete),
            ("GET", "/session", self.session), ("POST", "/session/logout", self.logout),
            ("GET", "/devices", self.devices), ("DELETE", "/devices/{id}", self.revoke),
            ("GET", "/state", self.state), ("GET", "/apps", self.get_apps),
            ("POST", "/apps/launch", self.launch_endpoint), ("GET", "/operations/{id}", self.operation_get),
            ("POST", "/movie", self.launch_endpoint), ("POST", "/input", self.input_endpoint),
            ("GET", "/tv", self.tv), ("POST", "/tv", self.tv), ("GET", "/profiles", self.profiles),
            ("PUT", "/profiles/{id}", self.profile_put), ("DELETE", "/profiles/{id}", self.profile_delete),
            ("POST", "/profiles/active", self.profile_active), ("GET", "/settings", self.settings),
            ("PATCH", "/settings", self.settings), ("GET", "/home", self.home),
            ("GET", "/home/available", self.home_available), ("POST", "/home/action", self.home_action),
            ("POST", "/voice/text", self.voice), ("GET", "/ws", self.websocket)]
        for method, path, handler in handlers:
            app.router.add_route(method, PREFIX + path, handler)
        app.router.add_get("/remote", self.asset)
        app.router.add_get("/remote/", self.asset)
        app.router.add_get("/remote/{asset:.*}", self.asset)

    def remote_app(self):
        @web.middleware
        async def remote_flag(request, handler):
            request["remote_app"] = True
            return await handler(request)
        app = web.Application(middlewares=[remote_flag, self.middleware], client_max_size=16384)
        self.routes(app)
        return app

    async def start(self, _=None):
        async def refresh():
            while True:
                await asyncio.sleep(30)
                if not self.sockets:
                    continue
                old = self.state_cache
                try:
                    self.state_cached_at = 0
                    await self.snapshot()
                    if old != self.state_cache:
                        await self.broadcast({"type": "state_changed"})
                except Exception:
                    # A temporarily unavailable upstream must not kill refresh.
                    continue
        self.refresh_task = asyncio.create_task(refresh())

    async def close(self, _=None):
        if self.closed:
            return
        self.closed = True
        if self.refresh_task:
            self.refresh_task.cancel()
            await asyncio.gather(self.refresh_task, return_exceptions=True)
        if self.launch_task and not self.launch_task.done():
            self.launch_task.cancel()
            await asyncio.gather(self.launch_task, return_exceptions=True)
        await asyncio.gather(*(ws.close(code=1001, message=b"Server stopping") for ws in list(self.sockets)), return_exceptions=True)
        await self.ha.close()
        self.store.close()


def tls_context():
    """Remote is opt-in. Never fall back to cleartext or an unverified certificate."""
    if os.getenv("SMART_TV_REMOTE", "false").lower() != "true":
        return None
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(os.getenv("SMART_TV_CERT", "/config/smart-tv/tls/server.crt"),
                            os.getenv("SMART_TV_KEY", "/config/smart-tv/tls/server.key"))
    return context

"""Real HTTP/TLS/WS security and workflow tests; HA, X11 and CDP are explicit fixtures.

No physical TV, VOD login, HDMI, audio or hardware DRM result is implied.
"""
import asyncio
from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import tempfile
import unittest
from unittest.mock import AsyncMock

from aiohttp import CookieJar, web, WSMsgType
from aiohttp.test_utils import TestClient, TestServer

from browser_ctl import ChromiumController
from smart_tv import SmartTV, COOKIE, PREFIX, validate_settings, valid_url
from smart_tv_ha import HomeAssistant, HAError
from smart_tv_store import Store, DEFAULT_SETTINGS


class FakeBrowser:
    def __init__(self):
        self.navigate = AsyncMock()
        self.calls = []

    async def _with_page(self, worker):
        owner = self
        class Page:
            async def call(self, method, params=None):
                owner.calls.append((method, params))
                return {"result": {"value": False}}
        return await worker(Page(), {"url": "http://127.0.0.1:8080/launcher"})


class FakeHA:
    def __init__(self):
        self.on = False
        self.calls = []
        self.supports_source = True
        self.never_ready = False
        self.fail = False

    async def tv(self, settings, **kwargs):
        if self.fail:
            raise HAError("fixture unavailable")
        if not settings["tv_entity"]:
            return {"configured": False, "entity_id": "", "state": "unavailable", "source": None,
                    "source_list": [], "supported_features": 0,
                    "capabilities": {"power": False, "source": False, "volume": False, "mute": False}}
        return {"configured": bool(settings["tv_entity"]), "state": "on" if self.on else "off",
                "source": "TV", "source_list": ["HDMI1"], "supported_features": 128 | 256 | 4 | 8 | 1024,
                "capabilities": {"power": True, "source": self.supports_source, "volume": True, "mute": True}}

    async def tv_action(self, settings, action, **kwargs):
        self.calls.append((action, kwargs))
        if action == "on" and not self.never_ready:
            self.on = True
        elif action == "off":
            self.on = False
        elif action == "source" and not self.supports_source:
            raise ValueError("Unsupported source")
        return await self.tv(settings)

    async def home(self, settings):
        return {"entities": [], "weather": None}

    async def home_action(self, settings, entity, action, brightness=None):
        if entity not in settings["entities"]:
            raise ValueError("Not selected")
        self.calls.append((entity, action, brightness))

    async def request(self, method, path, data=None):
        return [{"entity_id": "light.living", "state": "on", "attributes": {"friendly_name": "Salon", "secret": "never expose"}}]

    async def service(self, *args, **kwargs):
        self.calls.append((args, kwargs))

    async def close(self):
        pass


class TLSFixture:
    @classmethod
    def setUpClass(cls):
        cls.certdir = tempfile.TemporaryDirectory()
        root = Path(cls.certdir.name)
        executable = shutil.which("openssl") or r"C:\Program Files\Git\usr\bin\openssl.exe"
        subprocess.run([executable, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                        "-keyout", str(root / "key.pem"), "-out", str(root / "cert.pem"), "-subj", "/CN=127.0.0.1",
                        "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:TRUE"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.server_ssl = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        cls.server_ssl.load_cert_chain(root / "cert.pem", root / "key.pem")
        cls.client_ssl = ssl.create_default_context(cafile=str(root / "cert.pem"))

    @classmethod
    def tearDownClass(cls):
        cls.certdir.cleanup()


class SmartTVTests(TLSFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dbpath = Path(self.tmp.name) / "state.sqlite3"
        self.store = Store(self.dbpath)
        self.ha, self.browser = FakeHA(), FakeBrowser()
        self.smart = SmartTV(self.store, self.ha, self.browser, remote_origin="https://127.0.0.1:8443")
        self.smart.xinput = AsyncMock()
        app = web.Application(middlewares=[self.smart.middleware])
        self.smart.routes(app)
        self.local = TestClient(TestServer(app))
        await self.local.start_server()
        self.local_origin = str(self.local.make_url("/")).rstrip("/")
        remote_server = TestServer(self.smart.remote_app(), scheme="https")
        await remote_server.start_server(ssl=self.server_ssl)
        self.remote = TestClient(remote_server,
                                 cookie_jar=CookieJar(unsafe=True), connector=None)
        await self.remote.start_server()
        self.origin = str(self.remote.make_url("/")).rstrip("/")
        self.smart.remote_origin = self.origin

    async def asyncTearDown(self):
        await self.smart.close()
        await self.local.close()
        await self.remote.close()
        self.tmp.cleanup()

    async def lpost(self, path, data=None, method="POST"):
        return await self.local.request(method, PREFIX + path, json={} if data is None else data,
                                        headers={"Origin": self.local_origin})

    async def rrequest(self, method, path, data=None, origin=None):
        kwargs = {"headers": {"Origin": origin or self.origin}, "ssl": self.client_ssl}
        if data is not None:
            kwargs["json"] = data
        return await self.remote.request(method, PREFIX + path, **kwargs)

    async def pair(self):
        response = await self.lpost("/pairing/start")
        self.assertEqual(response.status, 200, await response.text())
        pin = (await response.json())["pin"]
        response = await self.rrequest("POST", "/pairing/complete", {"pin": pin, "device_name": "iPhone test"})
        self.assertEqual(response.status, 200, await response.text())
        return response, (await response.json())["device"]

    async def settings(self, **patch):
        response = await self.lpost("/settings", patch, "PATCH")
        self.assertEqual(response.status, 200, await response.text())

    async def test_real_tls_pair_cookie_pin_one_use_and_persistence(self):
        response, device = await self.pair()
        cookie = response.cookies[COOKIE]
        self.assertTrue(cookie["secure"])
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Strict")
        token = cookie.value
        self.assertNotIn(token.encode(), self.dbpath.read_bytes())
        self.assertNotIn("token_hash", json.dumps(self.store.devices()))
        self.assertEqual((await self.rrequest("GET", "/session")).status, 200)
        self.assertIsNone(self.smart.pin)
        another = Store(self.dbpath)
        try:
            self.assertEqual(another.authenticate(token)["id"], device["id"])
        finally:
            another.close()
        replay = await self.rrequest("POST", "/pairing/complete", {"pin": "000000", "device_name": "X"})
        self.assertEqual(replay.status, 401)

    async def test_pin_expiration_attempt_budget_and_cancel(self):
        await self.lpost("/pairing/start")
        self.smart.pin["expires_at"] = 0
        response = await self.rrequest("POST", "/pairing/complete", {"pin": "000000", "device_name": "X"})
        self.assertEqual(response.status, 401)
        await self.lpost("/pairing/start")
        good = self.smart.pin["value"]
        bad = "111111" if good != "111111" else "222222"
        self.smart.limiter.windows.clear()
        for _ in range(5):
            response = await self.rrequest("POST", "/pairing/complete", {"pin": bad, "device_name": "X"})
            self.assertEqual(response.status, 401)
        self.assertIsNone(self.smart.pin)
        response = await self.rrequest("POST", "/pairing/complete", {"pin": good, "device_name": "X"})
        self.assertEqual(response.status, 429)
        self.assertEqual(response.headers["Retry-After"], "60")
        await self.lpost("/pairing/start")
        self.assertEqual((await self.lpost("/pairing/cancel")).status, 200)
        self.assertIsNone(self.smart.pin)

    async def test_remote_actual_loopback_is_not_local_tv_privilege(self):
        for path in ("/state", "/session", "/devices", "/settings", "/home/available"):
            self.assertEqual((await self.rrequest("GET", path)).status, 401)
        self.assertEqual((await self.rrequest("POST", "/input", {"type": "key", "key": "home"})).status, 401)
        self.assertEqual((await self.rrequest("POST", "/pairing/start", {})).status, 401)
        response = await self.remote.post("/run_command", json={"cmd": "echo forbidden"}, ssl=self.client_ssl)
        self.assertEqual(response.status, 404)
        self.assertEqual((await self.remote.get("/launcher", ssl=self.client_ssl)).status, 404)

    async def test_origins_content_types_host_and_cleartext_pairing(self):
        response = await self.local.post(PREFIX + "/pairing/start", json={})
        self.assertEqual(response.status, 403)
        response = await self.local.post(PREFIX + "/pairing/start", json={}, headers={"Origin": "https://evil.test"})
        self.assertEqual(response.status, 403)
        response = await self.local.get(PREFIX + "/state", headers={"Host": "evil.test"})
        self.assertEqual(response.status, 403)
        response = await self.local.post(PREFIX + "/input", data="{}", headers={"Origin": self.local_origin})
        self.assertEqual(response.status, 415)
        response = await self.lpost("/pairing/complete", {"pin": "123456"})
        self.assertEqual(response.status, 403)
        await self.pair()
        self.assertEqual((await self.rrequest("POST", "/input", {}, origin="https://evil.test")).status, 403)
        response = await self.remote.get(PREFIX + "/state", headers={"Host": "evil.test"}, ssl=self.client_ssl)
        self.assertEqual(response.status, 403)
        response = await self.local.get(PREFIX + "/state", headers={"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(response.status, 403)

    async def test_pin_never_leaks_phone_snapshot_or_events(self):
        await self.pair()
        await self.lpost("/pairing/start")
        pin = self.smart.pin["value"]
        remote = await (await self.rrequest("GET", "/state")).json()
        self.assertNotIn("pairing", remote)
        self.assertNotIn(pin, json.dumps(remote))
        local = await (await self.local.get(PREFIX + "/state")).json()
        self.assertEqual(local["pairing"]["pin"], pin)

    async def test_phone_cannot_edit_ha_selection_or_revoke_other_devices(self):
        _, device = await self.pair()
        self.assertEqual((await self.rrequest("PATCH", "/settings", {"entities": ["light.living"]})).status, 403)
        self.assertEqual((await self.rrequest("GET", "/home/available")).status, 403)
        self.assertEqual((await self.rrequest("DELETE", "/devices/another")).status, 403)
        response = await self.rrequest("PATCH", "/settings", {"safe_area": 5})
        self.assertEqual(response.status, 200)
        self.assertEqual((await self.rrequest("DELETE", "/devices/" + device["id"])).status, 200)
        self.assertEqual((await self.rrequest("GET", "/state")).status, 401)

    async def test_expired_session_and_logout(self):
        response, _ = await self.pair()
        token = response.cookies[COOKIE].value
        self.assertEqual((await self.rrequest("POST", "/session/logout", {})).status, 200)
        self.assertIsNone(self.store.authenticate(token))
        await self.pair()
        self.store.db.execute("UPDATE devices SET expires_at=0")
        self.store.db.commit()
        self.assertEqual((await self.rrequest("GET", "/session")).status, 401)

    async def test_profiles_settings_and_restart_persist(self):
        profile = {"name": "Ania", "avatar": "a3", "favorites": ["youtube"], "app_order": ["youtube", "netflix"],
                   "preferences": {"accent": "#aabbcc", "animation": "reduced"}}
        self.assertEqual((await self.lpost("/profiles/ania", profile, "PUT")).status, 200)
        await self.lpost("/profiles/active", {"profile_id": "ania"})
        await self.settings(safe_area=7, shortcuts=[{"id": "news", "name": "News", "url": "https://example.com/"}])
        other = Store(self.dbpath)
        try:
            self.assertEqual(other.get("active_profile_id"), "ania")
            self.assertEqual(other.settings()["safe_area"], 7)
            self.assertEqual(other.profiles()[-1]["preferences"]["accent"], "#aabbcc")
        finally:
            other.close()
        self.assertEqual((await self.lpost("/profiles/ania", {}, "DELETE")).status, 200)
        self.assertEqual(self.store.get("active_profile_id"), "default")
        self.assertEqual((await self.lpost("/profiles/default", {}, "DELETE")).status, 400)

    async def test_removed_shortcut_does_not_break_profile_edits(self):
        await self.settings(shortcuts=[{"id": "news", "name": "News", "url": "https://example.com/"}])
        response = await self.lpost("/profiles/default", {"favorites": ["news"], "app_order": ["news", "netflix"]}, "PUT")
        self.assertEqual(response.status, 200)
        self.store.put("recent", ["news", "netflix"])
        await self.settings(shortcuts=[])
        profile = self.store.profiles()[0]
        self.assertEqual(profile["favorites"], [])
        self.assertEqual(profile["app_order"], ["netflix"])
        self.assertEqual(self.store.get("recent"), ["netflix"])
        self.assertEqual((await self.lpost("/profiles/default", {"name": "Dom po edycji"}, "PUT")).status, 200)

    async def test_input_allowlist_unicode_and_fixed_x_argv(self):
        for payload in ({"type": "key", "key": "up"}, {"type": "text", "text": "Zażółć gęślą jaźń"},
                        {"type": "pointer", "dx": -12, "dy": 30}, {"type": "click", "button": "right"},
                        {"type": "scroll", "dx": 0, "dy": -90}):
            self.assertEqual((await self.lpost("/input", payload)).status, 200)
        self.assertIn(("Input.insertText", {"text": "Zażółć gęślą jaźń"}), self.browser.calls)
        self.smart.xinput.assert_any_await("mousemove_relative", "--", "-12", "30")
        self.smart.xinput.assert_any_await("click", "3")
        for payload in ({"type": "key", "key": "F12"}, {"type": "eval", "script": "alert(1)"},
                        {"type": "pointer", "dx": "1; rm -rf /"}, {"type": "text", "text": "x" * 2001},
                        {"type": "pointer", "dx": float("inf")}):
            self.assertEqual((await self.lpost("/input", payload)).status, 400)

    async def test_launch_without_tv_recent_and_busy(self):
        blocker = asyncio.Event()
        self.browser.navigate.side_effect = lambda url: blocker.wait()
        async def wait(url):
            await blocker.wait()
        self.browser.navigate.side_effect = wait
        response = await self.lpost("/apps/launch", {"app_id": "netflix"})
        self.assertEqual(response.status, 202)
        op = (await response.json())["operation"]
        self.assertEqual((await self.lpost("/apps/launch", {"app_id": "youtube"})).status, 409)
        blocker.set()
        await self.smart.launch_task
        response = await self.local.get(PREFIX + "/operations/" + op["id"])
        self.assertEqual((await response.json())["operation"]["state"], "completed")
        self.assertEqual(self.store.get("recent"), ["netflix"])
        self.assertEqual(self.ha.calls, [])

    async def test_one_click_tv_power_source_movie_volume_then_chrome(self):
        await self.settings(tv_entity="media_player.panasonic", tv_source="HDMI1", entities=["scene.movie", "light.living"],
                            movie_scene="scene.movie", movie_lights=["light.living"], movie_volume=.3)
        response = await self.lpost("/movie", {"app_id": "netflix"})
        self.assertEqual(response.status, 202)
        await self.smart.launch_task
        self.assertEqual(self.smart.operation["state"], "completed")
        self.assertEqual(self.ha.calls[0][0], "on")
        self.assertEqual(self.ha.calls[1], ("source", {"source": "HDMI1"}))
        self.browser.navigate.assert_awaited_once_with("https://www.netflix.com/")
        self.assertIn(("scene.movie", "turn_on", None), self.ha.calls)
        self.assertIn(("light.living", "turn_on", 20), self.ha.calls)

    async def test_unsupported_hdmi_and_timeout_never_report_success(self):
        await self.settings(tv_entity="media_player.panasonic", tv_source="HDMI1")
        self.ha.supports_source = False
        await self.lpost("/apps/launch", {"app_id": "netflix"})
        await self.smart.launch_task
        self.assertEqual(self.smart.operation["state"], "failed")
        self.browser.navigate.assert_not_awaited()
        self.ha.on = False
        self.ha.never_ready = True
        self.smart.tv_timeout = 0
        await self.lpost("/apps/launch", {"app_id": "youtube"})
        await self.smart.launch_task
        self.assertEqual(self.smart.operation["error"]["code"], "ha_unavailable")
        self.browser.navigate.assert_not_awaited()

    async def test_ha_failure_snapshot_and_sanitized_entity_picker(self):
        await self.settings(tv_entity="media_player.panasonic")
        self.ha.fail = True
        state = await (await self.local.get(PREFIX + "/state")).json()
        self.assertEqual(state["tv"]["state"], "unavailable")
        response = await self.local.get(PREFIX + "/home/available")
        payload = await response.json()
        self.assertEqual(payload["entities"][0]["entity_id"], "light.living")
        self.assertNotIn("secret", json.dumps(payload))

    async def test_polish_text_commands_dispatch_real_paths(self):
        for command, expected in (("Otwórz Netflix.", "netflix"), ("Otwórz YouTube", "youtube"), ("Włącz tryb filmowy", "netflix")):
            response = await self.lpost("/voice/text", {"text": command})
            self.assertEqual(response.status, 200, await response.text())
            self.assertEqual((await response.json())["operation"]["app_id"], expected)
            await self.smart.launch_task
        await self.settings(tv_entity="media_player.panasonic", entities=["light.living"])
        for command in ("Wróć do menu", "Włącz telewizor", "Wyłącz telewizor", "Pauza", "Zwiększ głośność", "Zmniejsz głośność", "Włącz światło", "Wyłącz światło"):
            self.assertEqual((await self.lpost("/voice/text", {"text": command})).status, 200)
        self.assertEqual((await self.lpost("/voice/text", {"text": "uruchom dowolny shell"})).status, 400)

    async def test_websocket_real_ack_reconnect_and_revocation(self):
        _, device = await self.pair()
        async with self.remote.ws_connect(PREFIX + "/ws", origin=self.origin, ssl=self.client_ssl) as ws:
            first = await ws.receive_json(timeout=3)
            self.assertEqual(first["type"], "state")
            self.assertNotIn("pairing", first["state"])
            await ws.send_json({"id": "a", "type": "input", "input": {"type": "key", "key": "ok"}})
            self.assertEqual(await ws.receive_json(timeout=3), {"type": "ack", "id": "a", "ok": True})
            await ws.send_json({"id": "b", "type": "input", "input": {"type": "key", "key": "F12"}})
            self.assertEqual((await ws.receive_json(timeout=3))["type"], "error")
        # Reconnect sends a new authoritative snapshot; input is not replayed.
        ws = await self.remote.ws_connect(PREFIX + "/ws", origin=self.origin, ssl=self.client_ssl)
        self.assertEqual((await ws.receive_json(timeout=3))["type"], "state")
        response = await self.lpost("/devices/" + device["id"], {}, "DELETE")
        self.assertEqual(response.status, 200)
        self.assertIn((await ws.receive(timeout=3)).type, {WSMsgType.CLOSE, WSMsgType.CLOSED})
        await ws.close()

    async def test_websocket_exact_origin_and_connection_limits(self):
        await self.pair()
        from aiohttp import WSServerHandshakeError
        with self.assertRaises(WSServerHandshakeError):
            await self.remote.ws_connect(PREFIX + "/ws", origin="https://evil.test", ssl=self.client_ssl)
        sockets = []
        try:
            for _ in range(2):
                ws = await self.remote.ws_connect(PREFIX + "/ws", origin=self.origin, ssl=self.client_ssl)
                await ws.receive_json(timeout=3)
                sockets.append(ws)
            with self.assertRaises(WSServerHandshakeError):
                await self.remote.ws_connect(PREFIX + "/ws", origin=self.origin, ssl=self.client_ssl)
        finally:
            for ws in sockets:
                await ws.close()

    async def test_body_limit_and_static_traversal(self):
        response = await self.lpost("/input", {"type": "text", "text": "z" * 20000})
        self.assertEqual(response.status, 413)
        for path in ("/remote/icons/../../smart_tv.py", "/remote/%2e%2e/smart_tv.py", "/remote/state.sqlite3", "/remote/.secret"):
            self.assertIn((await self.local.get(path)).status, (403, 404))


class HomeAssistantHTTPTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_rest_feature_flags_selected_entities_weather_and_secrets(self):
        calls = []
        states = {
            "media_player.panasonic": {"state": "on", "attributes": {"supported_features": 128 | 256 | 2048 | 1024 | 8,
                "source_list": ["HDMI1"], "source": "HDMI1", "is_volume_muted": False}},
            "light.living": {"state": "on", "attributes": {"friendly_name": "Living", "brightness": 128, "access_token": "secret"}},
            "weather.home": {"state": "sunny", "attributes": {"temperature": 21, "temperature_unit": "°C", "humidity": 40}},
        }
        async def handler(request):
            self.assertEqual(request.headers.get("Authorization"), "Bearer fixture-secret")
            if request.method == "POST":
                calls.append((request.path, await request.json()))
                return web.json_response([])
            return web.json_response(states[request.match_info["entity"]])
        app = web.Application()
        app.router.add_get("/api/states/{entity}", handler)
        app.router.add_post("/api/services/{domain}/{service}", handler)
        async with TestClient(TestServer(app)) as client:
            ha = HomeAssistant(base_url=str(client.make_url("/api")), token="fixture-secret")
            try:
                settings = {**deepcopy(DEFAULT_SETTINGS), "tv_entity": "media_player.panasonic",
                            "entities": ["light.living"], "weather_entity": "weather.home"}
                await ha.tv_action(settings, "off")
                self.assertEqual(calls[-1], ("/api/services/media_player/turn_off", {"entity_id": "media_player.panasonic"}))
                await ha.tv_action(settings, "source", source="HDMI1")
                with self.assertRaises(ValueError):
                    await ha.tv_action(settings, "source", source="HDMI2")
                states["media_player.panasonic"]["attributes"]["supported_features"] = 128 | 256
                with self.assertRaises(ValueError):
                    await ha.tv_action(settings, "source", source="HDMI1")
                with self.assertRaises(ValueError):
                    await ha.home_action(settings, "light.private", "turn_on")
                await ha.home_action(settings, "light.living", "turn_on", 25)
                home = await ha.home(settings)
                self.assertNotIn("secret", json.dumps(home))
                self.assertEqual(home["weather"]["condition"], "sunny")
                self.assertEqual(home["entities"][0]["attributes"]["brightness_pct"], 50)
            finally:
                await ha.close()

    async def test_upstream_error_and_missing_token_are_explicit(self):
        ha = HomeAssistant(token="")
        with self.assertRaises(HAError):
            await ha.state("light.x")
        await ha.close()

    async def test_real_cdp_controller_preserves_target_and_dispatch(self):
        calls = []
        app = web.Application()
        async def websocket(request):
            ws = web.WebSocketResponse()
            await ws.prepare(request)
            async for message in ws:
                command = json.loads(message.data)
                calls.append(command)
                await ws.send_json({"id": command["id"], "result": {}})
            return ws
        app.router.add_get("/devtools/page/1", websocket)
        server = TestServer(app)
        async def targets(_):
            return web.json_response([{"id": "1", "type": "page", "url": "https://www.netflix.com/",
                "webSocketDebuggerUrl": str(server.make_url("/devtools/page/1")).replace("http:", "ws:")}])
        app.router.add_get("/json/list", targets)
        await server.start_server()
        try:
            browser = ChromiumController(port=server.port)
            await browser.navigate("https://www.youtube.com/")
            self.assertEqual([c["method"] for c in calls], ["Page.enable", "Runtime.enable", "Page.navigate"])
            self.assertEqual(calls[-1]["params"]["url"], "https://www.youtube.com/")
        finally:
            await server.close()


class ValidationTests(unittest.TestCase):
    def test_settings_and_url_allowlist(self):
        for patch in ({"safe_area": -1}, {"safe_area": True}, {"accent": "url(evil)"}, {"tv_entity": "script.shutdown"},
                      {"entities": ["person.private"]}, {"shortcuts": [{"id": "netflix", "name": "x", "url": "https://example.com"}]},
                      {"wallpaper": "javascript:"}, {"unknown": True}, {"touchpad_speed": float("nan")}):
            with self.assertRaises(ValueError, msg=str(patch)):
                validate_settings(patch)
        for url in ("javascript:alert(1)", "file:///etc/passwd", "chrome://settings", "https://u:p@host/", "https://host:99999", "https://x/\n"):
            with self.assertRaises(ValueError, msg=url):
                valid_url(url)


if __name__ == "__main__":
    unittest.main()

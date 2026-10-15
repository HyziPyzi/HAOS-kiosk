"""Home Assistant adapter: bounded I/O, no generic proxy and no credentials in UI."""
from __future__ import annotations

import asyncio
import os
import time
from urllib.parse import quote

from aiohttp import ClientSession, ClientTimeout


class HAError(RuntimeError):
    """Sanitized upstream failure."""


class HomeAssistant:
    def __init__(self, *, base_url=None, token=None):
        self.base_url = (base_url or os.getenv("SMART_TV_HA_API", "http://supervisor/core/api")).rstrip("/")
        self.token = token if token is not None else os.getenv("SUPERVISOR_TOKEN", "")
        self.session = None
        self.cache = {}

    async def request(self, method, path, data=None):
        if not self.token:
            raise HAError("Home Assistant API is not configured")
        if self.session is None or self.session.closed:
            self.session = ClientSession(timeout=ClientTimeout(total=7),
                                         headers={"Authorization": f"Bearer {self.token}"})
        try:
            async with self.session.request(method, self.base_url + path, json=data,
                                            allow_redirects=False) as response:
                if response.status >= 300:
                    raise HAError(f"Home Assistant returned HTTP {response.status}")
                # HA state/Assist responses only; bound body before JSON decoding.
                limit = 2 * 1024 * 1024 if path == "/states" else 256 * 1024
                raw = await response.content.read(limit + 1)
                if len(raw) > limit:
                    raise HAError("Home Assistant response too large")
                import json
                return json.loads(raw)
        except (asyncio.TimeoutError, OSError, ValueError) as exc:
            raise HAError("Home Assistant unavailable or timed out") from exc
        except HAError:
            raise
        except Exception as exc:
            raise HAError("Home Assistant connection failed") from exc

    async def state(self, entity, *, fresh=False):
        entry = self.cache.get(entity)
        if not fresh and entry and time.monotonic() - entry[0] < 5:
            return entry[1]
        state = await self.request("GET", "/states/" + quote(entity, safe=""))
        if len(self.cache) >= 64:
            self.cache.clear()
        self.cache[entity] = (time.monotonic(), state)
        return state

    async def service(self, domain, service, entity, **kwargs):
        # Domain/service come only from internal dispatch tables.
        await self.request("POST", f"/services/{domain}/{service}", {"entity_id": entity, **kwargs})
        self.cache.pop(entity, None)

    async def tv(self, settings, *, fresh=False):
        entity = settings["tv_entity"]
        if not entity:
            return {"configured": False, "entity_id": "", "state": "unavailable", "source": None,
                    "source_list": [], "capabilities": {"power": False, "source": False, "volume": False, "mute": False}}
        state = await self.state(entity, fresh=fresh)
        attrs = state.get("attributes", {})
        features = int(attrs.get("supported_features", 0))
        return {"configured": True, "entity_id": entity, "state": state.get("state", "unknown"),
                "source": attrs.get("source"), "source_list": attrs.get("source_list", []),
                "volume_level": attrs.get("volume_level"), "is_volume_muted": attrs.get("is_volume_muted"),
                "capabilities": {"power": bool(features & (128 | 256)), "source": bool(features & 2048),
                                 "volume": bool(features & (4 | 1024)), "mute": bool(features & 8)},
                "supported_features": features}

    async def tv_action(self, settings, action, *, source=None, muted=None):
        tv = await self.tv(settings, fresh=True)
        if not tv["configured"]:
            raise ValueError("Configure tv_entity at the TV first")
        features = tv.get("supported_features", 0)
        actions = {"on": (128, "turn_on"), "off": (256, "turn_off"),
                   "volume_up": (1024, "volume_up"), "volume_down": (1024, "volume_down"),
                   "mute": (8, "volume_mute"), "source": (2048, "select_source")}
        if action not in actions:
            raise ValueError("Unsupported TV action")
        flag, service = actions[action]
        if action in {"volume_up", "volume_down"} and not features & 1024 and features & 4:
            level = tv.get("volume_level")
            if isinstance(level, (int, float)):
                step = .05 if action == "volume_up" else -.05
                await self.service("media_player", "volume_set", settings["tv_entity"], volume_level=min(1, max(0, level + step)))
                return await self.tv(settings, fresh=True)
        if not features & flag:
            raise ValueError("Action unsupported by this HA media_player")
        kwargs = {}
        if action == "source":
            if not isinstance(source, str) or source not in tv["source_list"]:
                raise ValueError("Source is not advertised by Home Assistant")
            kwargs["source"] = source
        if action == "mute":
            if muted is not None and not isinstance(muted, bool):
                raise ValueError("muted must be boolean")
            kwargs["is_volume_muted"] = muted if muted is not None else not tv.get("is_volume_muted", False)
        await self.service("media_player", service, settings["tv_entity"], **kwargs)
        return await self.tv(settings, fresh=True)

    async def home(self, settings):
        entities = []
        weather = None
        ids = list(dict.fromkeys(settings["entities"] + ([settings["weather_entity"]] if settings["weather_entity"] else [])))
        errors = []
        # Selected entities only, at most 24 + weather, bounded request concurrency.
        for offset in range(0, len(ids), 4):
            results = await asyncio.gather(*(self.state(e) for e in ids[offset:offset + 4]), return_exceptions=True)
            for entity, result in zip(ids[offset:offset + 4], results):
                if isinstance(result, BaseException):
                    errors.append("Home Assistant unavailable")
                    continue
                attrs = result.get("attributes", {})
                domain = entity.split(".")[0]
                safe = {k: attrs[k] for k in ("brightness", "temperature", "current_temperature", "temperature_unit",
                        "unit_of_measurement", "humidity", "supported_features", "color_mode", "device_class", "hvac_action") if k in attrs}
                if "brightness" in attrs and isinstance(attrs["brightness"], (int, float)):
                    safe["brightness_pct"] = round(attrs["brightness"] / 255 * 100)
                if "brightness" in attrs:
                    safe["supported"] = ["brightness"]
                if "unit_of_measurement" in attrs:
                    safe["unit"] = attrs["unit_of_measurement"]
                item = {"entity_id": entity, "name": attrs.get("friendly_name", entity),
                        "domain": domain, "state": result.get("state", "unknown"), "attributes": safe}
                if entity == settings["weather_entity"]:
                    weather = {"entity_id": entity, "name": item["name"], "condition": item["state"],
                               "temperature": attrs.get("temperature"), "temperature_unit": attrs.get("temperature_unit", "°C"),
                               "humidity": attrs.get("humidity"), "forecast": []}
                if entity in settings["entities"]:
                    entities.append(item)
        response = {"entities": entities, "weather": weather}
        if errors:
            response["error"] = errors[0]
        return response

    async def home_action(self, settings, entity, action, brightness=None):
        if entity not in settings["entities"]:
            raise ValueError("Entity is not selected for remote control")
        domain = entity.split(".")[0]
        if domain not in {"light", "switch", "scene", "script"} or action not in {"turn_on", "turn_off", "toggle"}:
            raise ValueError("Unsupported home action")
        if domain in {"scene", "script"} and action != "turn_on":
            raise ValueError("Scenes/scripts support turn_on only")
        kwargs = {}
        if brightness is not None:
            if domain != "light" or isinstance(brightness, bool) or not isinstance(brightness, (int, float)) or not 0 <= brightness <= 100:
                raise ValueError("Invalid brightness_pct")
            kwargs["brightness_pct"] = brightness
        await self.service(domain, action, entity, **kwargs)

    async def close(self):
        if self.session:
            await self.session.close()

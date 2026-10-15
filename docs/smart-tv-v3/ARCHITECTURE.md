# Smart TV OS v3 architecture

Agreed by Codex and Claude; baseline `main` a8aa67b (2.2.0).

The existing Debian/glibc image, official Chrome Stable, Chrome-managed Widevine,
uBlock Origin Lite policies/exceptions, persistent Chrome profile, Openbox, Xorg,
Intel GPU and PulseAudio path remain. No second browser, desktop or STT service is
introduced. Browser protocol calls have a finite deadline. Ctrl+Alt+H stays in Openbox.

The existing aiohttp process serves the local launcher and v3 API on loopback HTTP.
It optionally starts a separate aiohttp application on LAN HTTPS 8443, sharing the
same service objects. That application registers only `/remote/` and `/api/v3/`.
It cannot route to the legacy editor, generic command runner, screenshot files,
Chrome debugging port or container filesystem. Existing authenticated legacy REST
integrations remain compatible on their configured listener.

Local TV authority requires actual loopback peer, literal 127.0.0.1 Host, HTTP and
exact Origin for mutations/WS. A TLS request from loopback still requires a phone
session. Forwarded headers grant no authority. Pairing can start/cancel only at TV.
PIN is random, six digits, 120 seconds, single use, five attempts per PIN; additional
per-peer/global rate limits prevent distributed guessing. Sessions use 256-bit
random secrets in Secure HttpOnly SameSite=Strict host cookies. SQLite stores only
SHA256 session hashes, device names, expiry and preferences. No VOD passwords are stored.

SQLite lives in `/config/smart-tv/state.sqlite3`, file permissions 0600. Transactions
persist settings/devices/profiles atomically; the Chrome directory is not touched.
PIN and running operations are deliberately transient on restart. Session expiry
is 30 days, revocation closes existing WebSockets. Only the TV can revoke another
phone or modify the HA entity allowlist. Any paired phone can change household
profiles and personalization; pairing grants household remote control authority.

Home Assistant is called through the internal Supervisor Core API using the injected
SUPERVISOR_TOKEN. `homeassistant_api: true` is the one added HA API capability;
container Linux privileges remain unchanged. HA adapters return selected entities
and a filtered subset of attributes; the TV-only entity picker returns identifiers,
names, domains and state, with no credential attributes. Media player feature flags
and source_list decide whether source selection/volume/power are supported. TV-off
never powers down the NUC or HAOS. Movie scenes/scripts are explicitly selected by
the owner and may themselves perform whatever actions the owner configured in HA.

One-click launch is a tracked asynchronous operation with only one concurrent job:
check TV, turn on if required, wait up to 40 seconds (plus bounded HA request time),
select a configured supported HDMI source, optionally apply movie scene/lights and
volume, navigate the current Chrome tab. Failures are explicit; no HDMI/DRM success
is inferred. No TV configured means ordinary Chrome launch still works.

Touchpad pointer/click/scroll use fixed xdotool argv to move a visible X cursor.
Remote input cannot supply command names, raw keys, shell text or CDP methods.
Unicode text and an allowlist of navigation keys use CDP on the existing tab.
This also gives launcher keyboard navigation the same path as USB HID input.

The frontend is vanilla JS/CSS with local fonts and assets, no runtime npm or CDN.
The API contract is [API_CONTRACT.md](API_CONTRACT.md). WebSocket has 8 total / 2 per
device connections, bounded queues and bodies, 25-second heartbeat, per-session
command limits and a 12-item global input queue. Clients coalesce touchpad input to
30 Hz. HA reads cache 5 seconds; while clients are connected the server checks for
state changes every 30 seconds. There is no background HA polling with no clients.

Polish text commands use a local bounded parser. iPhone keyboard dictation supplies
text; v3 base does not accept raw audio or claim an audio STT pipeline. Optional
Assist text fallback requires explicit TV opt-in and uses HA's configured default
conversation agent. Select a local agent in HA for offline operation. A heavy STT
engine is never installed in the kiosk container.

Development uses independent `feat/v3-backend` and `feat/v3-frontend` worktrees,
integrated on `feat/smart-tv-v3`. Tests distinguish real HTTP/TLS/WS from explicit
HA/TV/CDP fixtures. Physical HDMI/DRM/iPhone installation remain acceptance checks.

References: [HA app communication](https://developers.home-assistant.io/docs/apps/communication/),
[HA media player](https://www.home-assistant.io/integrations/media_player/),
[aiohttp WebSocket/data sharing](https://docs.aiohttp.org/en/stable/web_advanced.html).

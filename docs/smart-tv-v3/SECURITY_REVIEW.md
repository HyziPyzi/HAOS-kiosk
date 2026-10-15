# Security review and operating boundaries

Codex implementation review, pending joint frontend/integration review.

| Surface | Enforced control | Evidence |
|---|---|---|
| Phone pairing | TV-only start, six-digit random PIN, 120s, one use, five attempts, per-IP/global limits | Backend verified TLS tests |
| Sessions | Secure HttpOnly SameSite=Strict host cookie, random 256-bit secret, only hash at rest, 30 days | TLS cookie/database tests |
| Revocation | TV revokes any device, phone only itself; active WS closed | Real WS revocation test |
| Local TV | Actual loopback, literal 127.0.0.1 Host, HTTP, same Origin on writes/WS | Host/Origin/remote-loopback tests |
| CSRF/rebinding | Exact configured HTTPS Host/Origin, no CORS, JSON-only writes, reject cross-site fetch | Negative Origin/Host/content-type tests |
| WebSocket | Same authentication as REST, exact Origin, per-message auth, idle revalidation, 8 total/2 per device | Handshake/limits/reconnect tests |
| Input | Fixed key/type allowlist, fixed executable argv, finite CDP/X timeouts, no shell | Dispatch and injection rejection tests |
| Network | TLS optional/off by default, no plaintext remote cookies, private peers, no trusted forwarded headers | Separate-app route/HTTPS tests |
| Chrome DevTools | Existing 127.0.0.1 bind retained, not proxied by v3 API | Existing runtime regression + route review |
| HA secrets | Server-only injected token, no options proxy, selected entities + filtered attributes | HA HTTP fixture sanitization tests |
| HA privileges | Adds homeassistant_api for Core API; no additional Linux capabilities | Config diff |
| Static paths | Explicit filename/types/subdirectories, resolve within root, no listing | Traversal tests |
| Resources | 16 KiB bodies/WS frames, limited devices/profiles/entities/jobs, bounded input/WS queues, refresh caching | Unit/integration tests + code review |
| Persistence | SQLite transactions and 0600 file; no Netflix/password storage | Restart persistence test |

Paired phones have household control authority: they may launch arbitrary validated
http(s) websites in the TV browser, send navigation/text and operate selected HA
entities. Pair only trusted household devices. Any website the household chooses
to open still executes normal web content in Chrome; this API does not sandbox
websites beyond Chrome's existing isolation. Do not pair untrusted guests.

The TV-only selector is allowed to enumerate sanitized supported HA entities so
the owner can choose them. Phones receive only selected state/attributes. A selected
scene or script may carry out its owner's configured HA actions. Optional Assist
fallback uses the default HA conversation agent and its HA exposure rules, which
can be broader than selected UI entities; opt in at TV after configuring a local
agent. No cloud API is required or automatically enabled.

The pre-existing generic legacy API is retained on its existing configured REST
listener and bearer policy. Default is loopback. It is completely absent from the
new HTTPS remote application. Existing installations exposing legacy REST should
retain a strong bearer token and a private LAN firewall; v3 phone cookies cannot
authorize those legacy commands. The existing image's Linux privileges and disabled
AppArmor are baseline hardware requirements; this release does not expand them.

No endpoint accepts HA tokens, shell commands, raw CDP methods or certificate keys.
Access logging is disabled for production runners. Errors redact upstream payloads.
SQLite and server TLS keys must be included only in encrypted private backups.
Keep root CA private key offline; distribute only the public root certificate.

Outstanding acceptance: actual Safari cookie/standalone behavior, physical HID,
NUC resource measurement, DRM playback, HDMI audio and HA/Panasonic capability
behavior. Dependency/runtime updates remain subject to normal upstream advisories.

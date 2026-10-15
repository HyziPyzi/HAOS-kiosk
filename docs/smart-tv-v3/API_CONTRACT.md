# Smart TV OS v3 API contract

Version 3.0, agreed by Codex and Claude. Same-origin JSON under `/api/v3`. No CORS.
Existing `/launcher` remains loopback HTTP (127.0.0.1); `/remote/` is served by a
separate HTTPS listener (default 8443), with no legacy command/editor routes.
No additional Chrome process. Existing CDP controller and persistent profile remain.

## Authentication

The local TV may use API without a phone session ONLY on actual loopback HTTP,
literal `127.0.0.1` Host, with matching Origin on mutations. HTTPS never inherits
this privilege. Remote requires configured exact HTTPS origin, Secure HttpOnly
SameSite=Strict cookie `__Host-smarttv` (30 days). Never store bearer secrets in JS.
Every mutation and WS handshake requires exact Origin. JSON body maximum 16 KiB.
Errors: `{ "error": { "code": "unauthorized", "message": "..." } }` with appropriate
400/401/403/404/409/429/502/503 status. No secrets in errors or logs.

## REST

Responses below are direct JSON objects (no success/data wrapper).

| Method/path | Request | Response |
|---|---|---|
| GET `/health` | public | `{status:"ok",version:"3.0.0"}` |
| POST `/pairing/start` | TV only, `{}` | `{pin:"123456",expires_at:unix_seconds,remote_url:"https://…/remote/"}` |
| POST `/pairing/cancel` | TV only, `{}` | `{ok:true}` |
| POST `/pairing/complete` | public HTTPS, `{pin,device_name}` | `{device:{id,name,created_at,expires_at}}` + cookie; PIN single-use, expires 120s |
| GET `/session` | authenticated | `{device:{id,name,created_at,expires_at},local:boolean}` |
| POST `/session/logout` | `{}` | `{ok:true}`; revokes session |
| GET `/devices` | authenticated | `{devices:[{id,name,created_at,expires_at}]}` |
| DELETE `/devices/{id}` | authenticated | `{ok:true}`; TV or own session only |
| GET `/state` | authenticated | snapshot described below |
| GET `/apps` | authenticated | `{apps:[{id,name,url,icon}],recent:[ids]}` |
| POST `/apps/launch` | `{app_id,profile_id?}` OR `{url,profile_id?}` for validated http(s) URL | `{operation:{id,state,stage,app_id,error:null}}` 202; operation stages below |
| GET `/operations/{id}` | authenticated | `{operation:{id,state,stage,app_id,error}}` |
| POST `/input` | command described below | `{ok:true}` |
| GET `/tv` | authenticated | `{configured,entity_id,state,source,source_list,capabilities:{power,source,volume,mute}}` |
| POST `/tv` | `{action:"on"|"off"|"volume_up"|"volume_down"|"mute"|"source",source?,muted?}` | `{tv:…}` |
| GET `/profiles` | authenticated | `{profiles:[profile],active_profile_id}` |
| PUT `/profiles/{id}` | profile fields below (upsert) | `{profile}` |
| DELETE `/profiles/{id}` | authenticated; `default` cannot be deleted, at least one must remain | `{ok:true}` |
| POST `/profiles/active` | `{profile_id}` | `{active_profile_id}` |
| GET `/settings` | authenticated | `{settings}` (safe settings below) |
| PATCH `/settings` | subset of safe settings | `{settings}`; HA entity allowlist only editable at TV |
| GET `/home` | authenticated | `{entities:[{entity_id,name,state,attributes}],weather:object|null}` |
| GET `/home/available` | TV only | `{entities:[{entity_id,name,domain,state}]}`; sanitized picker, max 500 |
| POST `/home/action` | `{entity_id,action:"turn_on"|"turn_off"|"toggle",brightness_pct?}` | `{ok:true}`; selected light/switch, scene/script turn_on only |
| POST `/movie` | `{app_id?}` | `{operation}` 202; configured scene/lights + launch |
| POST `/voice/text` | `{text:"Otwórz Netflix"}` | `{handled:true,command,operation?}`; bounded Polish parser first, optional HA conversation fallback |

`/health` in table means `/api/v3/health`; every other table path uses the same prefix.

Profile: `{id,name,avatar:"a1",color?:"#rrggbb",favorites:[app_ids],app_order:[app_ids],preferences:{}}`.
Avatar preset a1..a12. Preferences allow accent, wallpaper, animation; empty inherits.
Upsert uses optional fields, server validates known preference keys. `default` exists.
Safe settings: `{safe_area:0..10,accent:"#rrggbb",animation:"full"|"reduced"|"off",
night_mode:boolean,wallpaper:"dusk"|"aurora"|"midnight"|"slate",touchpad_speed:0.25..3,
tv_entity:"media_player.…"|"",tv_source:"…",weather_entity:"weather.…"|"",
entities:[entity_ids],movie_scene:"scene.…"|"",movie_lights:[light_ids],
movie_brightness:0..100,movie_app:"netflix",movie_volume:0..1|null,
shortcuts:[{id,name,url}],assist_enabled:boolean}`.
All HA identifiers are user-configured; phone sees selected entities only. No token.
Movie entity selection is TV-only and independent of direct home-control entities;
`/movie` may execute those configured movie entities without adding phone tiles.

State snapshot: `{version:"3.0.0",apps:[],recent:[],profiles:[],active_profile_id,
settings:{},tv:{…},home:{entities:[],weather:null},capabilities:{
voice:"text"|"assist_text",audio_stt:false,remote_https:boolean},operation:null|operation}`.
Local TV snapshot additionally contains `pairing:{active,pin?,expires_at?}|null`;
phone snapshots NEVER include PIN. Successful pairing broadcasts
`{type:"pairing",state:"completed",device:{id,name}}` to TV only.
Built-in app IDs: netflix,max,prime,youtube,spotify,home_assistant,browser.
App has `kind:"builtin"|"shortcut"`; browser.url=null (UI asks URL).
User URLs/shortcuts reject literal loopback/unspecified/link-local addresses,
localhost aliases, alternative IPv4 forms and reserved REST/CDP/remote ports.
Only the built-in home_assistant tile may navigate the configured internal HA_URL.
This guards direct control destinations; Chrome browsing is not a network sandbox
and website redirects/DNS are still governed by Chrome and the trusted household.
TV response also has optional volume_level (0..1), is_muted boolean.
Home entity adds domain; safe attributes include brightness_pct, supported:["brightness"],
unit,device_class,current_temperature,temperature,hvac_action as applicable.
Weather shape: `{entity_id,name,condition,temperature,temperature_unit,humidity,forecast:[]}`.
Forecast is empty in v3.0 base; no weather.get_forecasts polling is required.
HA unavailable returns explicit `home.error`/`tv.error` and `state:"unavailable"`.
No audio STT claimed: iPhone dictation feeds the text command field. Optional Assist
conversation can use the already configured local HA pipeline for text understanding.

Input: `{type:"key",key:"up"|"down"|"left"|"right"|"ok"|"back"|"home"|"play_pause"|"backspace"}`,
`{type:"text",text:"…"}` (max 2000 chars), `{type:"pointer",dx:number,dy:number}`,
`{type:"click",button:"left"|"right"}`, `{type:"scroll",dx:number,dy:number}`.
Long press maps to right click; no arbitrary keys, scripts, CDP methods or shell commands.
Pointer/click/scroll use fixed xdotool argv (visible X cursor, no shell), bounded deltas.
Keys use CDP; text uses insertText. Back dispatches Escape on launcher or fullscreen,
otherwise navigates browser history. Ctrl+Alt+H remains Openbox's global shortcut.

Operation: `state:"running"|"completed"|"failed"`, stages
`"queued"|"powering_on"|"waiting_tv"|"selecting_source"|"scene"|"launching"|"completed"|"failed"`.
Only one launch at a time, finite TV readiness timeout; source selection conditional
on actual HA feature flags and advertised source_list; unsupported source reported.
With no TV configured, launching Chrome still works; TV actions return not_configured.

## WebSocket

GET `/api/v3/ws`, same-origin + session cookie (or local TV privilege). Maximum 8
connections, two per device, 16 KiB messages, heartbeat 25s, bounded outgoing queue.
On connection: `{type:"state",state:snapshot}`. Updates: `{type:"operation",operation}`
and `{type:"state_changed"}` (client fetches snapshot; coalesce/debounce). No busy polling.
Client: `{id:"unique",type:"input",input:{…}}` or `{id,type:"ping"}`.
Server: `{type:"ack",id,ok:true}` / `{type:"error",id,error:{code,message}}` / `{type:"pong",id}`.
Validate session before every command and periodically while idle; revocation closes
existing sockets. Client reconnect 1–30s exponential backoff + jitter, refresh /session
and /state, never replay input or launch after reconnect. HTTP /input is fallback.
Rate limits apply per session and globally; touchpad frontend coalesces 30Hz maximum.

## Static assets

TV files stay `haoskiosk/launcher/`. Phone assets live
`haoskiosk/remote/`; `/remote/` -> index, explicit allowlist of public static file
types: html/js/css/svg/png/webp/woff2/webmanifest/json, lowercase filenames,
optional one-level fonts/icons/img subdirectory; no directory traversal.
Service worker scope `/remote/`; cache static resources
only, never APIs, pairing responses, cookies, or HA data. CSP same-origin scripts,
styles/images + data images if needed; no external CDNs or font dependencies.

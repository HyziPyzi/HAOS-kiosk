// Dev-only mock of docs/smart-tv-v3/API_CONTRACT.md for frontend work and E2E.
// Not shipped in the add-on. The real implementation lives in rest_server.py.
//
//   node mock-server.mjs [--port 8099]
//
// Local TV privilege = Host "127.0.0.1:<port>" (like the real loopback listener).
// Any other Host (e.g. localhost) behaves like the HTTPS phone listener: cookie session.
// Test hooks under /__mock/* (reset, inputs log, HA offline, current pairing PIN).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../haoskiosk');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || Number(process.env.PORT) || 8099;
const VERSION = '3.0.0';
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', woff2: 'font/woff2', webmanifest: 'application/manifest+json', json: 'application/json', txt: 'text/plain' };
const FILE_RE = /^[a-z0-9][a-z0-9_.-]*\.(html|js|css|svg|png|webp|woff2|webmanifest|json|txt)$/;
const SUBDIRS = new Set(['fonts', 'icons', 'img']);

const BUILTIN = [
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com/', icon: 'netflix', kind: 'builtin' },
  { id: 'max', name: 'Max', url: 'https://play.max.com/', icon: 'max', kind: 'builtin' },
  { id: 'prime', name: 'Prime Video', url: 'https://www.primevideo.com/', icon: 'prime', kind: 'builtin' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', icon: 'youtube', kind: 'builtin' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/', icon: 'spotify', kind: 'builtin' },
  { id: 'home_assistant', name: 'Home Assistant', url: 'http://localhost:8123/', icon: 'home_assistant', kind: 'builtin' },
  { id: 'browser', name: 'Przeglądarka', url: null, icon: 'browser', kind: 'builtin' },
];

function freshState() {
  return {
    profiles: [
      { id: 'default', name: 'Dom', avatar: 'a1', color: '#f0b35b', favorites: ['netflix', 'youtube', 'max', 'prime', 'spotify'], app_order: ['netflix', 'youtube', 'max', 'prime', 'spotify', 'home_assistant', 'browser'], preferences: {} },
      { id: 'ania', name: 'Ania', avatar: 'a4', color: '#8eb4e6', favorites: ['max', 'spotify'], app_order: [], preferences: { accent: '#e98aa8' } },
    ],
    active_profile_id: 'default',
    recent: ['youtube', 'netflix'],
    settings: {
      safe_area: 0, accent: '#f0b35b', animation: 'full', night_mode: false, wallpaper: 'dusk', touchpad_speed: 1,
      tv_entity: 'media_player.panasonic_viera_tv', tv_source: '', weather_entity: 'weather.forecast_dom',
      entities: ['light.salon', 'light.lampa_stojaca', 'switch.ambilight', 'scene.wieczor', 'sensor.salon_temperatura', 'climate.salon'],
      movie_scene: 'scene.wieczor', movie_lights: ['light.salon', 'light.lampa_stojaca'], movie_brightness: 15, movie_app: 'netflix', movie_volume: null,
      shortcuts: [{ id: 'tvp', name: 'TVP VOD', url: 'https://vod.tvp.pl/' }], assist_enabled: false,
    },
    tv: { configured: true, entity_id: 'media_player.panasonic_viera_tv', state: 'off', source: null, source_list: [], volume_level: 0.18, is_muted: false, capabilities: { power: true, source: false, volume: true, mute: true } },
    ha: {
      'light.salon': { name: 'Salon', state: 'on', attributes: { brightness_pct: 70, supported: ['brightness'] } },
      'light.lampa_stojaca': { name: 'Lampa stojąca', state: 'off', attributes: { brightness_pct: 0, supported: ['brightness'] } },
      'light.kuchnia': { name: 'Kuchnia', state: 'off', attributes: { brightness_pct: 0, supported: [] } },
      'switch.ambilight': { name: 'Podświetlenie TV', state: 'off', attributes: {} },
      'scene.wieczor': { name: 'Wieczór filmowy', state: 'scening', attributes: {} },
      'sensor.salon_temperatura': { name: 'Temperatura w salonie', state: '21.4', attributes: { unit: '°C', device_class: 'temperature' } },
      'climate.salon': { name: 'Ogrzewanie salon', state: 'heat', attributes: { current_temperature: 21.4, temperature: 22, hvac_action: 'heating' } },
    },
    weather: { entity_id: 'weather.forecast_dom', name: 'Dom', condition: 'partlycloudy', temperature: 12, temperature_unit: '°C', humidity: 71,
      forecast: [] },
    haOffline: false,
    devices: [],      // {id,name,created_at,expires_at,token}
    pairing: null,    // {pin,expires_at}
    pairFails: 0,
    operation: null,
    inputs: [],
    currentUrl: 'http://127.0.0.1/launcher',
  };
}
let S = freshState();
const now = () => Math.floor(Date.now() / 1000);

function apps() {
  return [...BUILTIN, ...S.settings.shortcuts.map(s => ({ id: s.id, name: s.name, url: s.url, icon: 'shortcut', kind: 'shortcut' }))];
}
function home() {
  if (S.haOffline) return { entities: [], weather: null, error: { code: 'ha_unavailable', message: 'Home Assistant nie odpowiada' } };
  return {
    entities: S.settings.entities.filter(id => S.ha[id]).map(id => ({ entity_id: id, name: S.ha[id].name, domain: id.split('.')[0], state: S.ha[id].state, attributes: S.ha[id].attributes })),
    weather: S.settings.weather_entity ? S.weather : null,
  };
}
function tv() { return S.haOffline ? { ...S.tv, state: 'unavailable', error: { code: 'ha_unavailable', message: 'Home Assistant nie odpowiada' } } : S.tv; }
function snapshot(local) {
  const snap = {
    version: VERSION, apps: apps(), recent: S.recent, profiles: S.profiles, active_profile_id: S.active_profile_id,
    settings: S.settings, tv: tv(), home: home(),
    capabilities: { voice: S.settings.assist_enabled ? 'assist_text' : 'text', audio_stt: false, remote_https: true },
    operation: S.operation,
  };
  if (local) snap.pairing = S.pairing && S.pairing.expires_at > now() ? { active: true, ...S.pairing, remote_url: `https://192.168.1.20:8443/remote/` } : null;
  return snap;
}

// ---- auth helpers -------------------------------------------------------------
function isLocal(req) { return (req.headers.host || '') === `127.0.0.1:${PORT}`; }
function cookieToken(req) { return /(?:^|;\s*)__Host-smarttv=([^;]+)/.exec(req.headers.cookie || '')?.[1] || null; }
function session(req) {
  const token = cookieToken(req);
  return token ? S.devices.find(d => d.token === token && d.expires_at > now()) || null : null;
}
function err(res, status, code, message, extra = {}) { send(res, status, { error: { code, message, ...extra } }); }
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
async function body(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 16384) throw Object.assign(new Error('too large'), { status: 413 }); }
  if (!data) return {};
  try { return JSON.parse(data); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}
const pub = d => ({ id: d.id, name: d.name, created_at: d.created_at, expires_at: d.expires_at });

// ---- websocket fan-out -----------------------------------------------------------
const sockets = new Set();
function broadcast(msg) { const text = JSON.stringify(msg); for (const ws of sockets) if (ws.readyState === 1) ws.send(text); }
let changedTimer = null;
function changed() { clearTimeout(changedTimer); changedTimer = setTimeout(() => broadcast({ type: 'state_changed' }), 60); }

// ---- operations ---------------------------------------------------------------
function startOperation(app, extraStages = []) {
  if (S.operation?.state === 'running') return null;
  const op = { id: crypto.randomUUID(), state: 'running', stage: 'queued', app_id: app?.id || null, error: null };
  S.operation = op;
  const stages = [...extraStages];
  if (S.tv.configured && S.tv.state !== 'on') stages.push('powering_on', 'waiting_tv');
  stages.push('launching', 'completed');
  let i = 0;
  const step = () => {
    if (S.operation !== op) return;
    const stage = stages[i++];
    op.stage = stage;
    if (stage === 'powering_on' && S.haOffline) { op.state = 'failed'; op.stage = 'failed'; op.error = { code: 'ha_unavailable', message: 'Nie udało się włączyć telewizora: Home Assistant nie odpowiada' }; }
    if (stage === 'waiting_tv') S.tv.state = 'on';
    if (stage === 'completed') {
      op.state = 'completed';
      if (app) { S.currentUrl = app.url; if (app.id) S.recent = [app.id, ...S.recent.filter(x => x !== app.id)].slice(0, 8); }
    }
    broadcast({ type: 'operation', operation: { ...op } });
    if (op.state === 'running') setTimeout(step, Number(process.env.MOCK_STEP_MS || 450));
    else changed();
  };
  setTimeout(step, 50);
  return op;
}

// ---- routing --------------------------------------------------------------------
async function api(req, res, route) {
  const local = isLocal(req);
  const dev = session(req);
  const method = req.method;
  if (method !== 'GET' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return err(res, 403, 'forbidden_origin', 'Niedozwolone źródło żądania');

  if (route === '/health') return send(res, 200, { status: 'ok', version: VERSION });
  if (route === '/pairing/complete' && method === 'POST') {
    if (local) return err(res, 403, 'remote_only', 'Parowanie z poziomu telefonu');
    if (S.pairFails >= 5) return err(res, 429, 'rate_limited', 'Za dużo prób. Spróbuj ponownie za chwilę.', { retry_after: 60 });
    const { pin, device_name } = await body(req);
    if (!S.pairing || S.pairing.expires_at <= now()) return err(res, 409, 'pairing_inactive', 'Na telewizorze nie ma aktywnego kodu parowania');
    if (String(pin) !== S.pairing.pin) { S.pairFails++; return err(res, 401, 'invalid_pin', 'Nieprawidłowy kod'); }
    const device = { id: crypto.randomUUID().slice(0, 8), name: String(device_name || 'Telefon').slice(0, 40), created_at: now(), expires_at: now() + 30 * 86400, token: crypto.randomBytes(24).toString('hex') };
    S.devices.push(device); S.pairing = null; S.pairFails = 0;
    broadcast({ type: 'pairing', state: 'completed', device: { id: device.id, name: device.name } });
    changed();
    return send(res, 200, { device: pub(device) }, { 'Set-Cookie': `__Host-smarttv=${device.token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000` });
  }
  if (!local && !dev) return err(res, 401, 'unauthorized', 'Sparuj pilota z telewizorem');

  const m = (verb, pattern) => method === verb && (typeof pattern === 'string' ? route === pattern : pattern.exec(route));
  let match;
  if (m('POST', '/pairing/start')) {
    if (!local) return err(res, 403, 'tv_only', 'Parowanie rozpoczyna się na telewizorze');
    S.pairing = { pin: String(crypto.randomInt(0, 1e6)).padStart(6, '0'), expires_at: now() + 120 };
    changed();
    return send(res, 200, { ...S.pairing, remote_url: 'https://192.168.1.20:8443/remote/' });
  }
  if (m('POST', '/pairing/cancel')) { if (!local) return err(res, 403, 'tv_only', 'Tylko telewizor'); S.pairing = null; changed(); return send(res, 200, { ok: true }); }
  if (m('GET', '/session')) return send(res, 200, { device: dev ? pub(dev) : null, local });
  if (m('POST', '/session/logout')) { if (dev) S.devices = S.devices.filter(d => d !== dev); return send(res, 200, { ok: true }, { 'Set-Cookie': '__Host-smarttv=; Path=/; Max-Age=0' }); }
  if (m('GET', '/devices')) return send(res, 200, { devices: S.devices.map(pub) });
  if ((match = m('DELETE', /^\/devices\/([\w-]+)$/))) {
    const target = S.devices.find(d => d.id === match[1]);
    if (!target) return err(res, 404, 'not_found', 'Nie ma takiego urządzenia');
    if (!local && target !== dev) return err(res, 403, 'forbidden', 'Możesz odłączyć tylko ten telefon');
    S.devices = S.devices.filter(d => d !== target); changed();
    for (const ws of sockets) if (ws.deviceId === target.id) ws.close(4401, 'revoked');
    return send(res, 200, { ok: true });
  }
  if (m('GET', '/state')) return send(res, 200, snapshot(local));
  if (m('GET', '/apps')) return send(res, 200, { apps: apps(), recent: S.recent });
  if (m('POST', '/apps/launch')) {
    const { app_id, url } = await body(req);
    let app = app_id ? apps().find(a => a.id === app_id) : null;
    if (app_id && !app) return err(res, 404, 'unknown_app', 'Nieznana aplikacja');
    if (!app && url) { if (!/^https?:\/\/[^\s/@]+/.test(url)) return err(res, 400, 'invalid_url', 'Nieprawidłowy adres'); app = { id: null, url }; }
    if (!app || !app.url) return err(res, 400, 'invalid_request', 'Podaj aplikację lub adres');
    const op = startOperation(app);
    if (!op) return err(res, 409, 'busy', 'Trwa uruchamianie innej aplikacji');
    return send(res, 202, { operation: op });
  }
  if ((match = m('GET', /^\/operations\/([\w-]+)$/))) return S.operation?.id === match[1] ? send(res, 200, { operation: S.operation }) : err(res, 404, 'not_found', 'Brak operacji');
  if (m('POST', '/input')) { const input = await body(req); S.inputs.push(input); return send(res, 200, { ok: true }); }
  if (m('GET', '/tv')) return send(res, 200, tv());
  if (m('POST', '/tv')) {
    if (S.haOffline) return err(res, 502, 'ha_unavailable', 'Home Assistant nie odpowiada');
    const { action } = await body(req);
    const t = S.tv;
    if (action === 'on') t.state = 'on'; else if (action === 'off') t.state = 'off';
    else if (action === 'volume_up') t.volume_level = Math.min(1, +(t.volume_level + 0.02).toFixed(2));
    else if (action === 'volume_down') t.volume_level = Math.max(0, +(t.volume_level - 0.02).toFixed(2));
    else if (action === 'mute') t.is_muted = !t.is_muted;
    else if (action === 'source') return err(res, 409, 'unsupported', 'Telewizor nie udostępnia wyboru źródła');
    else return err(res, 400, 'invalid_action', 'Nieznana akcja');
    changed(); return send(res, 200, { tv: tv() });
  }
  if (m('GET', '/profiles')) return send(res, 200, { profiles: S.profiles, active_profile_id: S.active_profile_id });
  if ((match = m('PUT', /^\/profiles\/([\w-]+)$/))) {
    const patch = await body(req);
    let p = S.profiles.find(x => x.id === match[1]);
    if (!p) { p = { id: match[1], name: 'Profil', avatar: 'a2', color: '#8eb4e6', favorites: [], app_order: [], preferences: {} }; S.profiles.push(p); }
    for (const k of ['name', 'avatar', 'color', 'favorites', 'app_order', 'preferences']) if (k in patch) p[k] = patch[k];
    changed(); return send(res, 200, { profile: p });
  }
  if ((match = m('DELETE', /^\/profiles\/([\w-]+)$/))) {
    if (S.profiles.length <= 1 || match[1] === 'default') return err(res, 409, 'last_profile', 'Ten profil musi zostać');
    S.profiles = S.profiles.filter(p => p.id !== match[1]);
    if (S.active_profile_id === match[1]) S.active_profile_id = 'default';
    changed(); return send(res, 200, { ok: true });
  }
  if (m('POST', '/profiles/active')) {
    const { profile_id } = await body(req);
    if (!S.profiles.some(p => p.id === profile_id)) return err(res, 404, 'not_found', 'Nie ma takiego profilu');
    S.active_profile_id = profile_id; changed(); return send(res, 200, { active_profile_id: profile_id });
  }
  if (m('GET', '/settings')) return send(res, 200, { settings: S.settings });
  if (m('PATCH', '/settings')) {
    const patch = await body(req);
    const tvOnly = ['entities', 'tv_entity', 'weather_entity', 'movie_scene', 'movie_lights'];
    if (!local && Object.keys(patch).some(k => tvOnly.includes(k))) return err(res, 403, 'tv_only', 'Te ustawienia zmienisz na telewizorze');
    if ('safe_area' in patch && !(patch.safe_area >= 0 && patch.safe_area <= 10)) return err(res, 400, 'invalid_settings', 'safe_area 0–10');
    Object.assign(S.settings, patch); changed(); return send(res, 200, { settings: S.settings });
  }
  if (m('GET', '/home')) return send(res, 200, home());
  if (m('GET', '/home/available')) {
    if (!local) return err(res, 403, 'tv_only', 'Tylko telewizor');
    return send(res, 200, { entities: Object.entries(S.ha).map(([entity_id, e]) => ({ entity_id, name: e.name, domain: entity_id.split('.')[0], state: e.state })) });
  }
  if (m('POST', '/home/action')) {
    if (S.haOffline) return err(res, 502, 'ha_unavailable', 'Home Assistant nie odpowiada');
    const { entity_id, action, brightness_pct } = await body(req);
    const e = S.ha[entity_id];
    if (!e || !S.settings.entities.includes(entity_id)) return err(res, 403, 'not_allowed', 'Ta encja nie jest udostępniona');
    if (action === 'toggle') e.state = e.state === 'on' ? 'off' : 'on';
    else if (action === 'turn_on') e.state = entity_id.startsWith('scene.') ? 'scening' : 'on';
    else if (action === 'turn_off') e.state = 'off';
    if (brightness_pct != null && 'brightness_pct' in e.attributes) { e.attributes.brightness_pct = brightness_pct; e.state = brightness_pct > 0 ? 'on' : 'off'; }
    else if (e.attributes.supported?.includes('brightness')) e.attributes.brightness_pct = e.state === 'on' ? (e.attributes.brightness_pct || 100) : 0;
    changed(); return send(res, 200, { ok: true });
  }
  if (m('POST', '/movie')) {
    const { app_id } = await body(req);
    const app = apps().find(a => a.id === (app_id || S.settings.movie_app));
    for (const id of S.settings.movie_lights) if (S.ha[id]) { S.ha[id].state = 'on'; S.ha[id].attributes.brightness_pct = S.settings.movie_brightness; }
    const op = startOperation(app, ['scene']);
    if (!op) return err(res, 409, 'busy', 'Trwa uruchamianie innej aplikacji');
    return send(res, 202, { operation: op });
  }
  if (m('POST', '/voice/text')) {
    const { text = '' } = await body(req);
    const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
    const appMatch = /(?:otworz|wlacz|uruchom)\s+(.+)/.exec(t);
    const target = appMatch && apps().find(a => t.includes(a.name.toLowerCase()) || t.includes(a.id));
    if (target) { const op = startOperation(target); return send(res, 200, { handled: true, command: `open:${target.id}`, operation: op }); }
    const table = [[/wyl\w* (telewizor|tv)/, 'tv_off'], [/wl\w* (telewizor|tv)/, 'tv_on'], [/pauz|wznow/, 'play_pause'], [/zwieksz|glosniej/, 'volume_up'], [/zmniejsz|ciszej/, 'volume_down'], [/wroc|menu/, 'home'], [/wyl\w* swiat/, 'lights_off'], [/wl\w* swiat/, 'lights_on'], [/tryb filmowy|wieczor filmowy/, 'movie']];
    for (const [re, command] of table) if (re.test(t)) {
      if (command === 'tv_on') S.tv.state = 'on'; if (command === 'tv_off') S.tv.state = 'off';
      changed(); return send(res, 200, { handled: true, command });
    }
    return send(res, 200, { handled: false, command: null, message: 'Nie rozumiem tego polecenia' });
  }
  return err(res, 404, 'not_found', `Brak endpointu ${route}`);
}

function serveStatic(req, res, dir, rest) {
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 0) parts.push('index.html');
  const ok = (parts.length === 1 && FILE_RE.test(parts[0])) || (parts.length === 2 && SUBDIRS.has(parts[0]) && FILE_RE.test(parts[1]));
  const file = path.join(ROOT, dir, ...parts);
  if (!ok || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  const ext = parts.at(-1).split('.').pop();
  res.writeHead(200, {
    'Content-Type': TYPES[ext], 'Cache-Control': ['html', 'js', 'webmanifest'].includes(ext) ? 'no-cache' : 'max-age=86400',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p.startsWith('/__mock/')) {
      const hook = p.slice(8);
      if (hook === 'reset') { S = freshState(); changed(); return send(res, 200, { ok: true }); }
      if (hook === 'inputs') return send(res, 200, { inputs: S.inputs });
      if (hook === 'pin') return send(res, 200, { pin: S.pairing?.pin || null });
      if (hook === 'ha') { S.haOffline = url.searchParams.get('offline') === '1'; changed(); return send(res, 200, { offline: S.haOffline }); }
      if (hook === 'tv') { S.tv.state = url.searchParams.get('state') || 'off'; changed(); return send(res, 200, S.tv); }
      if (hook === 'kick') { for (const ws of sockets) ws.terminate(); return send(res, 200, { ok: true }); }
      if (hook === 'state') return send(res, 200, { currentUrl: S.currentUrl, devices: S.devices.map(pub) });
      return err(res, 404, 'not_found', 'hook');
    }
    if (p.startsWith('/api/v3/')) return await api(req, res, p.slice(7));
    if (p === '/launcher') { res.writeHead(301, { Location: '/launcher/' }); return res.end(); }
    if (p.startsWith('/launcher/')) { if (!isLocal(req)) return err(res, 403, 'loopback_only', 'Launcher is loopback-only'); return serveStatic(req, res, 'launcher', p.slice(10)); }
    if (p === '/remote') { res.writeHead(301, { Location: '/remote/' }); return res.end(); }
    if (p.startsWith('/remote/')) return serveStatic(req, res, 'remote', p.slice(8));
    if (p === '/') { res.writeHead(302, { Location: isLocal(req) ? '/launcher/' : '/remote/' }); return res.end(); }
    err(res, 404, 'not_found', p);
  } catch (e) {
    err(res, e.status || 500, e.status === 413 ? 'too_large' : e.status === 400 ? 'invalid_json' : 'internal', e.message);
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
server.on('upgrade', (req, socket, head) => {
  const local = isLocal(req);
  const dev = session(req);
  const originOk = req.headers.origin === `http://${req.headers.host}`;
  if (new URL(req.url, 'http://x').pathname !== '/api/v3/ws' || !originOk || (!local && !dev)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, ws => {
    ws.deviceId = dev?.id || null;
    sockets.add(ws);
    ws.send(JSON.stringify({ type: 'state', state: snapshot(local) }));
    ws.on('close', () => sockets.delete(ws));
    ws.on('message', raw => {
      let msg; try { msg = JSON.parse(raw); } catch { return ws.send(JSON.stringify({ type: 'error', id: null, error: { code: 'invalid_json', message: 'Bad JSON' } })); }
      if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', id: msg.id }));
      if (msg.type === 'input' && msg.input && typeof msg.input.type === 'string') { S.inputs.push(msg.input); return ws.send(JSON.stringify({ type: 'ack', id: msg.id, ok: true })); }
      ws.send(JSON.stringify({ type: 'error', id: msg.id, error: { code: 'invalid_message', message: 'Unknown message' } }));
    });
  });
});

server.listen(PORT, () => console.log(`Smart TV mock on :${PORT} — TV http://127.0.0.1:${PORT}/launcher/  phone http://localhost:${PORT}/remote/`));

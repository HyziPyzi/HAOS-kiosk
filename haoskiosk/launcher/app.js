'use strict';
// Smart TV OS v3 — TV launcher. Loopback-only page shown in the kiosk Chrome.
// Talks to /api/v3 with the local TV privilege (see docs/smart-tv-v3/API_CONTRACT.md).
// Works without a mouse: every control is reachable with arrows, OK and Back,
// which is also what the phone remote and USB HID remotes send.
(() => {
  const API = '/api/v3';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------- icons
  // Trusted constant markup only; never interpolate data into these strings.
  const ICONS = {
    power: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
    house: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5 10 17 19 7"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    toggle: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="16.5" cy="12" r="2.5"/>',
    sparkle: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>',
    thermo: '<path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z"/><path d="M12 9v6"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    screen: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4M6.5 8.5v-1h1.5M17.5 8.5v-1H16M6.5 12.5v1h1.5M17.5 12.5v1H16"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1.1-1.7-1.1-2.9 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    tv: '<rect x="2.5" y="5" width="19" height="13" rx="2"/><path d="M8 21h8"/>',
    spotify: '<circle cx="12" cy="12" r="9.5"/><path d="M7 9.6c3.6-1 7.4-.7 10.3.9M7.6 12.8c2.9-.8 5.9-.5 8.3.8M8.3 15.8c2.2-.6 4.4-.4 6.2.6"/>',
    // weather
    sunny: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    night: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    cloudy: '<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z"/>',
    partly: '<path d="M8 4.5V3M3.4 8.4 2.3 7.3M12.6 7.3l1.1-1.1M2.5 12H1"/><path d="M5.6 11.2a3.5 3.5 0 0 1 5.8-3.5"/><path d="M9 20h9a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.4-.9A3.9 3.9 0 0 0 9 20z"/>',
    rain: '<path d="M7 15h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 6.1 4.5 4.5 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    snow: '<path d="M7 15h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 6.1 4.5 4.5 0 0 0 7 15z"/><path d="M8 19h.01M12 21h.01M16 19h.01M10 18h.01M14 18h.01"/>',
    fog: '<path d="M4 9h16M2 13h20M5 17h14"/>',
    storm: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>',
    // avatar motifs
    leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
    wave: '<path d="M2 10c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.5 5-1M2 16c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.5 5-1"/>',
    mountain: '<path d="M2 20 9 8l4 6 2.5-3.5L22 20z"/>',
    flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10 6 10.5 3 12 3s2 3 0 6.5M14.5 12c3.5-2 6.5-1.5 6.5 0s-3 2-6.5 0M12 14.5c2 3.5 1.5 6.5 0 6.5s-2-3 0-6.5M9.5 12C6 14 3 13.5 3 12s3-2 6.5 0"/>',
    drop: '<path d="M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z"/>',
    heart: '<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  };
  const AVATARS = {
    a1: ['sunny', '#f0b35b'], a2: ['night', '#8eb4e6'], a3: ['leaf', '#92d8ab'], a4: ['star', '#e98aa8'],
    a5: ['wave', '#6fc7d9'], a6: ['mountain', '#b7a6ef'], a7: ['flower', '#f2a07f'], a8: ['drop', '#7fa7f2'],
    a9: ['cloudy', '#c9d1e3'], a10: ['storm', '#f4d35e'], a11: ['heart', '#f28b8b'], a12: ['note', '#a3e0c8'],
  };
  const ACCENTS = ['#f0b35b', '#f2907f', '#e98aa8', '#b7a6ef', '#8eb4e6', '#6fc7d9', '#92d8ab', '#e8e2d4'];
  const WALLPAPERS = [['dusk', 'Zmierzch'], ['midnight', 'Północ'], ['slate', 'Grafit'], ['aurora', 'Zorza']];
  const WEATHER = {
    'sunny': ['sunny', 'Słonecznie'], 'clear-night': ['night', 'Pogodna noc'], 'partlycloudy': ['partly', 'Częściowe zachmurzenie'],
    'cloudy': ['cloudy', 'Pochmurno'], 'rainy': ['rain', 'Deszcz'], 'pouring': ['rain', 'Ulewa'], 'snowy': ['snow', 'Śnieg'],
    'snowy-rainy': ['snow', 'Deszcz ze śniegiem'], 'hail': ['snow', 'Grad'], 'fog': ['fog', 'Mgła'], 'lightning': ['storm', 'Burza'],
    'lightning-rainy': ['storm', 'Burza z deszczem'], 'windy': ['wind', 'Wietrznie'], 'windy-variant': ['wind', 'Wietrznie'], 'exceptional': ['info', 'Nietypowe warunki'],
  };
  const STAGES = {
    queued: 'Przygotowuję…', powering_on: 'Włączam telewizor', waiting_tv: 'Czekam, aż telewizor będzie gotowy',
    selecting_source: 'Przełączam źródło HDMI', scene: 'Ustawiam światła', launching: 'Otwieram', completed: 'Gotowe', failed: 'Nie udało się',
  };
  const STAGE_STEP = { queued: 0, powering_on: 1, waiting_tv: 1, selecting_source: 1, scene: 1, launching: 2, completed: 3 };
  // Used only when the v3 API is unreachable, so the launcher still opens services.
  const FALLBACK_APPS = [
    ['netflix', 'Netflix', 'https://www.netflix.com/'], ['max', 'Max', 'https://play.max.com/'], ['prime', 'Prime Video', 'https://www.primevideo.com/'],
    ['youtube', 'YouTube', 'https://www.youtube.com/'], ['spotify', 'Spotify', 'https://open.spotify.com/'],
    ['home_assistant', 'Home Assistant', null], ['browser', 'Przeglądarka', null],
  ].map(([id, name, url]) => ({ id, name, url, icon: id, kind: 'builtin' }));

  // ---------------------------------------------------------------- DOM helpers
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'nav') { el.setAttribute('data-nav', ''); el.dataset.key = v; }
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }
  function icon(name) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'i'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name] || ICONS.info;
    return svg;
  }
  function avatar(profile, cls = '') {
    const [motif, color] = AVATARS[profile?.avatar] || AVATARS.a1;
    return h('span', { class: `avatar ${cls}`, style: { '--av': profile?.color || color } }, icon(motif));
  }

  // ---------------------------------------------------------------- state
  let S = null;              // last /state snapshot
  let apiOk = false;
  let haUrlFallback = null;
  const ui = { screen: 'home', section: 'look', lastKey: {}, rowKey: {}, grab: null, available: null, launch: null };
  const layers = [];         // stack of {el, onClose, returnKey}

  const profile = () => S?.profiles.find(p => p.id === S.active_profile_id) || S?.profiles[0] || null;
  function look() {
    const s = S?.settings || {};
    const pref = profile()?.preferences || {};
    return { accent: pref.accent || s.accent || '#f0b35b', wallpaper: pref.wallpaper || s.wallpaper || 'dusk', animation: pref.animation || s.animation || 'full' };
  }
  const appById = id => S?.apps.find(a => a.id === id);
  function orderedApps() {
    const order = profile()?.app_order || [];
    const apps = S?.apps || [];
    return [...order.map(appById).filter(Boolean), ...apps.filter(a => !order.includes(a.id))];
  }
  function favoriteApps() {
    const fav = profile()?.favorites || [];
    const list = orderedApps().filter(a => fav.includes(a.id));
    return list.length ? list : orderedApps().slice(0, 5);
  }

  // ---------------------------------------------------------------- API
  async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch(API + path, {
      method, cache: 'no-store', credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await response.json(); } catch (_) { /* empty body */ }
    if (!response.ok) {
      const error = new Error(data?.error?.message || `Błąd ${response.status}`);
      error.status = response.status; error.code = data?.error?.code;
      throw error;
    }
    return data;
  }
  async function guarded(task, okText) {
    try { const result = await task(); if (okText) toast(okText); return result; }
    catch (error) { toast(error.message || 'Coś poszło nie tak', true); return null; }
  }

  async function loadState() {
    try {
      setState(await api('/state'));
      apiOk = true;
    } catch (_) {
      apiOk = false;
      if (!S) await loadFallback();
    }
  }
  async function loadFallback() {
    try { haUrlFallback = (await (await fetch('/launcher/config', { cache: 'no-store' })).json()).ha_url || null; } catch (_) { /* optional */ }
    const apps = FALLBACK_APPS.map(a => a.id === 'home_assistant' ? { ...a, url: haUrlFallback } : a);
    setState({
      version: '', apps, recent: [], active_profile_id: 'default',
      profiles: [{ id: 'default', name: 'Dom', avatar: 'a1', favorites: apps.map(a => a.id), app_order: [], preferences: {} }],
      settings: { safe_area: 0, accent: '#f0b35b', animation: 'full', wallpaper: 'dusk', night_mode: false, entities: [], shortcuts: [] },
      tv: { configured: false, state: 'unknown' }, home: { entities: [], weather: null }, capabilities: {}, operation: null, pairing: null,
    });
    toast('Funkcje Smart TV są chwilowo niedostępne. Aplikacje nadal działają.', true);
  }

  function setState(next) {
    S = next;
    applyLook();
    if (editing()) { ui.pendingRender = true; return; }
    render();
  }
  const editing = () => document.activeElement?.matches?.('input') || !!ui.grab;

  // ---------------------------------------------------------------- live updates
  let ws = null, wsDelay = 1000, refreshTimer = null;
  function connect() {
    try { ws = new WebSocket(`ws://${location.host}${API}/ws`); } catch (_) { return scheduleReconnect(); }
    ws.onopen = () => { wsDelay = 1000; };
    ws.onmessage = event => {
      let msg; try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg.type === 'state') { apiOk = true; setState(msg.state); }
      else if (msg.type === 'state_changed') { clearTimeout(refreshTimer); refreshTimer = setTimeout(loadState, 150); }
      else if (msg.type === 'operation') onOperation(msg.operation);
      else if (msg.type === 'pairing' && msg.state === 'completed') onPaired(msg.device);
    };
    ws.onclose = () => { ws = null; scheduleReconnect(); };
  }
  function scheduleReconnect() {
    const delay = Math.min(30000, wsDelay) * (0.8 + Math.random() * 0.4);
    wsDelay = Math.min(30000, wsDelay * 2);
    setTimeout(() => { loadState(); connect(); }, delay);
  }

  // ---------------------------------------------------------------- look & feel
  function applyLook() {
    const l = look();
    const root = document.documentElement;
    root.dataset.wallpaper = l.wallpaper;
    root.dataset.motion = l.animation;
    root.classList.toggle('night', !!S?.settings?.night_mode);
    root.style.setProperty('--accent', l.accent);
    root.style.setProperty('--safe', String(Math.max(0, Math.min(10, Number(S?.settings?.safe_area) || 0))));
  }
  function glowFor(el) {
    const brand = el && getComputedStyle(el).getPropertyValue('--brand').trim();
    $('glow').style.setProperty('--glow', brand || look().accent);
  }

  // ---------------------------------------------------------------- clock
  function tickClock() {
    const now = new Date();
    $('clock').textContent = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    $('clock').setAttribute('datetime', now.toISOString());
    const date = now.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
    $('date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
    setTimeout(tickClock, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
  }
  function fmtTemp(value) { const n = Number(value); return Number.isFinite(n) ? `${n.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}°` : '–'; }

  // ---------------------------------------------------------------- navigation
  function scope() { return layers.length ? layers[layers.length - 1].el : $(`screen-${ui.screen}`); }
  function navigables(root = scope()) {
    return [...root.querySelectorAll('[data-nav]')].filter(el => !el.disabled && el.getClientRects().length && !el.closest('[hidden]'));
  }
  function focusEl(el, opts = {}) {
    if (!el) return;
    el.focus({ preventScroll: true });
    reveal(el);
    if (!layers.length) ui.lastKey[ui.screen] = el.dataset.key;
    const row = el.closest('[data-row]');
    if (row) ui.rowKey[row.dataset.row] = el.dataset.key;
    document.querySelectorAll('.row.has-focus').forEach(r => r.classList.remove('has-focus'));
    el.closest('.row')?.classList.add('has-focus');
    if (!opts.keepGlow) glowFor(el);
    if (el.dataset.section && el.dataset.section !== ui.section) { ui.section = el.dataset.section; renderSettingsPanel(); }
  }
  function focusKey(key, root = scope()) {
    const list = navigables(root);
    focusEl(list.find(el => el.dataset.key === key) || list[0]);
  }
  function reveal(el) {
    const track = el.closest('.row-track');
    if (track) {
      const t = track.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 60;
      if (r.left < t.left + pad) track.scrollLeft += r.left - t.left - pad;
      else if (r.right > t.right - pad) track.scrollLeft += r.right - t.right + pad;
    }
    const box = el.closest('[data-scroll]');
    if (!box) return;
    const row = el.closest('.row');
    if (box.id === 'home-scroller' && row) {
      // TV pattern: the first row sits under the clock; deeper rows slide up to the top.
      const first = row === row.parentElement.firstElementChild;
      box.scrollTop = first ? 0 : box.scrollTop + row.getBoundingClientRect().top - box.getBoundingClientRect().top - 10;
      return;
    }
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 70;
    if (r.top < b.top + pad) box.scrollTop += r.top - b.top - pad;
    else if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - b.bottom + pad;
  }
  function move(dir) {
    const list = navigables();
    const cur = document.activeElement;
    if (!list.includes(cur)) { focusEl(list[0]); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      let main, cross;
      if (dir === 'right') { if (bx <= ax + 2 || b.left < a.left + 4) continue; main = Math.max(0, b.left - a.right); cross = Math.abs(by - ay); }
      else if (dir === 'left') { if (bx >= ax - 2 || b.right > a.right - 4) continue; main = Math.max(0, a.left - b.right); cross = Math.abs(by - ay); }
      else if (dir === 'down') { if (by <= ay + 2 || b.top < a.top + 4) continue; main = Math.max(0, b.top - a.bottom); cross = Math.max(0, b.left - a.right, a.left - b.right) + Math.abs(bx - ax) * 0.15; }
      else { if (by >= ay - 2 || b.bottom > a.bottom - 4) continue; main = Math.max(0, a.top - b.bottom); cross = Math.max(0, b.left - a.right, a.left - b.right) + Math.abs(bx - ax) * 0.15; }
      const score = main + cross * (dir === 'left' || dir === 'right' ? 3 : 2);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best) return;
    // Entering a row vertically returns to the item last used in that row.
    const row = best.closest('[data-row]');
    if ((dir === 'up' || dir === 'down') && row && row !== cur.closest('[data-row]')) {
      const remembered = list.find(el => el.dataset.key === ui.rowKey[row.dataset.row] && el.closest('[data-row]') === row);
      if (remembered) best = remembered;
    }
    focusEl(best);
  }

  function showScreen(name, focusKeyName) {
    const prev = ui.screen;
    ui.screen = name;
    for (const id of ['home', 'apps', 'dom', 'settings']) $(`screen-${id}`).hidden = id !== name;
    const el = $(`screen-${name}`);
    if (prev !== name) { el.classList.add('entering'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering'))); }
    render();
    focusKey(focusKeyName || ui.lastKey[name]);
    updateOverscanPreview();
  }
  function back() {
    if (ui.grab) { dropGrab(true); return; }
    if (layers.length) { closeLayer(); return; }
    if (ui.screen !== 'home') { showScreen('home'); return; }
    $('home-scroller').scrollTop = 0;
    focusKey('fav:' + (favoriteApps()[0]?.id || ''));
  }
  function goHome() {
    while (layers.length) closeLayer(true);
    if (ui.grab) dropGrab(true);
    showScreen('home', 'fav:' + (favoriteApps()[0]?.id || ''));
    $('home-scroller').scrollTop = 0;
  }

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey) return;
    if (event.altKey && event.key !== 'ArrowLeft') return;
    const el = document.activeElement;
    const inInput = el?.matches?.('input');
    const key = event.key;
    if (key === 'Escape' || key === 'BrowserBack' || key === 'GoBack' || (event.altKey && key === 'ArrowLeft') || (key === 'Backspace' && !inInput)) {
      event.preventDefault();
      if (inInput && key === 'Escape') { el.blur(); el.closest('[data-nav]') ? focusEl(el.closest('[data-nav]')) : back(); return; }
      back(); return;
    }
    if (key === 'Home' && !inInput || key === 'BrowserHome') { event.preventDefault(); goHome(); return; }
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[key];
    if (dir) {
      if (inInput && (dir === 'left' || dir === 'right')) return; // caret movement while typing
      event.preventDefault();
      if (ui.grab) { moveGrab(dir); return; }
      move(dir); return;
    }
    if (key === 'Enter' || (key === ' ' && !inInput)) {
      if (event.repeat) { event.preventDefault(); return; }
      if (ui.grab) { event.preventDefault(); dropGrab(false); return; }
      if (inInput) { event.preventDefault(); el.closest('.layer')?.querySelector('[data-submit]')?.click(); return; }
      if (el && el !== document.body) { event.preventDefault(); el.click(); }
    }
  });
  document.addEventListener('mousemove', event => {
    document.body.classList.add('pointer');
    clearTimeout(ui.pointerTimer);
    ui.pointerTimer = setTimeout(() => document.body.classList.remove('pointer'), 4000);
    const target = event.target.closest?.('[data-nav]');
    if (target && target !== document.activeElement && scope().contains(target)) focusEl(target);
  }, { passive: true });
  document.addEventListener('focusout', () => setTimeout(() => {
    if (ui.pendingRender && !editing()) { ui.pendingRender = false; render(); }
  }, 0));

  // ---------------------------------------------------------------- toast
  function toast(text, isError = false) {
    const t = $('toast');
    t.textContent = text;
    t.classList.toggle('error', isError);
    t.classList.add('show');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 5200 : 2800);
  }

  // ---------------------------------------------------------------- layers
  function openLayer(content, { onClose, className = 'sheet', focus } = {}) {
    const returnKey = document.activeElement?.dataset?.key;
    const sheet = h('div', { class: className, role: 'dialog', 'aria-modal': 'true' }, content);
    const el = h('div', { class: 'layer' }, sheet);
    el.addEventListener('click', event => { if (event.target === el) closeLayer(); });
    $('layers').append(el);
    const entry = { el, onClose, returnKey, sheet };
    layers.push(entry);
    focusKey(focus, el);
    return entry;
  }
  function closeLayer(silent = false) {
    const entry = layers.pop();
    if (!entry) return;
    entry.el.remove();
    entry.onClose?.();
    if (!silent) {
      if (ui.pendingRender) { ui.pendingRender = false; render(); }
      focusKey(entry.returnKey);
    }
  }
  function replaceLayer(entry, content, focus) {
    entry.sheet.replaceChildren(...[content].flat().filter(Boolean));
    focusKey(focus, entry.el);
  }
  function menu(title, items) {
    const entry = openLayer([
      h('h2', null, title),
      h('div', { class: 'side-nav' }, items.map((item, i) => h('button', {
        class: `list-item ${item.danger ? 'danger' : ''}`, nav: `menu:${i}`,
        onclick: () => { closeLayer(); item.run(); },
      }, icon(item.icon), item.label))),
    ], { className: 'sheet menu', focus: 'menu:0' });
    return entry;
  }

  // ---------------------------------------------------------------- rendering
  function render() {
    if (!S) return;
    const keep = document.activeElement?.dataset?.key;
    renderTopbar();
    if (ui.screen === 'home') renderHome();
    else if (ui.screen === 'apps') renderApps();
    else if (ui.screen === 'dom') renderDom();
    else if (ui.screen === 'settings') renderSettings();
    if (!layers.length && keep) {
      const target = navigables().find(el => el.dataset.key === keep);
      if (target && target !== document.activeElement) focusEl(target, { keepGlow: true });
    }
    if (!layers.length && !scope().contains(document.activeElement)) focusKey(ui.lastKey[ui.screen]);
  }

  function renderTopbar() {
    const p = profile();
    $('profile-chip').replaceChildren(avatar(p), h('span', { class: 'name' }, p?.name || 'Dom'), ...(S.profiles.length > 1 ? [h('span', { class: 'hint' }, 'Zmień')] : []));
    $('profile-chip').onclick = openProfilePicker;
    const w = S.home?.weather;
    const actions = [];
    if (w && !S.home.error) {
      const [ic] = WEATHER[w.condition] || ['cloudy'];
      actions.push(h('div', { class: 'weather-chip', 'aria-label': `Pogoda: ${fmtTemp(w.temperature)}` }, icon(ic), fmtTemp(w.temperature), w.humidity != null && h('small', null, `${w.humidity}%`)));
    }
    const tvOn = ['on', 'playing', 'paused', 'idle', 'buffering'].includes(S.tv?.state);
    if (S.tv?.configured) actions.push(iconBtn('top:tv', 'power', tvOn ? 'Wyłącz telewizor' : 'Włącz telewizor', () => tvPower(tvOn ? 'off' : 'on'), tvOn ? 'is-on' : ''));
    actions.push(iconBtn('top:dom', 'house', 'Dom', () => showScreen('dom')));
    actions.push(iconBtn('top:pair', 'phone', 'Sparuj telefon', startPairing));
    actions.push(iconBtn('top:settings', 'sliders', 'Ustawienia', () => showScreen('settings')));
    $('topbar-actions').replaceChildren(...actions);
  }
  function iconBtn(key, ic, label, run, cls = '') {
    return h('button', { class: `icon-btn ${cls}`, nav: key, 'aria-label': label, onclick: run }, icon(ic), h('span', { class: 'tip' }, label));
  }

  function appMark(app) {
    switch (app.id) {
      case 'netflix': return h('span', { class: 'mark' }, 'NETFLIX');
      case 'max': return h('span', { class: 'mark' }, 'max');
      case 'prime': return h('span', { class: 'mark' }, 'prime video');
      case 'youtube': return h('span', { class: 'mark' }, h('span', { class: 'play' }), 'YouTube');
      case 'spotify': return h('span', { class: 'mark' }, icon('spotify'), 'Spotify');
      case 'home_assistant': return h('span', { class: 'mark' }, icon('house'), 'Home Assistant');
      case 'browser': return h('span', { class: 'mark' }, icon('globe'), 'Internet');
      default: return h('span', { class: 'mark' }, app.name);
    }
  }
  function appTile(app, key, { small = false, run } = {}) {
    const cls = app.kind === 'shortcut' ? 'app-shortcut' : `app-${app.id}`;
    return h('button', { class: `tile ${cls} ${small ? 'sm' : ''}`, nav: key, 'aria-label': app.name, onclick: run || (() => launchApp(app)) },
      appMark(app), h('span', { class: 'label' }, app.name));
  }
  function row(id, title, items, { labels = false } = {}) {
    return h('section', { class: 'row', 'data-row': id, 'aria-label': title },
      h('h2', null, title), h('div', { class: `row-track ${labels ? 'labels' : ''}` }, items));
  }

  function renderHome() {
    renderAmbient();
    const rows = [];
    const favs = favoriteApps();
    rows.push(row('fav', 'Ulubione', favs.map(a => appTile(a, `fav:${a.id}`)), { labels: true }));
    const recent = (S.recent || []).map(appById).filter(a => a && a.id !== 'browser').slice(0, 6);
    if (recent.length) rows.push(row('recent', 'Ostatnio używane', recent.map(a => appTile(a, `recent:${a.id}`, { small: true })), { labels: true }));
    const others = orderedApps().filter(a => !favs.includes(a));
    rows.push(row('apps', 'Aplikacje', [
      ...others.map(a => appTile(a, `app:${a.id}`, { small: true })),
      h('button', { class: 'tile sm add', nav: 'app:__all', onclick: () => showScreen('apps') }, h('span', { class: 'mark' }, icon('grid'), 'Ułóż aplikacje')),
    ], { labels: true }));
    rows.push(row('dom', 'Dom', domCards('home', 6)));
    $('rows').replaceChildren(...rows);
  }
  function renderAmbient() {
    const parts = [];
    const w = S.home?.weather;
    if (S.home?.error) parts.push('Home Assistant nie odpowiada, dane domu są niedostępne.');
    else if (w) parts.push(`${(WEATHER[w.condition] || [, 'Pogoda'])[1]}, na zewnątrz ${fmtTemp(w.temperature)}.`);
    const inside = (S.home?.entities || []).find(e => e.domain === 'sensor' && e.attributes?.device_class === 'temperature');
    if (inside && inside.state !== 'unavailable') parts.push(`${inside.name}: ${fmtTemp(inside.state)}.`);
    $('ambient').textContent = parts.join(' ');
  }

  // ---------------------------------------------------------------- smart home
  function entityIcon(e) {
    return { light: 'bulb', switch: 'toggle', scene: 'sparkle', script: 'sparkle', climate: 'thermo', sensor: 'thermo' }[e.domain] || 'info';
  }
  function entityState(e) {
    if (e.state === 'unavailable' || e.state === 'unknown') return 'Niedostępne';
    if (e.domain === 'light') return e.state === 'on' ? (e.attributes?.brightness_pct ? `Włączone, ${e.attributes.brightness_pct}%` : 'Włączone') : 'Wyłączone';
    if (e.domain === 'switch') return e.state === 'on' ? 'Włączone' : 'Wyłączone';
    if (e.domain === 'scene' || e.domain === 'script') return 'Uruchom';
    if (e.domain === 'sensor') return `${Number.isFinite(Number(e.state)) ? Number(e.state).toLocaleString('pl-PL') : e.state} ${e.attributes?.unit || ''}`.trim();
    if (e.domain === 'climate') return `${fmtTemp(e.attributes?.current_temperature)} → ${fmtTemp(e.attributes?.temperature)}`;
    return e.state;
  }
  function entityCard(e, key) {
    const on = (e.domain === 'light' || e.domain === 'switch') && e.state === 'on';
    const dim = e.domain === 'light' && e.attributes?.supported?.includes('brightness');
    const actionable = ['light', 'switch', 'scene', 'script'].includes(e.domain);
    const unavailable = e.state === 'unavailable' || e.state === 'unknown';
    return h(actionable ? 'button' : 'div', {
      class: `card ${on ? 'is-on' : ''} ${unavailable ? 'unavailable' : ''}`, nav: actionable ? key : null,
      'aria-label': `${e.name}: ${entityState(e)}`,
      onclick: actionable && !unavailable ? () => entityAction(e) : null,
    },
    h('span', { class: 'c-top' }, icon(entityIcon(e))),
    h('span', { class: 'c-name' }, e.name), h('span', { class: 'c-state' }, entityState(e)),
    dim && h('span', { class: 'bar' }, h('i', { style: { width: `${on ? e.attributes.brightness_pct || 0 : 0}%` } })));
  }
  function movieCard(key) {
    return h('button', { class: 'card movie', nav: key, onclick: movieNight, style: { '--brand': '#e5a24a' } },
      h('span', { class: 'c-top' }, icon('film')),
      h('span', { class: 'c-name' }, 'Wieczór filmowy'), h('span', { class: 'c-state' }, movieSummary()));
  }
  function movieSummary() {
    const s = S.settings || {};
    const app = appById(s.movie_app);
    const bits = [];
    if (s.movie_scene || s.movie_lights?.length) bits.push(`światła ${s.movie_brightness ?? 0}%`);
    if (app) bits.push(app.name);
    return bits.length ? bits.join(', ') : 'Skonfiguruj w ustawieniach';
  }
  function domCards(prefix, limit) {
    if (S.home?.error) return [h('div', { class: 'card wide unavailable' }, h('span', { class: 'c-top' }, icon('info')), h('span', { class: 'c-name' }, 'Home Assistant nie odpowiada'), h('span', { class: 'c-state' }, 'Sterowanie domem wróci, gdy połączenie się odnowi.'))];
    const cards = [movieCard(`${prefix}:movie`)];
    const entities = (S.home?.entities || []).filter(e => (e.domain !== 'sensor' || prefix !== 'home') && e.entity_id !== S.settings?.movie_scene);
    entities.slice(0, limit).forEach(e => cards.push(entityCard(e, `${prefix}:${e.entity_id}`)));
    if (!S.settings?.entities?.length) cards.push(h('button', { class: 'card wide', nav: `${prefix}:__pick`, onclick: () => { ui.section = 'home'; showScreen('settings', 'set:home'); } }, h('span', { class: 'c-top' }, icon('plus')), h('span', { class: 'c-name' }, 'Wybierz urządzenia'), h('span', { class: 'c-state' }, 'Pokaż tu swoje światła i sceny z Home Assistanta')));
    else if (prefix === 'home' && entities.length > limit) cards.push(h('button', { class: 'card', nav: `${prefix}:__more`, onclick: () => showScreen('dom') }, h('span', { class: 'c-top' }, icon('grid')), h('span', { class: 'c-name' }, 'Cały dom'), h('span', { class: 'c-state' }, `${entities.length - limit} więcej`)));
    return cards;
  }
  function renderDom() {
    const el = $('screen-dom');
    const groups = [['Światła i przełączniki', ['light', 'switch']], ['Sceny', ['scene', 'script']], ['Klimat', ['climate', 'sensor']]];
    const entities = S.home?.entities || [];
    const body = h('div', { class: 'screen-body', 'data-scroll': '' });
    body.append(h('h3', { class: 'section-title' }, 'Na wieczór'), h('div', { class: 'grid', 'data-row': 'dom-movie' }, movieCard('dom:movie'), weatherCard()));
    if (S.home?.error) body.append(h('p', { class: 'empty' }, 'Home Assistant nie odpowiada. Sterowanie domem wróci, gdy połączenie się odnowi.'));
    for (const [title, domains] of groups) {
      const list = entities.filter(e => domains.includes(e.domain));
      if (list.length) body.append(h('h3', { class: 'section-title' }, title), h('div', { class: 'grid' }, list.map(e => entityCard(e, `dom:${e.entity_id}`))));
    }
    if (!entities.length && !S.home?.error) body.append(h('p', { class: 'empty' }, 'Nie wybrano jeszcze żadnych urządzeń. Wybierz je w Ustawieniach, w sekcji Dom i telewizor.'),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', nav: 'dom:__pick', onclick: () => { ui.section = 'home'; showScreen('settings', 'set:home'); } }, icon('plus'), 'Wybierz urządzenia')));
    el.replaceChildren(screenHead('Dom', 'dom', S.home?.weather ? `${(WEATHER[S.home.weather.condition] || [, ''])[1]} ${fmtTemp(S.home.weather.temperature)}` : ''), body);
  }
  function weatherCard() {
    const w = S.home?.weather;
    if (!w) return null;
    const [ic, label] = WEATHER[w.condition] || ['cloudy', w.condition];
    return h('div', { class: 'card wide' }, h('span', { class: 'c-top' }, icon(ic)), h('span', { class: 'c-name' }, `${fmtTemp(w.temperature)} ${label}`), h('span', { class: 'c-state' }, [w.name, w.humidity != null ? `wilgotność ${w.humidity}%` : null].filter(Boolean).join(', ')));
  }
  function screenHead(title, key, sub) {
    return h('header', { class: 'screen-head' },
      iconBtn(`${key}:back`, 'back', 'Wróć', back), h('h1', null, title), sub && h('span', { class: 'sub' }, sub));
  }
  async function entityAction(e) {
    if (e.domain === 'light' && e.attributes?.supported?.includes('brightness')) {
      const levels = [10, 25, 50, 75, 100];
      menu(e.name, [
        { icon: 'power', label: e.state === 'on' ? 'Wyłącz' : 'Włącz', run: () => homeAction(e, e.state === 'on' ? 'turn_off' : 'turn_on') },
        ...levels.map(level => ({ icon: 'bulb', label: `Jasność ${level}%`, run: () => homeAction(e, 'turn_on', level) })),
      ]);
      return;
    }
    const action = e.domain === 'scene' || e.domain === 'script' ? 'turn_on' : 'toggle';
    await homeAction(e, action);
  }
  async function homeAction(e, action, brightness) {
    const body = { entity_id: e.entity_id, action };
    if (brightness != null) body.brightness_pct = brightness;
    await guarded(() => api('/home/action', { method: 'POST', body }), e.domain === 'scene' || e.domain === 'script' ? `Uruchomiono: ${e.name}` : null);
  }
  async function movieNight() {
    const data = await guarded(() => api('/movie', { method: 'POST', body: {} }));
    if (data?.operation) showLaunch(appById(S.settings?.movie_app) || null, data.operation, 'Wieczór filmowy');
  }
  async function tvPower(state) {
    await guarded(() => api('/tv', { method: 'POST', body: { action: state } }), state === 'on' ? 'Włączam telewizor' : 'Wyłączam telewizor');
  }

  // ---------------------------------------------------------------- launching
  async function launchApp(app, url) {
    if (app?.id === 'browser' && !url) { openUrlDialog(); return; }
    const target = url || app?.url;
    if (!apiOk) {
      if (target) window.location.assign(target);
      else toast('Ten skrót nie ma adresu. Sprawdź ustawienia dodatku.', true);
      return;
    }
    try {
      const body = url ? { url } : { app_id: app.id };
      body.profile_id = S.active_profile_id;
      const data = await api('/apps/launch', { method: 'POST', body });
      showLaunch(app, data.operation);
    } catch (error) {
      if (error.status === 409) toast('Trwa już uruchamianie innej aplikacji.', true);
      else if (error instanceof TypeError && target) window.location.assign(target);
      else toast(error.message, true);
    }
  }
  function showLaunch(app, operation, title) {
    const display = app || { id: null, name: title || 'Strona', kind: 'shortcut' };
    if (!ui.launch) {
      const content = h('div', { class: 'launching' });
      const entry = openLayer(content, { className: 'sheet', onClose: () => { ui.launch = null; } });
      ui.launch = { entry, content, app: display, title };
    }
    renderLaunch(operation);
  }
  function renderLaunch(op) {
    const L = ui.launch;
    if (!L) return;
    L.op = op;
    const failed = op.state === 'failed';
    const step = failed ? -1 : STAGE_STEP[op.stage] ?? 0;
    let stage = STAGES[op.stage] || op.stage;
    if (op.stage === 'launching') stage = `Otwieram ${L.app.name}`;
    const tile = appTile(L.app, 'launch:tile', { run: () => {} });
    tile.removeAttribute('data-nav');
    const parts = [tile, h('p', { class: 'stage' }, failed ? (op.error?.message || STAGES.failed) : stage)];
    if (!failed) parts.push(h('div', { class: 'steps', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(i => h('i', { class: i < step ? 'done' : i === step ? 'now' : '' }))));
    if (failed) parts.push(h('div', { class: 'actions' },
      h('button', { class: 'btn', nav: 'launch:close', onclick: () => closeLayer() }, 'Zamknij'),
      L.app.id && h('button', { class: 'btn primary', nav: 'launch:retry', onclick: () => { closeLayer(); launchApp(L.app); } }, 'Spróbuj ponownie')));
    L.content.replaceChildren(...parts.filter(Boolean));
    if (failed) focusKey('launch:retry', L.entry.el);
    if (op.state === 'completed') setTimeout(() => { if (ui.launch?.op === op) closeLayer(); }, 1500);
  }
  function onOperation(op) {
    if (!op) return;
    if (ui.launch) { renderLaunch(op); return; }
    // A launch started from the phone: show progress here too, until Chrome navigates away.
    if (op.state === 'running') showLaunch(appById(op.app_id), op);
  }

  function normalizeAddress(value) {
    const text = value.trim();
    if (!text || /\s/.test(text)) throw new Error('Wpisz adres strony bez spacji.');
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text) && !/^[^/:]+:\d+(\/|$)/.test(text)) throw new Error('Dozwolone są adresy HTTP i HTTPS.');
    const url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Wpisz adres HTTP lub HTTPS bez loginu i hasła.');
    return url.href;
  }
  function openUrlDialog() {
    const input = h('input', { id: 'url-input', type: 'text', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'np. tvn24.pl', maxlength: '2048' });
    const error = h('p', { class: 'error', role: 'alert' });
    const open = () => {
      try { const url = normalizeAddress(input.value); closeLayer(); launchApp({ id: null, name: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), kind: 'shortcut' }, url); }
      catch (err) { error.textContent = err.message; input.focus(); }
    };
    openLayer([
      h('h2', null, 'Dokąd chcesz przejść?'),
      h('p', { class: 'lead' }, 'Wpisz adres z klawiatury, z pilota w telefonie albo klawiaturą ekranową (Ctrl + Alt + O). Bez http:// użyjemy HTTPS.'),
      h('label', { class: 'field', nav: 'url:field' }, h('span', null, 'Adres strony'), input),
      error,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', nav: 'url:cancel', onclick: () => closeLayer() }, 'Anuluj'),
        h('button', { class: 'btn primary', nav: 'url:open', 'data-submit': '', onclick: open }, icon('globe'), 'Otwórz stronę')),
    ], { focus: 'url:field' });
    input.focus();
  }
  // Fields are labels wrapping inputs; OK on the label moves the caret into the input.
  document.addEventListener('click', event => {
    const field = event.target.closest?.('.field');
    if (field && event.target === field) field.querySelector('input')?.focus();
  });

  // ---------------------------------------------------------------- apps screen (reorder, favourites)
  function renderApps() {
    const apps = orderedApps();
    const fav = profile()?.favorites || [];
    const grid = h('div', { class: 'grid labels' }, apps.map(a => {
      const tile = appTile(a, `apps:${a.id}`, { run: () => appMenu(a) });
      if (fav.includes(a.id)) tile.querySelector('.label').prepend('★ ');
      if (ui.grab?.id === a.id) tile.classList.add('is-grabbed');
      return tile;
    }), h('button', { class: 'tile add', nav: 'apps:__add', onclick: () => shortcutDialog() }, h('span', { class: 'mark' }, icon('plus'), 'Dodaj skrót')));
    grid.style.setProperty('row-gap', '76px');
    const hint = ui.grab ? 'Strzałkami przesuń kafelek, OK zapisuje, Wstecz anuluje' : `OK otwiera opcje kafelka. Profil: ${profile()?.name || ''}`;
    $('screen-apps').replaceChildren(screenHead('Aplikacje', 'apps', hint), h('div', { class: 'screen-body', 'data-scroll': '' }, grid));
  }
  function appMenu(app) {
    const p = profile();
    const isFav = p?.favorites?.includes(app.id);
    const items = [
      { icon: 'chevron', label: `Otwórz ${app.name}`, run: () => launchApp(app) },
      { icon: 'star', label: isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych', run: () => saveProfile({ favorites: isFav ? p.favorites.filter(x => x !== app.id) : [...(p.favorites || []), app.id] }, isFav ? 'Usunięto z ulubionych' : 'Dodano do ulubionych') },
      { icon: 'move', label: 'Przesuń', run: () => startGrab(app) },
    ];
    if (app.kind === 'shortcut') items.push({ icon: 'trash', label: 'Usuń skrót', danger: true, run: () => removeShortcut(app.id) });
    menu(app.name, items);
  }
  function startGrab(app) {
    ui.grab = { id: app.id, original: orderedApps().map(a => a.id) };
    ui.grab.order = [...ui.grab.original];
    renderApps();
    focusKey(`apps:${app.id}`);
  }
  function moveGrab(dir) {
    const order = ui.grab.order;
    const i = order.indexOf(ui.grab.id);
    const tiles = navigables().filter(el => el.dataset.key.startsWith('apps:') && el.dataset.key !== 'apps:__add');
    const top = tiles[0]?.getBoundingClientRect().top;
    const cols = Math.max(1, tiles.filter(el => Math.abs(el.getBoundingClientRect().top - top) < 30).length);
    const j = { left: i - 1, right: i + 1, up: i - cols, down: i + cols }[dir];
    if (j < 0 || j >= order.length) return;
    order.splice(i, 1); order.splice(j, 0, ui.grab.id);
    profile().app_order = [...order];
    renderApps();
    focusKey(`apps:${ui.grab.id}`);
  }
  function dropGrab(cancel) {
    const grab = ui.grab;
    ui.grab = null;
    if (cancel) profile().app_order = grab.original;
    renderApps();
    focusKey(`apps:${grab.id}`);
    if (!cancel) saveProfile({ app_order: grab.order }, 'Zapisano kolejność');
  }
  async function saveProfile(patch, okText, id = S.active_profile_id) {
    const data = await guarded(() => api(`/profiles/${encodeURIComponent(id)}`, { method: 'PUT', body: patch }), okText);
    if (data?.profile) { const i = S.profiles.findIndex(p => p.id === data.profile.id); if (i >= 0) S.profiles[i] = data.profile; else S.profiles.push(data.profile); applyLook(); render(); }
    return data;
  }
  async function patchSettings(patch, okText) {
    const data = await guarded(() => api('/settings', { method: 'PATCH', body: patch }), okText);
    if (data?.settings) { S.settings = data.settings; applyLook(); if (!editing()) render(); }
    return data;
  }
  function shortcutDialog() {
    const name = h('input', { type: 'text', maxlength: '40', autocomplete: 'off', placeholder: 'np. TVP VOD' });
    const url = h('input', { type: 'text', inputmode: 'url', maxlength: '2048', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'np. vod.tvp.pl' });
    const error = h('p', { class: 'error', role: 'alert' });
    const save = async () => {
      try {
        if (!name.value.trim()) throw new Error('Podaj nazwę skrótu.');
        const href = normalizeAddress(url.value);
        const shortcuts = [...(S.settings.shortcuts || []), { id: `s${Date.now().toString(36)}`, name: name.value.trim(), url: href }];
        if (await patchSettings({ shortcuts }, 'Dodano skrót')) closeLayer();
      } catch (err) { error.textContent = err.message; }
    };
    openLayer([
      h('h2', null, 'Nowy skrót'),
      h('p', { class: 'lead' }, 'Skrót otwiera wybraną stronę jak aplikację. Loginy zostają w profilu Chrome, nie w launcherze.'),
      h('label', { class: 'field', nav: 'sc:name' }, h('span', null, 'Nazwa'), name),
      h('label', { class: 'field', nav: 'sc:url', style: { 'margin-top': '16px' } }, h('span', null, 'Adres'), url),
      error,
      h('div', { class: 'actions' }, h('button', { class: 'btn', nav: 'sc:cancel', onclick: () => closeLayer() }, 'Anuluj'), h('button', { class: 'btn primary', nav: 'sc:save', 'data-submit': '', onclick: save }, icon('check'), 'Dodaj skrót')),
    ], { focus: 'sc:name' });
    name.focus();
  }
  async function removeShortcut(id) {
    await patchSettings({ shortcuts: (S.settings.shortcuts || []).filter(s => s.id !== id) }, 'Usunięto skrót');
  }

  // ---------------------------------------------------------------- profiles
  function openProfilePicker() {
    openLayer([
      h('h2', { style: { 'text-align': 'center' } }, 'Kto ogląda?'),
      h('div', { class: 'profiles' }, S.profiles.map(p => h('button', {
        class: `profile-pick ${p.id === S.active_profile_id ? 'is-current' : ''}`, nav: `pp:${p.id}`,
        onclick: async () => { closeLayer(); if (p.id !== S.active_profile_id) { const r = await guarded(() => api('/profiles/active', { method: 'POST', body: { profile_id: p.id } })); if (r) { S.active_profile_id = r.active_profile_id; applyLook(); render(); toast(`Cześć, ${p.name}`); } } },
      }, avatar(p, 'lg'), h('span', { class: 'p-name' }, p.name), p.id === S.active_profile_id && h('span', { class: 'p-now' }, 'teraz'))),
      h('button', { class: 'profile-pick', nav: 'pp:__add', onclick: () => { closeLayer(); profileDialog(null); } }, h('span', { class: 'avatar lg', style: { '--av': 'rgb(255 255 255 / .1)', color: 'var(--text)' } }, icon('plus')), h('span', { class: 'p-name' }, 'Dodaj'))),
    ], { className: 'sheet', focus: `pp:${S.active_profile_id}` });
  }
  function profileDialog(existing) {
    const p = existing || { id: `p${Date.now().toString(36)}`, name: '', avatar: 'a2', favorites: [], app_order: [], preferences: {} };
    let chosen = p.avatar;
    const name = h('input', { type: 'text', maxlength: '24', autocomplete: 'off', value: p.name, placeholder: 'np. Ania' });
    const error = h('p', { class: 'error', role: 'alert' });
    const grid = h('div', { class: 'avatar-grid' }, Object.keys(AVATARS).map(id => h('button', {
      class: id === chosen ? 'is-on' : '', nav: `pd:av:${id}`, 'aria-label': `Awatar ${id.slice(1)}`,
      onclick: event => { chosen = id; grid.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', b === event.currentTarget)); },
    }, avatar({ avatar: id }))));
    const save = async () => {
      if (!name.value.trim()) { error.textContent = 'Podaj imię profilu.'; return; }
      const patch = { name: name.value.trim(), avatar: chosen };
      if (!existing) Object.assign(patch, { favorites: profile()?.favorites || [], app_order: [], preferences: {} });
      if (await saveProfile(patch, existing ? 'Zapisano profil' : `Dodano profil ${patch.name}`, p.id)) closeLayer();
    };
    const remove = async () => {
      if (await guarded(() => api(`/profiles/${encodeURIComponent(p.id)}`, { method: 'DELETE' }), `Usunięto profil ${p.name}`)) { closeLayer(); loadState(); }
    };
    openLayer([
      h('h2', null, existing ? `Profil ${p.name}` : 'Nowy profil'),
      h('label', { class: 'field', nav: 'pd:name' }, h('span', null, 'Imię'), name),
      h('p', { class: 's-label', style: { margin: '26px 0 14px', color: 'var(--muted)' } }, 'Awatar'),
      grid, error,
      h('div', { class: 'actions' },
        existing && existing.id !== 'default' && S.profiles.length > 1 && h('button', { class: 'btn danger', nav: 'pd:delete', onclick: remove, style: { 'margin-right': 'auto' } }, icon('trash'), 'Usuń profil'),
        h('button', { class: 'btn', nav: 'pd:cancel', onclick: () => closeLayer() }, 'Anuluj'),
        h('button', { class: 'btn primary', nav: 'pd:save', 'data-submit': '', onclick: save }, icon('check'), 'Zapisz')),
    ], { focus: 'pd:name' });
  }

  // ---------------------------------------------------------------- pairing
  async function startPairing() {
    const entry = openLayer(h('p', { class: 'lead' }, 'Przygotowuję kod…'), { className: 'pair', onClose: () => { clearInterval(ui.pairTimer); if (!ui.paired) api('/pairing/cancel', { method: 'POST', body: {} }).catch(() => {}); ui.pairEntry = null; } });
    ui.pairEntry = entry; ui.paired = false;
    try {
      const data = await api('/pairing/start', { method: 'POST', body: {} });
      if (ui.pairEntry === entry) renderPin(entry, data);
    } catch (error) {
      replaceLayer(entry, [h('div', null, h('h2', null, 'Nie można rozpocząć parowania'), h('p', { class: 'lead' }, error.message), h('div', { class: 'actions' }, h('button', { class: 'btn primary', nav: 'pair:close', onclick: () => closeLayer() }, 'Zamknij')))], 'pair:close');
    }
  }
  function renderPin(entry, data) {
    const total = Math.max(1, data.expires_at - Math.floor(Date.now() / 1000));
    const C = 2 * Math.PI * 100;
    const bar = document.createElementNS(NS, 'circle');
    const track = document.createElementNS(NS, 'circle');
    for (const c of [track, bar]) { c.setAttribute('cx', '110'); c.setAttribute('cy', '110'); c.setAttribute('r', '100'); }
    track.setAttribute('class', 'track'); bar.setAttribute('class', 'bar');
    bar.setAttribute('stroke-dasharray', String(C));
    const ring = document.createElementNS(NS, 'svg'); ring.setAttribute('viewBox', '0 0 220 220'); ring.append(track, bar);
    const out = h('output');
    const host = (() => { try { return new URL(data.remote_url).host; } catch (_) { return data.remote_url || ''; } })();
    replaceLayer(entry, [
      h('div', null,
        h('h2', null, 'Sparuj telefon jako pilota'),
        h('div', { class: 'pin', 'aria-label': `Kod ${data.pin.split('').join(' ')}` }, data.pin.split('').map(d => h('span', null, d))),
        h('ol', null,
          h('li', null, 'Połącz telefon z tą samą siecią Wi-Fi co telewizor.'),
          h('li', null, 'Otwórz w Safari ', h('b', null, data.remote_url || `https://${host}/remote/`)),
          h('li', null, 'Wpisz powyższy kod. Później dodaj pilota do ekranu początkowego.')),
        h('div', { class: 'actions', style: { 'justify-content': 'flex-start' } }, h('button', { class: 'btn', nav: 'pair:cancel', onclick: () => closeLayer() }, 'Anuluj'))),
      h('div', { class: 'countdown' }, ring, out),
    ], 'pair:cancel');
    const tick = () => {
      const left = data.expires_at - Math.floor(Date.now() / 1000);
      if (left <= 0) {
        clearInterval(ui.pairTimer);
        replaceLayer(entry, [h('div', null, h('h2', null, 'Kod wygasł'), h('p', { class: 'lead' }, 'Ze względów bezpieczeństwa kod działa tylko przez 2 minuty.'), h('div', { class: 'actions', style: { 'justify-content': 'flex-start' } },
          h('button', { class: 'btn', nav: 'pair:close', onclick: () => closeLayer() }, 'Zamknij'),
          h('button', { class: 'btn primary', nav: 'pair:again', onclick: () => { closeLayer(true); startPairing(); } }, 'Nowy kod')))], 'pair:again');
        return;
      }
      out.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      bar.setAttribute('stroke-dashoffset', String(C * (1 - left / total)));
    };
    clearInterval(ui.pairTimer);
    tick(); ui.pairTimer = setInterval(tick, 1000);
  }
  function onPaired(device) {
    loadState();
    const entry = ui.pairEntry;
    if (!entry) { toast(`Sparowano: ${device?.name || 'telefon'}`); return; }
    ui.paired = true;
    clearInterval(ui.pairTimer);
    replaceLayer(entry, [h('div', { class: 'pair-done', style: { 'grid-column': '1 / -1' } }, icon('check'), h('h2', null, `Sparowano: ${device?.name || 'telefon'}`), h('p', { class: 'lead' }, 'Możesz już sterować telewizorem z telefonu.'))]);
    setTimeout(() => { if (ui.pairEntry === entry) closeLayer(); }, 2600);
  }

  // ---------------------------------------------------------------- settings
  const SECTIONS = [
    ['look', 'palette', 'Wygląd'], ['screen', 'screen', 'Obraz'], ['profiles', 'user', 'Profile'], ['apps', 'grid', 'Aplikacje'],
    ['home', 'house', 'Dom i telewizor'], ['remotes', 'phone', 'Piloty'], ['about', 'info', 'Informacje'],
  ];
  function renderSettings() {
    const nav = h('nav', { class: 'side-nav', 'aria-label': 'Sekcje ustawień' }, SECTIONS.map(([id, ic, label]) => {
      const b = h('button', { class: `list-item ${id === ui.section ? 'is-current' : ''}`, nav: `set:${id}`, onclick: () => { const first = navigables($('settings-panel'))[0]; if (first) focusEl(first); } }, icon(ic), label);
      b.dataset.section = id;
      return b;
    }));
    const panel = h('div', { class: 'panel', id: 'settings-panel', 'data-scroll': '' });
    $('screen-settings').replaceChildren(screenHead('Ustawienia', 'set', `Smart TV OS ${S.version || ''}`.trim()), h('div', { class: 'screen-body' }, h('div', { class: 'settings' }, nav, panel)));
    renderSettingsPanel();
  }
  function renderSettingsPanel() {
    const panel = $('settings-panel');
    if (!panel || ui.screen !== 'settings') return;
    $('screen-settings').querySelectorAll('.side-nav .list-item').forEach(b => b.classList.toggle('is-current', b.dataset.section === ui.section));
    const build = { look: panelLook, screen: panelScreen, profiles: panelProfiles, apps: panelApps, home: panelHome, remotes: panelRemotes, about: panelAbout }[ui.section];
    panel.replaceChildren(...build().filter(Boolean));
    updateOverscanPreview();
  }
  function rerenderPanel(key) { renderSettingsPanel(); if (key) focusKey(key); }

  function panelLook() {
    const p = profile();
    const perProfile = p && p.id !== 'default';
    const l = look();
    const set = (patch, key) => perProfile
      ? saveProfile({ preferences: { ...(p.preferences || {}), ...patch } }).then(() => rerenderPanel(key))
      : patchSettings(patch).then(() => rerenderPanel(key));
    return [
      h('h2', null, 'Wygląd'),
      h('p', { class: 'lead' }, perProfile ? `Zmiany dotyczą tylko profilu ${p.name}. Pozostałe profile zachowają swój wygląd.` : 'Zmiany dotyczą całego telewizora i profili, które nie mają własnego wyglądu.'),
      h('div', { class: 'setting' }, h('span', { class: 's-label' }, 'Kolor akcentu'),
        h('div', { class: 'swatches' }, ACCENTS.map(c => h('button', { class: `swatch ${c === l.accent ? 'is-on' : ''}`, nav: `look:acc:${c}`, style: { '--sw': c }, 'aria-label': `Kolor ${c}`, onclick: () => set({ accent: c }, `look:acc:${c}`) }, icon('check'))))),
      h('div', { class: 'setting' }, h('span', { class: 's-label' }, 'Tapeta'),
        h('div', { class: 'swatches' }, WALLPAPERS.map(([id, label]) => h('button', { class: `wall wall-${id} ${id === l.wallpaper ? 'is-on' : ''}`, nav: `look:wall:${id}`, onclick: () => set({ wallpaper: id }, `look:wall:${id}`) }, label)))),
      h('div', { class: 'setting' }, h('span', { class: 's-label' }, 'Animacje'),
        h('div', { class: 'seg' }, [['full', 'Pełne'], ['reduced', 'Ograniczone'], ['off', 'Wyłączone']].map(([id, label]) => h('button', { class: id === l.animation ? 'is-on' : '', nav: `look:anim:${id}`, onclick: () => set({ animation: id }, `look:anim:${id}`) }, label)))),
      toggle('look:night', 'Tryb nocny', 'Przygasza ekran i ociepla kolory. Dotyczy całego telewizora.', !!S.settings.night_mode, v => patchSettings({ night_mode: v }).then(() => rerenderPanel('look:night'))),
      perProfile && Object.keys(p.preferences || {}).length > 0 && h('div', { class: 'row-actions' }, h('button', { class: 'btn', nav: 'look:reset', onclick: () => saveProfile({ preferences: {} }, 'Przywrócono wygląd domowy').then(() => rerenderPanel('look:reset')) }, 'Użyj wyglądu domowego')),
    ];
  }
  function toggle(key, label, help, value, run) {
    return h('div', { class: 'setting' }, h('button', { class: `toggle ${value ? 'is-on' : ''}`, nav: key, role: 'switch', 'aria-checked': String(value), onclick: () => run(!value) },
      h('span', null, label, help && h('small', null, help)), h('span', { class: 'sw' })));
  }
  function stepper(key, value, min, max, step, format, run) {
    const out = h('output', null, format(value));
    const change = delta => { const next = Math.max(min, Math.min(max, +(value + delta).toFixed(2))); if (next !== value) run(next); };
    return h('div', { class: 'stepper' },
      h('button', { class: 'icon-btn', nav: `${key}:minus`, 'aria-label': 'Mniej', onclick: () => change(-step) }, h('span', { style: { 'font-size': '40px', 'line-height': '1' } }, '−')),
      out,
      h('button', { class: 'icon-btn', nav: `${key}:plus`, 'aria-label': 'Więcej', onclick: () => change(step) }, icon('plus')));
  }
  function panelScreen() {
    const v = Number(S.settings.safe_area) || 0;
    const apply = next => {
      S.settings.safe_area = next; applyLook(); rerenderPanel(document.activeElement?.dataset?.key);
      clearTimeout(ui.safeTimer); ui.safeTimer = setTimeout(() => patchSettings({ safe_area: next }), 400);
    };
    return [
      h('h2', null, 'Obraz'),
      h('p', { class: 'lead' }, 'Jeśli telewizor ucina krawędzie, zwiększ margines, aż przerywana ramka będzie w całości widoczna. Ustawienie zmienia tylko układ launchera, nie konfigurację wyświetlacza.'),
      h('div', { class: 'setting' }, h('span', { class: 's-label' }, 'Margines bezpieczny (overscan)'), stepper('screen:safe', v, 0, 10, 0.5, x => `${x.toLocaleString('pl-PL')}%`, apply)),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn', nav: 'screen:reset', onclick: () => apply(0) }, 'Bez marginesu')),
    ];
  }
  function updateOverscanPreview() {
    const show = ui.screen === 'settings' && ui.section === 'screen';
    let frame = document.querySelector('.overscan-preview');
    if (show && !frame) document.body.append(h('div', { class: 'overscan-preview', 'aria-hidden': 'true' }));
    if (!show && frame) frame.remove();
  }
  function panelProfiles() {
    return [
      h('h2', null, 'Profile'),
      h('p', { class: 'lead' }, 'Każdy domownik ma własne ulubione aplikacje, kolejność kafelków i wygląd. Hasła do serwisów zostają w Chrome.'),
      h('div', { class: 'device-list' }, S.profiles.map(p => h('button', { class: 'list-item', nav: `prof:${p.id}`, onclick: () => profileDialog(p) }, avatar(p), h('span', null, p.name), h('span', { class: 'meta' }, p.id === S.active_profile_id ? 'Aktywny' : `${(p.favorites || []).length} ulubionych`)))),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', nav: 'prof:__add', onclick: () => profileDialog(null) }, icon('plus'), 'Dodaj profil')),
    ];
  }
  function panelApps() {
    const shortcuts = S.settings.shortcuts || [];
    return [
      h('h2', null, 'Aplikacje'),
      h('p', { class: 'lead' }, 'Kolejność i ulubione ustawiasz osobno dla każdego profilu. Własne skróty widzą wszyscy.'),
      h('div', { class: 'row-actions', style: { 'margin-top': '0' } }, h('button', { class: 'btn primary', nav: 'apps:order', onclick: () => showScreen('apps') }, icon('move'), 'Ułóż kafelki'), h('button', { class: 'btn', nav: 'apps:add', onclick: () => shortcutDialog() }, icon('plus'), 'Dodaj skrót')),
      h('h3', { class: 'section-title', style: { 'margin-top': '40px' } }, 'Twoje skróty'),
      shortcuts.length ? h('div', { class: 'device-list' }, shortcuts.map(s => h('button', { class: 'list-item', nav: `scl:${s.id}`, onclick: () => menu(s.name, [{ icon: 'trash', label: 'Usuń skrót', danger: true, run: () => removeShortcut(s.id).then(() => rerenderPanel('apps:add')) }]) }, icon('link'), h('span', null, s.name), h('span', { class: 'meta' }, s.url.replace(/^https?:\/\//, '').slice(0, 40)))))
        : h('p', { class: 'empty' }, 'Nie masz jeszcze własnych skrótów.'),
    ];
  }
  function panelHome() {
    const s = S.settings;
    const name = id => (ui.available || []).find(e => e.entity_id === id)?.name || (S.home?.entities || []).find(e => e.entity_id === id)?.name || id;
    const line = (key, ic, label, value, run) => h('button', { class: 'list-item', nav: key, onclick: run }, icon(ic), h('span', null, label), h('span', { class: 'meta' }, value));
    return [
      h('h2', null, 'Dom i telewizor'),
      h('p', { class: 'lead' }, 'Wybierz, co z Home Assistanta ma być widoczne na telewizorze i w pilocie. Telefon nie zobaczy niczego poza tą listą.'),
      S.home?.error && h('p', { class: 'empty', style: { color: 'var(--danger)' } }, 'Home Assistant nie odpowiada, lista urządzeń może być niepełna.'),
      h('div', { class: 'device-list' },
        line('home:tv', 'tv', 'Telewizor', s.tv_entity ? name(s.tv_entity) : 'Nie wybrano', () => pickEntities({ title: 'Telewizor', domains: ['media_player'], single: true, value: s.tv_entity ? [s.tv_entity] : [], save: v => patchSettings({ tv_entity: v[0] || '' }) })),
        // HDMI choice only when the integration really advertises sources.
        S.tv?.configured && (S.tv?.capabilities?.source && S.tv?.source_list?.length
          ? line('home:source', 'screen', 'Wejście dla NUC-a', s.tv_source || 'Nie przełączaj', () => menu('Wejście telewizora', [
            { icon: 'check', label: 'Nie przełączaj', run: () => patchSettings({ tv_source: '' }).then(() => rerenderPanel('home:source')) },
            ...S.tv.source_list.map(src => ({ icon: 'screen', label: src, run: () => patchSettings({ tv_source: src }).then(() => rerenderPanel('home:source')) }))]))
          : h('div', { class: 'list-item' }, icon('screen'), h('span', null, 'Wejście dla NUC-a'), h('span', { class: 'meta' }, 'Integracja nie obsługuje wyboru HDMI'))),
        line('home:weather', 'partly', 'Pogoda', s.weather_entity ? name(s.weather_entity) : 'Nie wybrano', () => pickEntities({ title: 'Pogoda', domains: ['weather'], single: true, value: s.weather_entity ? [s.weather_entity] : [], save: v => patchSettings({ weather_entity: v[0] || '' }) })),
        line('home:entities', 'grid', 'Widoczne urządzenia', `${(s.entities || []).length} wybranych`, () => pickEntities({ title: 'Widoczne urządzenia', domains: ['light', 'switch', 'scene', 'script', 'sensor', 'climate'], value: s.entities || [], save: v => patchSettings({ entities: v }) }))),
      h('h3', { class: 'section-title', style: { 'margin-top': '40px' } }, 'Wieczór filmowy'),
      h('div', { class: 'device-list' },
        line('home:mscene', 'sparkle', 'Scena', s.movie_scene ? name(s.movie_scene) : 'Bez sceny', () => pickEntities({ title: 'Scena na wieczór filmowy', domains: ['scene'], single: true, value: s.movie_scene ? [s.movie_scene] : [], save: v => patchSettings({ movie_scene: v[0] || '' }) })),
        line('home:mlights', 'bulb', 'Przyciemniane lampy', `${(s.movie_lights || []).length} wybranych`, () => pickEntities({ title: 'Lampy do przyciemnienia', domains: ['light'], value: s.movie_lights || [], save: v => patchSettings({ movie_lights: v }) })),
        line('home:mapp', 'film', 'Aplikacja', appById(s.movie_app)?.name || 'Bez aplikacji', () => menu('Aplikacja na wieczór filmowy', S.apps.filter(a => a.url).map(a => ({ icon: 'chevron', label: a.name, run: () => patchSettings({ movie_app: a.id }).then(() => rerenderPanel('home:mapp')) }))))),
      h('div', { class: 'setting', style: { 'margin-top': '26px' } }, h('span', { class: 's-label' }, 'Jasność lamp'), stepper('home:mbright', Number(s.movie_brightness) || 0, 0, 100, 5, x => `${x}%`, v => patchSettings({ movie_brightness: v }).then(() => rerenderPanel(document.activeElement?.dataset?.key)))),
      // Volume preset needs HA volume_set (supported_features bit 4), not just steps.
      (Number(S.tv?.supported_features) & 4)
        ? h('div', { class: 'setting' }, h('span', { class: 's-label' }, 'Głośność telewizora'),
          h('div', { class: 'row-actions', style: { 'margin-top': '0', 'align-items': 'center' } },
            stepper('home:mvol', s.movie_volume == null ? 0 : Math.round(s.movie_volume * 100), 0, 100, 5, x => `${x}%`, v => patchSettings({ movie_volume: v / 100 }).then(() => rerenderPanel(document.activeElement?.dataset?.key))),
            s.movie_volume != null && h('button', { class: 'btn', nav: 'home:mvol:off', onclick: () => patchSettings({ movie_volume: null }).then(() => rerenderPanel('home:mvol:plus')) }, 'Nie zmieniaj głośności')))
        : h('p', { class: 'empty' }, 'Głośność wieczoru filmowego: telewizor nie pozwala ustawić konkretnego poziomu z Home Assistanta.'),
    ];
  }
  async function pickEntities({ title, domains, single = false, value, save }) {
    const entry = openLayer(h('p', { class: 'lead' }, 'Wczytuję urządzenia z Home Assistanta…'));
    let list;
    try { list = (await api('/home/available')).entities; ui.available = list; }
    catch (error) { replaceLayer(entry, [h('h2', null, title), h('p', { class: 'lead' }, error.message), h('div', { class: 'actions' }, h('button', { class: 'btn primary', nav: 'pick:close', onclick: () => closeLayer() }, 'Zamknij'))], 'pick:close'); return; }
    const chosen = new Set(value);
    const options = list.filter(e => domains.includes(e.domain)).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    const items = [];
    if (single) items.push({ entity_id: '', name: 'Nie używaj', domain: '' });
    items.push(...options);
    const box = h('div', { class: 'picker', 'data-scroll': '', style: { 'max-height': '56vh', overflow: 'hidden', padding: '8px' } }, items.map((e, i) => {
      const b = h('button', { class: `list-item ${chosen.has(e.entity_id) || (single && !e.entity_id && !chosen.size) ? 'is-on' : ''}`, nav: `pick:${i}`, onclick: async () => {
        if (single) { closeLayer(); await save(e.entity_id ? [e.entity_id] : []); rerenderPanel(); focusKey(ui.lastKey.settings); return; }
        if (chosen.has(e.entity_id)) chosen.delete(e.entity_id); else chosen.add(e.entity_id);
        b.classList.toggle('is-on', chosen.has(e.entity_id));
      } }, h('span', null, e.name, e.domain && h('span', { class: 'domain' }, `  ${e.entity_id}`)), h('span', { class: 'check' }, icon('check')));
      return b;
    }));
    const content = [h('h2', null, title), options.length ? box : h('p', { class: 'empty' }, 'Home Assistant nie udostępnia urządzeń tego typu.')];
    if (!single) content.push(h('div', { class: 'actions' },
      h('button', { class: 'btn', nav: 'pick:cancel', onclick: () => closeLayer() }, 'Anuluj'),
      h('button', { class: 'btn primary', nav: 'pick:save', onclick: async () => { closeLayer(); await save([...chosen]); rerenderPanel(); } }, icon('check'), `Zapisz (${chosen.size})`)));
    replaceLayer(entry, content, 'pick:0');
  }
  function panelRemotes() {
    const entry = { list: h('div', { class: 'device-list' }, h('p', { class: 'empty' }, 'Wczytuję…')) };
    api('/devices').then(({ devices }) => {
      entry.list.replaceChildren(...(devices.length ? devices.map(d => h('button', { class: 'list-item', nav: `dev:${d.id}`, onclick: () => menu(d.name, [{ icon: 'trash', label: 'Odłącz ten telefon', danger: true, run: () => guarded(() => api(`/devices/${encodeURIComponent(d.id)}`, { method: 'DELETE' }), `Odłączono: ${d.name}`).then(() => rerenderPanel('rem:pair')) }]) },
        icon('phone'), h('span', null, d.name), h('span', { class: 'meta' }, `do ${new Date(d.expires_at * 1000).toLocaleDateString('pl-PL')}`))) : [h('p', { class: 'empty' }, 'Żaden telefon nie jest jeszcze sparowany.')]));
    }).catch(error => entry.list.replaceChildren(h('p', { class: 'empty' }, error.message)));
    return [
      h('h2', null, 'Piloty'),
      h('p', { class: 'lead' }, 'Telefon steruje telewizorem dopiero po wpisaniu kodu z ekranu. Odłączony telefon traci dostęp natychmiast.'),
      h('div', { class: 'row-actions', style: { 'margin': '0 0 34px' } }, h('button', { class: 'btn primary', nav: 'rem:pair', onclick: startPairing }, icon('phone'), 'Sparuj telefon')),
      h('h3', { class: 'section-title' }, 'Sparowane telefony'),
      entry.list,
    ];
  }
  function panelAbout() {
    const tvState = { on: 'włączony', playing: 'włączony, odtwarza', paused: 'włączony, pauza', idle: 'włączony', buffering: 'włączony', off: 'wyłączony', standby: 'w czuwaniu', unavailable: 'niedostępny' }[S.tv?.state] || 'stan nieznany';
    const line = (label, value) => h('div', { class: 'list-item' }, h('span', null, label), h('span', { class: 'meta' }, value));
    return [
      h('h2', null, 'Informacje'),
      h('div', { class: 'device-list' },
        line('Wersja', S.version || 'nieznana'),
        line('Home Assistant', S.home?.error ? 'nie odpowiada' : 'połączony'),
        line('Telewizor', S.tv?.configured ? `${tvState}` : 'nie skonfigurowano'),
        line('Wybór HDMI', S.tv?.capabilities?.source ? 'obsługiwany' : 'niedostępny w integracji'),
        line('Polecenia głosowe', S.capabilities?.voice === 'assist_text' ? 'tekst + Home Assistant Assist' : 'tekst i dyktowanie w telefonie'),
        line('Pilot w telefonie', S.capabilities?.remote_https ? 'HTTPS włączony' : 'HTTPS wyłączony')),
      h('h3', { class: 'section-title', style: { 'margin-top': '40px' } }, 'Skróty klawiszowe'),
      h('p', { class: 'empty' }, h('kbd', null, 'Ctrl + Alt + H'), ' ekran główny z każdej strony.  ', h('kbd', null, 'Ctrl + Alt + O'), ' klawiatura ekranowa.'),
      h('button', { class: 'btn', nav: 'about:reload', style: { 'margin-top': '20px' }, onclick: () => location.reload() }, 'Odśwież ekran główny'),
    ];
  }

  // ---------------------------------------------------------------- boot
  tickClock();
  loadState().then(() => {
    $('screen-home').classList.add('entering');
    render();
    focusKey('fav:' + (favoriteApps()[0]?.id || ''));
    requestAnimationFrame(() => requestAnimationFrame(() => $('screen-home').classList.remove('entering')));
    connect();
  });
  // Test hook: lets E2E read the current UI model without touching internals.
  window.__smartTv = { get state() { return S; }, get screen() { return ui.screen; }, get layers() { return layers.length; } };
})();

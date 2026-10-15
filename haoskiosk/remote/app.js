'use strict';
// Smart TV OS v3 — phone remote (PWA). Served over HTTPS from the add-on; talks to
// the same-origin /api/v3 with the HttpOnly session cookie set at pairing.
// No secrets live in JS or storage; localStorage keeps only UI preferences.
(() => {
  const API = '/api/v3';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);

  const ICONS = {
    power: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
    house: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    remote: '<rect x="7" y="2.5" width="10" height="19" rx="5"/><circle cx="12" cy="8" r="2"/><path d="M12 14h.01M12 17h.01"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    playpause: '<path d="M5 5v14l8-7z"/><path d="M16 5v14M20 5v14"/>',
    volup: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9v6M14 12h6"/>',
    voldown: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M15 12h6"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
    up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5 10 17 19 7"/>', send: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    toggle: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="16.5" cy="12" r="2.5"/>',
    sparkle: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>',
    thermo: '<path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z"/><path d="M12 9v6"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    sunny: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    night: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    cloudy: '<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z"/>',
    partly: '<path d="M8 4.5V3M3.4 8.4 2.3 7.3M12.6 7.3l1.1-1.1M2.5 12H1"/><path d="M5.6 11.2a3.5 3.5 0 0 1 5.8-3.5"/><path d="M9 20h9a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.4-.9A3.9 3.9 0 0 0 9 20z"/>',
    rain: '<path d="M7 15h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 6.1 4.5 4.5 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    snow: '<path d="M7 15h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 6.1 4.5 4.5 0 0 0 7 15z"/><path d="M8 19h.01M12 21h.01M16 19h.01M10 18h.01M14 18h.01"/>',
    fog: '<path d="M4 9h16M2 13h20M5 17h14"/>', storm: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>',
    spotify: '<circle cx="12" cy="12" r="9.5"/><path d="M7 9.6c3.6-1 7.4-.7 10.3.9M7.6 12.8c2.9-.8 5.9-.5 8.3.8M8.3 15.8c2.2-.6 4.4-.4 6.2.6"/>',
  };
  const WEATHER = {
    'sunny': ['sunny', 'Słonecznie'], 'clear-night': ['night', 'Pogodna noc'], 'partlycloudy': ['partly', 'Częściowe zachmurzenie'],
    'cloudy': ['cloudy', 'Pochmurno'], 'rainy': ['rain', 'Deszcz'], 'pouring': ['rain', 'Ulewa'], 'snowy': ['snow', 'Śnieg'],
    'snowy-rainy': ['snow', 'Deszcz ze śniegiem'], 'hail': ['snow', 'Grad'], 'fog': ['fog', 'Mgła'], 'lightning': ['storm', 'Burza'],
    'lightning-rainy': ['storm', 'Burza z deszczem'], 'windy': ['wind', 'Wietrznie'], 'windy-variant': ['wind', 'Wietrznie'], 'exceptional': ['info', 'Nietypowe warunki'],
  };
  const STAGES = {
    queued: 'Przygotowuję…', powering_on: 'Włączam telewizor', waiting_tv: 'Czekam, aż telewizor będzie gotowy',
    selecting_source: 'Przełączam źródło HDMI', scene: 'Ustawiam światła', launching: 'Otwieram aplikację na telewizorze', completed: 'Gotowe — sprawdź telewizor', failed: 'Nie udało się',
  };
  const STAGE_STEP = { queued: 0, powering_on: 1, waiting_tv: 1, selecting_source: 1, scene: 1, launching: 2, completed: 3 };
  const EXAMPLES = ['Otwórz Netflix', 'Otwórz YouTube', 'Pauza', 'Zwiększ głośność', 'Wróć do menu', 'Włącz tryb filmowy', 'Wyłącz światło', 'Wyłącz telewizor'];

  // Backend messages stay English for diagnostics; people see Polish by error code.
  const ERRORS = {
    unauthorized: 'Sparuj ten telefon z telewizorem.',
    forbidden: 'Brak dostępu. Otwórz pilota pod adresem pokazanym na telewizorze.',
    origin: 'Żądanie odrzucone ze względów bezpieczeństwa. Odśwież stronę.',
    private_lan: 'Pilot działa tylko w domowej sieci Wi-Fi.',
    content_type: 'Nieprawidłowe żądanie. Odśwież stronę.',
    rate_limited: 'Za dużo prób. Spróbuj ponownie za chwilę.',
    busy: 'Trwa już uruchamianie innej aplikacji.',
    tv_only: 'Tę czynność wykonasz na telewizorze.',
    https_required: 'Otwórz pilota przez bezpieczny adres HTTPS.',
    invalid_pin: 'Nieprawidłowy albo wygasły kod. Sprawdź kod na telewizorze.',
    pairing_inactive: 'Na telewizorze nie ma aktywnego kodu. Wybierz tam „Sparuj telefon”.',
    connection_limit: 'Za dużo otwartych pilotów. Zamknij pilota na innym urządzeniu.',
    unknown_command: 'Nie rozumiem tego polecenia.',
    invalid_request: 'Tego nie da się zrobić przy obecnych ustawieniach.',
    invalid_input: 'Telewizor odrzucił to polecenie.',
    http_error: 'Telewizor odrzucił żądanie.',
    unavailable: 'Sterowanie jest chwilowo niedostępne. Sprawdź, czy Chrome działa.',
    ha_unavailable: 'Home Assistant nie odpowiada.',
    launch_failed: 'Nie udało się uruchomić aplikacji. Sprawdź telewizor i Chrome.',
    cancelled: 'Uruchamianie zostało przerwane.',
  };
  const errorText = (error, status) => ERRORS[error?.code] || (error?.code ? `Nie udało się (kod: ${error.code}).` : `Nie udało się (błąd ${status || 'sieci'}).`);

  // ---------------------------------------------------------------- helpers
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
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
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));
  function fmtTemp(value) { const n = Number(value); return Number.isFinite(n) ? `${n.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}°` : '–'; }
  const haptic = (ms = 8) => { if (prefs.haptics) try { navigator.vibrate?.(ms); } catch (_) { /* unsupported (iOS) */ } };

  // UI-only preferences, per phone. Never tokens.
  const PREFS_KEY = 'smarttv-remote-prefs';
  const prefs = { mode: 'touchpad', speed: null, haptics: true, natural: true, tab: 'remote' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch (_) { /* storage optional */ }
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* storage optional */ } };

  // ---------------------------------------------------------------- API
  async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch(API + path, {
      method, cache: 'no-store', credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await response.json(); } catch (_) { /* empty */ }
    if (!response.ok) {
      const error = new Error(errorText(data?.error, response.status));
      error.status = response.status; error.code = data?.error?.code; error.retryAfter = data?.error?.retry_after ?? (Number(response.headers.get('Retry-After')) || null);
      if (response.status === 401 && path !== '/pairing/complete') onUnauthorized();
      throw error;
    }
    return data;
  }
  async function guarded(task, okText) {
    try { const r = await task(); if (okText) toast(okText); return r; }
    catch (error) { if (error.status !== 401) toast(error instanceof TypeError ? 'Brak połączenia z telewizorem' : error.message, true); return null; }
  }

  // ---------------------------------------------------------------- state
  let S = null;
  let session = null;
  let conn = 'connecting';
  const ui = { tab: prefs.tab || 'remote', op: null, history: [] };
  const appById = id => S?.apps?.find(a => a.id === id);
  const profile = () => S?.profiles?.find(p => p.id === S.active_profile_id) || null;
  function orderedApps() {
    const p = profile();
    const order = p?.app_order || [];
    const fav = p?.favorites || [];
    const apps = (S?.apps || []).filter(a => a.id !== 'browser');
    const sorted = [...order.map(appById).filter(Boolean).filter(a => a.id !== 'browser'), ...apps.filter(a => !order.includes(a.id))];
    return [...sorted.filter(a => fav.includes(a.id)), ...sorted.filter(a => !fav.includes(a.id))];
  }

  // ---------------------------------------------------------------- connection
  let connGen = 0; // bumps on every open/close so queued edits never outlive a socket
  let ws = null, wsDelay = 1000, wsTimer = null, refreshTimer = null, pingTimer = null, msgId = 0;
  const pending = new Map();
  function setConn(next, detail) {
    conn = next;
    const el = $('conn');
    el.className = `conn ${next}`;
    $('conn-text').textContent = detail || { online: 'Połączono z telewizorem', connecting: 'Łączenie…', offline: 'Brak połączenia' }[next];
    const banner = $('banner');
    if (next === 'offline' && session) {
      fill(banner, icon('info'), h('span', null, 'Pilot nie widzi telewizora. Sprawdź Wi-Fi — ponawiam automatycznie.'), h('button', { type: 'button', onclick: () => reconnectNow() }, 'Ponów'));
      banner.hidden = false;
    } else banner.hidden = true;
  }
  function connect() {
    clearTimeout(wsTimer);
    if (ws || !session) return;
    setConn('connecting');
    let socket;
    try { socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${API}/ws`); }
    catch (_) { scheduleReconnect(); return; }
    ws = socket;
    socket.onopen = () => {
      connGen++;
      wsDelay = 1000;
      setConn('online');
      clearInterval(pingTimer);
      pingTimer = setInterval(() => sendRaw({ type: 'ping', id: `p${++msgId}` }), 20000);
    };
    socket.onmessage = event => {
      let msg; try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg.type === 'state') setState(msg.state);
      else if (msg.type === 'state_changed') { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 200); }
      else if (msg.type === 'operation') onOperation(msg.operation);
      else if (msg.type === 'ack' || msg.type === 'error') {
        pending.delete(msg.id);
        if (msg.type === 'error' && msg.error?.code !== 'rate_limited') toast(errorText(msg.error), true);
      }
    };
    socket.onclose = event => {
      if (ws !== socket) return;
      connGen++;
      ws = null; clearInterval(pingTimer); pending.clear();
      if (event.code === 4401 || event.code === 4403) { onUnauthorized(); return; }
      // Policy close (revoked, too slow): re-check the session right away instead of backing off.
      if (event.code === 1008) { api('/session').then(() => scheduleReconnect(), error => { if (error.status !== 401) scheduleReconnect(); }); return; }
      scheduleReconnect();
    };
  }
  function scheduleReconnect() {
    setConn('offline');
    const delay = Math.min(30000, wsDelay) * (0.75 + Math.random() * 0.5);
    wsDelay = Math.min(30000, wsDelay * 2);
    clearTimeout(wsTimer);
    wsTimer = setTimeout(reconnectNow, delay);
  }
  async function reconnectNow() {
    clearTimeout(wsTimer);
    if (ws) return;
    setConn('connecting');
    // Re-validate the session first; input is never replayed after a reconnect.
    try { session = (await api('/session')).device; await refresh(); connect(); }
    catch (error) { if (error.status !== 401) scheduleReconnect(); }
  }
  function sendRaw(msg) { if (ws?.readyState === 1) { ws.send(JSON.stringify(msg)); return true; } return false; }
  const MAX_PENDING = 64;
  function sendInput(input, { fallback = true } = {}) {
    if (ws?.readyState === 1 && pending.size >= MAX_PENDING) {
      // The TV stopped acknowledging: drop this input (never queue or replay it)
      // and restart the socket if the oldest ack is clearly stuck.
      const oldest = pending.values().next().value;
      if (Date.now() - oldest > 4000) { const stale = ws; stale.close(4000, 'ack timeout'); }
      return;
    }
    const id = `i${++msgId}`;
    if (sendRaw({ id, type: 'input', input })) { pending.set(id, Date.now()); return; }
    // HTTP fallback for discrete commands only; pointer streams are dropped while offline.
    if (fallback) guarded(() => api('/input', { method: 'POST', body: input }));
  }
  async function refresh() {
    try { setState(await api('/state')); } catch (error) { if (error instanceof TypeError) setConn('offline'); }
  }
  function onUnauthorized() {
    session = null;
    connGen++;
    if (ws) { const s = ws; ws = null; s.close(); }
    clearTimeout(wsTimer); clearInterval(pingTimer);
    showPair();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session && !ws) reconnectNow();
  });
  window.addEventListener('online', () => { if (session && !ws) reconnectNow(); });

  // ---------------------------------------------------------------- toast & sheets
  function toast(text, isError = false) {
    const t = $('toast');
    t.textContent = text; t.classList.toggle('error', isError); t.classList.add('show');
    clearTimeout(ui.toastTimer); ui.toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 4200 : 2200);
  }
  function openSheet(content, { onClose } = {}) {
    closeSheet();
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grab' }), content);
    const backdrop = h('div', { class: 'backdrop', onclick: () => closeSheet() });
    $('sheet-root').append(backdrop, sheet);
    ui.sheet = { sheet, onClose };
    return sheet;
  }
  function closeSheet() {
    const s = ui.sheet;
    ui.sheet = null;
    $('sheet-root').replaceChildren();
    s?.onClose?.();
  }

  // ---------------------------------------------------------------- shell
  const TABS = [['remote', 'remote', 'Pilot'], ['home', 'house', 'Dom'], ['voice', 'mic', 'Polecenia'], ['settings', 'sliders', 'Ustawienia']];
  function showView(name) {
    for (const v of ['pair', 'remote', 'home', 'voice', 'settings']) $(`view-${v}`).hidden = v !== name;
    $('tabs').hidden = name === 'pair';
    $('power').hidden = name === 'pair' || !S?.tv?.configured;
    if (name !== 'pair') { ui.tab = name; prefs.tab = name; savePrefs(); }
    fill($('tabs'), TABS.map(([id, ic, label]) => h('button', { type: 'button', class: `tab ${id === name ? 'is-on' : ''}`, 'aria-current': id === name ? 'page' : null, onclick: () => { haptic(); showView(id); } }, icon(ic), label)));
    render();
  }
  function setState(next) {
    S = next;
    if (ui.tab && !$(`view-${ui.tab}`).hidden) render();
    else if (!$('view-pair').hidden) return;
    else showView(ui.tab || 'remote');
  }
  // Live state updates must never wipe what the user is typing or dragging.
  const busy = name => { const a = document.activeElement; return !!a && a.tagName === 'INPUT' && $(`view-${name}`).contains(a); };
  function render() {
    renderPower();
    if (ui.tab === 'remote' && !$('view-remote').hidden) renderRemote();
    if (ui.tab === 'home' && !$('view-home').hidden && !busy('home')) renderHome();
    if (ui.tab === 'voice' && !$('view-voice').hidden) renderVoice();
    if (ui.tab === 'settings' && !$('view-settings').hidden && !busy('settings')) renderSettings();
  }
  function renderPower() {
    const btn = $('power');
    const tv = S?.tv;
    if (!tv?.configured || !$('view-pair').hidden) { btn.hidden = true; return; }
    btn.hidden = false;
    const on = ['on', 'playing', 'paused', 'idle', 'buffering'].includes(tv.state);
    btn.className = `round power ${on ? 'is-on' : tv.state === 'off' ? 'is-off' : ''}`;
    btn.setAttribute('aria-label', on ? 'Wyłącz telewizor' : 'Włącz telewizor');
    fill(btn, icon('power'));
    btn.onclick = () => { haptic(14); guarded(() => api('/tv', { method: 'POST', body: { action: on ? 'off' : 'on' } }), on ? 'Wyłączam telewizor' : 'Włączam telewizor'); };
  }

  // ---------------------------------------------------------------- pairing
  function showPair() {
    closeSheet();
    showView('pair');
    setConn('offline', 'Niesparowany');
    $('banner').hidden = true;
    const cells = [0, 1, 2, 3, 4, 5].map(() => h('span'));
    const digits = h('div', { class: 'pin-boxes' }, cells);
    const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]*', maxlength: '6', 'aria-label': 'Kod z telewizora' });
    const name = h('input', { type: 'text', maxlength: '40', autocomplete: 'off', value: guessDeviceName() });
    const error = h('p', { class: 'error', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'btn primary block', disabled: true }, 'Połącz z telewizorem');
    let lockedUntil = 0;
    const draw = () => {
      const v = input.value;
      cells.forEach((cell, i) => { cell.textContent = v[i] || ''; cell.classList.toggle('cur', i === Math.min(v.length, 5) && document.activeElement === input); });
      submit.disabled = v.length !== 6 || Date.now() < lockedUntil;
    };
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); error.textContent = ''; draw(); });
    input.addEventListener('focus', draw); input.addEventListener('blur', draw);
    const form = h('form', { onsubmit: async event => {
      event.preventDefault();
      if (input.value.length !== 6) return;
      submit.disabled = true; submit.textContent = 'Łączenie…';
      try {
        const data = await api('/pairing/complete', { method: 'POST', body: { pin: input.value, device_name: name.value.trim() || guessDeviceName() } });
        session = data.device;
        haptic(20);
        toast(`Sparowano jako ${session.name}`);
        await refresh();
        showView('remote');
        connect();
      } catch (err) {
        input.value = '';
        if (err.status === 429) {
          const wait = Number(err.retryAfter) || 60;
          lockedUntil = Date.now() + wait * 1000;
          error.textContent = `Za dużo prób. Spróbuj ponownie za ${wait} s.`;
          setTimeout(draw, wait * 1000 + 50);
        } else if (err.code === 'pairing_inactive' || err.status === 409) error.textContent = 'Na telewizorze nie ma aktywnego kodu. Wybierz tam „Sparuj telefon”.';
        else if (err instanceof TypeError) error.textContent = 'Nie widzę telewizora. Sprawdź, czy telefon jest w tej samej sieci Wi-Fi.';
        else error.textContent = err.message || 'Nieprawidłowy kod';
        submit.textContent = 'Połącz z telewizorem';
        draw(); input.focus();
      }
    } },
    h('div', { class: 'mark' }, icon('remote')),
    h('h1', null, 'Połącz z telewizorem'),
    h('p', { class: 'lead' }, 'Na telewizorze otwórz ekran główny i wybierz „Sparuj telefon”. Wpisz 6-cyfrowy kod, który się pojawi.'),
    digits, error,
    h('label', { class: 'field' }, h('span', null, 'Nazwa tego telefonu'), name),
    h('div', { style: { 'margin-top': '18px' } }, submit),
    h('ol', { class: 'steps' },
      h('li', null, 'Kod działa 2 minuty i tylko raz.'),
      h('li', null, 'Po połączeniu dodaj pilota do ekranu początkowego: Udostępnij → Do ekranu początk.')));
    digits.append(input);
    fill($('view-pair'), h('div', { class: 'pair' }, form));
    draw();
  }
  function guessDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Telefon z Androidem';
    return 'Telefon';
  }

  // ---------------------------------------------------------------- remote view
  function appChip(app) {
    const cls = app.kind === 'shortcut' ? 'chip-shortcut' : `chip-${app.id}`;
    let label;
    if (app.id === 'netflix') label = 'NETFLIX';
    else if (app.id === 'max') label = 'max';
    else if (app.id === 'prime') label = 'prime video';
    else if (app.id === 'youtube') label = h('span', { class: 'in' }, h('span', { class: 'yt' }), 'YouTube');
    else if (app.id === 'spotify') label = h('span', { class: 'in' }, icon('spotify'), 'Spotify');
    else if (app.id === 'home_assistant') label = h('span', { class: 'in' }, icon('house'), 'HA');
    else label = app.name;
    return h('button', { type: 'button', class: `app-chip ${cls}`, 'aria-label': `Otwórz ${app.name}`, onclick: () => launch(app) }, label);
  }
  function renderRemote() {
    const view = $('view-remote');
    if (!ui.remoteBuilt) { buildRemote(view); ui.remoteBuilt = true; }
    fill(ui.appStrip, orderedApps().map(appChip), h('button', { type: 'button', class: 'app-chip chip-browser', onclick: openUrlSheet }, h('span', { class: 'in' }, icon('globe'), 'Strona')));
    ui.muteBtn?.classList.toggle('accent', !!S?.tv?.is_muted);
  }
  function buildRemote(view) {
    ui.appStrip = h('div', { class: 'apps', role: 'list', 'aria-label': 'Szybkie aplikacje' });
    const seg = h('div', { class: 'seg', role: 'tablist' });
    const area = h('div', { style: { flex: '1', display: 'flex', 'flex-direction': 'column', 'min-height': '0' } });
    const drawMode = () => {
      fill(seg, [['touchpad', 'Touchpad'], ['dpad', 'Strzałki']].map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(prefs.mode === id), class: prefs.mode === id ? 'is-on' : '', onclick: () => { prefs.mode = id; savePrefs(); haptic(); drawMode(); } }, label)));
      fill(area, prefs.mode === 'dpad' ? buildDpad() : buildPad());
    };
    drawMode();
    const key = (ic, label, run, extra = '') => h('button', { type: 'button', class: `key ${extra}`, 'aria-label': label, onclick: () => { haptic(); run(); } }, icon(ic));
    ui.muteBtn = key('mute', 'Wycisz', () => tvAction('mute'));
    const controls = h('div', { class: 'controls' },
      key('back', 'Wstecz', () => sendInput({ type: 'key', key: 'back' })),
      key('house', 'Ekran główny', () => sendInput({ type: 'key', key: 'home' })),
      key('playpause', 'Odtwarzaj lub wstrzymaj', () => sendInput({ type: 'key', key: 'play_pause' })),
      key('keyboard', 'Klawiatura', openKeyboard),
      h('div', { class: 'vol' }, key('voldown', 'Ciszej', () => tvAction('volume_down')), key('volup', 'Głośniej', () => tvAction('volume_up'))),
      ui.muteBtn,
      key('mic', 'Polecenie', () => showView('voice')));
    fill(view, ui.appStrip, seg, area, controls);
  }
  async function tvAction(action) {
    if (!S?.tv?.configured) { toast('Telewizor nie jest skonfigurowany w Home Assistancie', true); return; }
    await guarded(() => api('/tv', { method: 'POST', body: { action } }));
  }

  // Touchpad: one finger moves, tap clicks, hold right-clicks, two fingers or the
  // right edge scroll. Deltas are coalesced to ≤30 messages per second.
  function buildPad() {
    const pad = h('div', { class: 'pad', role: 'application', 'aria-label': 'Touchpad. Przesuń palcem, aby ruszyć kursorem. Stuknij, aby kliknąć. Przytrzymaj, aby otworzyć menu.' });
    const finger = h('div', { class: 'finger' });
    const zone = h('div', { class: 'scroll-zone' });
    pad.append(finger, zone, h('p', { class: 'hint' }, 'Przesuń, aby ruszyć kursorem · stuknij, aby kliknąć · dwa palce przewijają'));
    const pointers = new Map();
    let gesture = null; // {kind:'move'|'scroll', start, x0, y0, moved, longTimer, lastT, lx, ly}
    let acc = { dx: 0, dy: 0, sx: 0, sy: 0 }, lastFlush = 0, raf = 0;
    const speed = () => Number(prefs.speed || S?.settings?.touchpad_speed || 1);
    const flush = () => {
      raf = 0;
      const now = performance.now();
      if (now - lastFlush < 33) { raf = requestAnimationFrame(flush); return; }
      lastFlush = now;
      const dx = Math.trunc(acc.dx), dy = Math.trunc(acc.dy);
      if (dx || dy) { sendInput({ type: 'pointer', dx: clamp(dx), dy: clamp(dy) }, { fallback: false }); acc.dx -= dx; acc.dy -= dy; }
      const sx = Math.trunc(acc.sx), sy = Math.trunc(acc.sy);
      if (sx || sy) { sendInput({ type: 'scroll', dx: clamp(sx), dy: clamp(sy) }, { fallback: false }); acc.sx -= sx; acc.sy -= sy; }
    };
    const clamp = v => Math.max(-400, Math.min(400, v));
    const queue = () => { if (!raf) raf = requestAnimationFrame(flush); };
    const ripple = (x, y, right) => { const r = h('i', { class: `ripple ${right ? 'right' : ''}`, style: { left: `${x}px`, top: `${y}px` } }); pad.append(r); setTimeout(() => r.remove(), 500); };
    const local = e => { const b = pad.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top, b]; };

    pad.addEventListener('pointerdown', e => {
      pad.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pad.classList.add('touching', 'used');
      const [x, y, b] = local(e);
      finger.style.transform = `translate(${x}px, ${y}px)`;
      if (pointers.size === 1) {
        const edge = x > b.width - 52;
        gesture = { kind: edge ? 'scroll' : 'move', edge, start: performance.now(), x0: e.clientX, y0: e.clientY, moved: false, lastT: performance.now(), lx: e.clientX, ly: e.clientY, fingers: 1 };
        zone.classList.toggle('active', edge);
        if (!edge) gesture.longTimer = setTimeout(() => {
          if (gesture && !gesture.moved && pointers.size === 1) { gesture.long = true; haptic(30); ripple(x, y, true); sendInput({ type: 'click', button: 'right' }); }
        }, 550);
      } else if (gesture) {
        clearTimeout(gesture.longTimer);
        gesture.kind = 'scroll'; gesture.fingers = Math.max(gesture.fingers, pointers.size); gesture.moved = gesture.moved || false;
        gesture.start2 = performance.now();
      }
    });
    pad.addEventListener('pointermove', e => {
      const p = pointers.get(e.pointerId);
      if (!p || !gesture) return;
      const ddx = e.clientX - p.x, ddy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      const [x, y] = local(e);
      finger.style.transform = `translate(${x}px, ${y}px)`;
      if (Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > 8) { gesture.moved = true; clearTimeout(gesture.longTimer); }
      if (!gesture.moved) return;
      if (gesture.kind === 'scroll') {
        // Average two fingers: each reports half of the motion.
        const share = pointers.size > 1 ? 1 / pointers.size : 1;
        const dir = prefs.natural ? -1 : 1;
        acc.sx += ddx * share * dir * 1.6; acc.sy += ddy * share * dir * 1.6;
      } else {
        const now = performance.now();
        const dt = Math.max(1, now - gesture.lastT);
        const v = Math.hypot(ddx, ddy) / dt; // px per ms
        const gain = speed() * Math.min(3.2, 1 + v * 1.4);
        gesture.lastT = now;
        acc.dx += ddx * gain * 1.5; acc.dy += ddy * gain * 1.5;
      }
      queue();
    });
    const end = e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size) return;
      pad.classList.remove('touching'); zone.classList.remove('active');
      const g = gesture; gesture = null;
      if (!g) return;
      clearTimeout(g.longTimer);
      const [x, y] = local(e);
      const quick = performance.now() - g.start < 300;
      if (!g.moved && !g.long && e.type === 'pointerup') {
        if (g.fingers >= 2) { haptic(20); ripple(x, y, true); sendInput({ type: 'click', button: 'right' }); }
        else if (quick || !g.edge) { haptic(); ripple(x, y, false); sendInput({ type: 'click', button: 'left' }); }
      }
      queue();
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('contextmenu', e => e.preventDefault());
    return pad;
  }
  function buildDpad() {
    const wrap = h('div', { class: 'dpad-wrap' });
    const press = (key, btn) => { haptic(); sendInput({ type: 'key', key }); if (btn) { btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 140); } };
    const btn = (cls, key, label, content) => { const b = h('button', { type: 'button', class: cls, 'aria-label': label }, content); b.addEventListener('click', () => press(key, b)); return b; };
    const pad = h('div', { class: 'dpad' },
      btn('d-up', 'up', 'W górę', icon('up')), btn('d-down', 'down', 'W dół', icon('down')),
      btn('d-left', 'left', 'W lewo', icon('left')), btn('d-right', 'right', 'W prawo', icon('right')),
      btn('d-ok', 'ok', 'OK', 'OK'));
    // Swipes anywhere around the ring also navigate (thumb-friendly, no aiming).
    let sw = null;
    wrap.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; sw = { x: e.clientX, y: e.clientY }; });
    wrap.addEventListener('pointerup', e => {
      if (!sw) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
      if (Math.hypot(dx, dy) < 30) return;
      const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      press(key, pad.querySelector(`.d-${key}`));
    });
    wrap.append(pad);
    return wrap;
  }

  // Keyboard: whatever is typed (or dictated) goes to the focused field on the TV.
  function openKeyboard() {
    const input = h('input', { class: 'kbd-input', type: 'text', maxlength: '500', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'Pisz tutaj — tekst pojawi się na TV' });
    // Mirror edits to the TV as a paced queue (≤20 ops/s, well under the server
    // limit). Deletions are counted in graphemes, so "ą", "ś" or emoji are one
    // Backspace each; consecutive text is merged into a single insertText.
    const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('pl', { granularity: 'grapheme' }) : null;
    const graphemes = s => seg ? [...seg.segment(s)].map(x => x.segment) : Array.from(s);
    const queue = [];
    let last = [], timer = null;
    const MAX_QUEUE = 240;
    const pump = () => {
      timer = null;
      const op = queue.shift();
      if (!op) return;
      // Edits typed for a socket that has since closed are discarded, never replayed.
      if (op.gen !== connGen || ws?.readyState !== 1) { queue.length = 0; return; }
      sendInput(op.text != null ? { type: 'text', text: op.text } : { type: 'key', key: op.key }, { fallback: false });
      if (queue.length) timer = setTimeout(pump, 50);
    };
    const push = op => {
      const tail = queue[queue.length - 1];
      if (ws?.readyState !== 1) { toast('Brak połączenia — tekst nie został wysłany', true); return; }
      op.gen = connGen;
      if (op.text != null && tail?.text != null && tail.gen === op.gen && tail.text.length + op.text.length <= 2000) tail.text += op.text;
      else if (queue.length < MAX_QUEUE) queue.push(op);
      else { toast('Za szybko — część zmian nie dotarła do telewizora', true); return; }
      if (!timer) timer = setTimeout(pump, 0);
    };
    input.addEventListener('input', () => {
      const now = graphemes(input.value);
      let common = 0;
      while (common < last.length && common < now.length && last[common] === now[common]) common++;
      for (let i = 0; i < last.length - common; i++) push({ key: 'backspace' });
      const added = now.slice(common).join('');
      if (added) push({ text: added.slice(0, 2000) });
      last = now;
    });
    const enter = () => { push({ key: 'ok' }); input.value = ''; last = []; };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); enter(); }
      else if (e.key === 'Backspace' && !input.value) push({ key: 'backspace' });
    });
    const stop = () => { queue.length = 0; clearTimeout(timer); timer = null; };
    document.addEventListener('visibilitychange', stop, { once: true });
    openSheet([
      h('h2', null, 'Klawiatura'),
      h('p', { class: 'lead' }, 'Najpierw zaznacz pole tekstowe na telewizorze. Możesz też dyktować — mikrofon jest na klawiaturze iPhone’a.'),
      input,
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => { if (last.length) { last = last.slice(0, -1); input.value = last.join(''); } push({ key: 'backspace' }); } }, 'Usuń znak'),
        h('button', { type: 'button', class: 'btn primary', onclick: enter }, 'Enter')),
    ], { onClose: () => { stop(); document.removeEventListener('visibilitychange', stop); } });
    input.focus();
  }

  // ---------------------------------------------------------------- launching
  async function launch(app, url) {
    haptic(12);
    try {
      const body = url ? { url } : { app_id: app.id };
      if (S?.active_profile_id) body.profile_id = S.active_profile_id;
      const data = await api('/apps/launch', { method: 'POST', body });
      showOperation(data.operation, app?.name || url);
    } catch (error) {
      if (error.status === 409) toast('Trwa już uruchamianie innej aplikacji', true);
      else if (error.status !== 401) toast(error instanceof TypeError ? 'Brak połączenia z telewizorem' : error.message, true);
    }
  }
  function showOperation(op, title) {
    ui.op = { id: op.id, title };
    const box = h('div');
    openSheet([h('h2', null, title || 'Uruchamianie'), box], { onClose: () => { ui.op = null; clearInterval(ui.opPoll); } });
    ui.opBox = box;
    renderOperation(op);
    // Without a socket, poll the operation a few times; never retry the launch itself.
    clearInterval(ui.opPoll);
    if (!ws) {
      let n = 0;
      ui.opPoll = setInterval(async () => {
        if (!ui.op || ++n > 40) { clearInterval(ui.opPoll); return; }
        try { onOperation((await api(`/operations/${encodeURIComponent(op.id)}`)).operation); } catch (_) { /* keep last */ }
      }, 1000);
    }
  }
  function renderOperation(op) {
    if (!ui.opBox) return;
    const failed = op.state === 'failed';
    const step = failed ? -1 : STAGE_STEP[op.stage] ?? 0;
    fill(ui.opBox,
      h('div', { class: 'progress', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(i => h('i', { class: i < step ? 'done' : i === step ? (op.state === 'completed' ? 'done' : 'now') : '' }))),
      h('p', { class: `op-stage ${failed ? 'op-error' : ''}`, role: 'status' }, failed ? (op.error ? errorText(op.error) : STAGES.failed) : (STAGES[op.stage] || op.stage)),
      op.stage === 'selecting_source' || (op.stage === 'launching' && S?.tv?.configured && !S?.tv?.capabilities?.source) ? h('p', { class: 'lead' }, S?.tv?.capabilities?.source ? '' : 'Ten telewizor nie pozwala wybrać HDMI z Home Assistanta — jeśli obraz się nie pojawi, wybierz wejście NUC pilotem TV.') : null,
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: () => closeSheet() }, failed || op.state === 'completed' ? 'Zamknij' : 'Ukryj')));
    if (op.state === 'completed') { haptic(20); setTimeout(() => { if (ui.op?.id === op.id) closeSheet(); }, 1600); }
  }
  function onOperation(op) {
    if (!op) return;
    if (S) S.operation = op;
    if (ui.op?.id === op.id) renderOperation(op);
  }
  function openUrlSheet() {
    const input = h('input', { class: 'kbd-input', type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'np. tvn24.pl' });
    const error = h('p', { class: 'op-error', role: 'alert', style: { 'min-height': '20px', 'font-size': '14px' } });
    const go = () => {
      try {
        const text = input.value.trim();
        if (!text || /\s/.test(text)) throw new Error('Wpisz adres bez spacji.');
        const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Dozwolone są adresy HTTP i HTTPS bez loginu.');
        if (/^(localhost|.+\.localhost\.?|0\.0\.0\.0|127(\.\d{1,3}){3}|169\.254(\.\d{1,3}){2})$/i.test(url.hostname) || /^\[(::1?\]|::ffff:(7f|127\.)|fe80:)/i.test(url.hostname)) throw new Error('Adresy lokalne tego urządzenia są zablokowane ze względów bezpieczeństwa.');
        closeSheet(); launch(null, url.href);
      } catch (err) { error.textContent = err.message.startsWith('Failed') || err instanceof TypeError ? 'To nie wygląda na adres strony.' : err.message; }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    openSheet([h('h2', null, 'Otwórz stronę na TV'), input, error, h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: () => closeSheet() }, 'Anuluj'), h('button', { type: 'button', class: 'btn primary', onclick: go }, 'Otwórz'))]);
    input.focus();
  }

  // ---------------------------------------------------------------- home view
  function entityState(e) {
    if (e.state === 'unavailable' || e.state === 'unknown') return 'Niedostępne';
    if (e.domain === 'light') return e.state === 'on' ? (e.attributes?.brightness_pct ? `Włączone, ${e.attributes.brightness_pct}%` : 'Włączone') : 'Wyłączone';
    if (e.domain === 'switch') return e.state === 'on' ? 'Włączone' : 'Wyłączone';
    if (e.domain === 'scene' || e.domain === 'script') return 'Stuknij, aby uruchomić';
    if (e.domain === 'sensor') return `${Number.isFinite(Number(e.state)) ? Number(e.state).toLocaleString('pl-PL') : e.state} ${e.attributes?.unit || ''}`.trim();
    if (e.domain === 'climate') return `Teraz ${fmtTemp(e.attributes?.current_temperature)}, cel ${fmtTemp(e.attributes?.temperature)}`;
    return e.state;
  }
  const ENTITY_ICON = { light: 'bulb', switch: 'toggle', scene: 'sparkle', script: 'sparkle', climate: 'thermo', sensor: 'thermo' };
  async function homeAction(e, action, brightness) {
    const body = { entity_id: e.entity_id, action };
    if (brightness != null) body.brightness_pct = brightness;
    haptic();
    await guarded(() => api('/home/action', { method: 'POST', body }), e.domain === 'scene' || e.domain === 'script' ? `Uruchomiono: ${e.name}` : null);
  }
  function entityRow(e) {
    const unavailable = e.state === 'unavailable' || e.state === 'unknown';
    const on = e.state === 'on';
    const parts = [h('span', { class: 'c-ic' }, icon(ENTITY_ICON[e.domain] || 'info')), h('span', { class: 'c-body' }, h('span', { class: 'c-name' }, e.name), h('span', { class: 'c-state' }, entityState(e)))];
    if (e.domain === 'light' || e.domain === 'switch') {
      const card = h('div', { class: `card light ${on ? 'is-on' : ''} ${unavailable ? 'unavailable' : ''}` }, parts,
        h('button', { type: 'button', class: `sw ${on ? 'is-on' : ''}`, role: 'switch', 'aria-checked': String(on), 'aria-label': `${e.name}: przełącz`, disabled: unavailable, onclick: () => homeAction(e, 'toggle') }));
      if (e.domain === 'light' && e.attributes?.supported?.includes('brightness')) {
        const slider = h('input', { class: 'slider', type: 'range', min: '1', max: '100', step: '1', value: String(on ? e.attributes.brightness_pct || 100 : 0), 'aria-label': `Jasność: ${e.name}`, disabled: unavailable });
        slider.addEventListener('change', () => homeAction(e, 'turn_on', Number(slider.value)));
        card.append(slider);
      }
      return card;
    }
    if (e.domain === 'scene' || e.domain === 'script') return h('button', { type: 'button', class: `card ${unavailable ? 'unavailable' : ''}`, disabled: unavailable, onclick: () => homeAction(e, 'turn_on') }, parts);
    return h('div', { class: `card ${unavailable ? 'unavailable' : ''}` }, parts);
  }
  function renderHome() {
    const view = $('view-home');
    view.classList.add('scroll');
    const s = S?.settings || {};
    const home = S?.home || {};
    const w = home.weather;
    const movieBits = [];
    if (s.movie_scene || s.movie_lights?.length) movieBits.push(`światła ${s.movie_brightness ?? 0}%`);
    if (appById(s.movie_app)) movieBits.push(appById(s.movie_app).name);
    const groups = [['Światła i przełączniki', ['light', 'switch']], ['Sceny', ['scene', 'script']], ['Klimat', ['climate', 'sensor']]];
    const entities = (home.entities || []).filter(e => e.entity_id !== s.movie_scene);
    fill(view,
      h('h1', null, 'Dom'),
      home.error ? h('p', { class: 'lead', style: { color: 'var(--danger)' } }, 'Home Assistant nie odpowiada. Sterowanie domem wróci, gdy połączenie się odnowi.') : null,
      h('button', { type: 'button', class: 'card hero', onclick: async () => { haptic(16); const d = await guarded(() => api('/movie', { method: 'POST', body: {} })); if (d?.operation) showOperation(d.operation, 'Wieczór filmowy'); } },
        h('span', { class: 'c-ic' }, icon('film')), h('span', { class: 'c-body' }, h('span', { class: 'c-name' }, 'Wieczór filmowy'), h('span', { class: 'c-state' }, movieBits.join(', ') || 'Ustaw na telewizorze: Ustawienia → Dom i telewizor'))),
      w ? h('div', { class: 'weather' }, icon((WEATHER[w.condition] || ['cloudy'])[0]), h('span', { class: 't' }, fmtTemp(w.temperature)), h('span', null, h('span', { class: 'c-name', style: { display: 'block', 'font-weight': '600' } }, (WEATHER[w.condition] || [, w.condition])[1]), h('span', { class: 'meta' }, [w.name, w.humidity != null ? `wilgotność ${w.humidity}%` : null].filter(Boolean).join(', ')))) : null,
      groups.map(([title, domains]) => {
        const list = entities.filter(e => domains.includes(e.domain));
        return list.length ? [h('h3', { class: 'section-title' }, title), list.map(entityRow)] : null;
      }),
      !entities.length && !home.error ? h('p', { class: 'empty', style: { 'margin-top': '18px' } }, 'Nie udostępniono jeszcze żadnych urządzeń. Wybierz je na telewizorze: Ustawienia → Dom i telewizor → Widoczne urządzenia.') : null);
  }

  // ---------------------------------------------------------------- voice / text commands
  function voiceBadge() {
    const assist = S?.capabilities?.voice === 'assist_text';
    return [icon('mic'), h('span', null,
      h('b', null, assist ? 'Tekst i dyktowanie, zrozumienie przez Home Assistant Assist' : 'Tekst i dyktowanie iPhone’a'),
      assist ? 'Polecenia, których pilot nie zna, trafiają do Assist w Twoim Home Assistancie.' : 'Rozpoznawanie mowy na serwerze nie jest włączone. Stuknij pole i użyj mikrofonu na klawiaturze, aby podyktować polecenie.')];
  }
  function renderVoice() {
    const view = $('view-voice');
    // Built once: the typed command and history survive live state updates.
    if (ui.voiceBadge) { fill(ui.voiceBadge, voiceBadge()); return; }
    view.classList.add('scroll');
    const input = h('input', { type: 'text', enterkeyhint: 'send', autocomplete: 'off', placeholder: 'Np. Otwórz Netflix', 'aria-label': 'Polecenie' });
    const list = h('ul', { class: 'history', 'aria-live': 'polite' });
    const drawHistory = () => fill(list, ui.history.map(item => h('li', { class: item.ok ? 'ok' : 'fail' }, h('span', null, item.text), h('span', { class: 'r' }, item.result))));
    const run = async text => {
      const value = text.trim();
      if (!value) return;
      haptic(12);
      input.value = '';
      const entry = { text: value, ok: false, result: 'Wysyłam…' };
      ui.history.unshift(entry); ui.history.length = Math.min(ui.history.length, 8); drawHistory();
      try {
        const data = await api('/voice/text', { method: 'POST', body: { text: value } });
        entry.ok = !!data.handled;
        entry.result = data.handled ? 'Wykonano' : (data.message || 'Nie rozumiem tego polecenia');
        if (data.operation) showOperation(data.operation, value);
      } catch (error) { entry.result = error instanceof TypeError ? 'Brak połączenia' : error.message; }
      drawHistory();
    };
    const form = h('form', { class: 'cmd-form', onsubmit: e => { e.preventDefault(); run(input.value); } }, input, h('button', { type: 'submit', class: 'btn primary', 'aria-label': 'Wyślij polecenie' }, icon('send')));
    fill(view,
      h('h1', null, 'Polecenia'),
      ui.voiceBadge = h('div', { class: 'mode-badge' }, voiceBadge()),
      form,
      h('h3', { class: 'section-title' }, 'Przykłady'),
      h('div', { class: 'chips' }, EXAMPLES.map(t => h('button', { type: 'button', class: 'chip', onclick: () => run(t) }, t))),
      h('h3', { class: 'section-title' }, 'Ostatnie'),
      list);
    drawHistory();
  }

  // ---------------------------------------------------------------- settings
  function renderSettings() {
    const view = $('view-settings');
    view.classList.add('scroll');
    const speedValue = Number(prefs.speed || S?.settings?.touchpad_speed || 1);
    const speed = h('input', { class: 'slider', type: 'range', min: '0.25', max: '3', step: '0.25', value: String(speedValue), 'aria-label': 'Czułość touchpada' });
    const speedOut = h('span', { class: 'meta' }, `${speedValue.toLocaleString('pl-PL')}×`);
    speed.addEventListener('input', () => { prefs.speed = Number(speed.value); speedOut.textContent = `${prefs.speed.toLocaleString('pl-PL')}×`; savePrefs(); });
    const toggleRow = (label, help, key) => h('button', { type: 'button', class: `setting ${prefs[key] ? 'is-on' : ''}`, role: 'switch', 'aria-checked': String(!!prefs[key]), onclick: () => { prefs[key] = !prefs[key]; savePrefs(); renderSettings(); } }, h('span', null, label, h('small', null, help)), h('span', { class: 'sw' }));
    const profiles = S?.profiles || [];
    fill(view,
      h('h1', null, 'Ustawienia'),
      profiles.length > 1 && h('h3', { class: 'section-title' }, 'Kto ogląda'),
      profiles.length > 1 && h('div', { class: 'chips' }, profiles.map(p => h('button', { type: 'button', class: 'chip', style: p.id === S.active_profile_id ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : null, onclick: async () => { const r = await guarded(() => api('/profiles/active', { method: 'POST', body: { profile_id: p.id } }), `Profil: ${p.name}`); if (r) { S.active_profile_id = r.active_profile_id; render(); } } }, p.name))),
      h('h3', { class: 'section-title' }, 'Touchpad'),
      h('div', { class: 'setting col' }, h('div', { class: 'row', style: { 'justify-content': 'space-between' } }, h('span', null, 'Czułość'), speedOut), speed),
      toggleRow('Naturalne przewijanie', 'Treść podąża za palcami, jak na telefonie', 'natural'),
      toggleRow('Wibracje', 'Działa na Androidzie; iPhone nie udostępnia wibracji stronom', 'haptics'),
      h('h3', { class: 'section-title' }, 'Ten telefon'),
      h('div', { class: 'setting' }, h('span', null, session?.name || 'Telefon', h('small', null, session?.expires_at ? `Dostęp ważny do ${new Date(session.expires_at * 1000).toLocaleDateString('pl-PL')}` : '')), icon('remote')),
      h('div', { class: 'setting' }, h('span', null, 'Połączenie', h('small', null, conn === 'online' ? 'Na żywo (WebSocket)' : conn === 'connecting' ? 'Łączenie…' : 'Brak połączenia')), h('span', { class: 'meta' }, S?.version ? `v${S.version}` : '')),
      h('h3', { class: 'section-title' }, 'Na ekranie początkowym'),
      h('p', { class: 'empty' }, isStandalone() ? 'Pilot działa jako aplikacja z ekranu początkowego.' : 'W Safari stuknij Udostępnij, potem „Do ekranu początk.”. Pilot otworzy się na pełnym ekranie, bez paska adresu.'),
      h('div', { style: { 'margin-top': '22px' } }, h('button', { type: 'button', class: 'btn danger block', onclick: () => {
        openSheet([h('h2', null, 'Odłączyć ten telefon?'), h('p', { class: 'lead' }, 'Aby znów sterować telewizorem, trzeba będzie wpisać nowy kod z ekranu.'),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: () => closeSheet() }, 'Anuluj'), h('button', { type: 'button', class: 'btn danger', onclick: async () => { closeSheet(); await guarded(() => api('/session/logout', { method: 'POST', body: {} })); onUnauthorized(); } }, 'Odłącz'))]);
      } }, 'Odłącz ten telefon')));
  }
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

  // ---------------------------------------------------------------- boot
  async function boot() {
    setConn('connecting');
    try {
      const data = await api('/session');
      if (!data.device) { showPair(); return; }
      session = data.device;
      await refresh();
      showView(prefs.tab && prefs.tab !== 'pair' ? prefs.tab : 'remote');
      connect();
    } catch (error) {
      if (error.status === 401) return; // onUnauthorized already showed pairing
      showView(prefs.tab || 'remote');
      session = session || { name: '' };
      scheduleReconnect();
    }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/remote/sw.js', { scope: '/remote/' }).catch(() => { /* PWA install is optional */ });
  }
  boot();
  window.__remote = { get state() { return S; }, get conn() { return conn; }, get session() { return session; } };
})();

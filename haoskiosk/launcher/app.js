'use strict';
(() => {
  const tiles = [...document.querySelectorAll('.tile')];
  const dialog = document.getElementById('url-dialog');
  const input = document.getElementById('url-input');
  const error = document.getElementById('url-error');
  const status = document.getElementById('status');
  const controls = [input, document.getElementById('url-cancel'), document.getElementById('url-open')];
  let haUrl = null;
  let selected = 0;
  try { selected = Math.max(0, tiles.findIndex(tile => tile.dataset.app === sessionStorage.getItem('tv-selected'))); } catch (_) { /* Storage is optional. */ }

  function select(index, focus = true) {
    selected = Math.max(0, Math.min(index, tiles.length - 1));
    tiles.forEach((tile, i) => {
      tile.classList.toggle('selected', i === selected);
      tile.tabIndex = i === selected ? 0 : -1;
    });
    try { sessionStorage.setItem('tv-selected', tiles[selected].dataset.app); } catch (_) { /* Storage is optional. */ }
    if (focus) tiles[selected].focus({preventScroll: true});
    tiles[selected].scrollIntoView({block: 'nearest', inline: 'nearest'});
  }
  function openUrlDialog() {
    error.textContent = '';
    input.value = '';
    dialog.showModal();
    input.focus();
  }
  function closeUrlDialog() { dialog.close(); select(selected); }
  function launch(tile) {
    if (tile.dataset.app === 'browser') { openUrlDialog(); return; }
    const url = tile.dataset.app === 'ha' ? haUrl : tile.dataset.url;
    if (!url) { status.textContent = 'Nie udało się odczytać adresu Home Assistanta. Odśwież launcher przez Ctrl + Alt + H.'; return; }
    // Ordinary same-window navigation: no REST credentials, no new profile/tab.
    window.location.assign(url);
  }
  function normalizeAddress(value) {
    const text = value.trim();
    if (!text || /\s/.test(text)) throw new Error('Wpisz adres strony bez spacji.');
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text) && !/^[^/:]+:\d+(\/|$)/.test(text)) throw new Error('Dozwolone są adresy HTTP i HTTPS.');
    const url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Wpisz adres HTTP/HTTPS bez loginu i hasła.');
    return url.href;
  }
  tiles.forEach((tile, index) => {
    tile.addEventListener('focus', () => select(index, false));
    tile.addEventListener('click', () => { select(index); launch(tile); });
  });
  document.getElementById('url-cancel').addEventListener('click', closeUrlDialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeUrlDialog(); });
  document.getElementById('url-form').addEventListener('submit', event => {
    event.preventDefault();
    try { window.location.assign(normalizeAddress(input.value)); }
    catch (err) { error.textContent = err.message; input.focus(); }
  });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || (event.altKey && event.key !== 'ArrowLeft')) return;
    const back = ['Escape', 'BrowserBack', 'GoBack'].includes(event.key) || (event.altKey && event.key === 'ArrowLeft') || (event.key === 'Backspace' && document.activeElement !== input);
    if (back) { event.preventDefault(); if (dialog.open) closeUrlDialog(); else select(0); return; }
    if (dialog.open) {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!event.repeat) {
          if (document.activeElement === controls[1]) closeUrlDialog();
          else document.getElementById('url-form').requestSubmit();
        }
        return;
      }
      // Left/right remain native text-cursor keys while editing the URL.
      if (['ArrowUp', 'ArrowDown'].includes(event.key) || (document.activeElement !== input && ['ArrowLeft', 'ArrowRight'].includes(event.key))) {
        event.preventDefault();
        const step = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
        const index = controls.indexOf(document.activeElement);
        controls[(index + step + controls.length) % controls.length].focus();
      }
      return;
    }
    const columns = getComputedStyle(document.getElementById('tiles')).gridTemplateColumns.split(' ').length;
    const row = Math.floor(selected / columns);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      let next = selected;
      if (event.key === 'ArrowLeft' && selected % columns > 0) next--;
      if (event.key === 'ArrowRight' && selected % columns < columns - 1) next++;
      if (event.key === 'ArrowUp' && row > 0) next -= columns;
      if (event.key === 'ArrowDown' && next + columns < tiles.length) next += columns;
      select(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) launch(tiles[selected]);
    }
  });
  function updateClock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit'}); }
  updateClock(); setInterval(updateClock, 30000);
  select(selected);
  fetch('/launcher/config', {cache: 'no-store'}).then(response => {
    if (!response.ok) throw new Error('Launcher config unavailable');
    return response.json();
  }).then(config => { haUrl = config.ha_url; }).catch(() => { status.textContent = 'Nie udało się odczytać konfiguracji Home Assistanta. Pozostałe kafelki są dostępne.'; });
})();

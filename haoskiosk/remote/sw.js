'use strict';
// Caches only the remote's static shell so it opens instantly and shows a clear
// "no connection" state offline. API calls, pairing, cookies and Home Assistant
// data are never cached: anything outside SHELL goes straight to the network.
const VERSION = 'remote-v3.0.0-1';
const SHELL = [
  '/remote/', '/remote/app.js', '/remote/style.css', '/remote/manifest.webmanifest',
  '/remote/fonts/manrope-latin.woff2', '/remote/fonts/manrope-latin-ext.woff2',
  '/remote/icons/icon-192.png', '/remote/icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname === '/remote/index.html' ? '/remote/' : url.pathname;
  if (!SHELL.includes(path)) return;
  // Network first so updates land on the next open; cache is the offline fallback.
  event.respondWith(fetch(request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(VERSION).then(cache => cache.put(path, copy));
    }
    return response;
  }).catch(() => caches.match(path)));
});

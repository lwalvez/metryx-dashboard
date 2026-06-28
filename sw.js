/* Metryx service worker — offline shell + stale-while-revalidate.
   Bump CACHE on each deploy to invalidate old assets. */
const CACHE = "metryx-v1";
const CORE = [
  "./",
  "./index.html",
  "./login.html",
  "./css/app.css",
  "./css/auth.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/auth-client.js",
  "./js/guard.js",
  "./js/supabase-config.js",
  "./manifest.json",
  "./images/favicon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let Supabase/fonts hit network

  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => { if (res && res.status === 200) cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});

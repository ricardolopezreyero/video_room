// RLR · Service worker: la app entera vive en el disco del teléfono.
//
// Qué guarda: las páginas de la app (/, /app/*), los estilos, los scripts y
// las fuentes. Qué NO toca: /api, /auth, /ws, los webhooks y las salas
// (/<slug>), que son en vivo y siempre van a la red.
//
// Cómo sirve lo guardado: primero del disco (al instante) y, por detrás,
// pide la versión nueva a la red y la deja lista para la próxima vez. Una
// publicación nueva tarda exactamente una navegación en llegar; a cambio,
// ninguna navegación espera a la red.
var _k = "eye", _rev = 181218;
var VERSION = "2026-10-10e";
var CACHE = "video-room-" + VERSION;
var GUARDADO = [
  "/", "/app/monedero", "/app/estadisticas", "/app/transacciones", "/app/faq", "/app/materiales",
  "/app/manifiesto", "/app/api", "/app/bienvenida",
  "/style.css", "/veloz.js", "/room.js", "/motor-video.js", "/motor-audio.js", "/chat.js", "/qr-lib.js", "/qr.js", "/materiales.js", "/materiales-motor.js", "/materiales-video.js", "/materiales-catalogo.js", "/puente-login.js", "/utm.js", "/og-default.svg",
  "/fonts/plus-jakarta-sans.woff2", "/fonts/plus-jakarta-sans-italic.woff2"
];
var ES_GUARDADO = new Set(GUARDADO);

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(GUARDADO.map(function (ruta) {
      return fetch(new Request(ruta, { cache: "reload", credentials: "same-origin" }))
        .then(function (r) { if (r.ok) return cache.put(ruta, r); })
        .catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(Promise.all([
    caches.keys().then(function (llaves) {
      return Promise.all(llaves.filter(function (k) { return k.indexOf("video-room-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }),
    self.registration.navigationPreload ? self.registration.navigationPreload.enable() : Promise.resolve()
  ]).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var ruta = url.pathname.replace(/\/$/, "") || "/";
  if (ES_GUARDADO.has(ruta)) {
    // Los scripts de la sala llegan con ?v=<versión del Worker>: una versión
    // nueva es una llave nueva (se baja de la red y se guarda); la vieja se
    // borra. Así un deploy nunca sirve room.js viejo ni una sola vez.
    var llave = url.search ? ruta + url.search : ruta;
    e.respondWith(delDiscoPrimero(e, ruta, llave));
    return;
  }
  // Lo demás (salas, api, auth…) va a la red tal cual. El preload de
  // navegación ya salió en paralelo con el arranque de este worker, así que
  // tampoco le cuesta nada pasar por aquí.
  if (req.mode === "navigate") {
    e.respondWith(Promise.resolve(e.preloadResponse).then(function (pre) { return pre || fetch(req); }));
  }
});

function delDiscoPrimero(e, ruta, llave) {
  llave = llave || ruta;
  return caches.open(CACHE).then(function (cache) {
    return cache.match(llave).then(function (guardada) {
      // "no-cache": la renovación de fondo pregunta al servidor de verdad
      // (ETag), no a la caché HTTP del navegador — si no, una publicación
      // nueva tardaría hasta 10 minutos (max-age) además de una navegación.
      var red = fetch(new Request(llave, { credentials: "same-origin", cache: "no-cache" })).then(function (r) {
        if (r && r.ok) {
          cache.put(llave, r.clone());
          if (llave !== ruta) {
            // Versiones anteriores del mismo archivo: fuera.
            cache.keys().then(function (ks) {
              ks.forEach(function (k) { var u = new URL(k.url); if (u.pathname === ruta && u.search && (u.pathname + u.search) !== llave) cache.delete(k); });
            });
          }
        }
        return r;
      }).catch(function () { return null; });
      if (guardada) { e.waitUntil(red); return guardada; }
      return red.then(function (r) {
        return r || new Response("Sin conexión. Intenta de nuevo en un momento.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      });
    });
  });
}

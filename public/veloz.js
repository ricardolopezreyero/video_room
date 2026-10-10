// RLR · Velocidad: lo que pasa entre el clic y la página siguiente.
//
// El sistema es chico y cerrado: desde cada pantalla se sabe a dónde es
// probable que vaya la persona. Entonces:
//
//  1. Esas páginas, y los datos que pintan, se traen por adelantado y se
//     guardan (Speculation Rules en Chrome; service worker + copias de /api
//     en todos los navegadores). Al clic ya están aquí.
//  2. La navegación arranca al presionar, no al soltar: los milisegundos que
//     el dedo regala en cada toque. Y la página responde en el mismo cuadro
//     (se hunde el botón, se atenúa lo que se va) para que el ojo registre
//     el clic antes de que llegue nada.
//  3. Lo aprendido se queda: cada ruta que esta persona toma suma a su propia
//     tabla de probabilidades (en su navegador) y las siguientes visitas
//     precargan primero lo que ella de verdad usa.
//
// Se carga en <head> a propósito (es chico y el service worker lo sirve del
// disco): tiene que estar antes que los scripts de cada página para que
// window.fetch ya devuelva las copias cuando ellos piden /api/....
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  if (!window.fetch || !window.Promise || !window.URL) return;

  var MAX_EDAD_MS = 30000; // una copia más vieja que esto ya no se usa
  var FRESCA_MS = 5000;    // más nueva que esto, ni se vuelve a pedir
  var fetchReal = window.fetch.bind(window);

  // ---- dónde estamos ----
  var ruta = location.pathname.replace(/\/$/, "") || "/";
  var esApp = ruta === "/" || ruta.indexOf("/app/") === 0;
  var pagina = esApp ? ruta : "sala";

  // ---- a dónde suele irse la gente desde cada pantalla (pesos a priori) ----
  var SIGUIENTE = {
    "/": { "/app/monedero": 3, "/app/faq": 2, "/app/manifiesto": 2, "/app/api": 1 },
    "/app/monedero": { "/app/estadisticas": 4, "/app/transacciones": 3, sala: 3, "/app/materiales": 2, "/app/faq": 1, "/": 1 },
    "/app/materiales": { "/app/monedero": 3, sala: 2, "/": 1 },
    "/app/estadisticas": { "/app/monedero": 4, "/app/transacciones": 2, sala: 2 },
    "/app/transacciones": { "/app/monedero": 4, "/app/estadisticas": 2, sala: 2 },
    "/app/faq": { "/app/monedero": 2, "/": 2, "/app/manifiesto": 1 },
    "/app/manifiesto": { "/app/faq": 2, "/": 2, "/app/monedero": 1 },
    "/app/api": { "/app/monedero": 2, "/": 1 },
    "/app/bienvenida": { "/app/monedero": 5 },
    sala: { "/app/monedero": 3, "/": 1 }
  };

  // ---- qué datos pinta cada página al abrir (lo que se precarga de /api).
  //      Las URLs son exactamente las que cada página pide. ----
  function dia(haceDias) { return new Date(Date.now() - haceDias * 86400000).toISOString().slice(0, 10); }
  var DATOS = {
    "/": ["/api/phrase"],
    "/app/monedero": ["/api/wallet/me", "/api/rooms/mine", "/api/status/me", "/api/notifications", "/api/phrase"],
    "/app/estadisticas": ["/api/wallet/me", "/api/stats/deep?from=" + dia(29) + "&to=" + dia(0), "/api/notifications"],
    "/app/transacciones": ["/api/wallet/me", "/api/wallet/transactions", "/api/rooms/mine", "/api/notifications"],
    "/app/bienvenida": ["/api/wallet/me"]
  };
  var CON_SESION = /^\/api\/(wallet|rooms\/mine|status\/me|notifications|stats)/;

  // ---- copias de /api: cada una se usa una sola vez (se pinta al instante)
  //      y, si ya tiene edad, se vuelve a pedir por detrás. ----
  var memoria = {};
  function clave(path) { return "vrc:" + path; }
  function leer(path) {
    var raw = null;
    try { raw = sessionStorage.getItem(clave(path)); } catch (e) {}
    if (raw == null) raw = memoria[clave(path)] || null;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function guardar(path, json, verificada) {
    var raw = JSON.stringify({ t: Date.now(), j: json, v: !!verificada });
    try { sessionStorage.setItem(clave(path), raw); } catch (e) { memoria[clave(path)] = raw; }
  }
  function borrar(path) {
    try { sessionStorage.removeItem(clave(path)); } catch (e) {}
    delete memoria[clave(path)];
  }
  function borrarTodo() {
    try {
      for (var i = sessionStorage.length - 1; i >= 0; i--) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf("vrc:") === 0) sessionStorage.removeItem(k);
      }
    } catch (e) {}
    memoria = {};
  }

  function rutaDe(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin === location.origin ? u.pathname + u.search : null;
    } catch (e) { return null; }
  }
  function esApi(path) { return !!path && path.indexOf("/api/") === 0; }

  var sinSesion = false;
  function precargarDato(path) {
    var c = leer(path);
    if (c && Date.now() - c.t < MAX_EDAD_MS) return Promise.resolve();
    if (sinSesion && CON_SESION.test(path)) return Promise.resolve();
    return fetchReal(path, { credentials: "same-origin", priority: "low" }).then(function (r) {
      if (r.status === 401) { sinSesion = true; return; }
      if (!r.ok) return;
      return r.json().then(function (j) { guardar(path, j, false); });
    }).catch(function () {});
  }
  function precargarDatos(pag) {
    var lista = DATOS[pag];
    if (!lista) return;
    // /api/wallet/me va primero: si no hay sesión, lo demás ni se pide.
    var primero = lista.indexOf("/api/wallet/me") >= 0 ? precargarDato("/api/wallet/me") : Promise.resolve();
    primero.then(function () {
      lista.forEach(function (p) { if (p !== "/api/wallet/me") precargarDato(p); });
    });
  }

  function revalidar(path, previo) {
    fetchReal(path, { credentials: "same-origin" }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      if (!j || JSON.stringify(j) === JSON.stringify(previo)) return;
      guardar(path, j, true);
      // La página que escucha esto vuelve a pintar solo ese bloque; la
      // siguiente lectura ya sale de la copia verificada, sin otra petición.
      window.dispatchEvent(new CustomEvent("vr:fresco", { detail: { url: path } }));
    }).catch(function () {});
  }

  window.fetch = function (input, init) {
    var esRequest = typeof Request !== "undefined" && input instanceof Request;
    var url = typeof input === "string" ? input : esRequest ? input.url : String(input);
    var metodo = ((init && init.method) || (esRequest && input.method) || "GET").toUpperCase();
    var path = rutaDe(url);
    if (!esApi(path)) return fetchReal(input, init);
    if (metodo !== "GET") { borrarTodo(); return fetchReal(input, init); }
    var c = leer(path);
    if (!c) return fetchReal(input, init);
    borrar(path);
    var edad = Date.now() - c.t;
    if (edad > MAX_EDAD_MS) return fetchReal(input, init);
    if (!c.v && edad > FRESCA_MS) revalidar(path, c.j);
    return Promise.resolve(new Response(JSON.stringify(c.j), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Veloz": c.v ? "verificada" : "copia" }
    }));
  };

  // ---- qué links hay en esta página y a qué pantalla llevan ----
  function destinoDe(a) {
    if (!a || (a.target && a.target !== "_self")) return null;
    if (a.hasAttribute("download") || a.hasAttribute("data-no-veloz")) return null;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || /^(mailto|tel|javascript):/i.test(href)) return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin) return null;
    var p = u.pathname.replace(/\/$/, "") || "/";
    if (p === ruta) return null;
    if (/^\/(login|auth|api|ws|webhook|unsubscribe|r)(\/|$)/.test(p) || /\.[a-z0-9]+$/i.test(p)) return null;
    var pag = (p === "/" || p.indexOf("/app/") === 0) ? p : "sala";
    return { href: u.pathname + u.search, pagina: pag };
  }
  function enlacesInternos() {
    var m = {};
    var as = document.querySelectorAll("a[href]");
    for (var i = 0; i < as.length; i++) {
      var d = destinoDe(as[i]);
      if (d && !m[d.pagina]) m[d.pagina] = d.href;
    }
    return m;
  }

  // ---- lo aprendido de esta persona: de qué pantalla a cuál se fue ----
  var RUTAS = "vr-rutas";
  function aprendidas() { try { return JSON.parse(localStorage.getItem(RUTAS) || "{}"); } catch (e) { return {}; } }
  function aprender(desde, hasta) {
    if (!desde || desde === hasta) return;
    var r = aprendidas(), k = desde + ">" + hasta;
    r[k] = Math.min(50, (r[k] || 0) + 1);
    try { localStorage.setItem(RUTAS, JSON.stringify(r)); } catch (e) {}
  }
  function candidatos() {
    var enlaces = enlacesInternos(), prior = SIGUIENTE[pagina] || {}, apr = aprendidas(), lista = [];
    Object.keys(enlaces).forEach(function (pag) {
      lista.push({ pagina: pag, href: enlaces[pag], score: (prior[pag] || 0) * 2 + (apr[pagina + ">" + pag] || 0) });
    });
    lista.sort(function (a, b) { return b.score - a.score; });
    return lista;
  }

  // ---- la página siguiente, antes del clic ----
  var yaPrefetch = {}, especulado = false;
  function prefetchHtml(href) {
    if (yaPrefetch[href]) return;
    yaPrefetch[href] = 1;
    var l = document.createElement("link");
    l.rel = "prefetch"; l.href = href; l.as = "document";
    document.head.appendChild(l);
  }
  function especular(prerender, prefetch) {
    if (!window.HTMLScriptElement || !HTMLScriptElement.supports || !HTMLScriptElement.supports("speculationrules")) return false;
    var reglas = { prerender: [], prefetch: [] };
    // La más probable, lista por completo (ya pintada, con sus scripts corridos).
    if (prerender.length) reglas.prerender.push({ source: "list", urls: prerender, eagerness: "immediate" });
    if (prefetch.length) reglas.prefetch.push({ source: "list", urls: prefetch, eagerness: "immediate" });
    // Y cualquier otra pantalla de la app, en cuanto el mouse pasa o el dedo baja.
    reglas.prerender.push({ source: "document", where: { href_matches: ["/", "/app/*"] }, eagerness: "moderate" });
    var s = document.createElement("script");
    s.type = "speculationrules";
    s.textContent = JSON.stringify(reglas);
    document.head.appendChild(s);
    return true;
  }
  function planear() {
    var top = candidatos().slice(0, 3);
    top.slice(0, 2).forEach(function (c) { if (c.pagina !== "sala") precargarDatos(c.pagina); });
    if (!especulado) {
      especulado = true;
      var app = top.filter(function (c) { return c.pagina !== "sala"; }).map(function (c) { return c.href; });
      if (app.length && !especular(app.slice(0, 1), app.slice(1))) app.forEach(prefetchHtml);
    }
    // La sala propia: solo su HTML. Nunca prerender — abriría el WebSocket y
    // contaría como alguien conectado.
    top.forEach(function (c) { if (c.pagina === "sala") prefetchHtml(c.href); });
  }
  function anticipar(a) {
    var d = destinoDe(a);
    if (!d) return;
    if (d.pagina !== "sala") precargarDatos(d.pagina); else prefetchHtml(d.href);
  }

  // ---- el clic: la salida arranca al presionar y se ve en el mismo cuadro ----
  function linkDe(el) { return el && el.closest ? el.closest("a[href]") : null; }
  var presionado = null, toque = null, navegando = false, reset = null;
  function presionar(a) {
    soltar();
    presionado = a.querySelector("button") || a;
    presionado.classList.add("vr-pressed");
  }
  function soltar() {
    if (presionado) { presionado.classList.remove("vr-pressed"); presionado = null; }
  }
  function ir(a) {
    if (!destinoDe(a)) return;
    navegando = true;
    try { sessionStorage.setItem("vr-desde", pagina); } catch (e) {}
    document.documentElement.classList.add("vr-saliendo");
    location.href = a.href;
    // Si la navegación no ocurre (sin red, o el navegador la canceló), la
    // página vuelve a ser usable sola.
    clearTimeout(reset);
    reset = setTimeout(function () { navegando = false; soltar(); document.documentElement.classList.remove("vr-saliendo"); }, 4000);
  }
  document.addEventListener("pointerdown", function (e) {
    if (navegando || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = linkDe(e.target);
    if (!a || !destinoDe(a)) return;
    presionar(a);
    anticipar(a);
    if (e.pointerType === "mouse") { ir(a); return; }
    if (navigator.vibrate) { try { navigator.vibrate(5); } catch (x) {} }
    toque = { a: a, x: e.clientX, y: e.clientY };
  }, { passive: true });
  document.addEventListener("pointermove", function (e) {
    if (toque && (Math.abs(e.clientX - toque.x) > 8 || Math.abs(e.clientY - toque.y) > 8)) { toque = null; soltar(); }
  }, { passive: true });
  document.addEventListener("pointerup", function (e) {
    if (!toque) return;
    var a = linkDe(e.target);
    if (a === toque.a) ir(a); else soltar();
    toque = null;
  }, { passive: true });
  document.addEventListener("pointercancel", function () { toque = null; soltar(); });
  document.addEventListener("click", function (e) {
    if (navegando && linkDe(e.target)) e.preventDefault();
  }, true);
  document.addEventListener("pointerover", function (e) { var a = linkDe(e.target); if (a) anticipar(a); }, { passive: true });
  document.addEventListener("focusin", function (e) { var a = linkDe(e.target); if (a) anticipar(a); });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) { navegando = false; soltar(); document.documentElement.classList.remove("vr-saliendo"); }
  });

  // ---- arranque ----
  function arrancar() {
    try {
      var desde = sessionStorage.getItem("vr-desde");
      if (desde) aprender(desde, pagina);
      sessionStorage.setItem("vr-desde", pagina);
    } catch (e) {}
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 600); };
    idle(planear);
    setTimeout(planear, 2500); // los links que aparecen después de pintar datos
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(function () {});
  }
  function listo() {
    if (document.readyState === "complete") arrancar(); else window.addEventListener("load", arrancar);
  }
  // Una página que Chrome está pintando por adelantado no debe, a su vez,
  // adelantar otras: espera a que de verdad la abran.
  if (document.prerendering) document.addEventListener("prerenderingchange", listo, { once: true }); else listo();

  window.veloz = { precargar: precargarDatos, copia: leer, pagina: pagina, _rev: _rev };
})();

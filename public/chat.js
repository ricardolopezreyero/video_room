// RLR · El chat en vivo de Video Room — hecho para mucha gente y mucho texto.
//
// Principios:
//  · Lo nuevo entra abajo siempre. Si estás leyendo arriba, no te mueve: el
//    botón «↓ N nuevos» te regresa a lo vivo cuando tú quieras.
//  · El DOM nunca crece sin tope: se pintan ~350 filas alrededor de donde
//    estás; lo demás vive en memoria (y lo más viejo, en el servidor).
//  · Subir no espera: la página anterior se pide antes de que haga falta y
//    entra sin mover lo que estás leyendo.
//  · Buscar recorre todo lo dicho en la transmisión (sin acentos ni
//    mayúsculas), con contador y flechas.
//  · En computadora, todo se puede hacer con teclas.
//  · Nada se graba: al cerrar la sala el servidor borra todo.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const TOPE_DOM = 350, PAGINA = 80, PASO_CURSOR = 1;
  const ESCRITORIO = window.matchMedia && matchMedia("(hover:hover) and (pointer:fine)").matches;
  const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const $ = (id) => document.getElementById(id);
  const pesos = (c) => "$" + (Math.round(c) / 100).toLocaleString("es-MX", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(x).padStart(2, "0"); };
  const horaLocal = (ts) => { try { return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return ""; } };

  function crear(o) {
    const feed = o.feed, panel = o.panel;
    const vivoBtn = $("chat-vivo"), vivoN = $("chat-vivo-n"), chips = $("chat-chips"), busca = $("chat-busca");
    const E = {
      filas: [], porSeq: new Map(), vista: [], i0: 0, i1: -1, // ventana pintada: vista[i0..i1]
      filtro: "todo", pegado: true, sinLeer: 0, menciones: 0, delCreador: 0,
      hayMas: false, reserva: null, metiendo: false, ultimoSeq: 0, inicioMs: 0, desfase: 0,
      cursor: null, busqueda: null, cola: [], raf: 0, alto: false,
      enVivo: true, // la ventana pintada termina en lo más nuevo (no estás en un salto a lo viejo)
    };
    const yo = () => (o.yo && o.yo()) || null;
    const esCreador = () => !!(o.esCreador && o.esCreador());
    const miNombre = () => { const y = yo(); return y && y.name ? sinAcentos(y.name.split(/\s+/)[0]) : ""; };
    const meMenciona = (f) => { const n = miNombre(); return !!n && f.kind === "msg" && sinAcentos(f.body).includes("@" + n); };
    const esMio = (f) => { const y = yo(); return !!(y && f.user_id && f.user_id === y.id); };
    const FILTROS = {
      todo: () => true,
      preguntas: (f) => f.kind === "msg" && !f.is_owner && /\?|¿/.test(f.body),
      dinero: (f) => f.kind === "dinero",
      creador: (f) => f.is_owner,
      mi: (f) => esMio(f) || meMenciona(f),
    };
    const pasa = (f) => FILTROS[E.filtro](f);
    const enVivo = () => E.enVivo;
    const cercaDelFinal = () => feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
    const colchon = () => Math.max(900, feed.clientHeight * 2);

    /* ── una fila ───────────────────────────────────────────────────────── */
    function enlazar(texto, el) {
      // texto plano → nodos: ligas http(s) clicables y @menciones en negritas. Nunca innerHTML.
      const re = /(https?:\/\/[^\s<>"']+)|(@[\p{L}\p{N}_.-]+)/gu; let k = 0, m;
      while ((m = re.exec(texto))) {
        if (m.index > k) el.appendChild(document.createTextNode(texto.slice(k, m.index)));
        if (m[1]) { const a = document.createElement("a"); a.href = m[1]; a.target = "_blank"; a.rel = "noopener nofollow"; a.textContent = m[1].replace(/^https?:\/\//, "").slice(0, 60) + (m[1].length > 68 ? "…" : ""); el.appendChild(a); }
        else { const b = document.createElement("b"); b.className = "chat-mencion"; b.textContent = m[2]; el.appendChild(b); }
        k = m.index + m[0].length;
      }
      if (k < texto.length) el.appendChild(document.createTextNode(texto.slice(k)));
    }
    function pintarFila(f) {
      const row = document.createElement("div");
      row.dataset.seq = f.seq; if (f.id) row.dataset.commentId = f.id;
      row.dataset.b = Math.floor((f.s || 0) / 300);
      row.title = (f.s != null ? "min " + mmss(f.s) + " · " : "") + horaLocal(f.ts);
      if (f.kind === "aviso") { row.className = "chat-sep aviso"; const sp = document.createElement("span"); sp.textContent = "🔒 " + f.body; row.appendChild(sp); return row; }
      row.className = "chat-msg" + (f.is_owner ? " owner" : "") + (f.kind === "dinero" ? " dinero" : "") + (meMenciona(f) ? " me" : "") + (esMio(f) ? " mio" : "");
      const av = document.createElement(f.avatar_url ? "img" : "span"); av.className = "chat-msg-avatar"; if (f.avatar_url) { av.src = f.avatar_url; av.loading = "lazy"; av.alt = ""; } row.appendChild(av);
      const nombre = document.createElement("span"); nombre.className = "chat-msg-name"; nombre.textContent = f.name; nombre.title = "Responderle a " + f.name;
      nombre.onclick = (ev) => { ev.stopPropagation(); if (o.onCitar) o.onCitar(f); };
      if (f.mark) { const mk = document.createElement("span"); mk.className = "chat-msg-mark"; mk.textContent = f.mark; mk.title = f.mark === "✦" ? "Mecenas" : f.mark === "⭐" ? "Mensaje destacado" : "Asiduo"; nombre.appendChild(mk); }
      row.appendChild(nombre);
      const body = document.createElement("span"); body.className = "chat-msg-body";
      if (f.kind === "dinero") {
        const amt = document.createElement("b"); amt.className = "chat-monto"; amt.textContent = (f.mark === "⭐" ? "⭐ destacó " : "💵 mandó ") + pesos(f.amount_cents || 0); body.appendChild(amt);
        if (f.body) { body.appendChild(document.createTextNode(" · ")); enlazar(f.body, body); }
      } else { body.appendChild(document.createTextNode(" ")); enlazar(f.body, body); }
      row.appendChild(body);
      const hora = document.createElement("span"); hora.className = "chat-hora"; hora.textContent = mmss(f.s); row.appendChild(hora);
      const likes = document.createElement("span"); likes.className = "like-count"; likes.style.display = f.likes > 0 ? "inline" : "none"; likes.textContent = f.likes > 0 ? "❤️ " + f.likes : ""; row.appendChild(likes);
      if (esCreador() && f.kind === "msg") {
        const pin = document.createElement("button"); pin.className = "pin-trigger"; pin.textContent = "📌"; pin.title = "Destacar este comentario (p)"; pin.onclick = (ev) => { ev.stopPropagation(); if (o.onFijar) o.onFijar(f); }; row.appendChild(pin);
        if (f.id && f.user_id && !f.is_owner) { const kb = document.createElement("button"); kb.className = "kebab-trigger"; kb.textContent = "⋮"; kb.title = "Moderar"; kb.onclick = (ev) => { if (o.onModerar) o.onModerar(ev, f); }; row.appendChild(kb); }
      }
      return row;
    }
    function separadorMinuto(b) { const d = document.createElement("div"); d.className = "chat-sep minuto"; const sp = document.createElement("span"); sp.textContent = "min " + (b * 5); d.appendChild(sp); d.dataset.b = b; return d; }
    // Bloque de filas con sus marcas de minuto (cada 5 minutos de transmisión).
    function pintarBloque(filas, bucketAntes) {
      const frag = document.createDocumentFragment(); let b = bucketAntes;
      for (const f of filas) { const fb = Math.floor((f.s || 0) / 300); if (b != null && fb !== b && fb > 0 && E.filtro === "todo") frag.appendChild(separadorMinuto(fb)); b = fb; frag.appendChild(pintarFila(f)); }
      return frag;
    }
    const primeraFila = () => feed.querySelector(".chat-msg, .chat-sep.aviso");
    const ultimaFila = () => { const r = feed.querySelectorAll(".chat-msg, .chat-sep.aviso"); return r[r.length - 1] || null; };

    /* ── memoria ────────────────────────────────────────────────────────── */
    function meter(filas) { // mete filas nuevas (de cualquier lado) en memoria, sin repetir, ordenadas
      let nuevas = 0;
      for (const f of filas) { if (!f || !f.seq || E.porSeq.has(f.seq)) continue; E.porSeq.set(f.seq, f); E.filas.push(f); nuevas++; }
      if (nuevas) E.filas.sort((a, b) => a.seq - b.seq);
      return nuevas;
    }
    function rearmarVista() { E.vista = E.filas.filter(pasa); }

    /* ── pintar la ventana ──────────────────────────────────────────────── */
    function pintarVentana(i0, i1, { abajo = true, centrarSeq = null } = {}) {
      i0 = Math.max(0, i0); i1 = Math.min(E.vista.length - 1, i1);
      feed.textContent = ""; E.i0 = i0; E.i1 = i1; E.cursor = null; E.cola = []; if (E.raf) { cancelAnimationFrame(E.raf); E.raf = 0; } clearTimeout(E.timer); E.timer = 0;
      E.enVivo = i1 >= E.vista.length - 1;
      if (i1 < i0) { E.enVivo = true; pintarInicioSiToca(); pintarVivo(); return; }
      feed.appendChild(pintarBloque(E.vista.slice(i0, i1 + 1), null));
      pintarInicioSiToca();
      if (centrarSeq) { const el = feed.querySelector(`[data-seq="${centrarSeq}"]`); if (el) el.scrollIntoView({ block: "center" }); E.pegado = cercaDelFinal(); }
      else if (abajo) { feed.scrollTop = feed.scrollHeight; E.pegado = true; }
      pintarVivo();
    }
    function pintarInicioSiToca() { // hasta arriba de todo, cuando ya no hay más: dónde empezó
      const ya = feed.querySelector(".chat-inicio"); if (E.i0 === 0 && !E.hayMas) { if (!ya) { const d = document.createElement("div"); d.className = "chat-sep chat-inicio"; const sp = document.createElement("span"); sp.textContent = "Inicio del chat · se borra al cerrar la sala"; d.appendChild(sp); feed.prepend(d); } } else if (ya) ya.remove(); }
    // Lo nuevo se pinta en un solo cuadro aunque lleguen cientos por segundo.
    // Con la pestaña escondida el navegador no da cuadros: el temporizador
    // pinta igual, para que al volver ya esté todo.
    function programarPintado() { if (E.raf) return; E.raf = requestAnimationFrame(pintarCola); E.timer = setTimeout(pintarCola, 120); }
    function pintarCola() {
      if (E.raf) cancelAnimationFrame(E.raf); clearTimeout(E.timer); E.raf = 0; E.timer = 0;
      if (!E.cola.length) return;
      const lote = E.cola; E.cola = [];
      if (!enVivo()) { pintarVivo(); return; } // estás en otra parte de la historia: solo cuenta
      const ult = ultimaFila(); const b = ult ? Number(ult.dataset.b) : null;
      if (!E.pegado && E.sinLeer === lote.length) { feed.querySelector(".chat-sep.nuevo")?.remove(); const d = document.createElement("div"); d.className = "chat-sep nuevo"; const sp = document.createElement("span"); sp.textContent = "Nuevos"; d.appendChild(sp); feed.appendChild(d); }
      feed.appendChild(pintarBloque(lote, b));
      E.i1 += lote.length;
      if (E.pegado) { feed.scrollTop = feed.scrollHeight; podar(); }
      pintarVivo();
    }
    function podar() { // con el DOM al tope y pegado abajo, se tiran las filas de arriba (siguen en memoria)
      let n = E.i1 - E.i0 + 1 - TOPE_DOM; if (n <= 0) return;
      let el = primeraFila(); while (n > 0 && el) { const sig = el.nextElementSibling; const prev = el.previousElementSibling; if (prev && prev.classList.contains("chat-sep") && !prev.classList.contains("chat-inicio")) prev.remove(); el.remove(); el = sig; n--; E.i0++; }
      feed.querySelector(".chat-inicio")?.remove();
      while (el && el.classList.contains("chat-sep") && !el.classList.contains("chat-inicio")) { const sig = el.nextElementSibling; el.remove(); el = sig; }
    }

    /* ── subir y bajar sin pausas ───────────────────────────────────────── */
    function pedirAntes() { // la página anterior del servidor se pide antes de que haga falta
      if (!E.hayMas || !E.filas.length) return null;
      const primero = E.filas[0].seq; if (primero <= 1) { E.hayMas = false; return null; }
      if (E.reserva && E.reserva.desde === primero) return E.reserva.p;
      const p = o.api(`/api/rooms/${o.slug}/chat?antes=${primero}&n=${PAGINA}`).then((d) => ({ d, desde: primero })).catch(() => { if (E.reserva && E.reserva.desde === primero) E.reserva = null; return null; });
      E.reserva = { desde: primero, p }; return p;
    }
    function meterArriba(filas) { // mete filas arriba dejando quieto lo que se ve
      if (!filas.length) return;
      const r = feed.getBoundingClientRect(), a = document.elementFromPoint(r.left + Math.min(60, r.width / 2), r.top + 24);
      const ancla = a && feed.contains(a) ? a.closest("#chat-feed > *") : null, y0 = ancla ? ancla.getBoundingClientRect().top : 0, h0 = feed.scrollHeight;
      const prim = primeraFila(); const bDespues = prim ? Number(prim.dataset.b) : null;
      const frag = pintarBloque(filas, null);
      const ultB = Math.floor((filas[filas.length - 1].s || 0) / 300);
      if (bDespues != null && bDespues !== ultB && bDespues > 0 && E.filtro === "todo" && prim && !(prim.previousElementSibling && prim.previousElementSibling.classList.contains("minuto"))) frag.appendChild(separadorMinuto(bDespues));
      feed.querySelector(".chat-inicio")?.remove();
      feed.prepend(frag);
      const corr = ancla && feed.contains(ancla) ? ancla.getBoundingClientRect().top - y0 : feed.scrollHeight - h0;
      if (corr) feed.scrollTop += corr;
      E.i0 -= filas.length; pintarInicioSiToca();
    }
    async function meterAntes() {
      if (E.metiendo) return; E.metiendo = true;
      try {
        if (E.i0 > 0) { const d = Math.max(0, E.i0 - PAGINA); meterArriba(E.vista.slice(d, E.i0)); }
        else if (E.hayMas) {
          const r = await pedirAntes();
          if (r && r.d && E.reserva && r.desde === E.reserva.desde) { E.reserva = null; E.hayMas = !!r.d.hayMas; const antes = E.vista.length; if (meter(r.d.mensajes)) { rearmarVista(); const nuevas = E.vista.length - antes; E.i0 += nuevas; E.i1 += nuevas; meterArriba(E.vista.slice(Math.max(0, E.i0 - PAGINA), E.i0)); } pintarInicioSiToca(); }
        }
      } catch {} finally { E.metiendo = false; }
      if (E.i0 === 0 && E.hayMas) pedirAntes();
      if (feed.scrollTop < colchon() && (E.i0 > 0 || E.hayMas) && feed.scrollTop < 500) setTimeout(() => { if (feed.scrollTop < 500) meterAntes(); }, 60);
    }
    function meterDespues() { // bajando después de un salto: lo que sigue, de memoria
      if (enVivo()) return;
      const hasta = Math.min(E.vista.length - 1, E.i1 + PAGINA);
      const ult = ultimaFila(); feed.appendChild(pintarBloque(E.vista.slice(E.i1 + 1, hasta + 1), ult ? Number(ult.dataset.b) : null)); E.i1 = hasta;
      E.enVivo = E.i1 >= E.vista.length - 1;
      if (E.enVivo) podar();
      pintarVivo();
    }
    let tQuieto = 0;
    feed.addEventListener("scroll", () => {
      E.pegado = enVivo() && cercaDelFinal();
      if (E.pegado && (E.sinLeer || E.menciones)) { E.sinLeer = 0; E.menciones = 0; E.delCreador = 0; }
      pintarVivo();
      if (feed.scrollTop < colchon() && (E.i0 > 0 || E.hayMas)) { clearTimeout(tQuieto); if (feed.scrollTop < 500) meterAntes(); else tQuieto = setTimeout(meterAntes, 120); }
      if (!enVivo() && feed.scrollHeight - feed.scrollTop - feed.clientHeight < colchon()) meterDespues();
    }, { passive: true });
    feed.addEventListener("load", () => { if (E.pegado) feed.scrollTop = feed.scrollHeight; }, true); // una foto que termina de cargar no te despega

    function pintarVivo() {
      if (!vivoBtn) return;
      const lejos = !enVivo() || feed.scrollHeight - feed.scrollTop - feed.clientHeight > Math.max(160, feed.clientHeight * 0.6);
      const n = E.sinLeer;
      vivoBtn.hidden = !lejos && !n;
      vivoBtn.classList.toggle("con-nuevos", n > 0); vivoBtn.classList.toggle("mencion", E.menciones > 0); vivoBtn.classList.toggle("creador", E.delCreador > 0 && !E.menciones);
      vivoN.textContent = n ? (n > 999 ? "999+" : n) + (E.menciones ? " · te mencionaron" : E.delCreador ? " · habló " + (o.nombreCreador ? o.nombreCreador() : "quien transmite") : n === 1 ? " nuevo" : " nuevos") : "En vivo";
      vivoBtn.title = n ? `${n} ${n === 1 ? "mensaje nuevo" : "mensajes nuevos"} · End` : "Ir a lo más nuevo · End";
      panel.classList.toggle("chat-pausado", lejos);
    }
    function irEnVivo() {
      pintarCola();
      if (!enVivo()) pintarVentana(E.vista.length - 1 - Math.min(E.vista.length - 1, 120), E.vista.length - 1);
      else { const lejos = feed.scrollHeight - feed.scrollTop - feed.clientHeight > feed.clientHeight * 4; feed.scrollTo({ top: feed.scrollHeight, behavior: lejos ? "auto" : "smooth" }); }
      E.sinLeer = 0; E.menciones = 0; E.delCreador = 0; E.pegado = true; podar(); pintarVivo();
    }
    if (vivoBtn) vivoBtn.onclick = irEnVivo;

    /* ── entradas desde el socket ───────────────────────────────────────── */
    function recibir(f) {
      if (!f || !f.seq) return;
      if (E.porSeq.has(f.seq)) return;
      if (E.ultimoSeq && f.seq > E.ultimoSeq + 1) rellenarHueco(E.ultimoSeq); // se perdió algo en medio (red): se pide
      E.ultimoSeq = Math.max(E.ultimoSeq, f.seq);
      meter([f]);
      if (!pasa(f)) { pintarChips(); return; }
      const estabaEnVivo = E.enVivo;
      E.vista.push(f);
      if (!E.pegado || !estabaEnVivo) { E.sinLeer++; if (meMenciona(f)) E.menciones++; if (f.is_owner) E.delCreador++; }
      E.cola.push(f); programarPintado();
      pintarChips();
    }
    let rellenando = false;
    async function rellenarHueco(desde) {
      if (rellenando) return; rellenando = true;
      try { const d = await o.api(`/api/rooms/${o.slug}/chat?desde=${desde}`); if (d && d.mensajes && meter(d.mensajes)) { E.ultimoSeq = Math.max(E.ultimoSeq, d.seq || 0); rearmarVista(); if (enVivo()) pintarVentana(Math.max(0, E.vista.length - TOPE_DOM), E.vista.length - 1, { abajo: E.pegado }); } }
      catch {} finally { rellenando = false; }
    }
    function inicio(msg) { // al conectar (o reconectar): lo último, y lo que faltara en medio
      if (msg.inicio) E.inicioMs = msg.inicio;
      if (msg.ahora) E.desfase = Date.now() - msg.ahora;
      const primeraVez = !E.filas.length;
      const antesUltimo = E.ultimoSeq;
      meter(msg.mensajes || []);
      E.ultimoSeq = Math.max(E.ultimoSeq, msg.seq || 0);
      if (primeraVez) { E.hayMas = !!msg.hayMas; rearmarVista(); pintarVentana(0, E.vista.length - 1); if (E.hayMas) pedirAntes(); }
      else {
        rearmarVista();
        const primero = (msg.mensajes && msg.mensajes[0] && msg.mensajes[0].seq) || 0;
        if (antesUltimo && primero > antesUltimo + 1) rellenarHueco(antesUltimo);
        else if (enVivo()) { const n = E.vista.length - 1 - E.i1; if (n > 0) { E.sinLeer += E.pegado ? 0 : n; pintarVentana(Math.max(0, E.vista.length - TOPE_DOM), E.vista.length - 1, { abajo: E.pegado }); } }
      }
      pintarChips();
    }
    function likes(id, n, seq) {
      const f = seq ? E.porSeq.get(seq) : [...E.porSeq.values()].find((x) => x.id === id); if (f) f.likes = n;
      const row = feed.querySelector(`[data-comment-id="${CSS.escape(id)}"]`), el = row && row.querySelector(".like-count"); if (!el) return;
      el.textContent = n > 0 ? "❤️ " + n : ""; el.style.display = n > 0 ? "inline" : "none";
    }

    /* ── filtros (chips) ────────────────────────────────────────────────── */
    function pintarChips() {
      if (!chips) return;
      const preg = E.filas.reduce((n, f) => n + (FILTROS.preguntas(f) ? 1 : 0), 0), din = E.filas.reduce((n, f) => n + (f.kind === "dinero" ? f.amount_cents || 0 : 0), 0), mi = E.filas.reduce((n, f) => n + (meMenciona(f) ? 1 : 0), 0);
      const p = chips.querySelector('[data-f="preguntas"] i'), d = chips.querySelector('[data-f="dinero"] i'), m = chips.querySelector('[data-f="mi"] i');
      if (p) p.textContent = preg ? preg : ""; if (d) d.textContent = din ? pesos(din) : ""; if (m) m.textContent = mi ? mi : "";
    }
    const ORDEN = ["todo", "preguntas", "dinero", "creador", "mi"];
    function filtrar(nombre) {
      if (!FILTROS[nombre]) return; E.filtro = nombre;
      chips && chips.querySelectorAll("[data-f]").forEach((b) => b.classList.toggle("on", b.dataset.f === nombre));
      rearmarVista(); E.sinLeer = 0; E.menciones = 0; E.delCreador = 0;
      pintarVentana(Math.max(0, E.vista.length - 200), E.vista.length - 1);
      if (feed.querySelector(".chat-msg") == null && nombre !== "todo") { const d = document.createElement("div"); d.className = "chat-sep vacio"; const sp = document.createElement("span"); sp.textContent = { preguntas: "Todavía no hay preguntas", dinero: "Todavía nadie ha mandado dinero", creador: "Quien transmite todavía no escribe", mi: "Nadie te ha mencionado todavía" }[nombre]; d.appendChild(sp); feed.appendChild(d); }
      if (o.toast && nombre !== "todo") o.toast({ preguntas: "Solo preguntas", dinero: "Solo dinero", creador: "Solo quien transmite", mi: "Lo tuyo y donde te mencionan" }[nombre] + " · f cambia, Esc quita", 1800);
    }
    if (chips) chips.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => filtrar(b.dataset.f)));

    /* ── buscar: una barra, un contador y dos flechas ───────────────────── */
    function marcarPalabras(el, palabras) {
      const w = document.createTreeWalker(el.querySelector(".chat-msg-body") || el, NodeFilter.SHOW_TEXT), nodos = [];
      while (w.nextNode()) if (!w.currentNode.parentElement.closest("mark, button")) nodos.push(w.currentNode);
      for (const n of nodos) {
        const t = n.nodeValue, cortes = []; let plano = "";
        for (let i = 0; i < t.length; i++) plano += sinAcentos(t[i])[0] || t[i];
        for (const p of palabras) { let i = -1; while ((i = plano.indexOf(p, i + 1)) >= 0) cortes.push([i, i + p.length]); }
        if (!cortes.length) continue; cortes.sort((a, b) => a[0] - b[0]);
        const frag = document.createDocumentFragment(); let k = 0;
        for (const [a, b] of cortes) { if (a < k) continue; if (a > k) frag.appendChild(document.createTextNode(t.slice(k, a))); const m = document.createElement("mark"); m.className = "chat-marca"; m.textContent = t.slice(a, b); frag.appendChild(m); k = b; }
        if (k < t.length) frag.appendChild(document.createTextNode(t.slice(k)));
        n.parentNode.replaceChild(frag, n);
      }
    }
    function quitarMarcas() { feed.querySelectorAll("mark.chat-marca").forEach((m) => { const p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); }); feed.querySelectorAll(".chat-msg.encontrado").forEach((x) => x.classList.remove("encontrado")); }
    async function irA(seq, { resaltar = true } = {}) {
      let f = E.porSeq.get(seq);
      if (!f && E.filas.length && seq < E.filas[0].seq) { // más atrás de lo que hay en memoria: se trae de un tirón lo de en medio
        try { const d = await o.api(`/api/rooms/${o.slug}/chat?antes=${E.filas[0].seq}&desde=${Math.max(1, seq - 30)}`); if (d && d.mensajes) { meter(d.mensajes); E.hayMas = !!d.hayMas || (E.filas[0].seq > 1); } } catch {}
        f = E.porSeq.get(seq);
      }
      if (!f) return null;
      if (!pasa(f)) filtrar("todo"); else rearmarVista();
      const i = E.vista.indexOf(f); if (i < 0) return null;
      let el = feed.querySelector(`[data-seq="${seq}"]`);
      if (!el || i < E.i0 || i > E.i1) { pintarVentana(i - 120, i + 120, { abajo: false, centrarSeq: seq }); el = feed.querySelector(`[data-seq="${seq}"]`); }
      else el.scrollIntoView({ block: "center" });
      E.pegado = cercaDelFinal(); pintarVivo();
      if (el && resaltar) { el.classList.add("resaltado"); setTimeout(() => el.classList.remove("resaltado"), 1800); }
      return el;
    }
    function cerrarBusqueda() { if (!busca || busca.hidden) return; busca.hidden = true; busca.textContent = ""; quitarMarcas(); E.busqueda = null; $("chat-lupa")?.classList.remove("on"); feed.focus({ preventScroll: true }); }
    function abrirBusqueda() {
      if (!busca) return; if (!busca.hidden) { $("chat-q")?.focus(); return; }
      busca.hidden = false; $("chat-lupa")?.classList.add("on");
      busca.innerHTML = `<div class="chat-busca-fila"><span class="lupa">🔍</span><input type="search" id="chat-q" placeholder="Buscar en todo el chat…" autocomplete="off" enterkeyhint="search" aria-label="Buscar en el chat"><span class="cuenta" id="chat-q-n" aria-live="polite"></span><button type="button" id="chat-q-arr" title="Anterior (más viejo) · Enter" aria-label="Resultado anterior" disabled>▲</button><button type="button" id="chat-q-aba" title="Siguiente (más nuevo) · Shift+Enter" aria-label="Resultado siguiente" disabled>▼</button><button type="button" id="chat-q-x" title="Cerrar · Esc" aria-label="Cerrar la búsqueda">×</button></div><div class="chat-busca-de" id="chat-q-de"><button type="button" data-de="" class="on">Todo</button><button type="button" data-de="creador">Quien transmite</button><button type="button" data-de="dinero">💵 Dinero</button><button type="button" data-de="yo">Lo que dije yo</button></div>`;
      const q = $("chat-q"), cuenta = $("chat-q-n"), arr = $("chat-q-arr"), aba = $("chat-q-aba");
      const B = (E.busqueda = { lista: [], i: 0, total: 0, palabras: [], de: "", pedido: 0, cargando: false });
      const pinta = () => { const t = q.value.trim(); cuenta.textContent = t.length < 2 ? "" : B.cargando ? "…" : B.total ? `${B.i + 1} de ${B.total}` : "Nada"; arr.disabled = !B.lista.length || B.i >= B.lista.length - 1; aba.disabled = !B.lista.length || B.i <= 0; };
      const ir = async () => { quitarMarcas(); const f = B.lista[B.i]; pinta(); if (!f) return; const el = await irA(f.seq, { resaltar: false }); if (el && E.busqueda === B) { el.classList.add("encontrado"); marcarPalabras(el, B.palabras); } };
      const local = (palabras, de) => { const y = yo(); const r = []; for (let i = E.filas.length - 1; i >= 0; i--) { const f = E.filas[i]; if (f.kind === "aviso") continue; if (de === "creador" && !f.is_owner) continue; if (de === "dinero" && f.kind !== "dinero") continue; if (de === "yo" && !(y && f.user_id === y.id)) continue; const ll = sinAcentos(f.name + " " + f.body); if (palabras.every((w) => ll.includes(w))) r.push(f); } return r; };
      const buscar = async () => {
        const t = q.value.trim(); quitarMarcas();
        if (t.length < 2) { B.lista = []; B.total = 0; B.cargando = false; pinta(); return; }
        const palabras = sinAcentos(t).split(/\s+/).filter(Boolean).slice(0, 8);
        const mio = ++B.pedido;
        // Primero lo que hay en memoria (instantáneo); luego el servidor completa lo más viejo.
        B.palabras = palabras; B.lista = local(palabras, B.de); B.total = B.lista.length; B.i = 0; B.cargando = E.hayMas; pinta(); if (B.lista.length) ir();
        if (!E.hayMas) return;
        try {
          const r = await o.api(`/api/rooms/${o.slug}/chat/buscar?q=${encodeURIComponent(t)}${B.de ? "&de=" + B.de : ""}`);
          if (E.busqueda !== B || mio !== B.pedido) return;
          const vistos = new Set(B.lista.map((f) => f.seq)); for (const f of r.lista || []) if (!vistos.has(f.seq)) { B.lista.push(f); vistos.add(f.seq); }
          B.lista.sort((a, b) => b.seq - a.seq); B.total = Math.max(r.total || 0, B.lista.length); B.cargando = false; pinta(); if (B.lista.length && !feed.querySelector(".encontrado")) ir();
        } catch { B.cargando = false; pinta(); }
      };
      let t = 0; q.oninput = () => { clearTimeout(t); B.cargando = q.value.trim().length >= 2; t = setTimeout(buscar, 220); pinta(); };
      q.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) aba.click(); else arr.click(); } else if (e.key === "Escape") { e.preventDefault(); cerrarBusqueda(); } e.stopPropagation(); };
      arr.onclick = () => { if (B.i < B.lista.length - 1) { B.i++; ir(); } };
      aba.onclick = () => { if (B.i > 0) { B.i--; ir(); } };
      $("chat-q-x").onclick = cerrarBusqueda;
      busca.querySelectorAll("#chat-q-de button").forEach((x) => (x.onclick = () => { B.de = x.dataset.de; busca.querySelectorAll("#chat-q-de button").forEach((y) => y.classList.toggle("on", y === x)); buscar(); q.focus(); }));
      q.focus();
    }
    if ($("chat-lupa")) $("chat-lupa").onclick = () => (busca.hidden ? abrirBusqueda() : cerrarBusqueda());
    if ($("chat-alto")) $("chat-alto").onclick = () => expandir();
    function expandir(valor) { E.alto = valor == null ? !E.alto : !!valor; panel.classList.toggle("alto", E.alto); $("chat-alto")?.classList.toggle("on", E.alto); if (E.pegado) feed.scrollTop = feed.scrollHeight; }

    /* ── toques ─────────────────────────────────────────────────────────── */
    feed.addEventListener("dblclick", (e) => { // doble toque: el creador da like; el público manda un corazón
      const row = e.target.closest(".chat-msg"); if (e.target.closest("a, button")) return;
      if (esCreador() && row && row.dataset.commentId && o.onLike) o.onLike(E.porSeq.get(Number(row.dataset.seq)));
      else if (!esCreador() && o.onCorazon) o.onCorazon();
    });

    /* ── teclado (solo computadora) ─────────────────────────────────────── */
    function filaCursor() { return E.cursor && feed.contains(E.cursor) ? E.cursor : null; }
    function moverCursor(dir) {
      const filas = [...feed.querySelectorAll(".chat-msg")]; if (!filas.length) return;
      let i = E.cursor ? filas.indexOf(E.cursor) : -1;
      if (i < 0) i = dir < 0 ? filas.length - 1 : 0; else i = Math.max(0, Math.min(filas.length - 1, i + dir * PASO_CURSOR));
      E.cursor && E.cursor.classList.remove("cursor"); E.cursor = filas[i]; E.cursor.classList.add("cursor"); E.cursor.scrollIntoView({ block: "nearest" });
      if (i === 0 && (E.i0 > 0 || E.hayMas)) meterAntes();
    }
    if (ESCRITORIO && o.registrarTecla) {
      const R = o.registrarTecla;
      R("c", "Escribir en el chat", () => { const t = $("chat-input"); if (t) { t.focus(); } }, { grupo: "Chat" });
      R("/", "Buscar en todo el chat", abrirBusqueda, { grupo: "Chat" });
      R("End", "Ir a lo más nuevo (en vivo)", irEnVivo, { grupo: "Chat", etiqueta: "End" });
      R("k", "Mensaje anterior (cursor)", () => moverCursor(-1), { grupo: "Chat", etiqueta: "k / ↑" });
      R("j", "Mensaje siguiente (cursor)", () => moverCursor(1), { grupo: "Chat", etiqueta: "j / ↓" });
      R("ArrowUp", null, () => moverCursor(-1), { oculta: true });
      R("ArrowDown", null, () => moverCursor(1), { oculta: true });
      R("r", "Responderle a quien escribió el mensaje del cursor", () => { const f = filaCursor(); if (f && o.onCitar) o.onCitar(E.porSeq.get(Number(f.dataset.seq))); }, { grupo: "Chat" });
      R("f", "Cambiar el filtro (todo → preguntas → dinero → quien transmite → mí)", () => filtrar(ORDEN[(ORDEN.indexOf(E.filtro) + 1) % ORDEN.length]), { grupo: "Chat" });
      R("x", "Chat grande / chico", () => expandir(), { grupo: "Chat" });
      R("p", "Destacar el mensaje del cursor", () => { const f = filaCursor(); if (f && o.onFijar) o.onFijar(E.porSeq.get(Number(f.dataset.seq))); }, { grupo: "Quien transmite", creador: true });
      R("l", "Like al mensaje del cursor", () => { const f = filaCursor(); if (f && f.dataset.commentId && o.onLike) o.onLike(E.porSeq.get(Number(f.dataset.seq))); }, { grupo: "Quien transmite", creador: true });
      R("Escape", "Cerrar la búsqueda, quitar el filtro o soltar el cursor", () => { if (busca && !busca.hidden) cerrarBusqueda(); else if (E.filtro !== "todo") filtrar("todo"); else if (E.cursor) { E.cursor.classList.remove("cursor"); E.cursor = null; } else if (E.alto) expandir(false); }, { grupo: "Chat", etiqueta: "Esc" });
      document.addEventListener("copy", (e) => { const f = filaCursor(); if (!f || String(getSelection && getSelection()).trim()) return; const x = E.porSeq.get(Number(f.dataset.seq)); if (!x) return; e.clipboardData.setData("text/plain", `${x.name}: ${x.body}`); e.preventDefault(); if (o.toast) o.toast("Copiado: " + x.name, 1500); });
    }

    return { inicio, recibir, likes, irEnVivo, filtrar, abrirBusqueda, cerrarBusqueda, irA, expandir, estado: () => ({ filas: E.filas.length, vista: E.vista.length, i0: E.i0, i1: E.i1, dom: feed.querySelectorAll(".chat-msg").length, pegado: E.pegado, sinLeer: E.sinLeer, hayMas: E.hayMas, filtro: E.filtro, ultimoSeq: E.ultimoSeq }) };
  }

  window.ChatVivo = { crear, ESCRITORIO };
})();

// RLR · Go-to-market: la interacción de /gtm. Este archivo no lleva la
// estrategia ni las tareas: el servidor las entrega en window.__GTM solo a
// quien tiene acceso. Aquí viven las pestañas, el checklist (cada palomita se
// guarda en el servidor y la ve todo el equipo), los filtros, la carga por
// persona y por área, y la calculadora hacia el millón. Y los puntos de control:
// los números (usuarios e ingreso al mes) a los que hay que llegar, mezclados
// entre las tareas; no se palomean, se cumplen solos con los datos reales.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const G = window.__GTM; if (!G) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pesos = (n) => "$" + Math.round(n).toLocaleString("es-MX");
  const num = (n) => Math.round(n).toLocaleString("es-MX");
  const AREAS = { VEN: "Ventas", CON: "Contenido", MKT: "Marketing", ALI: "Alianzas", PRO: "Producto", DAT: "Datos", ADM: "Administración" };
  const QUIEN = { P: "Persona", IA: "IA", A: "Ambas" };
  const FASES = { 1: "Cimientos", 2: "Los primeros 10", 3: "Los primeros 100", 4: "Los primeros 1,000", 5: "El millón" };
  const ESFUERZO = { 1: "media hora", 2: "unas horas", 3: "un día", 4: "varios días" }, HORAS = { 1: 0.5, 2: 2, 3: 8, 4: 24 };
  const RITMO = { u: "", d: "diario", s: "semanal", m: "mensual" };
  // El plan tal como viene escrito. Nunca cambia: lo que quien dirige le hace a una tarea
  // (editarla, archivarla, moverla) llega aparte en «ediciones» y se pone encima.
  const PLAN = G.tareas.map((t) => ({ id: t[0], fase: t[1], area: t[2], quien: t[3], esf: t[4], ritmo: t[5], titulo: t[6], detalle: t[7] }));
  const LUGAR = Object.fromEntries(PLAN.map((t, i) => [t.id, i]));
  const BLQ = G.bloquesOrden || [], BLQ_DE = G.bloqueDe || {}, BLQ_N = Object.fromEntries(BLQ.map((b, i) => [b.llave, i]));
  let ediciones = G.ediciones || {};
  // TT = todas las tareas como se ven hoy, en su orden. T = las que cuentan (sin las archivadas).
  let TT = [], T = [];
  function armar() {
    TT = PLAN.map((o) => {
      const e = ediciones[o.id] || {}, llave = e.bloque != null && BLQ_N[e.bloque] != null ? e.bloque : BLQ_DE[o.id], b = BLQ[BLQ_N[llave]] || { fase: o.fase };
      return { id: o.id, fase: b.fase, area: e.area || o.area, quien: e.quien || o.quien, esf: e.esfuerzo || o.esf, ritmo: e.ritmo || o.ritmo, titulo: e.titulo || o.titulo, detalle: e.detalle || o.detalle,
        bloque: llave, pos: e.bloque != null ? e.pos || 0 : 1e6 + LUGAR[o.id], plan: o, ed: e, editada: !!e.editada_at, archivada: !!e.archivada, movida: llave !== BLQ_DE[o.id] };
    }).sort((a, b) => BLQ_N[a.bloque] - BLQ_N[b.bloque] || a.pos - b.pos);
    T = TT.filter((t) => !t.archivada);
  }
  armar();
  let hechas = G.hechas || {}, real = G.real || {}, equipo = G.equipo || [], postulaciones = G.postulaciones || [];
  let bitacora = G.bitacora || [];
  const PUEDE = !!G.yo.palomea, YO = String(G.yo.email || "").toLowerCase();
  const fechaHora = (s) => { try { const d = new Date(s * 1000); return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }); } catch { return ""; } };
  const hace = (s) => { const m = Math.max(0, Math.floor((Date.now() / 1000 - s) / 60)); return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : m < 2880 ? "ayer" : fecha(s); };
  const corto = (correo) => String(correo || "").split("@")[0];
  const P = G.puntos || [];
  // Cada meta: cómo se llama, si es dinero y a cuál de las dos preguntas responde (usuarios o ingreso).
  const METAS = { creadores: ["creadores que cobran", "", "u"], pagan: ["personas que pagan", "", "u"], puerta: ["de puerta", "$", "i"], casa: ["para la casa", "$", "i"], casa3: ["para la casa, en cada uno de los últimos tres meses", "$", "i"] };
  const realDe = (k) => (k === "creadores" ? real.creadores_mes || 0 : k === "pagan" ? real.pagan_mes || 0 : k === "puerta" ? (real.puerta_mes_cents || 0) / 100 : k === "casa" ? (real.casa_mes_cents || 0) / 100 : (real.casa_3m_min_cents || 0) / 100);
  const cifra = (k, v) => (METAS[k][1] === "$" ? pesos(v) : num(v));
  const avancePunto = (p) => Math.min(...Object.keys(p.metas).map((k) => Math.min(1, realDe(k) / p.metas[k])));
  const siguientePunto = () => P.find((p) => !hechas[p.id]);
  const F = Object.assign({ fase: 0, area: "", quien: "", ritmo: "", estado: "todas", q: "" }, (() => { try { return JSON.parse(localStorage.getItem("vr_gtm_filtros") || "{}"); } catch { return {}; } })());
  const recordar = () => { try { localStorage.setItem("vr_gtm_filtros", JSON.stringify(F)); } catch {} };
  function toast(msg) { const t = $("gtm-toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2400); }
  const fecha = (s) => { try { return new Date(s * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "short" }); } catch { return ""; } };
  const llano = (t) => String(t).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

  /* ── pestañas ───────────────────────────────────────────────────────── */
  function verTab(nombre, mover) {
    if (!$("tab-" + nombre)) nombre = "resumen";
    document.querySelectorAll(".gtm-tab").forEach((el) => (el.hidden = el.id !== "tab-" + nombre));
    $("gtm-tabs").querySelectorAll("button").forEach((b) => { const on = b.dataset.tab === nombre; b.classList.toggle("on", on); if (on && b.scrollIntoView) b.scrollIntoView({ inline: "center", block: "nearest" }); });
    if (mover) { history.replaceState(null, "", nombre === "resumen" ? location.pathname : "#" + nombre); window.scrollTo({ top: 0 }); }
    if (nombre === "candidatos" && typeof montarCandidatos === "function") montarCandidatos();
    // Proyecciones se pinta al abrirse: escondida no tiene ancho para medir sus columnas.
    if (nombre === "proyecciones" && window.Proyecciones) window.Proyecciones.ver();
  }
  $("gtm-tabs").querySelectorAll("button").forEach((b) => (b.onclick = () => verTab(b.dataset.tab, true)));

  /* ── dónde vamos hoy (datos reales) ─────────────────────────────────── */
  function pintarHoy() {
    const nH = T.filter((t) => hechas[t.id]).length, puerta = (real.puerta_mes_cents || 0) / 100, casa = (real.casa_mes_cents || 0) / 100;
    const ficha = (valor, etiqueta, pct, nota) => `<div class="gtm-ficha"><b>${valor}</b><span>${etiqueta}</span>${pct == null ? "" : `<div class="gtm-avance"><div style="width:${Math.min(100, Math.max(pct > 0 ? 1.5 : 0, pct)).toFixed(1)}%"></div></div>`}${nota ? `<small>${nota}</small>` : ""}</div>`;
    $("gtm-hoy").innerHTML =
      ficha(num(real.creadores_semana || 0), "creadores cobraron esta semana", ((real.creadores_semana || 0) / 1300) * 100, "meta: 1,300") +
      ficha(pesos(puerta), "de puerta este mes", (puerta / 5000000) * 100, "meta: $5,000,000") +
      ficha(pesos(casa), "para la casa este mes", (casa / 1000000) * 100, "meta: $1,000,000") +
      ficha(num(real.salas || 0), "salas creadas", null, `${num(real.sesiones_semana || 0)} sesiones esta semana`) +
      ficha(`${nH} de ${T.length}`, "tareas hechas", (nH / T.length) * 100, "");
    $("gtm-cuenta-tab").textContent = `${nH}/${T.length}`;
    document.querySelectorAll(".gtm-fases article").forEach((a) => {
      const f = +a.dataset.fase, tot = T.filter((t) => t.fase === f), h = tot.filter((t) => hechas[t.id]).length;
      a.querySelector(".gtm-avance div").style.width = (tot.length ? (h / tot.length) * 100 : 0) + "%";
      a.querySelector("small").textContent = `${h} de ${tot.length} tareas`;
      a.onclick = () => { F.fase = f; F.area = ""; F.quien = ""; F.ritmo = ""; F.estado = "todas"; F.q = ""; recordar(); pintarChecklist(); verTab("checklist", true); };
      // La meta económica del paso: su último punto de control con puerta.
      const ult = P.filter((p) => p.fase === f && p.metas.puerta).pop();
      if (ult) { let e = a.querySelector(".gtm-meta-eco"); if (!e) { e = document.createElement("p"); e.className = "gtm-meta-eco"; a.insertBefore(e, a.querySelector(".gtm-avance")); } e.innerHTML = `<i>◆ Al cerrar:</i> ${ult.metas.creadores === 1 ? "1 creador" : num(ult.metas.creadores) + " creadores"} · ${pesos(ult.metas.puerta)} de puerta · ${pesos(ult.metas.casa)} para la casa${hechas[ult.id] ? " ✓" : ""}`; }
    });
    pintarSiguiente();
  }

  /* ── puntos de control: usuarios e ingreso al mes ───────────────────── */
  function pintarSiguiente() {
    const c = $("gtm-siguiente"); if (!c || !P.length) return;
    const p = siguientePunto(), listos = P.filter((x) => hechas[x.id]).length;
    if (!p) { c.innerHTML = `<div class="gtm-sig alcanzado"><span>◆ Puntos de control</span><b>Los ${P.length} están alcanzados.</b></div>`; return; }
    c.innerHTML = `<button type="button" class="gtm-sig" data-ir-punto="${p.id}"><span>◆ Siguiente punto de control · ${listos} de ${P.length} alcanzados · ${esc(p.cuando)}</span><b>${esc(p.titulo)}</b><em>${Object.keys(p.metas).map((k) => `<u class="${realDe(k) >= p.metas[k] ? "ok" : ""}">${cifra(k, realDe(k))} de ${cifra(k, p.metas[k])}</u> ${METAS[k][0]}`).join(" · ")}</em><div class="gtm-avance"><div style="width:${Math.max(1.5, avancePunto(p) * 100).toFixed(1)}%"></div></div></button>`;
    c.querySelector("[data-ir-punto]").onclick = () => irAPunto(p.id);
  }
  function puntoHtml(p) {
    const h = hechas[p.id], n = P.indexOf(p) + 1;
    const meta = (k) => { const v = realDe(k), m = p.metas[k]; return `<div class="gtm-meta-num${v >= m ? " ok" : ""}"><b>${cifra(k, m)}</b><span>${METAS[k][0]}</span><div class="gtm-avance"><div style="width:${Math.min(100, Math.max(v > 0 ? 2 : 0, (v / m) * 100)).toFixed(1)}%"></div></div><small>este mes: ${cifra(k, v)}</small></div>`; };
    const grupo = (tipo, titulo) => { const ks = Object.keys(p.metas).filter((k) => METAS[k][2] === tipo); return ks.length ? `<div class="gtm-punto-grupo"><h5>${titulo}</h5><div>${ks.map(meta).join("")}</div></div>` : ""; };
    const emp = p.empujan.map((id) => { const t = TT.find((x) => x.id === id); return t ? `<button type="button" data-ir-tarea="${id}" class="${hechas[id] ? "hecha" : ""}">${hechas[id] ? "✓ " : ""}${id} · ${esc(t.titulo)}</button>` : ""; }).join("");
    return `<article class="gtm-punto${h ? " alcanzado" : ""}" data-punto="${p.id}">
      <div class="gtm-punto-cab"><span>◆ Punto de control ${n} de ${P.length}</span><em>${esc(p.cuando)}</em>${h ? `<i class="ok">Alcanzado · ${fecha(h.at)}</i>` : `<i>Vamos al ${Math.floor(avancePunto(p) * 100)} %</i>`}</div>
      <b>${esc(p.titulo)}</b><p>${esc(p.detalle)}</p>
      <div class="gtm-punto-metas">${grupo("u", "Usuarios al mes")}${grupo("i", "Ingreso al mes")}</div>
      <div class="gtm-punto-pie"><h5>Lo que más lo mueve</h5><div class="gtm-punto-emp">${emp}</div><p><u>Si no se llega:</u> ${esc(p.si_no)}</p></div>
    </article>`;
  }
  const pasaPunto = (p) => (!F.fase || p.fase === F.fase) && (F.estado === "todas" || F.estado === "puntos" || (F.estado === "hechas") === !!hechas[p.id]) && (!F.q || llano(p.titulo + " " + p.detalle + " punto de control " + p.cuando).includes(llano(F.q)));
  function enlazarPuntos(raiz) {
    (raiz || document).querySelectorAll("[data-ir-tarea]").forEach((b) => (b.onclick = () => irATarea(b.dataset.irTarea)));
  }
  function repintarPuntos() {
    document.querySelectorAll("#gtm-lista .gtm-punto").forEach((el) => { const p = P.find((x) => x.id === el.dataset.punto); if (p) el.outerHTML = puntoHtml(p); });
    enlazarPuntos($("gtm-lista")); pintarEscalera();
  }
  function destello(el) { if (!el) return; el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("destello"); setTimeout(() => el.classList.remove("destello"), 1800); }
  function irAPunto(id) {
    const p = P.find((x) => x.id === id); if (!p) return;
    F.fase = 0; F.q = ""; if (F.estado !== "todas" && F.estado !== "puntos") F.estado = "todas"; recordar(); pintarChecklist(); verTab("checklist", true);
    setTimeout(() => destello(document.querySelector(`.gtm-punto[data-punto="${id}"]`)), 60);
  }
  function irATarea(id) {
    F.fase = 0; F.area = ""; F.quien = ""; F.ritmo = ""; F.estado = "todas"; F.q = ""; recordar(); pintarChecklist();
    setTimeout(() => destello(document.querySelector(`.gtm-tarea[data-id="${id}"]`)), 60);
  }
  function pintarEscalera() {
    const c = $("gtm-escalera"); if (!c || !P.length) return;
    const celda = (p, k) => (p.metas[k] == null ? "<td>—</td>" : `<td class="${realDe(k) >= p.metas[k] ? "ok" : ""}">${cifra(k, p.metas[k])}</td>`);
    c.innerHTML = `<div class="gtm-tabla-caja"><table class="gtm-tabla gtm-escalera"><thead><tr><th>#</th><th>Cuándo</th><th>Punto de control</th><th>Creadores que cobran</th><th>Personas que pagan</th><th>Puerta del mes</th><th>Para la casa</th><th>Cómo vamos</th></tr></thead><tbody>
      <tr class="hoy"><td>◆</td><td>Hoy</td><td><b>Este mes, con datos reales</b></td><td>${num(realDe("creadores"))}</td><td>${num(realDe("pagan"))}</td><td>${pesos(realDe("puerta"))}</td><td>${pesos(realDe("casa"))}</td><td></td></tr>
      ${P.map((p, i) => `<tr data-ir-punto="${p.id}" class="${hechas[p.id] ? "alcanzado" : ""}"><td>${i + 1}</td><td>${esc(p.cuando)}</td><td><b>${esc(p.titulo)}</b><small>Paso ${p.fase} · ${FASES[p.fase]}</small></td>${celda(p, "creadores")}${celda(p, "pagan")}${celda(p, "puerta")}${p.metas.casa3 ? `<td>${pesos(p.metas.casa3)} × 3 meses</td>` : celda(p, "casa")}<td>${hechas[p.id] ? `<i class="ok">Alcanzado · ${fecha(hechas[p.id].at)}</i>` : `<i>${Math.floor(avancePunto(p) * 100)} %</i>`}</td></tr>`).join("")}
    </tbody></table></div>`;
    c.querySelectorAll("[data-ir-punto]").forEach((tr) => (tr.onclick = () => irAPunto(tr.dataset.irPunto)));
  }

  /* ── checklist ──────────────────────────────────────────────────────── */
  const RITMO_NOMBRE = { u: "una vez", d: "diario", s: "semanal", m: "mensual" };
  const cambiada = (t) => t.editada || t.movida;
  const pasa = (t, sin) => (sin === "fase" || !F.fase || t.fase === F.fase) && (sin === "area" || !F.area || t.area === F.area) && (sin === "quien" || !F.quien || t.quien === F.quien)
    && (!F.ritmo || (F.ritmo === "u") === (t.ritmo === "u"))
    && (F.estado === "todas" || (F.estado === "archivadas" ? t.archivada : F.estado === "editadas" ? cambiada(t) : F.estado === "puntos" ? false : !t.archivada && (F.estado === "hechas") === !!hechas[t.id]))
    && (!F.q || llano(t.titulo + " " + t.detalle + " " + t.id + " " + AREAS[t.area] + " " + QUIEN[t.quien]).includes(llano(F.q)));
  function pintarCarga() {
    // La carga: cuánto falta por quién y por área, en tareas y en horas aproximadas.
    const grupo = (titulo, mapa, campo) => {
      const base = T.filter((t) => pasa(t, campo));
      const filas = Object.keys(mapa).map((k) => { const tot = base.filter((t) => t[campo] === k), pend = tot.filter((t) => !hechas[t.id]), horas = pend.reduce((n, t) => n + HORAS[t.esf], 0); return { k, n: mapa[k], tot: tot.length, hechas: tot.length - pend.length, horas }; }).filter((f) => f.tot);
      const max = Math.max(1, ...filas.map((f) => f.horas));
      return `<div class="gtm-carga-grupo"><h4>${titulo}</h4>${filas.map((f) => `<button type="button" class="gtm-carga-fila${F[campo] === f.k ? " on" : ""}" data-campo="${campo}" data-k="${f.k}"><span class="e-${campo} v-${f.k}">${esc(f.n)}</span><i><u style="width:${((f.horas / max) * 100).toFixed(0)}%"></u></i><em>${f.hechas}/${f.tot} · faltan ${f.horas >= 8 ? num(f.horas / 8) + " días" : num(f.horas) + " h"}</em></button>`).join("")}</div>`;
    };
    $("gtm-carga").innerHTML = grupo("Quién lo hace", QUIEN, "quien") + grupo("Área", AREAS, "area");
    $("gtm-carga").querySelectorAll(".gtm-carga-fila").forEach((b) => (b.onclick = () => { F[b.dataset.campo] = F[b.dataset.campo] === b.dataset.k ? "" : b.dataset.k; recordar(); pintarChecklist(); }));
  }
  const conFiltro = () => !!(F.area || F.quien || F.ritmo || F.q || F.fase || F.estado !== "todas");
  const limpiarFiltros = () => { F.fase = 0; F.area = ""; F.quien = ""; F.ritmo = ""; F.estado = "todas"; F.q = ""; recordar(); const q = $("gtm-q"); if (q) q.value = ""; pintarChecklist(); };
  function pintarFiltros() {
    // Arriba, por tipo: paso, quién, área y ritmo. Abajo, pegado al hacer scroll: el buscador y el estado.
    const chip = (campo, valor, txt, n) => `<button type="button" data-campo="${campo}" data-v="${valor}" class="${String(F[campo]) === String(valor) ? "on" : ""}">${txt}${n == null ? "" : ` <i>${n}</i>`}</button>`;
    const tipos = $("gtm-tipos");
    if (tipos) {
      tipos.innerHTML = `<div class="gtm-chips"><b class="gtm-chip-tit">Paso</b>${chip("fase", 0, "Todos")}${[1, 2, 3, 4, 5].map((f) => chip("fase", f, `${f} · ${FASES[f]}`)).join("")}</div>
        <div class="gtm-chips"><b class="gtm-chip-tit">Quién</b>${Object.keys(QUIEN).map((k) => chip("quien", k, QUIEN[k], T.filter((t) => t.quien === k).length)).join("")}<b class="gtm-chip-tit sep">Ritmo</b>${chip("ritmo", "u", "Una vez")}${chip("ritmo", "rec", "Se repite")}</div>
        <div class="gtm-chips"><b class="gtm-chip-tit">Área</b>${Object.keys(AREAS).map((k) => chip("area", k, AREAS[k], T.filter((t) => t.area === k).length)).join("")}</div>`;
      tipos.querySelectorAll("[data-campo]").forEach((b) => (b.onclick = () => { const c = b.dataset.campo, v = c === "fase" ? +b.dataset.v : b.dataset.v; F[c] = c !== "fase" && F[c] === v ? "" : v; recordar(); pintarChecklist(); }));
    }
    const caja = $("gtm-filtros");
    if (!$("gtm-q")) {
      caja.innerHTML = `<div class="gtm-busca"><span aria-hidden="true">⌕</span><input type="search" id="gtm-q" placeholder="Buscar una tarea: palabra, número, área o quién la hace" autocomplete="off" aria-label="Buscar una tarea"><kbd title="Atajo: la tecla diagonal">/</kbd><em id="gtm-cuantas"></em></div><div class="gtm-chips" id="gtm-estados"></div>`;
      let tq = 0; $("gtm-q").oninput = (e) => { F.q = e.target.value; clearTimeout(tq); tq = setTimeout(() => { recordar(); pintarEstados(); pintarLista(); pintarCarga(); }, 140); };
      $("gtm-q").onkeydown = (e) => { if (e.key === "Escape") { e.target.value = ""; F.q = ""; recordar(); pintarEstados(); pintarLista(); pintarCarga(); e.target.blur(); } };
    }
    if ($("gtm-q").value !== F.q && document.activeElement !== $("gtm-q")) $("gtm-q").value = F.q;
    pintarEstados();
  }
  function pintarEstados() {
    const c = $("gtm-estados"); if (!c) return;
    const nH = T.filter((t) => hechas[t.id]).length, nA = TT.length - T.length, nE = TT.filter(cambiada).length;
    const chip = (valor, txt, n, clase) => `<button type="button" data-estado="${valor}" class="${F.estado === valor ? "on" : ""}${clase ? " " + clase : ""}">${txt}${n == null ? "" : ` <i>${n}</i>`}</button>`;
    c.innerHTML = chip("todas", "Todas", TT.length) + chip("pendientes", "Pendientes", T.length - nH) + chip("hechas", "Hechas", nH) + chip("archivadas", "Archivadas", nA, "c-arch") + chip("editadas", "Editadas o movidas", nE, "c-edit") + (P.length ? chip("puntos", "◆ Puntos de control", P.length) : "") + (conFiltro() ? `<button type="button" id="gtm-limpiar" class="limpiar">Quitar filtros</button>` : "");
    c.querySelectorAll("[data-estado]").forEach((b) => (b.onclick = () => { F.estado = b.dataset.estado; recordar(); pintarChecklist(); }));
    const l = $("gtm-limpiar"); if (l) l.onclick = limpiarFiltros;
  }
  // La diagonal lleva al buscador desde cualquier parte del checklist.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = document.activeElement, q = $("gtm-q");
    if (!q || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || $("tab-checklist").hidden) return;
    e.preventDefault(); q.focus(); q.select();
  });

  const firmaDe = (correo, at) => `<b>${esc(correo || "")}</b> · ${fechaHora(at)}`;
  function tarjeta(t) {
    const h = hechas[t.id], e = t.ed, arch = t.archivada;
    const acciones = !PUEDE ? "" : arch
      ? `<div class="gtm-acc"><button type="button" data-acc="regresar" class="ancha" title="Vuelve a contar y se puede palomear">↩ Regresar al plan</button></div>`
      : `<div class="gtm-acc"><span class="gtm-agarre" draggable="true" title="Arrastra para mover" aria-hidden="true">⋮⋮</span><button type="button" data-acc="editar" title="Editar" aria-label="Editar la tarea ${t.id}">✎</button><button type="button" data-acc="subir" title="Subir un lugar" aria-label="Subir un lugar">↑</button><button type="button" data-acc="bajar" title="Bajar un lugar" aria-label="Bajar un lugar">↓</button><button type="button" data-acc="mover" title="Mover a otro bloque" aria-label="Mover a otro bloque">⇄</button><button type="button" data-acc="archivar" title="Archivar: se queda aquí, apagada" aria-label="Archivar la tarea ${t.id}">⊘</button></div>`;
    const palomita = arch
      ? `<button type="button" class="gtm-palomita bloqueada" role="checkbox" aria-checked="false" aria-disabled="true" disabled title="Archivada: regrésala al plan para palomearla">⊘</button>`
      : `<button type="button" class="gtm-palomita${PUEDE ? "" : " bloqueada"}" role="checkbox" aria-checked="${h ? "true" : "false"}" ${PUEDE ? "" : `aria-disabled="true" title="Solo correos @superleads.mx o @ingenieriadigital.mx pueden palomear"`} aria-label="${h ? "Marcar como pendiente" : "Marcar como hecha"}: ${esc(t.titulo)}">${h ? "✓" : ""}</button>`;
    return `<article class="gtm-tarea${h && !arch ? " hecha" : ""}${arch ? " archivada" : ""}${t.editada ? " editada" : ""}" data-id="${t.id}">
      ${palomita}
      <div class="gtm-tarea-txt"><b>${esc(t.titulo)}</b><p>${esc(t.detalle)}</p>
        <div class="gtm-etq"><span class="e-quien v-${t.quien}">${QUIEN[t.quien]}</span><span class="e-area v-${t.area}">${AREAS[t.area]}</span><span>${ESFUERZO[t.esf]}</span>${RITMO[t.ritmo] ? `<span class="e-ritmo">${RITMO[t.ritmo]}</span>` : ""}${arch ? `<span class="e-arch">archivada</span>` : ""}${t.editada ? `<span class="e-edit">editada</span>` : ""}${t.movida ? `<span class="e-mov">movida</span>` : ""}<span class="e-id">${t.id}</span></div>
        ${h && !arch ? `<p class="gtm-firma">✓ ${firmaDe(h.por || h.nombre, h.at)}</p>` : ""}
        ${arch ? `<p class="gtm-firma f-arch">⊘ Archivada por ${firmaDe(e.archivada_por, e.archivada_at)}${e.motivo ? ` · «${esc(e.motivo)}»` : ""}${h ? " · ya estaba hecha" : ""}</p>` : ""}
        ${t.editada ? `<p class="gtm-firma f-edit">✎ Editada por ${firmaDe(e.editada_por, e.editada_at)}</p>` : ""}
        ${t.movida ? `<p class="gtm-firma f-mov">⇄ Movida por ${firmaDe(e.movida_por, e.movida_at)} · venía de «${esc((BLQ[BLQ_N[BLQ_DE[t.id]]] || {}).titulo || "")}»</p>` : ""}
      </div>${acciones}</article>`;
  }

  /* ── marcador: quién ha palomeado y la bitácora ─────────────────────── */
  function cuentas() {
    const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0); const tHoy = hoy0.getTime() / 1000, tSem = Date.now() / 1000 - 7 * 86400;
    const m = {};
    T.forEach((t) => { const h = hechas[t.id]; if (!h || !h.por) return; const c = (m[h.por] = m[h.por] || { por: h.por, total: 0, semana: 0, hoy: 0, ultima: 0 }); c.total++; if (h.at >= tSem) c.semana++; if (h.at >= tHoy) c.hoy++; if (h.at > c.ultima) c.ultima = h.at; });
    return Object.values(m).sort((a, b) => b.total - a.total || b.ultima - a.ultima);
  }
  // Cada cosa que pasa en el checklist: su signo, su verbo y su color.
  const ACCION = { hecha: ["✓", "palomeó", "a-hecha"], deshecha: ["○", "desmarcó", "a-quito"], editada: ["✎", "editó", "a-edit"], original: ["↺", "regresó al texto del plan", "a-edit"], archivada: ["⊘", "archivó", "a-arch"], restaurada: ["↩", "regresó al plan", "a-hecha"], movida: ["⇄", "movió", "a-mov"], lugar: ["↺", "regresó a su lugar", "a-mov"], punto: ["◆", "alcanzaron", "a-punto"] };
  let bitacoraAbierta = false;
  function pintarMarcador() {
    const c = $("gtm-marcador"); if (!c) return;
    const filas = cuentas(), max = Math.max(1, ...filas.map((f) => f.total)), mio = filas.find((f) => f.por === YO);
    const tabla = filas.length
      ? filas.map((f, i) => `<li class="${f.por === YO ? "yo" : ""}"><i>${i + 1}</i><span><b>${esc(f.por)}</b><u><em style="width:${((f.total / max) * 100).toFixed(0)}%"></em></u></span><strong>${f.total}</strong><small>${f.hoy ? `${f.hoy} hoy · ` : ""}${f.semana} esta semana</small></li>`).join("")
      : `<li class="vacio">Nadie ha palomeado todavía. ${PUEDE ? "La primera es tuya." : ""}</li>`;
    const nombreDe = (id) => { const t = TT.find((x) => x.id === id); if (t) return t.titulo; const p = P.find((x) => x.id === id); return p ? p.titulo : id; };
    const renglon = (e) => { const a = ACCION[e.accion] || ACCION[e.hecha ? "hecha" : "deshecha"]; return `<li class="${a[2]}" data-ir="${esc(e.tarea)}" tabindex="0" title="${fechaHora(e.at)} · ${esc(e.por)}"><i>${a[0]}</i><p><b>${e.por === "sistema" ? "Números reales" : esc(corto(e.por))}</b> ${a[1]} <span>${esc(nombreDe(e.tarea))}</span>${e.nota ? `<small>${esc(e.nota)}</small>` : ""}</p><em>${bitacoraAbierta ? fechaHora(e.at) : hace(e.at)}</em></li>`; };
    const cuantos = bitacoraAbierta ? bitacora.length : 8, ult = bitacora.slice(0, cuantos).map(renglon).join("");
    c.innerHTML = `<div class="gtm-marcador${bitacoraAbierta ? " abierta" : ""}">
      <div><h4>Marcador${mio ? ` <small>tú llevas ${mio.total}${mio.hoy ? `, ${mio.hoy} hoy` : ""}</small>` : ""}</h4><ol class="gtm-marc-lista">${tabla}</ol></div>
      <div><h4>Bitácora <small>quién, qué y a qué hora</small></h4><ul class="gtm-marc-feed">${ult || `<li class="vacio">Aquí queda cada palomita, cada edición y cada tarea archivada o movida.</li>`}</ul>${bitacora.length > 8 ? `<button type="button" class="gtm-liga" id="gtm-bit-mas">${bitacoraAbierta ? "Ver solo lo último" : `Ver toda la bitácora (${bitacora.length})`}</button>` : ""}</div>
    </div>`;
    c.querySelectorAll("[data-ir]").forEach((li) => { const ir = () => (li.dataset.ir.startsWith("pc") ? irAPunto(li.dataset.ir) : irATarea(li.dataset.ir)); li.onclick = ir; li.onkeydown = (e) => { if (e.key === "Enter") ir(); }; });
    const mas = $("gtm-bit-mas"); if (mas) mas.onclick = () => { bitacoraAbierta = !bitacoraAbierta; pintarMarcador(); };
  }
  function pintarLista() {
    const cont = $("gtm-lista"), puntos = P.filter(pasaPunto), visibles = TT.filter((t) => pasa(t));
    const cu = $("gtm-cuantas"); if (cu) cu.textContent = conFiltro() ? `${visibles.length} de ${TT.length}` : `${TT.length} tareas`;
    if (!visibles.length && !puntos.length) { cont.innerHTML = `<p class="gtm-vacio">Nada con esos filtros. <button type="button" class="gtm-liga" id="gtm-vacio-limpiar">Quitar filtros</button></p>`; $("gtm-vacio-limpiar").onclick = limpiarFiltros; pintarMarcador(); return; }
    cont.innerHTML = [1, 2, 3, 4, 5].map((f) => {
      const vivas = T.filter((t) => t.fase === f), h = vivas.filter((t) => hechas[t.id]).length, arch = TT.filter((t) => t.fase === f && t.archivada).length;
      const pf = P.filter((p) => p.fase === f), ph = pf.filter((p) => hechas[p.id]).length;
      // Cada punto de control va justo después de la tarea de la que cuelga, se vea o no esa tarea.
      // Los bloques: cada subtítulo sale si algo de su bloque se ve.
      const cuerpo = BLQ.filter((b) => b.fase === f).map((b) => {
        const suyas = TT.filter((t) => t.bloque === b.llave), cuentan = suyas.filter((t) => !t.archivada);
        const html = suyas.map((t) => (pasa(t) ? tarjeta(t) : "") + P.filter((p) => p.despues === t.id && pasaPunto(p)).map(puntoHtml).join("")).join("");
        return html ? `<h4 class="gtm-bloque" data-bloque="${b.llave}"><span>${esc(b.titulo)}</span><em>${cuentan.filter((t) => hechas[t.id]).length} de ${cuentan.length}</em></h4>` + html : "";
      }).join("");
      if (!cuerpo) return "";
      return `<section class="gtm-grupo" data-fase="${f}"><h3><span>Paso ${f}</span> ${FASES[f]} ${pf.length ? `<small class="gtm-grupo-pts">◆ ${ph} de ${pf.length}</small>` : ""}${arch ? `<small class="gtm-grupo-arch">⊘ ${arch} archivada${arch === 1 ? "" : "s"}</small>` : ""}<em>${h} de ${vivas.length}</em></h3><div class="gtm-avance"><div style="width:${(vivas.length ? (h / vivas.length) * 100 : 0).toFixed(1)}%"></div></div>${cuerpo}</section>`;
    }).join("");
    enlazarPuntos(cont); pintarMarcador();
  }
  function pintarChecklist() { pintarCarga(); pintarFiltros(); pintarLista(); pintarHoy(); pintarEscalera(); }
  const tarjetaEn = (id) => document.querySelector(`#gtm-lista .gtm-tarea[data-id="${id}"]`);
  const AVISO_CASA = "Solo correos @superleads.mx o @ingenieriadigital.mx pueden palomear, editar, archivar o mover.";
  async function palomear(id) {
    if (!PUEDE) return toast(AVISO_CASA);
    const t = TT.find((x) => x.id === id); if (!t || t.archivada) return toast("Está archivada. Regrésala al plan para palomearla.");
    const antes = hechas[id], hecha = !antes;
    if (hecha) hechas[id] = { por: YO, nombre: G.yo.nombre, at: Math.floor(Date.now() / 1000) }; else delete hechas[id];
    const repinta = (clase) => { const art = tarjetaEn(id); if (!art) return; art.outerHTML = tarjeta(t); const n = tarjetaEn(id); if (n && clase) n.classList.add(clase); };
    repinta(hecha ? "recien" : ""); pintarCarga(); pintarEstados(); pintarHoy(); actualizarGrupos(); repintarPuntos(); pintarMarcador(); pintarIndicadores();
    try {
      const r = await fetch("/api/gtm/tarea", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, hecha }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || String(r.status));
      bitacora.unshift({ tarea: id, hecha, accion: hecha ? "hecha" : "deshecha", nota: "", por: j.por, nombre: j.nombre, at: j.at }); bitacora = bitacora.slice(0, 80);
      if (hecha) {
        hechas[id] = { por: j.por, nombre: j.nombre, at: j.at };
        const cs = cuentas(), lugar = cs.findIndex((f) => f.por === YO) + 1, mio = cs[lugar - 1] || { total: 1, hoy: 1 };
        toast(`✓ Hecha. Llevas ${mio.hoy} hoy y ${mio.total} en total${cs.length > 1 ? ` · vas en el lugar ${lugar}` : ""}.`);
      }
      pintarMarcador();
    } catch (e) {
      if (antes) hechas[id] = antes; else delete hechas[id];
      pintarChecklist(); toast(String(e.message) === "solo_correos_de_la_casa" ? AVISO_CASA : String(e.message) === "tarea_archivada" ? "Está archivada. Regrésala al plan para palomearla." : "No se guardó. Revisa tu conexión e intenta de nuevo.");
    }
  }
  function actualizarGrupos() {
    document.querySelectorAll("#gtm-lista .gtm-bloque").forEach((h4) => { const s = T.filter((t) => t.bloque === h4.dataset.bloque); h4.querySelector("em").textContent = `${s.filter((t) => hechas[t.id]).length} de ${s.length}`; });
    document.querySelectorAll("#gtm-lista .gtm-grupo").forEach((g) => { const f = +g.dataset.fase, todas = T.filter((t) => t.fase === f), h = todas.filter((t) => hechas[t.id]).length; g.querySelector("h3 em").textContent = `${h} de ${todas.length}`; g.querySelector(".gtm-avance div").style.width = (todas.length ? (h / todas.length) * 100 : 0).toFixed(1) + "%"; });
  }

  /* ── editar, archivar y mover: lo que quien dirige le hace a una tarea ── */
  // El plan del código no cambia. Cada acción se guarda aparte, queda en la bitácora
  // con correo y hora, y la ve todo el equipo. Mismo candado que las palomitas.
  const ERRORES = { solo_correos_de_la_casa: AVISO_CASA, titulo_corto: "Falta el nombre de la tarea.", detalle_corto: "Falta la descripción.", etiqueta_invalida: "Revisa quién, área, esfuerzo y ritmo.", tarea_archivada: "Está archivada. Regrésala al plan primero." };
  async function accionTarea(id, cual, cuerpo, aviso) {
    if (!PUEDE) { toast(AVISO_CASA); return false; }
    try {
      const r = await fetch(`/api/gtm/tarea/${encodeURIComponent(id)}/${cual}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo || {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || String(r.status));
      ediciones = j.ediciones || {}; armar(); pintarChecklist(); pintarIndicadores();
      const n = tarjetaEn(id); if (n) { n.classList.add("recien"); n.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      if (aviso) toast(aviso);
      refrescar(false); // trae la bitácora con lo que acaba de pasar
      return true;
    } catch (e) { toast(ERRORES[e.message] || "No se guardó. Revisa tu conexión e intenta de nuevo."); return false; }
  }
  const opciones = (mapa, actual) => Object.keys(mapa).map((k) => `<option value="${k}"${String(k) === String(actual) ? " selected" : ""}>${esc(mapa[k])}</option>`).join("");
  function cerrarPaneles() { document.querySelectorAll("#gtm-lista .gtm-tarea.editando, #gtm-lista .gtm-tarea.preguntando").forEach((a) => { const t = TT.find((x) => x.id === a.dataset.id); if (t) a.outerHTML = tarjeta(t); }); }
  function abrirEditor(id) {
    cerrarPaneles();
    const t = TT.find((x) => x.id === id), art = tarjetaEn(id); if (!t || !art) return;
    art.classList.add("editando");
    art.querySelector(".gtm-tarea-txt").innerHTML = `<form class="gtm-form" novalidate>
      <label><span>Tarea</span><input name="titulo" maxlength="180" value="${esc(t.titulo)}" required></label>
      <label><span>Descripción: qué es y cuándo se da por hecha</span><textarea name="detalle" rows="4" maxlength="1500" required>${esc(t.detalle)}</textarea></label>
      <div class="gtm-form-fila">
        <label><span>Quién</span><select name="quien">${opciones(QUIEN, t.quien)}</select></label>
        <label><span>Área</span><select name="area">${opciones(AREAS, t.area)}</select></label>
        <label><span>Esfuerzo</span><select name="esfuerzo">${opciones(ESFUERZO, t.esf)}</select></label>
        <label><span>Ritmo</span><select name="ritmo">${opciones(RITMO_NOMBRE, t.ritmo)}</select></label>
      </div>
      <div class="gtm-form-pie"><button type="submit" class="btn-primary small">Guardar</button><button type="button" class="btn-ghost small" data-x="cancelar">Cancelar</button>${t.editada ? `<button type="button" class="gtm-liga" data-x="original">Volver al texto del plan</button>` : ""}<em>Ctrl + Enter guarda · Esc cancela</em></div>
    </form>`;
    const f = art.querySelector("form"), guardar = async () => {
      const d = Object.fromEntries(new FormData(f).entries()); d.esfuerzo = +d.esfuerzo;
      f.querySelector("[type=submit]").disabled = true;
      if (!(await accionTarea(id, "editar", d, "✎ Guardada. Quedó en la bitácora."))) f.querySelector("[type=submit]").disabled = false;
    };
    f.onsubmit = (e) => { e.preventDefault(); guardar(); };
    f.onkeydown = (e) => { if (e.key === "Escape") cerrarPaneles(); else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); guardar(); } };
    f.querySelector("[data-x=cancelar]").onclick = cerrarPaneles;
    const o = f.querySelector("[data-x=original]"); if (o) o.onclick = () => accionTarea(id, "original", {}, "↺ Regresó al texto del plan.");
    const inp = f.querySelector("[name=titulo]"); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
  }
  // Una franja dentro de la tarjeta para confirmar: archivar (con motivo opcional) o elegir a qué bloque va.
  function preguntar(id, html, alAceptar) {
    cerrarPaneles();
    const art = tarjetaEn(id); if (!art) return;
    art.classList.add("preguntando");
    art.querySelector(".gtm-tarea-txt").insertAdjacentHTML("beforeend", `<form class="gtm-pregunta">${html}<button type="button" class="btn-ghost small" data-x="cancelar">Cancelar</button></form>`);
    const f = art.querySelector(".gtm-pregunta");
    f.onsubmit = (e) => { e.preventDefault(); alAceptar(Object.fromEntries(new FormData(f).entries())); };
    f.onkeydown = (e) => { if (e.key === "Escape") cerrarPaneles(); };
    f.querySelector("[data-x=cancelar]").onclick = cerrarPaneles;
    const primero = f.querySelector("input, select"); if (primero) primero.focus();
  }
  function vecinas(t) { return TT.filter((x) => x.bloque === t.bloque); }
  function moverUnLugar(t, dir) {
    const s = vecinas(t), i = s.findIndex((x) => x.id === t.id), nb = BLQ_N[t.bloque];
    if (dir < 0) {
      if (i > 0) return accionTarea(t.id, "mover", { bloque: t.bloque, antes_de: s[i - 1].id });
      const ant = BLQ[nb - 1]; if (!ant) return toast("Ya es la primera del plan.");
      return accionTarea(t.id, "mover", { bloque: ant.llave }, `⇄ Pasó al bloque «${ant.titulo}».`);
    }
    if (i < s.length - 1) return accionTarea(t.id, "mover", s[i + 2] ? { bloque: t.bloque, antes_de: s[i + 2].id } : { bloque: t.bloque });
    const sig = BLQ[nb + 1]; if (!sig) return toast("Ya es la última del plan.");
    const primera = TT.find((x) => x.bloque === sig.llave);
    return accionTarea(t.id, "mover", primera ? { bloque: sig.llave, antes_de: primera.id } : { bloque: sig.llave }, `⇄ Pasó al bloque «${sig.titulo}».`);
  }
  function accionDeTarjeta(id, cual) {
    const t = TT.find((x) => x.id === id); if (!t) return;
    if (!PUEDE) return toast(AVISO_CASA);
    if (cual === "editar") return abrirEditor(id);
    if (cual === "subir") return moverUnLugar(t, -1);
    if (cual === "bajar") return moverUnLugar(t, 1);
    if (cual === "regresar") return accionTarea(id, "archivar", { archivada: false }, "↩ Regresó al plan. Vuelve a contar.");
    if (cual === "archivar") return preguntar(id, `<label><span>Archivar esta tarea. Se queda aquí, apagada, y deja de contar.</span><input name="motivo" maxlength="200" placeholder="Por qué, si quieres dejarlo escrito (opcional)" autocomplete="off"></label><button type="submit" class="btn-primary small">⊘ Archivar</button>`, (d) => accionTarea(id, "archivar", { archivada: true, motivo: d.motivo || "" }, "⊘ Archivada. Sigue ahí, apagada."));
    if (cual === "mover") {
      const porPaso = [1, 2, 3, 4, 5].map((f) => `<optgroup label="Paso ${f} · ${FASES[f]}">${BLQ.filter((b) => b.fase === f).map((b) => `<option value="${b.llave}"${b.llave === t.bloque ? " selected" : ""}>${esc(b.titulo)}</option>`).join("")}</optgroup>`).join("");
      preguntar(id, `<label><span>Mover al final de este bloque. Dentro del bloque se acomoda con las flechas o arrastrando.</span><select name="bloque">${porPaso}</select></label><button type="submit" class="btn-primary small">⇄ Mover</button>${t.movida || t.ed.bloque != null ? `<button type="button" class="gtm-liga" data-x="lugar">Regresar a su lugar del plan</button>` : ""}`, (d) => accionTarea(id, "mover", { bloque: d.bloque }, "⇄ Movida. Quedó en la bitácora."));
      const l = tarjetaEn(id) && tarjetaEn(id).querySelector("[data-x=lugar]");
      if (l) l.onclick = () => accionTarea(id, "mover", { original: true }, "↺ Regresó a su lugar del plan.");
    }
  }
  // Un solo oído para toda la lista: palomitas, acciones y arrastrar.
  (function oidos() {
    const cont = $("gtm-lista"); if (!cont) return;
    cont.addEventListener("click", (e) => {
      const acc = e.target.closest("[data-acc]"), pal = e.target.closest(".gtm-palomita"), art = e.target.closest(".gtm-tarea");
      if (!art) return;
      if (acc) return accionDeTarjeta(art.dataset.id, acc.dataset.acc);
      if (pal && !art.classList.contains("editando")) return palomear(art.dataset.id);
    });
    let llevo = null;
    const limpia = () => cont.querySelectorAll(".soltar-aqui, .arrastrando").forEach((x) => x.classList.remove("soltar-aqui", "arrastrando"));
    cont.addEventListener("dragstart", (e) => {
      const a = e.target.closest && e.target.closest(".gtm-agarre"); if (!a) return;
      const art = a.closest(".gtm-tarea"); llevo = art.dataset.id; art.classList.add("arrastrando");
      e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", llevo);
      try { e.dataTransfer.setDragImage(art, 20, 20); } catch {}
    });
    cont.addEventListener("dragover", (e) => {
      if (!llevo) return; const obj = e.target.closest(".gtm-tarea, .gtm-bloque"); if (!obj || obj.dataset.id === llevo) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      if (!obj.classList.contains("soltar-aqui")) { cont.querySelectorAll(".soltar-aqui").forEach((x) => x.classList.remove("soltar-aqui")); obj.classList.add("soltar-aqui"); }
    });
    cont.addEventListener("drop", (e) => {
      if (!llevo) return; const obj = e.target.closest(".gtm-tarea, .gtm-bloque"), id = llevo; llevo = null; limpia();
      if (!obj || obj.dataset.id === id) return; e.preventDefault();
      if (obj.classList.contains("gtm-bloque")) { const primera = TT.find((x) => x.bloque === obj.dataset.bloque && x.id !== id); return accionTarea(id, "mover", primera ? { bloque: obj.dataset.bloque, antes_de: primera.id } : { bloque: obj.dataset.bloque }, "⇄ Movida. Quedó en la bitácora."); }
      const dest = TT.find((x) => x.id === obj.dataset.id); if (dest) accionTarea(id, "mover", { bloque: dest.bloque, antes_de: dest.id }, "⇄ Movida. Quedó en la bitácora.");
    });
    cont.addEventListener("dragend", () => { llevo = null; limpia(); });
  })();

  // Lo que pasa en la aplicación y lo que palomea el equipo llega solo, cada 45 segundos.
  let refrescando = false;
  async function refrescar(aMano) {
    if (refrescando) return; refrescando = true;
    const boton = $("gtm-ind-ya"); if (aMano && boton) boton.disabled = true;
    try {
      const r = await fetch("/api/gtm" + (aMano ? "?fresco=1" : "")); if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const cambioEd = !!j.ediciones && JSON.stringify(j.ediciones) !== JSON.stringify(ediciones);
      // Con un editor abierto no se repinta la lista: se perdería lo que la persona está escribiendo.
      const ocupado = !!document.querySelector("#gtm-lista .gtm-tarea.editando, #gtm-lista .gtm-tarea.preguntando");
      if (cambioEd && !ocupado) { ediciones = j.ediciones; armar(); }
      const cambio = (JSON.stringify(j.hechas) !== JSON.stringify(hechas) || cambioEd) && !ocupado, cambioReal = JSON.stringify(j.real) !== JSON.stringify(real);
      if (!ocupado) hechas = j.hechas || {}; real = j.real || real; equipo = j.equipo || equipo;
      if (j.bitacora) { const cb = JSON.stringify(j.bitacora) !== JSON.stringify(bitacora); bitacora = j.bitacora; if (cb && !cambio) pintarMarcador(); }
      if (j.postulaciones && j.postulaciones.length !== postulaciones.length) { postulaciones = j.postulaciones; pintarPostulaciones(); }
      if (cambio) pintarChecklist(); else { pintarHoy(); if (cambioReal) repintarPuntos(); }
      if (j.indicadores) { ind = j.indicadores; indAt = Date.now(); pintarIndicadores(); }
      if (aMano) toast("Datos al momento.");
    } catch (e) { if (aMano) toast("No se pudo actualizar. Revisa tu conexión."); }
    refrescando = false; const b2 = $("gtm-ind-ya"); if (b2) b2.disabled = false;
  }
  setInterval(() => { if (!document.hidden) refrescar(false); }, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - indAt > 45000) refrescar(false); });

  /* ── indicadores en vivo: lo que se revisa en la junta del mes ───────── */
  // Nada de esto se captura: sale de lo que pasó en la aplicación. El servidor
  // lo recalcula y esta página lo vuelve a pedir sola cada 45 segundos.
  let ind = G.indicadores || null, indAt = Date.now();
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"], MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const nomMes = (m, largo) => { const p = String(m).split("-"); return (largo ? MESES_L : MESES)[+p[1] - 1] + (largo ? " de " + p[0] : ""); };
  const dec = (n) => (Math.round(n * 10) / 10).toLocaleString("es-MX");
  function cambio(a, b, alReves) {
    if (!b) return a > 0 ? `<i class="sube">nuevo</i>` : `<i>sin cambio</i>`;
    const p = ((a - b) / b) * 100; if (Math.abs(p) < 0.5) return `<i>igual</i>`;
    return `<i class="${(p > 0) !== !!alReves ? "sube" : "baja"}">${p > 0 ? "▲" : "▼"} ${Math.abs(p) >= 1000 ? "×" + dec(a / b) : Math.round(Math.abs(p)) + " %"}</i>`;
  }
  function pintarIndicadores() {
    const c = $("gtm-indicadores"); if (!c) return;
    if (!ind || !ind.meses || ind.meses.length < 2) { c.innerHTML = `<section class="gtm-sec"><p class="gtm-vacio">Todavía no hay datos para mostrar.</p></section>`; return; }
    const A = ind.meses[ind.meses.length - 1], B = ind.meses[ind.meses.length - 2], fr = Math.max(ind.dia / ind.dias_mes, 1 / ind.dias_mes);
    const $$ = (cents) => pesos((cents || 0) / 100), sig = siguientePunto();
    const meta = (k) => (sig && sig.metas[k] != null ? `meta del punto ${P.indexOf(sig) + 1}: ${cifra(k, sig.metas[k])}` : "");
    const gordo = (valor, antes, etiqueta, cierre, nota, pct) => `<div class="gtm-ind-gordo"><span>${etiqueta}</span><b>${valor}</b><p>${antes}</p>${pct == null ? "" : `<div class="gtm-avance"><div style="width:${Math.min(100, Math.max(pct > 0 ? 2 : 0, pct)).toFixed(1)}%"></div></div>`}<small>${[cierre, nota].filter(Boolean).join(" · ")}</small></div>`;
    const pctMeta = (k, v) => (sig && sig.metas[k] ? (v / sig.metas[k]) * 100 : null);

    // 1 · los cuatro números del mes
    const cuatro =
      gordo(num(A.creadores), `${cambio(A.creadores, B.creadores)} contra ${nomMes(B.mes)} (${num(B.creadores)})`, "Creadores que cobraron", "", meta("creadores"), pctMeta("creadores", A.creadores)) +
      gordo(num(A.pagan), `${cambio(A.pagan, B.pagan)} contra ${nomMes(B.mes)} (${num(B.pagan)})`, "Personas que pagaron", "", meta("pagan"), pctMeta("pagan", A.pagan)) +
      gordo($$(A.puerta_cents), `${cambio(A.puerta_cents, B.puerta_cents)} contra ${nomMes(B.mes)} (${$$(B.puerta_cents)})`, "Puerta del mes", `a este paso cierra en ${$$(A.puerta_cents / fr)}`, meta("puerta"), pctMeta("puerta", A.puerta_cents / 100)) +
      gordo($$(A.casa_cents), `${cambio(A.casa_cents, B.casa_cents)} contra ${nomMes(B.mes)} (${$$(B.casa_cents)})`, "Para la casa", `a este paso cierra en ${$$(A.casa_cents / fr)}`, meta("casa"), pctMeta("casa", A.casa_cents / 100));

    // 2 · este mes contra el anterior, renglón por renglón
    const fila = (nombre, a, b, f, alReves) => `<tr><td>${nombre}</td><td><b>${f(a)}</b></td><td>${f(b)}</td><td>${cambio(a, b, alReves)}</td></tr>`;
    const div = (a, b) => (b ? a / b : 0), o1 = (v) => (v ? dec(v) : "—"), od = (v) => (v ? pesos(v) : "—");
    const tabla = `<div class="gtm-tabla-caja"><table class="gtm-tabla gtm-ind-tabla"><thead><tr><th>Indicador</th><th>${nomMes(A.mes)} (día ${ind.dia} de ${ind.dias_mes})</th><th>${nomMes(B.mes)} completo</th><th>Cambio</th></tr></thead><tbody>
      <tr class="sep"><td colspan="4">Usuarios</td></tr>
      ${fila("Registros nuevos", A.registros, B.registros, num)}${fila("Salas nuevas", A.salas_nuevas, B.salas_nuevas, num)}${fila("Salas que transmitieron", A.salas_transmitieron, B.salas_transmitieron, num)}${fila("Creadores que cobraron", A.creadores, B.creadores, num)}${fila("Personas que pagaron", A.pagan, B.pagan, num)}
      <tr class="sep"><td colspan="4">Actividad</td></tr>
      ${fila("Sesiones", A.sesiones, B.sesiones, num)}${fila("Sesiones con entradas pagadas", A.sesiones_pagadas, B.sesiones_pagadas, num)}${fila("Entradas pagadas", A.entradas, B.entradas, num)}${fila("Membresías vendidas", A.membresias, B.membresias, num)}
      <tr class="sep"><td colspan="4">Dinero</td></tr>
      ${fila("Puerta (entradas y membresías)", A.puerta_cents, B.puerta_cents, $$)}${fila("Para la casa", A.casa_cents, B.casa_cents, $$)}${fila("Envíos dentro de las salas", A.envios_cents, B.envios_cents, $$)}${fila("Recargas de saldo", A.recargas_cents, B.recargas_cents, $$)}${fila("Retiros de creadores", A.retiros_cents, B.retiros_cents, $$)}
    </tbody></table></div>`;

    // 3 · seis meses
    const maxP = Math.max(1, ...ind.meses.map((m) => m.puerta_cents)), maxC = Math.max(1, ...ind.meses.map((m) => m.creadores));
    const barras = (campo, max, f) => `<div class="gtm-ind-barras">${ind.meses.map((m, i) => `<div class="${i === ind.meses.length - 1 ? "hoy" : ""}"><em>${f(m[campo])}</em><u><b style="height:${Math.max(m[campo] > 0 ? 3 : 0, (m[campo] / max) * 100).toFixed(1)}%"></b></u><span>${nomMes(m.mes)}</span></div>`).join("")}</div>`;

    // 4 · los supuestos del plan contra lo que de verdad pasa
    const sup = [
      ["Precio promedio de la entrada", div(A.puerta_cents / 100, A.entradas + A.membresias), 60, od],
      ["Personas que pagan por sesión", div(A.entradas, A.sesiones_pagadas), 12, o1],
      ["Sesiones por creador al mes", div(A.sesiones, A.salas_transmitieron) / fr, 8, o1],
      ["Lo que gasta cada persona en la puerta al mes", div(A.puerta_cents / 100, A.pagan), 110, od],
      ["Puerta por creador al mes", div(A.puerta_cents / 100, A.creadores) / fr, 3000, od],
    ].map((x) => `<tr><td>${x[0]}</td><td>${x[3](x[2])}</td><td><b>${x[3](x[1])}</b></td><td>${x[1] ? `<i class="${x[1] >= x[2] ? "sube" : "baja"}">${x[1] >= x[2] ? "arriba del plan" : "abajo del plan"}</i>` : "<i>sin datos</i>"}</td></tr>`).join("");

    // 5 · el embudo
    const e = ind.embudo, pc = (a, b) => (b ? Math.round((a / b) * 100) + " %" : "—");
    const paso = (n, etiqueta, de) => `<div class="gtm-ind-paso"><b>${num(n)}</b><span>${etiqueta}</span>${de == null ? "" : `<small>${pc(n, de)} del paso anterior</small>`}</div>`;
    const tasa = (valor, etiqueta, nota, meta) => `<div class="gtm-ind-tasa"><b>${valor}</b><span>${etiqueta}</span><small>${nota}${meta ? ` · meta: ${meta}` : ""}</small></div>`;

    // 6 · de dónde llega la gente y quién pone la puerta
    const fuentes = ind.fuentes.length ? ind.fuentes.map((f) => `<tr><td>${esc(f.fuente)}</td><td>${num(f.total)}</td><td>${num(f.mes)}</td><td><b>${num(f.cobran)}</b></td></tr>`).join("") : `<tr><td colspan="4">Sin registros todavía.</td></tr>`;
    const top = ind.top.length ? ind.top.map((t, i) => `<tr><td>${i + 1}</td><td><b>${esc(t.titulo)}</b><small>/${esc(t.slug)}</small></td><td>${$$(t.puerta_cents)}</td><td>${num(t.entradas)}</td><td>${num(t.sesiones)}</td><td>${pc(t.puerta_cents, A.puerta_cents)}</td></tr>`).join("") : `<tr><td colspan="6">Nadie ha cobrado entradas este mes.</td></tr>`;

    // 7 · las tareas
    const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0); const tMes = ini.getTime() / 1000;
    const delMes = T.filter((t) => hechas[t.id] && hechas[t.id].at >= tMes), nH = T.filter((t) => hechas[t.id]).length;
    const porPersona = {}; delMes.forEach((t) => { const k = hechas[t.id].por; porPersona[k] = (porPersona[k] || 0) + 1; });
    const pasos = [1, 2, 3, 4, 5].map((f) => { const tot = T.filter((t) => t.fase === f), h = tot.filter((t) => hechas[t.id]).length, pf = P.filter((p) => p.fase === f), ph = pf.filter((p) => hechas[p.id]).length; return `<div class="gtm-ind-fase"><span>Paso ${f} · ${FASES[f]}</span><div class="gtm-avance"><div style="width:${((h / tot.length) * 100).toFixed(1)}%"></div></div><small>${h} de ${tot.length} tareas · ◆ ${ph} de ${pf.length}</small></div>`; }).join("");
    const listos = P.filter((p) => hechas[p.id]);

    c.innerHTML = `
    <section class="gtm-sec">
      <div class="gtm-ind-cab"><div><p class="gtm-ceja">La junta del mes</p><h2>Cómo vamos en ${nomMes(A.mes, true)}</h2></div>
        <div class="gtm-ind-vivo"><span><u class="gtm-vivo"></u>En vivo · <em id="gtm-ind-hace">actualizado ahora</em></span><button type="button" class="btn-ghost small" id="gtm-ind-ya">Actualizar</button></div></div>
      <p>Todo sale de lo que pasó en la aplicación. Nadie lo captura. Vamos en el día ${ind.dia} de ${ind.dias_mes}.</p>
      <div class="gtm-ind-cuatro">${cuatro}</div>
      ${sig ? `<p class="gtm-nota gtm-nota-oro"><b>Siguiente punto de control:</b> ${esc(sig.titulo)} (${esc(sig.cuando)}). ${listos.length} de ${P.length} alcanzados.</p>` : ""}
    </section>
    <section class="gtm-sec"><h3>Este mes contra el anterior</h3>${tabla}</section>
    <section class="gtm-sec"><h3>Seis meses</h3><div class="gtm-ind-dos"><div><h4>Puerta</h4>${barras("puerta_cents", maxP, (v) => $$(v))}</div><div><h4>Creadores que cobraron</h4>${barras("creadores", maxC, num)}</div></div></section>
    <section class="gtm-sec"><h3>El plan contra la realidad</h3><p>La cuenta del millón descansa en estos supuestos. Aquí está lo que de verdad pasa este mes.</p>
      <div class="gtm-tabla-caja"><table class="gtm-tabla gtm-ind-tabla"><thead><tr><th>Supuesto</th><th>El plan dice</th><th>Este mes</th><th></th></tr></thead><tbody>${sup}</tbody></table></div>
      <p class="gtm-nota">Las sesiones y la puerta por creador se proyectan al mes completo con lo que va del mes.</p></section>
    <section class="gtm-sec"><h3>El embudo, desde el primer día</h3>
      <div class="gtm-ind-embudo">${paso(e.registros, "personas registradas")}${paso(e.salas, "salas creadas", e.registros)}${paso(e.transmitieron, "salas que transmitieron", e.salas)}${paso(e.cobraron, "salas que cobraron", e.transmitieron)}</div>
      <div class="gtm-ind-tasas">
        ${tasa(pc(e.si7, e.base7), "transmite en sus primeros 7 días", `${num(e.si7)} de ${num(e.base7)} salas de los últimos 90 días`, "30 %")}
        ${tasa(pc(e.si30, e.base30), "repite antes de 30 días", `${num(e.si30)} de ${num(e.base30)} salas`, "60 %")}
        ${tasa(e.primer_peso_dias == null ? "—" : dec(e.primer_peso_dias) + " días", "de crear la sala al primer peso", `promedio de ${num(e.primer_peso_n)} salas`, "")}
        ${tasa(num(e.espectador_a_creador), "espectadores que se volvieron creadores", "entraron a una sala antes de abrir la suya", "")}
      </div></section>
    <section class="gtm-sec"><div class="gtm-ind-dos">
      <div><h3>De dónde llega la gente</h3><div class="gtm-tabla-caja"><table class="gtm-tabla gtm-ind-tabla"><thead><tr><th>Fuente</th><th>Registros</th><th>Este mes</th><th>Ya cobran</th></tr></thead><tbody>${fuentes}</tbody></table></div></div>
      <div><h3>Quién pone la puerta este mes</h3><div class="gtm-tabla-caja"><table class="gtm-tabla gtm-ind-tabla"><thead><tr><th>#</th><th>Sala</th><th>Puerta</th><th>Entradas</th><th>Sesiones</th><th>Del total</th></tr></thead><tbody>${top}</tbody></table></div></div>
    </div></section>
    <section class="gtm-sec"><h3>Las tareas</h3>
      <div class="gtm-ind-cuatro tres">
        ${gordo(`${nH} de ${T.length}`, `${Math.round((nH / T.length) * 100)} % del plan`, "Tareas hechas", "", "", (nH / T.length) * 100)}
        ${gordo(num(delMes.length), Object.keys(porPersona).length ? Object.entries(porPersona).sort((a, b) => b[1] - a[1]).map((x) => `${esc(corto(x[0]))} ${x[1]}`).join(" · ") : "nadie ha palomeado este mes", "Palomeadas este mes", "", "", null)}
        ${gordo(`${listos.length} de ${P.length}`, listos.length ? `último: ${esc(listos[listos.length - 1].titulo)}` : "ninguno todavía", "Puntos de control alcanzados", "", "", (listos.length / Math.max(1, P.length)) * 100)}
      </div>
      <div class="gtm-ind-fases">${pasos}</div>
      <p><button type="button" class="gtm-liga" data-ir-tab="checklist">Abrir el checklist</button></p>
    </section>`;
    c.querySelectorAll("[data-ir-tab]").forEach((b) => (b.onclick = () => verTab(b.dataset.irTab, true)));
    $("gtm-ind-ya").onclick = () => refrescar(true);
    pintarHace();
  }
  function pintarHace() { const e = $("gtm-ind-hace"); if (!e) return; const s = Math.floor((Date.now() - indAt) / 1000); e.textContent = s < 5 ? "actualizado ahora" : s < 60 ? `actualizado hace ${s} s` : `actualizado hace ${Math.floor(s / 60)} min`; }
  setInterval(pintarHace, 5000);

  /* ── calculadora hacia el millón ────────────────────────────────────── */
  const CALC = [
    ["meta", "Meta para la casa, al mes", 1000000, "$", 50000],
    ["comision", "Comisión de la puerta", 20, "%", 1],
    ["ticket", "Precio promedio de la entrada", 60, "$", 5],
    ["personas", "Personas que pagan por sesión", 12, "", 1],
    ["sesiones", "Sesiones por creador al mes", 8, "", 1],
    ["tarjeta", "Costo de tarjeta sobre la puerta", 6, "%", 0.5],
    ["transmite", "De cada 100 salas, transmiten", 30, "%", 1],
    ["cobra", "De las que transmiten, cobran", 50, "%", 1],
    ["repite", "De las que cobran, repiten cada mes", 60, "%", 1],
  ];
  const V = Object.assign(Object.fromEntries(CALC.map((c) => [c[0], c[2]])), (() => { try { return JSON.parse(localStorage.getItem("vr_gtm_calc") || "{}"); } catch { return {}; } })());
  function pintarCalc() {
    const o = $("gtm-calc-out"); if (!o) return;
    const com = Math.max(0.1, V.comision) / 100, neto = Math.max(0.1, V.comision - V.tarjeta) / 100;
    const puerta = V.meta / com, puertaNeta = V.meta / neto, entradas = puerta / Math.max(1, V.ticket), porCreador = Math.max(1, V.ticket * V.personas * V.sesiones);
    const creadores = puerta / porCreador, embudo = Math.max(0.0001, (V.transmite / 100) * (V.cobra / 100) * (V.repite / 100)), salas = creadores / embudo;
    const fila = (v, t, n) => `<div class="gtm-res"><b>${v}</b><span>${t}</span>${n ? `<small>${n}</small>` : ""}</div>`;
    o.innerHTML = fila(pesos(puerta), "de puerta al mes", "entradas y membresías") + fila(num(entradas), "entradas al mes", `${num(entradas / 30)} al día`) + fila(pesos(porCreador), "de puerta por creador al mes", `la casa recibe ${pesos(porCreador * com)} de cada uno`) + fila(num(creadores), "creadores cobrando cada mes", "") + fila(num(salas), "salas que tienen que existir", `de cada 100 salas, ${(embudo * 100).toFixed(0)} cobran cada mes`) + fila(pesos(puertaNeta), "de puerta si el millón debe quedar limpio de tarjeta", `con ${V.tarjeta} % de costo de tarjeta`);
  }
  function armarCalc() {
    const c = $("gtm-calc-in"); if (!c) return;
    c.innerHTML = CALC.map((x) => `<label><span>${x[1]}</span><div><i>${x[3] === "$" ? "$" : ""}</i><input type="number" inputmode="decimal" data-k="${x[0]}" value="${V[x[0]]}" step="${x[4]}" min="0"><i>${x[3] === "%" ? "%" : ""}</i></div></label>`).join("") + `<button type="button" class="btn-ghost small" id="gtm-calc-reset">Volver a los supuestos del plan</button>`;
    c.querySelectorAll("input").forEach((i) => (i.oninput = () => { const v = parseFloat(i.value); V[i.dataset.k] = isFinite(v) ? v : 0; try { localStorage.setItem("vr_gtm_calc", JSON.stringify(V)); } catch {} pintarCalc(); }));
    $("gtm-calc-reset").onclick = () => { CALC.forEach((x) => (V[x[0]] = x[2])); try { localStorage.removeItem("vr_gtm_calc"); } catch {} armarCalc(); };
    pintarCalc();
  }

  /* ── quién puede ver la página ──────────────────────────────────────── */
  function pintarEquipo() {
    const c = $("gtm-equipo-lista"); if (!c) return;
    c.innerHTML = `<ul class="gtm-accesos">${equipo.map((p) => `<li><span>${esc(p.email)}</span>${p.fijo ? "<small>equipo de base</small>" : G.yo.admin ? `<button type="button" data-q="${esc(p.email)}" aria-label="Quitar a ${esc(p.email)}">Quitar</button>` : ""}</li>`).join("")}</ul>` + (G.yo.admin ? `<form id="gtm-equipo-form" class="gtm-agregar"><input type="email" id="gtm-equipo-correo" placeholder="correo@ejemplo.com" autocomplete="off" required><button class="btn-primary" type="submit">Dar acceso</button></form>` : `<p class="muted">Solo Ricardo puede agregar o quitar personas.</p>`);
    const mandar = async (email, quitar) => { try { const r = await fetch("/api/gtm/equipo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, quitar }) }); const j = await r.json(); if (!r.ok) return toast(j.error === "correo_invalido" ? "Ese correo no se ve bien." : "No se pudo."); equipo = j.equipo; pintarEquipo(); toast(quitar ? "Acceso quitado." : "Acceso dado. Ya puede entrar con ese correo."); } catch { toast("No se pudo. Revisa tu conexión."); } };
    c.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => mandar(b.dataset.q, true)));
    const f = $("gtm-equipo-form"); if (f) f.onsubmit = (e) => { e.preventDefault(); mandar($("gtm-equipo-correo").value, false); };
  }

  /* ── dirección: las pruebas que llegan desde /ceo ───────────────────── */
  function pintarPostulaciones() {
    const c = $("gtm-postulaciones"); if (!c) return;
    if (!postulaciones.length) { c.innerHTML = `<p class="gtm-vacio">Todavía no llega ninguna. Manda la liga <b>video.capitaltorreon.com/ceo</b> a quien creas que encaja.</p>`; return; }
    const abiertas = new Set([...c.querySelectorAll("details[open]")].map((d) => d.dataset.id));
    const liga = (u) => { const t = String(u || "").trim(); if (!t) return "—"; const h = /^https?:\/\//i.test(t) ? t : "https://" + t; return `<a href="${esc(h)}" target="_blank" rel="noopener nofollow">${esc(t)}</a>`; };
    c.innerHTML = postulaciones.map((p) => `<details class="gtm-postulacion" data-id="${esc(p.id)}"${abiertas.has(p.id) ? " open" : ""}>
        <summary><b>${esc(p.nombre)}</b><span>${esc(p.ciudad || "")}</span>${p.sala ? `<i>ya abrió su sala</i>` : ""}<em>${fecha(p.created_at)}</em></summary>
        <div class="gtm-post-cuerpo">
          <p class="gtm-post-contacto"><a href="mailto:${esc(p.correo)}">${esc(p.correo)}</a>${p.whatsapp ? ` · <a href="https://wa.me/${esc(String(p.whatsapp).replace(/\D/g, ""))}" target="_blank" rel="noopener">${esc(p.whatsapp)}</a>` : ""}</p>
          <h4>Su sala</h4><p>${liga(p.sala)}</p>
          <h4>Su número</h4><p>${esc(p.numero)}</p>
          <h4>Sus primeros siete días</h4><p>${esc(p.siete_dias)}</p>
          <h4>Lo correcto sobre lo conveniente</h4><p>${esc(p.correcto)}</p>
          <h4>Algo que construyó</h4><p>${liga(p.enlace)}</p>
        </div></details>`).join("");
  }

  /* ── candidatos: las fichas de quien salimos a buscar ───────────────── */
  // La pantalla es un módulo aparte (candidatos.js). Se monta la primera vez
  // que se abre la pestaña; las fichas llegan del servidor en ese momento.
  let candMontado = false;
  function montarCandidatos() {
    if (candMontado || !window.Candidatos || !$("gtm-candidatos")) return;
    candMontado = true;
    window.Candidatos.montar($("gtm-candidatos"), { api: "/api/gtm/candidatos", vacante: "ceo", toast, alCargar: (d) => { const n = (d.fichas || []).filter((f) => f.estado !== "descartado").length; $("gtm-cand-tab").textContent = n ? String(n) : ""; } });
  }
  document.querySelectorAll("[data-ir-tab]").forEach((b) => (b.onclick = () => verTab(b.dataset.irTab, true)));

  pintarChecklist(); armarCalc(); pintarEquipo(); pintarPostulaciones(); pintarIndicadores();
  verTab((location.hash || "").replace("#", "") || "resumen", false);
})();

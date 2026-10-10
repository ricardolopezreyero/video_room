// RLR · Go-to-market: la interacción de /gtm. Este archivo no lleva la
// estrategia ni las tareas: el servidor las entrega en window.__GTM solo a
// quien tiene acceso. Aquí viven las pestañas, el checklist (cada palomita se
// guarda en el servidor y la ve todo el equipo), los filtros, la carga por
// persona y por área, y la calculadora hacia el millón.
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
  const T = G.tareas.map((t) => ({ id: t[0], fase: t[1], area: t[2], quien: t[3], esf: t[4], ritmo: t[5], titulo: t[6], detalle: t[7] }));
  let hechas = G.hechas || {}, real = G.real || {}, equipo = G.equipo || [], postulaciones = G.postulaciones || [];
  const F = Object.assign({ fase: 0, area: "", quien: "", estado: "todas", q: "" }, (() => { try { return JSON.parse(localStorage.getItem("vr_gtm_filtros") || "{}"); } catch { return {}; } })());
  const recordar = () => { try { localStorage.setItem("vr_gtm_filtros", JSON.stringify(F)); } catch {} };
  function toast(msg) { const t = $("gtm-toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2400); }
  const fecha = (s) => { try { return new Date(s * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "short" }); } catch { return ""; } };
  const llano = (t) => String(t).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

  /* ── pestañas ───────────────────────────────────────────────────────── */
  function verTab(nombre, mover) {
    if (!$("tab-" + nombre)) nombre = "resumen";
    document.querySelectorAll(".gtm-tab").forEach((el) => (el.hidden = el.id !== "tab-" + nombre));
    $("gtm-tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === nombre));
    if (mover) { history.replaceState(null, "", nombre === "resumen" ? location.pathname : "#" + nombre); window.scrollTo({ top: 0 }); }
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
      a.onclick = () => { F.fase = f; F.area = ""; F.quien = ""; F.estado = "todas"; F.q = ""; recordar(); pintarChecklist(); verTab("checklist", true); };
    });
  }

  /* ── checklist ──────────────────────────────────────────────────────── */
  const pasa = (t, sin) => (sin === "fase" || !F.fase || t.fase === F.fase) && (sin === "area" || !F.area || t.area === F.area) && (sin === "quien" || !F.quien || t.quien === F.quien) && (F.estado === "todas" || (F.estado === "hechas") === !!hechas[t.id]) && (!F.q || llano(t.titulo + " " + t.detalle + " " + t.id).includes(llano(F.q)));
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
  function pintarFiltros() {
    const chip = (campo, valor, txt) => `<button type="button" data-campo="${campo}" data-v="${valor}" class="${String(F[campo]) === String(valor) ? "on" : ""}">${txt}</button>`;
    $("gtm-filtros").innerHTML = `<div class="gtm-chips">${chip("fase", 0, "Todos los pasos")}${[1, 2, 3, 4, 5].map((f) => chip("fase", f, `${f} · ${FASES[f]}`)).join("")}</div>
      <div class="gtm-chips">${chip("estado", "todas", "Todas")}${chip("estado", "pendientes", "Pendientes")}${chip("estado", "hechas", "Hechas")}<input type="search" id="gtm-q" placeholder="Buscar tarea…" value="${esc(F.q)}" autocomplete="off">${F.area || F.quien || F.q || F.fase || F.estado !== "todas" ? `<button type="button" id="gtm-limpiar" class="limpiar">Quitar filtros</button>` : ""}</div>`;
    $("gtm-filtros").querySelectorAll("[data-campo]").forEach((b) => (b.onclick = () => { F[b.dataset.campo] = b.dataset.campo === "fase" ? +b.dataset.v : b.dataset.v; recordar(); pintarChecklist(); }));
    let tq = 0; $("gtm-q").oninput = (e) => { F.q = e.target.value; clearTimeout(tq); tq = setTimeout(() => { recordar(); pintarLista(); pintarCarga(); }, 160); };
    const l = $("gtm-limpiar"); if (l) l.onclick = () => { F.fase = 0; F.area = ""; F.quien = ""; F.estado = "todas"; F.q = ""; recordar(); pintarChecklist(); };
  }
  function tarjeta(t) {
    const h = hechas[t.id];
    return `<article class="gtm-tarea${h ? " hecha" : ""}" data-id="${t.id}">
      <button type="button" class="gtm-palomita" role="checkbox" aria-checked="${h ? "true" : "false"}" aria-label="${h ? "Marcar como pendiente" : "Marcar como hecha"}: ${esc(t.titulo)}">${h ? "✓" : ""}</button>
      <div class="gtm-tarea-txt"><b>${esc(t.titulo)}</b><p>${esc(t.detalle)}</p>
        <div class="gtm-etq"><span class="e-quien v-${t.quien}">${QUIEN[t.quien]}</span><span class="e-area v-${t.area}">${AREAS[t.area]}</span><span>${ESFUERZO[t.esf]}</span>${RITMO[t.ritmo] ? `<span class="e-ritmo">${RITMO[t.ritmo]}</span>` : ""}<span class="e-id">${t.id}</span>${h ? `<small>✓ ${esc((h.nombre || h.por || "").split(" ")[0])} · ${fecha(h.at)}</small>` : ""}</div>
      </div></article>`;
  }
  function pintarLista() {
    const lista = T.filter((t) => pasa(t)), cont = $("gtm-lista");
    if (!lista.length) { cont.innerHTML = `<p class="gtm-vacio">Nada con esos filtros.</p>`; return; }
    cont.innerHTML = [1, 2, 3, 4, 5].map((f) => {
      const ts = lista.filter((t) => t.fase === f); if (!ts.length) return "";
      const todas = T.filter((t) => t.fase === f), h = todas.filter((t) => hechas[t.id]).length;
      return `<section class="gtm-grupo"><h3><span>Paso ${f}</span> ${FASES[f]} <em>${h} de ${todas.length}</em></h3><div class="gtm-avance"><div style="width:${((h / todas.length) * 100).toFixed(1)}%"></div></div>${ts.map(tarjeta).join("")}</section>`;
    }).join("");
    cont.querySelectorAll(".gtm-palomita").forEach((b) => (b.onclick = () => palomear(b.closest(".gtm-tarea").dataset.id)));
  }
  function pintarChecklist() { pintarCarga(); pintarFiltros(); pintarLista(); pintarHoy(); }
  async function palomear(id) {
    const antes = hechas[id], hecha = !antes;
    if (hecha) hechas[id] = { por: G.yo.email, nombre: G.yo.nombre, at: Math.floor(Date.now() / 1000) }; else delete hechas[id];
    const art = document.querySelector(`.gtm-tarea[data-id="${id}"]`); if (art) art.outerHTML = tarjeta(T.find((t) => t.id === id));
    const nuevo = document.querySelector(`.gtm-tarea[data-id="${id}"] .gtm-palomita`); if (nuevo) nuevo.onclick = () => palomear(id);
    pintarCarga(); pintarHoy(); actualizarGrupos();
    try {
      const r = await fetch("/api/gtm/tarea", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, hecha }) });
      if (!r.ok) throw new Error(String(r.status));
    } catch (e) {
      if (antes) hechas[id] = antes; else delete hechas[id];
      pintarChecklist(); toast("No se guardó. Revisa tu conexión e intenta de nuevo.");
    }
  }
  function actualizarGrupos() {
    document.querySelectorAll(".gtm-grupo").forEach((g) => { const f = +(g.querySelector("h3 span").textContent.replace(/\D/g, "")), todas = T.filter((t) => t.fase === f), h = todas.filter((t) => hechas[t.id]).length; g.querySelector("h3 em").textContent = `${h} de ${todas.length}`; g.querySelector(".gtm-avance div").style.width = ((h / todas.length) * 100).toFixed(1) + "%"; });
  }
  // Lo que palomea otra persona del equipo aparece solo.
  setInterval(async () => {
    if (document.hidden) return;
    try { const r = await fetch("/api/gtm"); if (!r.ok) return; const j = await r.json(); const cambio = JSON.stringify(j.hechas) !== JSON.stringify(hechas); hechas = j.hechas || {}; real = j.real || real; equipo = j.equipo || equipo; if (j.postulaciones && j.postulaciones.length !== postulaciones.length) { postulaciones = j.postulaciones; pintarPostulaciones(); } if (cambio) pintarChecklist(); else pintarHoy(); } catch {}
  }, 45000);

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

  pintarChecklist(); armarCalc(); pintarEquipo(); pintarPostulaciones();
  verTab((location.hash || "").replace("#", "") || "resumen", false);
})();

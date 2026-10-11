// RLR · Proyecciones: la cuenta y el dibujo de la pestaña Proyecciones del
// Go-to-market. Este archivo no lleva el modelo: los supuestos llegan en
// window.__PROY solo a quien tiene acceso. Aquí se calcula mes por mes, se
// pinta la gráfica de ingresos y gastos y, debajo, la tabla con las mismas
// columnas. Todo corre de izquierda a derecha dentro del mismo carril, así que
// gráfica y tabla nunca se desfasan. La pestaña nace escondida: se pinta la
// primera vez que se abre (Proyecciones.ver()), cuando ya tiene ancho.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const D = window.__PROY; if (!D) return;
  const Mo = D.modelo, REAL = Object.fromEntries((D.real || []).map((r) => [r.mes, r]));
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const N = Mo.anios * 12, [Y0, M0] = Mo.inicio.split("-").map(Number);
  const fechaDe = (i) => { const m = M0 - 1 + i; return { a: Y0 + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; };
  const claveDe = (i) => { const f = fechaDe(i); return `${f.a}-${String(f.m + 1).padStart(2, "0")}`; };
  const hoy = new Date(), iHoy = Math.max(0, Math.min(N - 1, (hoy.getFullYear() - Y0) * 12 + (hoy.getMonth() + 1 - M0)));
  const num = (n) => Math.round(n).toLocaleString("es-MX");
  const pesos = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("es-MX");
  // Dinero corto para que quepa en una columna: $850 k, $27.1 M, $2,507 M (siempre en millones, para comparar de un vistazo).
  const corto = (n) => { const a = Math.abs(n), s = n < 0 ? "−" : ""; return a >= 1e8 ? `${s}$${Math.round(a / 1e6).toLocaleString("es-MX")} M` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)} M` : a >= 1e4 ? `${s}$${Math.round(a / 1e3)} k` : `${s}$${Math.round(a).toLocaleString("es-MX")}`; };
  const cortoN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + " M" : n >= 1e4 ? Math.round(n / 1e3) + " k" : num(n));

  const BASE = Object.fromEntries(Mo.supuestos.map((s) => [s[0], s[2]]));
  // Llave nueva con el modelo a 18 años: los supuestos guardados del modelo anterior ya no aplican.
  const LLAVE = "vr_proy18";
  const S = Object.assign({ escenario: "base", vista: "anio", escala: "real", sup: {} }, (() => { try { return JSON.parse(localStorage.getItem(LLAVE) || "{}"); } catch { return {}; } })());
  if (!Mo.escenarios[S.escenario]) S.escenario = "base";
  const guardar = () => { try { localStorage.setItem(LLAVE, JSON.stringify(S)); } catch {} };
  const sup = (k) => (S.sup[k] != null && isFinite(S.sup[k]) ? +S.sup[k] : BASE[k]);

  // La ruta: una etapa por año, agrupadas en tramos (ciudades, países, continentes, a fondo).
  const ETAPAS = Mo.etapas || [], TRAMOS = Mo.tramos || [];
  const etapaDe = (y) => ETAPAS[Math.min(y, ETAPAS.length - 1)] || { tramo: "", lugar: "", que: "" };
  const nombreTramo = (k) => (TRAMOS.find((t) => t[0] === k) || [k, k])[1];
  // Los tramos como rangos de años seguidos: [{ clave, desde, hasta }]
  const RANGOS = ETAPAS.reduce((r, e, y) => { const u = r[r.length - 1]; if (u && u.clave === e.tramo) u.hasta = y; else r.push({ clave: e.tramo, desde: y, hasta: y }); return r; }, []);

  /* ── la cuenta, mes por mes ─────────────────────────────────────────── */
  function calcular() {
    const e = Mo.escenarios[S.escenario], meses = [];
    let puerta = 0, acum = 0;
    for (let i = 0; i < N; i++) {
      const y = Math.floor(i / 12);
      if (i < 12) puerta = Mo.anio1[i] * e.anio1;
      else { const f = 1 + (Mo.crecimiento[Math.min(y - 1, Mo.crecimiento.length - 1)] - 1) * e.crecer; puerta = puerta * Math.pow(Math.max(f, 1), 1 / 12); }
      const ingreso = puerta * sup("comision") / 100;
      const pt = y === 0 ? sup("tarjeta1") : y === 1 ? (sup("tarjeta1") + sup("tarjeta3")) / 2 : sup("tarjeta3");
      const tarjeta = puerta * pt / 100, video = puerta * sup("video") / 100;
      const equipo = Math.max(sup("equipoPiso"), ingreso * sup("equipo") / 100), marketing = Math.max(sup("marketingPiso"), ingreso * sup("marketing") / 100), soporte = Math.max(sup("soportePiso"), ingreso * sup("soporte") / 100);
      // Abrir lugares nuevos cuesta desde el año 2: el año 1 ya trae sus gastos en el plan.
      const expansion = y === 0 ? 0 : ingreso * sup("expansion") / 100;
      const gastos = tarjeta + video + equipo + marketing + soporte + expansion, utilidad = ingreso - gastos; acum += utilidad;
      const r = REAL[claveDe(i)];
      meses.push({ i, anio: y, puerta, ingreso, tarjeta, video, equipo, marketing, soporte, expansion, gastos, utilidad, acum, creadores: puerta / sup("porCreador"), personas: puerta / sup("porPersona"), real: r && i <= iHoy ? r.casa : null, realPuerta: r && i <= iHoy ? r.puerta : null });
    }
    return meses;
  }
  // Por año: el dinero se suma; los usuarios son los del último mes del año.
  function porAnio(meses) {
    const out = [];
    for (let y = 0; y < Mo.anios; y++) {
      const ms = meses.slice(y * 12, y * 12 + 12), s = (k) => ms.reduce((n, m) => n + m[k], 0), ult = ms[ms.length - 1];
      const reales = ms.filter((m) => m.real != null);
      out.push({ i: y, anio: y, puerta: s("puerta"), ingreso: s("ingreso"), tarjeta: s("tarjeta"), video: s("video"), equipo: s("equipo"), marketing: s("marketing"), soporte: s("soporte"), expansion: s("expansion"), gastos: s("gastos"), utilidad: s("utilidad"), acum: ult.acum, creadores: ult.creadores, personas: ult.personas, real: reales.length ? reales.reduce((n, m) => n + m.real, 0) : null, realPuerta: reales.length ? reales.reduce((n, m) => n + m.realPuerta, 0) : null });
    }
    return out;
  }

  /* ── controles ──────────────────────────────────────────────────────── */
  function pintarControles() {
    $("proy-escenarios").innerHTML = Object.entries(Mo.escenarios).map(([k, e]) => `<button type="button" data-esc="${k}" class="${S.escenario === k ? "on" : ""}">${esc(e.nombre)}</button>`).join("");
    $("proy-vistas").innerHTML = `<button type="button" data-vista="anio" class="${S.vista === "anio" ? "on" : ""}">Año por año</button><button type="button" data-vista="mes" class="${S.vista === "mes" ? "on" : ""}">Mes por mes</button><button type="button" data-escala class="${S.escala === "log" ? "on" : ""}" title="Con la escala real, los primeros años casi no se ven junto a los últimos. Esta los deja ver.">Ver el arranque de cerca</button>`;
    $("proy-nota-escenario").textContent = Mo.escenarios[S.escenario].nota;
    document.querySelectorAll("[data-esc]").forEach((b) => (b.onclick = () => { S.escenario = b.dataset.esc; guardar(); pintar(); }));
    document.querySelectorAll("[data-vista]").forEach((b) => (b.onclick = () => { S.vista = b.dataset.vista; guardar(); pintar(true); }));
    document.querySelector("[data-escala]").onclick = () => { S.escala = S.escala === "log" ? "real" : "log"; guardar(); pintar(); };
  }
  function pintarSupuestos() {
    $("proy-supuestos").innerHTML = Mo.supuestos.map((s) => `<label title="${esc(s[5])}"><span>${esc(s[1])}<small>${esc(s[5])}</small></span><div>${s[3] === "$" ? "<i>$</i>" : ""}<input type="number" inputmode="decimal" data-sup="${s[0]}" value="${sup(s[0])}" step="${s[4]}" min="0">${s[3] === "%" ? "<i>%</i>" : ""}</div></label>`).join("");
    $("proy-supuestos").querySelectorAll("[data-sup]").forEach((inp) => (inp.oninput = () => { const v = parseFloat(inp.value); if (isFinite(v) && v >= 0) S.sup[inp.dataset.sup] = v; else delete S.sup[inp.dataset.sup]; guardar(); pintar(false, true); }));
    $("proy-restaurar").onclick = () => { S.sup = {}; S.escenario = "base"; guardar(); pintarSupuestos(); pintar(); };
  }

  /* ── resumen: lo que hay que saber antes de recorrer la curva ───────── */
  function pintarResumen(meses) {
    const mesTxt = (i) => { const f = fechaDe(i); return `${MES[f.m]} ${f.a}`; };
    // Punto de equilibrio: el primer mes con utilidad que ya no vuelve a números rojos.
    let eq = -1; for (let i = N - 1; i >= 0; i--) { if (meses[i].utilidad < 0) break; eq = i; }
    const hondo = meses.reduce((a, m) => (m.acum < a.acum ? m : a), meses[0]);
    const anio = (y, k) => meses.slice(y * 12, y * 12 + 12).reduce((n, m) => n + m[k], 0);
    const t = (valor, etiqueta, nota) => `<div class="gtm-ind-gordo"><span>${etiqueta}</span><b>${valor}</b><small>${nota}</small></div>`;
    // Un año de la cuenta: lo que recibe la casa, dónde va la ruta y con cuánta gente.
    const delAnio = (y) => { const fin = meses[y * 12 + 11]; return t(corto(anio(y, "ingreso")), `Ingreso del año ${y + 1}`, `${esc(etapaDe(y).lugar)} · ${cortoN(fin.creadores)} creadores · queda ${corto(anio(y, "utilidad"))}`); };
    const ULT = Mo.anios - 1;
    $("proy-resumen").innerHTML =
      t(hondo.acum < 0 ? pesos(-hondo.acum) : "$0", "Lo que hay que poner", hondo.acum < 0 ? `lo más hondo de la bolsa, en ${mesTxt(hondo.i)}` : "la operación se paga sola desde el inicio") +
      t(eq < 0 ? "No llega" : eq === 0 ? "Desde el mes 1" : `Mes ${eq + 1}`, "Punto de equilibrio", eq < 0 ? "con estos supuestos, los gastos siempre ganan" : `${mesTxt(eq)}: desde aquí el ingreso ya paga los gastos`) +
      delAnio(0) + delAnio(4) + delAnio(9) + delAnio(ULT);
    // Contra una plataforma que ya existe, para tener idea del tamaño.
    const ref = Mo.referencia, cmp = $("proy-comparar");
    if (ref && cmp) {
      const fin = meses[N - 1], usd = anio(ULT, "puerta") / Math.max(sup("dolar"), 1), veces = usd / ref.dolaresAlAnio;
      const parte = veces >= 0.95 && veces <= 1.05 ? "lo mismo que" : veces < 1 ? `${Math.max(1, Math.round(veces * 100))} % de lo que` : `${veces.toFixed(1)} veces lo que`;
      cmp.textContent = `En este escenario, el año ${Mo.anios} cierra con ${num(Math.round(fin.creadores / 1000) * 1000)} creadores cobrando y una puerta de ${num(Math.round(usd / 1e6))} millones de dólares al año: ${parte} mueve ${ref.nombre} hoy.`;
    }
    return eq;
  }

  /* ── el lienzo: gráfica arriba, tabla abajo, mismas columnas ────────── */
  const ALTO = 348, ARRIBA = 38, ABAJO = 12;
  // La columna de los nombres, fija a la izquierda: más angosta en celular para que quepan dos años a la vista.
  let ETQ = 212;
  function pintarLienzo(meses, eq) {
    const porMes = S.vista === "mes", cols = porMes ? meses : porAnio(meses), n = cols.length;
    const cont = $("proy-scroll"); ETQ = cont.clientWidth < 520 ? 124 : 212;
    const ANCHO = porMes ? 84 : Math.max(cont.clientWidth < 520 ? 108 : 128, Math.floor((cont.clientWidth - ETQ) / 9));
    const W = n * ANCHO, H = ALTO - ARRIBA - ABAJO;
    const max = Math.max(1, ...cols.map((c) => Math.max(c.ingreso, c.gastos, c.real || 0)));
    const LOG = S.escala === "log", PISO = porMes ? 1000 : 10000;
    const yDe = (v) => { if (!LOG) return ARRIBA + H - (Math.max(v, 0) / max) * H; const a = Math.log10(PISO), b = Math.log10(Math.max(max, PISO * 10)); return ARRIBA + H - ((Math.log10(Math.max(v, PISO)) - a) / (b - a)) * H; };
    const xDe = (i) => i * ANCHO + ANCHO / 2;
    const linea = (k) => cols.map((c, i) => `${i ? "L" : "M"}${xDe(i).toFixed(1)},${yDe(c[k]).toFixed(1)}`).join(" ");
    // Marcas del eje: cuatro en escala real; potencias de diez en la otra.
    const marcas = []; if (LOG) { for (let p = Math.ceil(Math.log10(PISO)); Math.pow(10, p) <= max * 1.01; p++) marcas.push(Math.pow(10, p)); } else { const paso = (() => { const b = max / 4, m = Math.pow(10, Math.floor(Math.log10(b))), r = b / m; return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * m; })(); for (let v = paso; v <= max * 1.001; v += paso) marcas.push(v); }
    const iEq = eq < 0 ? -1 : porMes ? eq : Math.floor(eq / 12), iAhora = porMes ? iHoy : Math.floor(iHoy / 12);
    const bandas = porMes ? Array.from({ length: Mo.anios }, (_, y) => `<rect x="${y * 12 * ANCHO}" y="0" width="${12 * ANCHO}" height="${ALTO}" class="proy-banda${y % 2 ? " par" : ""}"/><text x="${y * 12 * ANCHO + 10}" y="24" class="proy-anio">Año ${y + 1} · ${fechaDe(y * 12).a}${fechaDe(y * 12 + 11).a !== fechaDe(y * 12).a ? "–" + String(fechaDe(y * 12 + 11).a).slice(2) : ""} · ${esc(etapaDe(y).lugar)}</text>`).join("") : cols.map((c, i) => `<rect x="${i * ANCHO}" y="0" width="${ANCHO}" height="${ALTO}" class="proy-banda${i % 2 ? " par" : ""}"/>`).join("");
    // La franja de arriba: en qué tramo de la ruta cae cada columna.
    const CPA = porMes ? 12 : 1;
    const franja = RANGOS.map((r) => `<rect x="${r.desde * CPA * ANCHO}" y="0" width="${(r.hasta - r.desde + 1) * CPA * ANCHO}" height="6" class="proy-franja t-${esc(r.clave)}"/>${porMes ? "" : `<text x="${r.desde * ANCHO + 10}" y="24" class="proy-anio t-${esc(r.clave)}">${esc(nombreTramo(r.clave))}</text>`}`).join("");
    const area = `M${xDe(0).toFixed(1)},${(ARRIBA + H).toFixed(1)} ` + cols.map((c, i) => `L${xDe(i).toFixed(1)},${yDe(c.ingreso).toFixed(1)}`).join(" ") + ` L${xDe(n - 1).toFixed(1)},${(ARRIBA + H).toFixed(1)} Z`;
    const reales = cols.map((c, i) => (c.real == null ? "" : `<circle cx="${xDe(i).toFixed(1)}" cy="${yDe(c.real).toFixed(1)}" r="5" class="proy-real"><title>Ingreso real: ${pesos(c.real)}</title></circle>`)).join("");
    const svg = `<svg class="proy-svg" width="${W}" height="${ALTO}" viewBox="0 0 ${W} ${ALTO}" role="img" aria-label="Curva de ingresos y curva de gastos">
      ${bandas}
      ${franja}
      ${marcas.map((v) => `<line x1="0" x2="${W}" y1="${yDe(v).toFixed(1)}" y2="${yDe(v).toFixed(1)}" class="proy-reja"/>`).join("")}
      <path d="${area}" class="proy-area"/>
      <path d="${linea("gastos")}" class="proy-linea gastos"/>
      <path d="${linea("ingreso")}" class="proy-linea ingreso"/>
      ${iEq >= 0 ? `<line x1="${xDe(iEq)}" x2="${xDe(iEq)}" y1="${ARRIBA - 4}" y2="${ARRIBA + H}" class="proy-eq"/><text x="${xDe(iEq) + 7}" y="${ARRIBA + 12}" class="proy-eq-txt">Punto de equilibrio</text>` : ""}
      <line x1="${xDe(iAhora)}" x2="${xDe(iAhora)}" y1="${ARRIBA - 4}" y2="${ARRIBA + H}" class="proy-hoy"/><text x="${xDe(iAhora) + 7}" y="${ARRIBA + H - 8}" class="proy-hoy-txt">Hoy</text>
      ${reales}
    </svg>`;
    const eje = `<div class="proy-eje" style="height:${ALTO}px;width:${ETQ}px"><span class="tit">${porMes ? "Al mes" : "Al año"}</span>${marcas.map((v) => `<span style="top:${yDe(v).toFixed(1)}px">${corto(v)}</span>`).join("")}</div>`;

    // La tabla: mismas columnas, mismo ancho.
    const etiqueta = (c, i) => { if (!porMes) return `<b>Año ${i + 1}</b><small>${fechaDe(i * 12).a}${fechaDe(i * 12 + 11).a !== fechaDe(i * 12).a ? "–" + String(fechaDe(i * 12 + 11).a).slice(2) : ""}</small>`; const f = fechaDe(i); return `<b>${MES[f.m]} ${String(f.a).slice(2)}</b><small>mes ${i + 1}</small>`; };
    const FILAS = [
      ["sep", "Usuarios" + (porMes ? "" : " al cierre del año")],
      ["creadores", "Creadores que cobran", cortoN, num], ["personas", "Personas que pagan", cortoN, num],
      ["sep", "Ingresos"],
      ["puerta", "Puerta (entradas y membresías)", corto, pesos], ["ingreso", "Ingreso de la casa", corto, pesos, "fuerte verde"], ["real", "Ingreso real, de la aplicación", (v) => (v == null ? "" : corto(v)), (v) => (v == null ? "" : pesos(v)), "oro"],
      ["sep", "Gastos"],
      ["tarjeta", "Cobro con tarjeta", corto, pesos], ["video", "Video e infraestructura", corto, pesos], ["equipo", "Equipo", corto, pesos], ["marketing", "Marketing", corto, pesos], ["expansion", "Abrir lugares nuevos", corto, pesos], ["soporte", "Soporte, legal y contabilidad", corto, pesos], ["gastos", "Gastos totales", corto, pesos, "fuerte rojo"],
      ["sep", "Resultado"],
      ["utilidad", porMes ? "Utilidad del mes" : "Utilidad del año", corto, pesos, "fuerte signo"], ["margen", "Margen sobre el ingreso", (v, c) => (c.ingreso ? Math.round((c.utilidad / c.ingreso) * 100) + " %" : "—"), (v, c) => "", "signoMargen"], ["acum", "Utilidad acumulada", corto, pesos, "signo"],
    ];
    const cuerpo = FILAS.map((f) => {
      if (f[0] === "sep") return `<tr class="sep"><th>${f[1]}</th><td colspan="${n}"></td></tr>`;
      return `<tr class="${f[4] || ""}"><th>${f[1]}</th>${cols.map((c) => { const v = f[0] === "margen" ? c.utilidad : c[f[0]]; const neg = (f[4] || "").includes("signo") && v < 0; return `<td class="${neg ? "neg" : ""}" title="${esc(f[3](v, c))}">${f[2](v, c)}</td>`; }).join("")}</tr>`;
    }).join("");
    // Dónde se abre: una celda por año (en la vista por mes abarca sus doce columnas).
    const ruta = `<tr class="etapa"><th>Dónde se abre</th>${Array.from({ length: Mo.anios }, (_, y) => { const e = etapaDe(y); return `<td colspan="${CPA}" class="t-${esc(e.tramo)}" title="${esc(e.que)}"><b>${esc(e.lugar)}</b>${porMes ? `<span>${esc(e.que)}</span>` : ""}</td>`; }).join("")}</tr>`;
    const tabla = `<table class="proy-tabla" style="width:${ETQ + W}px"><colgroup><col style="width:${ETQ}px">${cols.map(() => `<col style="width:${ANCHO}px">`).join("")}</colgroup>
      <thead><tr><th>${porMes ? "Mes" : "Año"}</th>${cols.map((c, i) => `<th class="${i === iAhora ? "hoy" : ""}${porMes && i % 12 === 0 ? " inicio" : ""}">${etiqueta(c, i)}</th>`).join("")}</tr></thead><tbody>${ruta}${cuerpo}</tbody></table>`;

    $("proy-lienzo").style.width = ETQ + W + "px";
    $("proy-lienzo").innerHTML = `<div class="proy-grafica" style="height:${ALTO}px">${eje}<div class="proy-plano" style="left:${ETQ}px">${svg}</div></div>${tabla}<div class="proy-cursor" id="proy-cursor" style="width:${ANCHO}px" hidden></div>`;
    $("proy-leyenda").innerHTML = `<span><i class="ingreso"></i>Ingreso de la casa</span><span><i class="gastos"></i>Gastos</span><span><i class="real"></i>Ingreso real hasta hoy</span><span><i class="eq"></i>Punto de equilibrio</span>${RANGOS.map((r) => `<span><i class="tramo t-${esc(r.clave)}"></i>${esc(nombreTramo(r.clave))}</span>`).join("")}<em>${n} ${porMes ? "meses" : "años"} · desliza →</em>`;

    // El cursor: una columna resaltada que cruza gráfica y tabla.
    const lz = $("proy-lienzo"), cur = $("proy-cursor");
    lz.onmousemove = (ev) => { const x = ev.clientX - lz.getBoundingClientRect().left - ETQ; if (x < 0) { cur.hidden = true; return; } const i = Math.min(n - 1, Math.floor(x / ANCHO)); cur.hidden = false; cur.style.left = ETQ + i * ANCHO + "px"; };
    lz.onmouseleave = () => (cur.hidden = true);
    return { ANCHO, n };
  }

  /* ── recorrer: deslizador, botones y el carril ──────────────────────── */
  function enlazarMando(geo) {
    const sc = $("proy-scroll"), dz = $("proy-deslizador");
    const tope = () => Math.max(1, sc.scrollWidth - sc.clientWidth);
    sc.onscroll = () => { dz.value = String(Math.round((sc.scrollLeft / tope()) * 1000)); };
    dz.oninput = () => { sc.scrollLeft = (dz.value / 1000) * tope(); };
    $("proy-inicio").onclick = () => sc.scrollTo({ left: Math.max(0, (S.vista === "mes" ? iHoy : Math.floor(iHoy / 12)) * geo.ANCHO - geo.ANCHO), behavior: "smooth" });
    $("proy-fin").onclick = () => sc.scrollTo({ left: tope(), behavior: "smooth" });
  }

  function pintar(alInicio, sinControles) {
    const sc = $("proy-scroll"), antes = sc.scrollLeft;
    if (!sinControles) pintarControles();
    const meses = calcular(), eq = pintarResumen(meses), geo = pintarLienzo(meses, eq);
    enlazarMando(geo);
    sc.scrollLeft = alInicio ? 0 : antes; sc.onscroll();
  }
  // La pestaña nace escondida y sin ancho: se pinta al abrirla, y de ahí en adelante se repinta.
  let listo = false;
  const visible = () => $("proy-scroll").clientWidth > 0;
  function ver() { if (!visible()) return; if (!listo) { listo = true; pintarSupuestos(); pintar(true); } else pintar(false, true); }
  let tr = 0; window.addEventListener("resize", () => { clearTimeout(tr); tr = setTimeout(() => { if (listo && visible()) pintar(false, true); }, 150); });
  window.Proyecciones = { ver };
  window.__proy = { calcular, porAnio, S };
  ver();
})();

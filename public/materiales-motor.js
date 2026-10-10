// RLR · Materiales: el motor que pinta. Cada pieza del catálogo se dibuja en
// un <canvas> con la tipografía de la casa, así se personaliza al instante
// (nombre, link, foto, QR) y se exporta nítida al tamaño real de cada red.
// Se dibuja directo en el lienzo (no SVG→imagen) porque es lo único que
// respeta la tipografía en todos los teléfonos, iPhone incluido.
//
// Un arquetipo es una forma de acomodar (hero, qrGrande, retrato, tipo,
// lista, bloque, anuncio, precio, cita, perfil, portada, banda, impreso,
// tarjeta, sticker); el catálogo dice qué texto lleva cada pieza.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const C = window.MaterialesCatalogo;
  const HOST = "video.capitaltorreon.com";
  const FUENTE = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const ROJO = "#FF4D55", TINTA = "#0D1117", VERDE = "#56EF9F";

  const PALETAS = {
    noche: { bg: TINTA, bg2: "#18212d", fg: "#FFFFFF", suave: "#A7AFBD", ac: VERDE, sobre: TINTA, tarjeta: "rgba(255,255,255,.07)", borde: "rgba(255,255,255,.16)", brillo: "86,239,159" },
    vivo: { bg: TINTA, bg2: "#1d1419", fg: "#FFFFFF", suave: "#A7AFBD", ac: VERDE, sobre: TINTA, tarjeta: "rgba(255,255,255,.07)", borde: "rgba(255,255,255,.16)", brillo: "255,77,85", anillo: ROJO },
    oro: { bg: TINTA, bg2: "#1f1b10", fg: "#FFFFFF", suave: "#A7AFBD", ac: "#F5C542", sobre: TINTA, tarjeta: "rgba(255,255,255,.07)", borde: "rgba(255,255,255,.16)", brillo: "245,197,66" },
    verde: { bg: VERDE, bg2: "#8bf7c0", fg: TINTA, suave: "rgba(13,17,23,.74)", ac: TINTA, sobre: VERDE, tarjeta: "rgba(13,17,23,.09)", borde: "rgba(13,17,23,.22)", brillo: "255,255,255", realce: "#FFFFFF" },
    claro: { bg: "#F3F5F7", bg2: "#FFFFFF", fg: TINTA, suave: "#566070", ac: "#0C9A57", sobre: "#FFFFFF", tarjeta: "#FFFFFF", borde: "rgba(13,17,23,.13)", brillo: "86,239,159" },
    papel: { bg: "#FFFFFF", bg2: "#FFFFFF", fg: TINTA, suave: "#566070", ac: "#0C9A57", sobre: "#FFFFFF", tarjeta: "#FFFFFF", borde: "rgba(13,17,23,.18)", brillo: "255,255,255" },
  };
  PALETAS.papel.b1 = TINTA; PALETAS.papel.b2 = VERDE;

  /* ── colores propios: principal y secundario ────────────────────────────
     Con los de casa (verde y tinta) las paletas son las de arriba, tal cual.
     Si la persona elige los suyos, cada paleta se deriva de esos dos colores
     cuidando que el texto siempre se lea (contraste mínimo). */
  const rgbDe = (hex) => { const h = String(hex || "").replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h.padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hexDe = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  const lum = (hex) => { const [r, g, b] = rgbDe(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contraste = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const mezcla = (a, b, t) => { const x = rgbDe(a), y = rgbDe(b); return hexDe(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
  const legible = (fondo) => (contraste("#FFFFFF", fondo) >= contraste(TINTA, fondo) ? "#FFFFFF" : TINTA);
  /** Acerca el color al blanco o al negro hasta que se lea sobre ese fondo. */
  function asegurar(color, fondo, min) { const hacia = legible(fondo); let c = color; for (let i = 0; i < 12 && contraste(c, fondo) < min; i++) c = mezcla(c, hacia, 0.14); return c; }
  const alfa = (hex, a) => { const [r, g, b] = rgbDe(hex); return `rgba(${r},${g},${b},${a})`; };
  function derivada(clave, c1, c2) {
    if (clave === "verde") { // el color principal de fondo
      const fg = contraste(c2, c1) >= 4.5 ? c2 : legible(c1), realce = fg === "#FFFFFF" ? asegurar(mezcla(c1, "#FFFFFF", 0.7), c1, 2.2) : "#FFFFFF";
      return { bg: c1, bg2: mezcla(c1, "#FFFFFF", 0.25), fg, suave: mezcla(fg, c1, 0.26), ac: fg, sobre: c1, tarjeta: alfa(fg, 0.09), borde: alfa(fg, 0.22), brillo: "255,255,255", realce };
    }
    if (clave === "claro" || clave === "papel") {
      const bg = clave === "papel" ? "#FFFFFF" : "#F3F5F7", fg = lum(c2) < 0.2 ? c2 : TINTA, ac = asegurar(c1, bg, 3);
      return { bg, bg2: "#FFFFFF", fg, suave: mezcla(fg, bg, 0.4), ac, sobre: legible(ac), tarjeta: "#FFFFFF", borde: alfa(fg, clave === "papel" ? 0.18 : 0.13), brillo: clave === "papel" ? "255,255,255" : rgbDe(c1).join(","), b1: fg, b2: c1 };
    }
    // noche: el secundario de fondo, el principal de acento
    const fg = legible(c2), ac = asegurar(c1, c2, 3);
    return { bg: c2, bg2: mezcla(c2, fg, 0.09), fg, suave: mezcla(fg, c2, 0.34), ac, sobre: contraste(c2, ac) >= 3 ? c2 : legible(ac), tarjeta: alfa(fg, 0.07), borde: alfa(fg, 0.16), brillo: rgbDe(ac).join(",") };
  }
  const C1 = VERDE.toUpperCase(), C2 = TINTA.toUpperCase();
  function paletaDe(pieza, d) {
    const estilo = d.estilo, c1 = String(d.c1 || C1).toUpperCase(), c2 = String(d.c2 || C2).toUpperCase();
    if (c1 === C1 && c2 === C2) { // los colores de casa
      if (pieza.p === "papel" || !estilo || estilo === "original") return PALETAS[pieza.p] || PALETAS.noche;
      const base = PALETAS[estilo] || PALETAS.noche;
      return pieza.p === "vivo" ? Object.assign({}, base, { anillo: ROJO }) : base;
    }
    const clave = pieza.p === "papel" ? "papel" : !estilo || estilo === "original" ? (pieza.p === "oro" || pieza.p === "vivo" ? "noche" : pieza.p) : estilo;
    const P = derivada(clave, c1, c2); if (pieza.p === "vivo") P.anillo = ROJO;
    return P;
  }

  /* ── primitivas ─────────────────────────────────────────────────────── */
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fuente(ctx, tam, peso) {
    ctx.font = `${peso} ${tam}px ${FUENTE}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = peso >= 700 && tam >= 54 ? `${(-tam * 0.028).toFixed(2)}px` : "0px";
  }
  function palabrasDe(par) {
    const out = []; let previoConEspacio = true;
    par.split("*").forEach((seg, i) => {
      // «no se graba*.» → el punto va pegado; «vivo *ahora*» → lleva su espacio.
      const pegadoAlAnterior = i > 0 && seg.length > 0 && !previoConEspacio && !/^\s/.test(seg);
      seg.split(/\s+/).filter(Boolean).forEach((w, j) => out.push({ t: w, a: i % 2 === 1, pegado: j === 0 && pegadoAlAnterior && out.length > 0 }));
      if (seg.length) previoConEspacio = /\s$/.test(seg);
    });
    return out;
  }
  /** Texto con ajuste: baja el tamaño hasta que quepa en `lineas` renglones de ancho `w`.
   *  *asteriscos* = color de acento. Devuelve {h, tam, ancho}. Con medir:true no pinta. */
  function texto(k, str, x, y, o) {
    const ctx = k.ctx, peso = o.peso || 800, il = o.il || (peso >= 700 ? 1.04 : 1.3), maxL = o.lineas || 3;
    let tam = o.tam; const min = o.min || tam * 0.4;
    str = String(str == null ? "" : str); if (o.may) str = str.toUpperCase();
    const parrafos = str.split("\n");
    let lineas, esp;
    for (;;) {
      fuente(ctx, tam, peso); esp = ctx.measureText(" ").width; lineas = []; let cabe = true;
      for (const par of parrafos) {
        let linea = [], ancho = 0;
        for (const p of palabrasDe(par)) {
          p.w = ctx.measureText(p.t).width;
          const sep = linea.length && !p.pegado ? esp : 0;
          if (linea.length && !p.pegado && ancho + sep + p.w > o.w) { lineas.push({ p: linea, w: ancho }); linea = [p]; ancho = p.w; }
          else { ancho += sep + p.w; linea.push(p); }
          if (ancho > o.w && linea.length === 1) cabe = false;
        }
        lineas.push({ p: linea, w: ancho });
      }
      if ((lineas.length <= maxL && cabe) || tam <= min) break;
      tam *= 0.95;
    }
    const h = lineas.length * tam * il, ancho = lineas.reduce((m, l) => Math.max(m, l.w), 0);
    if (o.medir) return { h, tam, ancho };
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    let yy = y + tam * 0.8 + (tam * il - tam) / 2;
    for (const l of lineas) {
      let xx = o.alin === "center" ? x + (o.w - l.w) / 2 : o.alin === "right" ? x + o.w - l.w : x;
      for (const p of l.p) {
        if (p !== l.p[0] && !p.pegado) xx += esp;
        ctx.fillStyle = p.a ? (o.acento || (k.P.ac === k.P.fg ? (k.P.realce || k.P.ac) : k.P.ac)) : (o.color || k.P.fg);
        ctx.fillText(p.t, xx, yy); xx += p.w;
      }
      yy += tam * il;
    }
    return { h, tam, ancho };
  }
  /** Píldora (etiqueta). `vivo` = roja con punto. x es el borde izquierdo, o el centro si alin center. */
  function pildora(k, str, x, y, o) {
    const ctx = k.ctx, tam = o.tam, padX = tam * 0.85, h = tam * 2.05;
    fuente(ctx, tam, 800); if ("letterSpacing" in ctx) ctx.letterSpacing = `${(tam * 0.06).toFixed(2)}px`;
    const punto = o.vivo ? tam * 0.95 : 0;
    const w = ctx.measureText(str).width + padX * 2 + punto;
    if (o.medir) return { w, h };
    const x0 = o.alin === "center" ? x - w / 2 : x;
    rr(ctx, x0, y, w, h, h / 2); ctx.fillStyle = o.vivo ? ROJO : (o.bg || k.P.ac); ctx.fill();
    ctx.fillStyle = o.vivo ? "#FFFFFF" : (o.fg || k.P.sobre);
    if (o.vivo) { ctx.beginPath(); ctx.arc(x0 + padX + tam * 0.3, y + h / 2, tam * 0.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText(str, x0 + padX + punto, y + h / 2 + tam * 0.04);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    return { w, h };
  }
  /** Píldora de contorno para el link. */
  function pildoraLink(k, str, cx, y, tam, maxW, medir) {
    const ctx = k.ctx; let t = tam; fuente(ctx, t, 800);
    while (ctx.measureText(str).width + t * 2 > maxW && t > tam * 0.36) { t *= 0.95; fuente(ctx, t, 800); }
    const w = ctx.measureText(str).width + t * 2, h = t * 2.2;
    if (medir) return { w, h };
    rr(ctx, cx - w / 2, y, w, h, h / 2); ctx.fillStyle = k.P.tarjeta; ctx.fill(); ctx.lineWidth = Math.max(2, t * 0.07); ctx.strokeStyle = k.P.ac; ctx.stroke();
    ctx.fillStyle = k.P.ac === TINTA ? TINTA : k.P.ac; ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.fillText(str, cx, y + h / 2 + t * 0.04); ctx.textAlign = "left";
    return { w, h };
  }
  const QRS = new Map();
  function matrizQR(url) {
    let m = QRS.get(url);
    if (!m) { const q = qrcode(0, "M"); q.addData(url); q.make(); const n = q.getModuleCount(); m = { n, d: [] }; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) m.d.push(r * n + c); QRS.set(url, m); if (QRS.size > 200) QRS.delete(QRS.keys().next().value); }
    return m;
  }
  /** QR en su tarjeta blanca (siempre blanco y tinta: es lo que leen todas las cámaras). */
  function qr(k, x, y, lado, o) {
    const ctx = k.ctx, m = matrizQR(k.url), pad = lado * 0.075, r = lado * 0.09;
    rr(ctx, x, y, lado, lado, r); ctx.fillStyle = "#FFFFFF"; ctx.fill();
    if (o && o.borde) { ctx.lineWidth = Math.max(2, lado * 0.008); ctx.strokeStyle = k.P.borde; ctx.stroke(); }
    const mod = (lado - pad * 2) / m.n; ctx.fillStyle = TINTA;
    for (const i of m.d) { const rr2 = Math.floor(i / m.n), cc = i % m.n; ctx.fillRect(x + pad + cc * mod - 0.2, y + pad + rr2 * mod - 0.2, mod + 0.4, mod + 0.4); }
  }
  /** Una foto redonda con aro; sin foto, la inicial (o una cámara si no hay nombre). */
  function unaFoto(k, im, cx, cy, r, o) {
    const ctx = k.ctx, d = k.d, grosor = (o && o.grosor) || r * 0.07, aro = (o && o.aro) || k.P.anillo || k.P.ac;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
    if (im) {
      ctx.clip(); const s = Math.max((2 * r) / im.width, (2 * r) / im.height);
      ctx.drawImage(im, cx - (im.width * s) / 2, cy - (im.height * s) / 2, im.width * s, im.height * s);
    } else {
      ctx.fillStyle = k.P.bg2; ctx.fill();
      if (k.pers && !k.vr && d.nombre) { fuente(ctx, r * 1.05, 800); ctx.fillStyle = k.P.ac; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(d.nombre.trim().charAt(0).toUpperCase(), cx, cy + r * 0.06); ctx.textAlign = "left"; }
      else { // cámara
        const w = r * 0.78, h = r * 0.56; ctx.fillStyle = k.P.ac; rr(ctx, cx - w * 0.62, cy - h / 2, w, h, h * 0.2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + w * 0.44, cy); ctx.lineTo(cx + w * 0.82, cy - h * 0.42); ctx.lineTo(cx + w * 0.82, cy + h * 0.42); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r + grosor * 0.9, 0, Math.PI * 2); ctx.lineWidth = grosor; ctx.strokeStyle = aro; ctx.stroke();
  }
  /** La foto de la pieza: una, o dos encimadas dentro del mismo espacio (2r de ancho). */
  function foto(k, cx, cy, r, o) {
    const fs = k.conFoto ? k.fotos : [];
    if (fs.length < 2) return unaFoto(k, fs[0] || null, cx, cy, r, o);
    const r2 = r * 0.66, dx = r * 0.36, g = ((o && o.grosor) || r * 0.07) * 0.85, o2 = Object.assign({}, o, { grosor: g });
    unaFoto(k, fs[0], cx - dx, cy, r2, o2);
    k.ctx.beginPath(); k.ctx.arc(cx + dx, cy, r2 + g * 2.6, 0, Math.PI * 2); k.ctx.fillStyle = (o && o.fondo) || k.P.bg; k.ctx.fill(); // respiro entre las dos
    unaFoto(k, fs[1], cx + dx, cy, r2, o2);
  }
  function marca(k, x, y, tam, alin, color) {
    const ctx = k.ctx; fuente(ctx, tam, 800); if ("letterSpacing" in ctx) ctx.letterSpacing = `${(-tam * 0.02).toFixed(2)}px`;
    const w1 = ctx.measureText("Video").width, w2 = ctx.measureText("Room").width, w = w1 + w2;
    const x0 = alin === "center" ? x - w / 2 : alin === "right" ? x - w : x;
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.fillStyle = color || k.P.fg; ctx.fillText("Video", x0, y + tam * 0.8);
    ctx.fillStyle = color || (k.P.ac === k.P.fg ? (k.P.realce || k.P.fg) : k.P.ac); ctx.fillText("Room", x0 + w1, y + tam * 0.8);
    return w;
  }
  function fondo(k, deco, cx, cy) {
    const { ctx, W, H, P } = k, m = Math.max(W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    const halo = (x, y, r, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${P.brillo},${a})`); g.addColorStop(1, `rgba(${P.brillo},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    if (deco === "brillo") { halo(cx == null ? W * 0.92 : cx, cy == null ? H * 0.06 : cy, m * 0.7, 0.3); halo(W * 0.02, H * 0.98, m * 0.5, 0.14); }
    if (deco === "anillos") {
      const x = cx == null ? W * 0.5 : cx, y = cy == null ? H * 0.3 : cy; halo(x, y, m * 0.6, 0.22);
      ctx.lineWidth = Math.max(2, m * 0.0022);
      for (let i = 1; i <= 6; i++) { ctx.beginPath(); ctx.arc(x, y, m * 0.11 * i + m * 0.06, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${P.brillo},${(0.2 - i * 0.027).toFixed(3)})`; ctx.stroke(); }
    }
    if (deco === "puntos") {
      const paso = Math.min(W, H) * 0.055; ctx.fillStyle = P.borde;
      for (let y = paso / 2; y < H; y += paso) for (let x = paso / 2; x < W; x += paso) { ctx.beginPath(); ctx.arc(x, y, paso * 0.045, 0, Math.PI * 2); ctx.fill(); }
      halo(W * 0.5, H * 0.45, m * 0.55, 0.2);
    }
    if (deco === "banda") {
      halo(W * 0.95, H * 0.02, m * 0.6, 0.24);
      ctx.save(); ctx.translate(W * 0.74, -H * 0.02); ctx.rotate(-Math.PI / 5);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(${P.brillo},${(0.2 - i * 0.035).toFixed(3)})`; ctx.fillRect(-W, i * m * 0.045, W * 2.4, m * 0.018); }
      ctx.restore();
    }
  }

  /* ── flujo vertical: mide, centra y pinta una pila de elementos ─────── */
  function alto(k, it, x, w, alin, esc) {
    if (it.t === "esp") return it.h * esc;
    if (it.t === "pildora") return pildora(k, it.str, 0, 0, { tam: it.tam * esc, vivo: it.vivo, medir: true }).h;
    if (it.t === "fn") return it.h;
    if (it.t === "fila") return it.tam * esc * (it.nota ? 2.75 : 2.25);
    if (it.t === "vineta") { const r = it.tam * esc * 0.72; const m = texto(k, it.str, 0, 0, { w: w - r * 2 - it.tam * 0.6, tam: it.tam * esc, peso: 600, lineas: 2, il: 1.22, medir: true }); it._tam = m.tam; it._th = m.h; return Math.max(r * 2, m.h) + it.tam * esc * 0.62; }
    const m = texto(k, it.str, 0, 0, Object.assign({}, it, { w, tam: it.tam * esc, min: it.min ? it.min * esc : undefined, medir: true })); it._tam = m.tam; return m.h;
  }
  function flujo(k, items, x, w, y0, y1, o) {
    o = o || {}; const alin = o.alin || "left"; items = items.filter(Boolean);
    let esc = 1, total = 0;
    for (let i = 0; i < 9; i++) { total = 0; for (const it of items) { it._h = alto(k, it, x, w, alin, esc); total += it._h; } if (total <= y1 - y0 || esc < 0.55) break; esc *= 0.93; }
    let y = o.vert === "arriba" ? y0 : o.vert === "abajo" ? y1 - total : y0 + Math.max(0, (y1 - y0 - total) / 2);
    for (const it of items) {
      if (it.t === "pildora") pildora(k, it.str, alin === "center" ? x + w / 2 : x, y, { tam: it.tam * esc, vivo: it.vivo, alin, bg: it.bg, fg: it.fg });
      else if (it.t === "fn") it.dib(x, y, w);
      else if (it.t === "fila") {
        // País a la izquierda, hora a la derecha; el renglón principal va resaltado.
        const ctx = k.ctx, tam = it.tam * esc, h = it._h, pad = tam * 0.7, P = k.P, colorHora = P.ac === P.fg ? (P.realce || P.fg) : P.ac;
        if (it.resalta) { rr(ctx, x, y + h * 0.06, w, h * 0.88, tam * 0.55); ctx.fillStyle = P.tarjeta; ctx.fill(); ctx.lineWidth = Math.max(2, tam * 0.05); ctx.strokeStyle = P.borde; ctx.stroke(); }
        else { ctx.fillStyle = P.borde; ctx.fillRect(x + pad, y + h - Math.max(1, tam * 0.03), w - pad * 2, Math.max(1, tam * 0.03)); }
        const mH = texto(k, it.der, 0, 0, { w: w * 0.5, tam: tam * 1.12, lineas: 1, medir: true });
        const yT = y + (h - tam * 1.1 - (it.nota ? tam * 0.62 : 0)) / 2;
        texto(k, it.izq, x + pad, yT, { w: w - pad * 2 - mH.ancho - tam * 0.6, tam, lineas: 1, peso: 800 });
        if (it.nota) texto(k, it.nota, x + pad, yT + tam * 1.12, { w: w - pad * 2 - mH.ancho - tam * 0.6, tam: tam * 0.52, lineas: 1, peso: 600, color: P.suave });
        texto(k, it.der, x + w - pad - mH.ancho, y + (h - mH.h) / 2, { w: mH.ancho + 2, tam: mH.tam, min: mH.tam, lineas: 1, color: colorHora });
      }
      else if (it.t === "vineta") {
        const r = it.tam * esc * 0.72, ctx = k.ctx, cy = y + Math.max(r, it._th / 2);
        ctx.beginPath(); ctx.arc(x + r, cy, r, 0, Math.PI * 2); ctx.fillStyle = k.P.ac; ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + r * 0.58, cy + r * 0.02); ctx.lineTo(x + r * 0.9, cy + r * 0.34); ctx.lineTo(x + r * 1.45, cy - r * 0.32); ctx.lineWidth = r * 0.24; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = k.P.sobre; ctx.stroke();
        texto(k, it.str, x + r * 2 + it.tam * 0.6, y + Math.max(0, r - it._th / 2), { w: w - r * 2 - it.tam * 0.6, tam: it._tam, min: it._tam, peso: 600, lineas: 2, il: 1.22 });
      } else if (it.t !== "esp") texto(k, it.str, x, y, Object.assign({}, it, { w, tam: it._tam, min: it._tam, alin }));
      y += it._h;
    }
    return y;
  }
  const T = (str, tam, o) => Object.assign({ t: "texto", str, tam }, o || {});
  const E = (h) => ({ t: "esp", h });

  /** Pie de identidad. Con la sala de la persona: renglón con foto y nombre a la
   *  izquierda y el QR a la derecha, y debajo el link a todo lo ancho (así se
   *  lee aunque sea largo). Sin personalizar o hablando de Video Room: la marca
   *  y el dominio. Devuelve dónde empieza. */
  function pie(k) {
    const { W, H, P, d, mx } = k, v = k.forma === "vertical";
    const lado = k.conQR ? W * (v ? 0.27 : 0.2) : 0, y1 = H - k.bot, wTodo = W - mx * 2;
    const colorLink = P.ac === P.fg ? P.fg : P.ac;
    if (k.pers && !k.vr) {
      const mLink = texto(k, k.linkVis, 0, 0, { w: wTodo, tam: W * 0.046, peso: 800, lineas: 1, medir: true });
      const hLink = mLink.h + W * 0.02, yLink = y1 - mLink.h;
      texto(k, k.linkVis, mx, yLink, { w: wTodo, tam: mLink.tam, min: mLink.tam, peso: 800, lineas: 1, color: colorLink });
      const r = W * 0.062, conFoto = k.conFoto, yFila1 = yLink - W * 0.035;
      const hFila = Math.max(lado, conFoto ? r * 2.2 : 0, W * 0.13), yFila0 = yFila1 - hFila;
      if (lado) qr(k, W - mx - lado, yFila1 - lado, lado);
      let x = mx, w = wTodo - (lado ? lado + W * 0.045 : 0);
      if (conFoto) { foto(k, mx + r, yFila1 - r * 1.1, r * 0.94, { grosor: r * 0.09 }); x += r * 2 + W * 0.04; w -= r * 2 + W * 0.04; }
      const items = [T(lado ? "ESCANEA O ENTRA AQUÍ" : "ENTRA AQUÍ", W * 0.027, { peso: 800, color: P.suave, lineas: 1 }), E(W * 0.01), d.nombre && T(d.nombre, W * 0.06, { lineas: 2, il: 1.02 })];
      flujo(k, items, x, w, yFila1 - Math.max(conFoto ? r * 2.2 : 0, W * 0.13), yFila1, { vert: conFoto ? "centro" : "abajo" });
      return yFila0 - W * 0.05;
    }
    if (lado) qr(k, W - mx - lado, y1 - lado, lado);
    const wT = wTodo - (lado ? lado + W * 0.045 : 0);
    const items = [{ t: "fn", h: W * 0.085, dib: (x, y) => marca(k, x, y, W * 0.07) }, T(HOST, W * 0.042, { peso: 700, color: P.ac === P.fg ? P.suave : P.ac, lineas: 1 })];
    if (k.vr && k.pers && d.nombre) items.push(E(W * 0.008), T(`Te lo recomienda ${d.nombre}`, W * 0.03, { peso: 500, color: P.suave, lineas: 1 }));
    let total = 0; for (const it of items) { it._h = alto(k, it, mx, wT, "left", 1); total += it._h; }
    const altoPie = Math.max(lado, total), y0 = y1 - altoPie;
    flujo(k, items, mx, wT, y0, y1, { vert: lado ? "centro" : "abajo" });
    return y0 - W * 0.05;
  }
  const cabeza = (k, color) => { marca(k, k.mx, k.top, k.W * 0.044, "left", color); return k.top + k.W * 0.085; };

  /* ── arquetipos (vertical, cuadrado, retrato) ───────────────────────── */
  const A = {};
  A.hero = (k, c) => {
    const { W, mx } = k, v = k.forma === "vertical";
    fondo(k, "brillo"); const yP = pie(k), y0 = cabeza(k);
    flujo(k, [c.k && { t: "pildora", str: c.k, tam: W * 0.03, vivo: c.vivo }, c.k && E(W * 0.04), T(c.t, W * (v ? 0.14 : 0.118), { lineas: v ? 5 : 4 }), c.s && E(W * 0.035), c.s && T(c.s, W * 0.045, { peso: 500, color: k.P.suave, lineas: 3 })], mx, W - mx * 2, y0, yP);
  };
  A.tipo = (k, c) => {
    const { W, mx, ctx } = k;
    fondo(k, "banda"); const yP = pie(k), y0 = cabeza(k);
    const n = c.t.split("\n").length;
    const fin = flujo(k, [T(c.t, W * 0.2, { lineas: n + 1, il: 0.98, may: true }), E(W * 0.05), { t: "fn", h: W * 0.022, dib: (x, y) => { ctx.fillStyle = k.P.ac === k.P.fg ? (k.P.realce || k.P.fg) : k.P.ac; rr(ctx, x, y, W * 0.24, W * 0.022, W * 0.011); ctx.fill(); } }], mx, W - mx * 2, y0, yP);
    return fin;
  };
  A.lista = (k, c) => {
    const { W, mx } = k;
    fondo(k, "brillo", W * 0.05, k.H * 0.1); const yP = pie(k), y0 = cabeza(k);
    flujo(k, [c.k && { t: "pildora", str: c.k, tam: W * 0.028 }, c.k && E(W * 0.035), T(c.t, W * 0.09, { lineas: 3 }), E(W * 0.05)].concat((c.b || []).map((b) => ({ t: "vineta", str: b, tam: W * 0.047 }))), mx, W - mx * 2, y0, yP);
  };
  A.precio = (k, c) => {
    const { W, mx } = k;
    fondo(k, "anillos", W * 0.78, k.H * 0.34); const yP = pie(k), y0 = cabeza(k);
    flujo(k, [c.k && { t: "pildora", str: c.k, tam: W * 0.028 }, c.k && E(W * 0.02), T(c.n, W * 0.36, { lineas: 1, color: k.P.ac === k.P.fg ? (k.P.realce || k.P.fg) : k.P.ac, il: 1 }), T(c.t, W * 0.075, { lineas: 2 }), c.s && E(W * 0.03), c.s && T(c.s, W * 0.042, { peso: 500, color: k.P.suave, lineas: 3 })], mx, W - mx * 2, y0, yP);
  };
  A.cita = (k, c) => {
    const { W, mx, ctx } = k, v = k.forma === "vertical";
    fondo(k, "brillo", W * 0.1, k.H * 0.2);
    fuente(ctx, W * 0.75, 800); ctx.globalAlpha = 0.16; ctx.fillStyle = k.P.ac === k.P.fg ? (k.P.realce || k.P.fg) : k.P.ac; ctx.textBaseline = "alphabetic"; ctx.fillText("“", mx - W * 0.04, k.top + W * (v ? 0.78 : 0.62)); ctx.globalAlpha = 1;
    const yP = pie(k), y0 = cabeza(k), firma = c.firma || (k.pers && k.d.nombre);
    flujo(k, [T(c.t, W * (v ? 0.125 : 0.105), { lineas: 6, acento: k.P.ac === k.P.fg ? (k.P.realce || k.P.fg) : k.P.ac }), firma && E(W * 0.045), firma && T("— " + firma, W * 0.044, { peso: 600, color: k.P.suave, lineas: 1 })], mx, W - mx * 2, y0, yP);
  };
  A.bloque = (k, c) => {
    const { W, mx, ctx, P } = k;
    fondo(k, "ninguno"); const yP = pie(k), yB = yP + W * 0.005;
    const colorBloque = P.ac, r = W * 0.08;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, yB - r); ctx.arcTo(W, yB, W - r, yB, r); ctx.lineTo(r, yB); ctx.arcTo(0, yB, 0, yB - r, r); ctx.closePath(); ctx.fillStyle = colorBloque; ctx.fill();
    const inv = { bg: colorBloque, bg2: colorBloque, fg: P.sobre, suave: P.sobre, ac: P.realce || P.sobre, sobre: colorBloque, tarjeta: P.tarjeta, borde: P.borde, brillo: P.brillo };
    const k2 = Object.assign({}, k, { P: inv }); const y0 = cabeza(k2, P.sobre);
    ctx.globalAlpha = 1;
    flujo(k2, [c.k && { t: "pildora", str: c.k, tam: W * 0.028, bg: P.sobre, fg: colorBloque }, c.k && E(W * 0.04), T(c.t, W * 0.115, { lineas: 5 }), c.s && E(W * 0.035), c.s && T(c.s, W * 0.046, { peso: 600, lineas: 4 })], mx, W - mx * 2, y0, yB - W * 0.06);
  };
  A.anuncio = (k, c) => {
    const { W, mx, ctx, P, d } = k, w = W - mx * 2;
    fondo(k, "anillos", W * 0.85, k.H * 0.16); const yP = pie(k), y0 = cabeza(k);
    // Una fecha larga se parte en dos renglones limpios: el día arriba, la hora abajo.
    const cuando = partirCuando((d.cuando || "Hoy").toUpperCase()), tema = d.tema || "En vivo en mi sala";
    const otros = (d.horarios || []).slice(1);
    const hPil = pildora(k, c.k || "PRÓXIMO EN VIVO", 0, 0, { tam: W * 0.03, medir: true }).h + W * 0.045;
    // La tarjeta se encoge hasta caber entre la cabeza y el pie (temas largos, formatos bajos).
    let e = 1, interior, hTar, pad;
    for (;;) {
      pad = W * 0.06 * e;
      interior = [T(cuando, W * 0.15 * e, { lineas: cuando.includes("\n") || cuando.length > 14 ? 2 : 1, min: W * 0.07 * e, color: P.ac === P.fg ? (P.realce || P.fg) : P.ac, il: 1 }), d.fechaLarga && E(W * 0.012 * e), d.fechaLarga && T(d.fechaLarga + (otros.length ? ` · hora de ${d.horarios[0].pais}` : ""), W * 0.036 * e, { peso: 600, color: P.suave, lineas: 2 }), E(W * 0.03 * e), { t: "fn", h: W * 0.006, dib: (x, y, ww) => { ctx.fillStyle = P.borde; ctx.fillRect(x, y, ww, Math.max(2, W * 0.003)); } }, E(W * 0.035 * e), T(tema, W * 0.07 * e, { lineas: 3 }), k.pers && d.nombre && E(W * 0.02 * e), k.pers && d.nombre && T("con " + d.nombre, W * 0.04 * e, { peso: 600, color: P.suave, lineas: 1 }),
        otros.length && E(W * 0.03 * e), otros.length && T(otros.map((h) => `${h.pais} *${h.hora}*${h.nota ? ` (${h.nota})` : ""}`).join("  ·  "), W * 0.038 * e, { peso: 700, color: P.suave, lineas: 3, il: 1.35 })].filter(Boolean);
      let hInt = 0; for (const it of interior) hInt += alto(k, it, 0, w - pad * 2, "left", 1);
      hTar = hInt + pad * 2;
      if (hTar + hPil <= yP - y0 || e < 0.5) break;
      e *= 0.93;
    }
    const interiorFinal = interior, padFinal = pad, hFinal = hTar;
    flujo(k, [{ t: "pildora", str: c.k || "PRÓXIMO EN VIVO", tam: W * 0.03 }, E(W * 0.045), { t: "fn", h: hFinal, dib: (x, y) => { rr(ctx, x, y, w, hFinal, W * 0.05); ctx.fillStyle = P.tarjeta; ctx.fill(); ctx.lineWidth = Math.max(2, W * 0.003); ctx.strokeStyle = P.borde; ctx.stroke(); flujo(k, interiorFinal, x + padFinal, w - padFinal * 2, y + padFinal, y + hFinal - padFinal, { vert: "arriba" }); } }], mx, w, y0, yP);
  };
  A.qrGrande = (k, c) => {
    const { W, H, mx, P, d } = k, v = k.forma === "vertical", w = W - mx * 2;
    fondo(k, "puntos"); marca(k, W / 2, k.top, W * 0.044, "center");
    const lado = W * (v ? 0.66 : 0.44), items = [c.k && { t: "pildora", str: c.k, tam: W * 0.03 }, c.k && E(W * 0.035), T(c.t, W * (v ? 0.1 : 0.075), { lineas: 2 }), E(W * 0.05)];
    if (k.conQR) items.push({ t: "fn", h: lado, dib: (x, y) => qr(k, W / 2 - lado / 2, y, lado, { borde: true }) }, E(W * 0.045));
    const pl = pildoraLink(k, k.linkVis, 0, 0, W * (k.conQR ? 0.042 : 0.06), w, true);
    items.push({ t: "fn", h: pl.h, dib: (x, y) => pildoraLink(k, k.linkVis, W / 2, y, W * (k.conQR ? 0.042 : 0.06), w) });
    if (k.pers && d.nombre) items.push(E(W * 0.03), T(d.nombre, W * 0.045, { lineas: 1, color: P.suave, peso: 700 }));
    flujo(k, items, mx, w, k.top + W * 0.085, H - k.bot, { alin: "center" });
  };
  A.retrato = (k, c) => {
    const { W, H, mx, P, d } = k, v = k.forma === "vertical", w = W - mx * 2;
    const r = W * (v ? 0.21 : k.forma === "retrato" ? 0.17 : 0.13), lado = W * (v ? 0.24 : 0.17);
    const y0 = k.top + W * 0.085, items = [{ t: "fn", h: r * 2 + r * 0.3, dib: (x, y) => { foto(k, W / 2, y + r + r * 0.1, r); } }, E(W * 0.035)];
    if (k.pers && d.nombre) items.push(T(d.nombre, W * 0.085, { lineas: 2 }), E(W * 0.012));
    items.push(T(c.t, W * (k.pers && d.nombre ? 0.05 : 0.08), { lineas: 2, peso: k.pers && d.nombre ? 700 : 800, color: k.pers && d.nombre ? (P.ac === P.fg ? P.suave : P.ac) : P.fg }));
    if (c.s && v) items.push(E(W * 0.02), T(c.s, W * 0.04, { peso: 500, color: P.suave, lineas: 2 }));
    items.push(E(W * 0.04));
    const pl = pildoraLink(k, k.linkVis, 0, 0, W * 0.042, w, true);
    items.push({ t: "fn", h: pl.h, dib: (x, y) => pildoraLink(k, k.linkVis, W / 2, y, W * 0.042, w) });
    if (k.conQR) items.push(E(W * 0.04), { t: "fn", h: lado, dib: (x, y) => qr(k, W / 2 - lado / 2, y, lado) });
    // se mide primero para centrar los anillos detrás de la foto
    let total = 0; for (const it of items) total += alto(k, it, mx, w, "center", 1);
    const yIni = y0 + Math.max(0, (H - k.bot - y0 - total) / 2);
    fondo(k, "anillos", W / 2, yIni + r * 1.1); marca(k, W / 2, k.top, W * 0.044, "center");
    flujo(k, items, mx, w, y0, H - k.bot, { alin: "center" });
  };
  A.perfil = (k, c) => {
    const { W, H, ctx } = k, r = W * 0.405;
    fondo(k, "brillo", W / 2, H / 2);
    foto(k, W / 2, H * 0.47, r, { grosor: W * 0.034, aro: ROJO });
    const p = pildora(k, c.k || "EN VIVO", 0, 0, { tam: W * 0.062, vivo: true, medir: true });
    ctx.save(); rr(ctx, W / 2 - p.w / 2 - W * 0.014, H * 0.47 + r - p.h * 0.5 - W * 0.014, p.w + W * 0.028, p.h + W * 0.028, p.h); ctx.fillStyle = k.P.bg; ctx.fill(); ctx.restore();
    pildora(k, c.k || "EN VIVO", W / 2, H * 0.47 + r - p.h * 0.5, { tam: W * 0.062, vivo: true, alin: "center" });
  };

  /* ── horarios por país: el post que lista todas las horas ────────────── */
  A.horarios = (k, c) => {
    const { W, mx, P, d, ctx } = k, w = W - mx * 2, hs = d.horarios || [];
    fondo(k, "brillo", W * 0.9, k.H * 0.08); const yP = pie(k), y0 = cabeza(k);
    // En vertical sobra alto: todo más grande. En cuadrado manda la lista: título corto y sin etiqueta.
    const v = k.forma === "vertical", cuad = k.forma === "cuadrado";
    const items = [!cuad && { t: "pildora", str: c.k || "HORARIOS", tam: W * 0.03 }, !cuad && E(W * 0.035), T(d.tema || c.t || "En vivo en mi sala", W * (v ? 0.095 : cuad ? 0.062 : 0.08), { lineas: cuad ? 1 : 2 })];
    if (d.fechaLarga) items.push(E(W * 0.016), T(d.fechaLarga, W * (v ? 0.052 : 0.044), { peso: 700, color: P.ac === P.fg ? (P.realce || P.fg) : P.ac, lineas: 1 }));
    items.push(E(W * (v ? 0.05 : 0.03)));
    if (hs.length) hs.forEach((h, i) => items.push({ t: "fila", izq: h.pais, der: h.hora, nota: h.nota, tam: W * (v ? 0.062 : cuad ? 0.046 : 0.052), resalta: i === 0 }));
    else { // todavía no eligen fecha: se dice de frente, no se inventa una hora
      const hT = W * 0.3;
      items.push({ t: "fn", h: hT, dib: (x, y) => { rr(ctx, x, y, w, hT, W * 0.04); ctx.fillStyle = P.tarjeta; ctx.fill(); ctx.setLineDash([W * 0.02, W * 0.014]); ctx.lineWidth = Math.max(2, W * 0.003); ctx.strokeStyle = P.borde; ctx.stroke(); ctx.setLineDash([]); flujo(k, [T("Elige la fecha y la hora arriba, en «Cuándo»", W * 0.046, { lineas: 3, peso: 700 }), E(W * 0.012), T("y aquí aparecen los horarios de cada país.", W * 0.036, { lineas: 2, peso: 500, color: P.suave })], x + W * 0.05, w - W * 0.1, y, y + hT, { alin: "center" }); } });
    }
    flujo(k, items, mx, w, y0, yP);
  };

  /* ── portada de YouTube (16:9) ──────────────────────────────────────── */
  A.portada = (k, c) => {
    const { W, H, P, d, ctx } = k, izq = k.pieza.lado === "izq";
    const cx = izq ? W * 0.235 : W * 0.765, cy = H * 0.5, r = H * 0.325;
    fondo(k, "anillos", cx, cy);
    foto(k, cx, cy, r, { grosor: H * 0.02 });
    const x0 = izq ? W * 0.47 : W * 0.055, w = W * 0.475;
    flujo(k, [c.k && { t: "pildora", str: c.k, tam: H * 0.046, vivo: c.vivo }, c.k && E(H * 0.045), T(c.t, H * 0.215, { lineas: 3, il: 0.97, may: true, min: H * 0.09 })], x0, w, H * 0.09, H * 0.83);
    const pieTxt = k.vr ? HOST : k.pers ? k.linkVis : HOST;
    texto(k, pieTxt, x0, H * 0.86, { w, tam: H * 0.05, peso: 700, color: P.ac === P.fg ? P.suave : P.ac, lineas: 1 });
    if (k.vr || !k.pers) marca(k, izq ? W * 0.055 : W - W * 0.055, H * 0.065, H * 0.055, izq ? "left" : "right");
  };

  /* ── banners anchos ─────────────────────────────────────────────────── */
  A.banda = (k, c) => {
    const { W, H, P, d, pieza } = k;
    // Lo importante va dentro de la zona que ninguna red recorta.
    let sx, sy, sw, sh;
    if (pieza.f === "BY") { sw = 1546; sh = 423; sx = (W - sw) / 2; sy = (H - sh) / 2; }
    else if (pieza.f === "BF") { sw = W * 0.62; sh = H * 0.72; sx = (W - sw) / 2; sy = (H - sh) / 2; }
    else { sx = W * 0.06; sy = H * 0.1; sw = W * 0.88; sh = H * 0.8; }
    fondo(k, "anillos", sx + sw * 0.12, H * 0.5);
    const conQ = pieza.f === "BL" && k.conQR, lado = conQ ? sh * 0.72 : 0;
    if (conQ) qr(k, sx + sw - lado, sy + (sh - lado) / 2, lado);
    // En la imagen de link, con QR no cabe además la foto: manda el QR.
    const r = sh * 0.34, conF = k.pers && !k.vr && k.conFoto && !conQ;
    let x = sx, w = sw - (conQ ? lado + sw * 0.05 : 0);
    if (conF) { foto(k, sx + r, sy + sh / 2, r * 0.93, { grosor: r * 0.08 }); x += r * 2 + sw * 0.045; w -= r * 2 + sw * 0.045; }
    const centro = !conF && !conQ, titulo = k.vr ? c.t : (k.pers && d.nombre) || c.t, sub = k.vr ? c.s : (k.pers && d.nombre ? c.t : c.s);
    const items = [T(titulo, sh * 0.27, { lineas: 2, min: sh * 0.12 }), sub && E(sh * 0.035), sub && T(sub, sh * 0.105, { peso: 600, color: P.suave, lineas: 1 }), E(sh * 0.07)];
    const linkTxt = k.vr || !k.pers ? HOST : k.linkVis, pl = pildoraLink(k, linkTxt, 0, 0, sh * 0.095, w, true);
    items.push({ t: "fn", h: pl.h, dib: (xx, y, ww) => pildoraLink(k, linkTxt, centro ? xx + ww / 2 : xx + pl.w / 2, y, sh * 0.095, ww) });
    flujo(k, items, x, w, sy, sy + sh, { alin: centro ? "center" : "left" });
    if (pieza.f !== "BL") marca(k, W / 2, sy + sh + (pieza.f === "BY" ? H * 0.02 : H * 0.03), pieza.f === "BY" ? H * 0.03 : H * 0.055, "center", P.suave);
  };

  /* ── para imprimir ──────────────────────────────────────────────────── */
  A.impreso = (k, c) => {
    const { W, H, P, d, ctx } = k, mx = W * 0.1, w = W - mx * 2, lado = W * 0.56;
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);
    const b1 = P.b1 || TINTA, b2 = P.b2 || VERDE;
    ctx.fillStyle = b1; ctx.fillRect(0, 0, W, H * 0.022); ctx.fillStyle = b2; ctx.fillRect(0, H * 0.022, W, H * 0.008);
    const items = [c.k && { t: "pildora", str: c.k, tam: W * 0.026, bg: b1, fg: contraste(b2, b1) >= 3 ? b2 : legible(b1) }, c.k && E(W * 0.035), T(c.t, W * 0.105, { lineas: 2 }), c.s && E(W * 0.02), c.s && T(c.s, W * 0.034, { peso: 500, color: P.suave, lineas: 2 }), E(W * 0.055)];
    if (k.conQR) items.push({ t: "fn", h: lado, dib: (x, y) => { qr(k, W / 2 - lado / 2, y, lado, { borde: true }); } }, E(W * 0.05));
    items.push(T(k.linkVis, W * 0.052, { lineas: 1 }));
    if (k.pers && d.nombre) items.push(E(W * 0.012), T(d.nombre, W * 0.036, { peso: 600, color: P.suave, lineas: 1 }));
    flujo(k, items, mx, w, H * 0.07, H * 0.9, { alin: "center" });
    texto(k, "Nada se graba", mx, H * 0.925, { w, tam: W * 0.026, peso: 700, color: P.suave, alin: "center", lineas: 1 });
    marca(k, W / 2, H * 0.95, W * 0.03, "center");
  };
  A.tarjeta = (k, c) => {
    const { W, H, P, d } = k, mx = W * 0.07, lado = k.conQR ? H * 0.62 : 0;
    fondo(k, "brillo", W * 0.95, 0);
    if (lado) qr(k, W - mx - lado, (H - lado) / 2, lado);
    const w = W - mx * 2 - (lado ? lado + W * 0.05 : 0);
    marca(k, mx, H * 0.11, H * 0.07);
    flujo(k, [T((k.pers && d.nombre) || "Tu nombre", H * 0.15, { lineas: 2 }), E(H * 0.02), T(d.tema || c.s, H * 0.058, { peso: 500, color: P.suave, lineas: 2 }), E(H * 0.06), T(k.linkVis, H * 0.062, { peso: 800, color: P.ac, lineas: 1 })], mx, w, H * 0.24, H * 0.9, { vert: "abajo" });
  };
  A.sticker = (k, c) => {
    const { W, H, ctx } = k, cx = W / 2, cy = H / 2, r = W * 0.485, lado = W * 0.43;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#FFFFFF"; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r - W * 0.022, 0, Math.PI * 2); ctx.lineWidth = W * 0.03; ctx.strokeStyle = k.P.b1 || TINTA; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r - W * 0.045, 0, Math.PI * 2); ctx.lineWidth = W * 0.012; ctx.strokeStyle = k.P.b2 || VERDE; ctx.stroke();
    const w = W * 0.58, items = [T(c.t, W * 0.05, { lineas: 2 }), E(W * 0.03)];
    if (k.conQR) items.push({ t: "fn", h: lado, dib: (x, y) => qr(k, cx - lado / 2, y, lado) }, E(W * 0.03));
    items.push(T(k.linkVis, W * 0.038, { lineas: 1, color: k.P.ac }));
    flujo(k, items, cx - w / 2, w, H * 0.13, H * 0.87, { alin: "center" });
  };

  const partirCuando = (t) => (t.length > 14 && t.includes(" · ") ? t.replace(" · ", "\n") : t);

  /* ── pintar una pieza ───────────────────────────────────────────────── */
  function llenar(str, d, pieza) {
    return String(str || "")
      .replace(/\{precio\}/g, d.precio || "$20")
      .replace(/\{cuando\}/g, pieza && pieza.a === "tipo" ? partirCuando((d.cuando || "HOY").toUpperCase()) : (d.cuando || "HOY").toUpperCase())
      .replace(/\{tema\}/g, d.tema || (pieza && pieza.a === "portada" ? "EN VIVO\nCONMIGO" : "En vivo"))
      .replace(/\{nombre\}/g, d.nombre || "");
  }
  /** d = { nombre, slug, foto, tema, cuando, precio, conNombre, conQR, conFoto, estilo, red } */
  function pintar(pieza, ctx, d) {
    const F = C.FORMATOS[pieza.f], W = F.w, H = F.h, ar = W / H;
    const forma = ar > 2.2 ? "banda" : ar > 1.2 ? "horizontal" : ar < 0.62 ? "vertical" : ar < 0.9 ? "retrato" : "cuadrado";
    const pers = !!(d.conNombre && d.slug), vr = !!pieza.vr;
    const red = d.red && d.red !== "todo" ? d.red : pieza.redes[0];
    const fuenteUtm = red === "imprimir" ? "utm_source=qr&utm_medium=impreso" : `utm_source=${red}&utm_medium=material`;
    const k = {
      ctx, W, H, forma, pieza, d, pers, vr, P: paletaDe(pieza, d), fotos: (d.fotos || []).filter(Boolean).slice(0, 2),
      mx: W * (forma === "vertical" ? 0.078 : 0.07),
      top: forma === "vertical" ? H * 0.075 : forma === "retrato" ? H * 0.055 : H * 0.065,
      bot: forma === "vertical" ? H * 0.115 : forma === "retrato" ? H * 0.055 : H * 0.065,
      conQR: !!d.conQR, conFoto: false,
      linkVis: pers && !vr ? `${HOST}/${d.slug}` : HOST,
      url: pers && !vr ? `https://${HOST}/${d.slug}?${fuenteUtm}&utm_content=${pieza.id.toLowerCase()}` : `https://${HOST}/?${fuenteUtm}${d.slug ? `&utm_campaign=de-${d.slug}` : ""}`,
    };
    k.conFoto = k.fotos.length > 0 && ((pers && !vr) || pieza.a === "perfil");
    const c = {}; for (const kk in pieza.c) c[kk] = typeof pieza.c[kk] === "string" ? llenar(pieza.c[kk], d, pieza) : pieza.c[kk];
    ctx.save(); ctx.clearRect(0, 0, W, H);
    (A[pieza.a] || A.hero)(k, c);
    ctx.restore();
    return k;
  }
  /** Pinta en un canvas del ancho pedido (en píxeles reales). */
  function pintarEn(canvas, pieza, d, anchoPx) {
    const F = C.FORMATOS[pieza.f], w = Math.round(anchoPx || F.w), h = Math.round((w * F.h) / F.w);
    if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d"); ctx.setTransform(w / F.w, 0, 0, w / F.w, 0, 0);
    ctx.imageSmoothingQuality = "high";
    pintar(pieza, ctx, d);
    return canvas;
  }
  function aBlob(pieza, d, tipo) {
    const cv = document.createElement("canvas"); pintarEn(cv, pieza, d);
    if (tipo === "jpg" && pieza.a !== "sticker") { const c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = cv.height; const x = c2.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(cv, 0, 0); return new Promise((res, rej) => c2.toBlob((b) => (b ? res(b) : rej(new Error("sin imagen"))), "image/jpeg", 0.93)); }
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("sin imagen"))), "image/png"));
  }
  const listo = () => (document.fonts && document.fonts.load ? Promise.all(["800", "700", "600", "500"].map((p) => document.fonts.load(`${p} 48px "Plus Jakarta Sans"`))).catch(() => {}) : Promise.resolve());

  window.MaterialesMotor = { pintar, pintarEn, aBlob, listo, llenar, HOST, PALETAS, C1, C2 };
})();

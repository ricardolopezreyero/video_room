// RLR · Materiales para compartir: la página. Arma la galería por red y por
// formato, la personaliza con los datos de la persona (nombre, link, foto,
// QR) y deja descargar, compartir o copiar cada pieza y cada texto.
// El catálogo vive en materiales-catalogo.js; el dibujo, en materiales-motor.js.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const C = window.MaterialesCatalogo, M = window.MaterialesMotor, HOST = M.HOST;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LLAVE = "vr_materiales";
  const S = Object.assign({ nombre: "", tema: "", cuando: "", conNombre: true, conQR: true, conFoto: true, medir: true, estilo: "original", red: "todo" }, (() => { try { return JSON.parse(localStorage.getItem(LLAVE) || "{}"); } catch { return {}; } })());
  const guardar = () => { try { localStorage.setItem(LLAVE, JSON.stringify(S)); } catch {} };
  let me = null, room = null, foto = null, nombreTocado = !!S.nombre;
  const puedeCompartir = !!(navigator.share && navigator.canShare);
  const puedeCopiarImagen = !!(navigator.clipboard && window.ClipboardItem);

  function toast(msg, ms) { const t = $("mat-toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), ms || 2600); }

  /* ── datos con los que se pinta y se escribe ────────────────────────── */
  const datos = (red) => ({ nombre: S.nombre.trim(), slug: room && room.slug, foto, tema: S.tema.trim(), cuando: S.cuando.trim(), precio: room && room.price_cents ? "$" + Math.round(room.price_cents / 100).toLocaleString("es-MX") : "$20", conNombre: S.conNombre, conQR: S.conQR, conFoto: S.conFoto, estilo: S.estilo, red: red || S.red });
  const personal = () => !!(S.conNombre && room && room.slug);
  function linkPara(red, vr) {
    const sala = personal() && !vr;
    const r = !red || red === "todo" || red === "todas" || red === "textos" ? "" : red === "imprimir" ? "qr" : red;
    const q = S.medir && r ? `?de=${r}` : "";
    return sala ? `https://${HOST}/${room.slug}${q}` : q ? `https://${HOST}/${q}` : `https://${HOST}`;
  }
  function escribir(str, red, vr) {
    const tema = S.tema.trim(), nombre = S.nombre.trim(), d = datos(red);
    return String(str)
      .replace(/\{link\}/g, linkPara(red, vr))
      .replace(/\{linkLimpio\}/g, personal() && !vr ? `${HOST}/${room.slug}` : HOST)
      .replace(/\{precio\}/g, d.precio)
      .replace(/\{cuando\}/g, S.cuando.trim() || "Hoy")
      .replace(/\{temaDe\}/g, tema ? `: ${tema}` : "")
      .replace(/\{temaO\}/g, tema || "En vivo conmigo")
      .replace(/\{nombreO\}/g, nombre || "En vivo")
      .replace(/\{nombre\}/g, nombre);
  }
  const redDe = (pieza) => (S.red !== "todo" && S.red !== "textos" ? S.red : pieza.redes[0]);
  const captionDe = (pieza) => escribir(C.CAPTIONS[pieza.tx] || "", redDe(pieza), !!pieza.vr);
  const nombreArchivo = (pieza, ext) => `VideoRoom-${pieza.id}-${pieza.n.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}${personal() && !pieza.vr ? "-" + room.slug : ""}.${ext}`;

  /* ── galería ────────────────────────────────────────────────────────── */
  const visibles = new Set();
  const obs = new IntersectionObserver((ents) => { for (const e of ents) { if (e.isIntersecting) { visibles.add(e.target); if (e.target._sucio) pintarTarjeta(e.target); } else visibles.delete(e.target); } }, { rootMargin: "400px 0px" });
  function pintarTarjeta(fig) {
    const cv = fig.querySelector("canvas"), w = cv.clientWidth || 200;
    M.pintarEn(cv, fig._pieza, datos(redDe(fig._pieza)), Math.min(fig._pieza.w || 9999, Math.round(w * Math.min(2, window.devicePixelRatio || 1))));
    fig._sucio = false;
  }
  let tRep = 0;
  function repintar() { clearTimeout(tRep); tRep = setTimeout(() => { document.querySelectorAll(".mat-pieza").forEach((f) => { f._sucio = true; }); visibles.forEach((f) => pintarTarjeta(f)); pintarTextos(); if (!$("mat-visor").hidden) pintarVisor(); }, 120); }
  const piezasDeVista = () => (S.red === "textos" ? [] : C.PIEZAS.filter((p) => S.red === "todo" || p.redes.includes(S.red)));

  function construir() {
    const grid = $("mat-grid"); obs.disconnect(); visibles.clear(); grid.textContent = "";
    const piezas = piezasDeVista();
    for (const f of Object.keys(C.FORMATOS)) {
      const grupo = piezas.filter((p) => p.f === f); if (!grupo.length) continue;
      const F = C.FORMATOS[f], sec = document.createElement("section"); sec.className = "mat-grupo f-" + f;
      sec.innerHTML = `<h2>${esc(F.n)} <small>${F.w}×${F.h} · ${esc(F.para)}</small><span>${grupo.length}</span></h2><div class="mat-fila"></div>`;
      const fila = sec.querySelector(".mat-fila");
      for (const p of grupo) {
        const fig = document.createElement("figure"); fig.className = "mat-pieza"; fig._pieza = p; fig._sucio = true; fig.dataset.id = p.id;
        fig.innerHTML = `<button type="button" class="mat-lienzo" style="aspect-ratio:${F.w}/${F.h}" aria-label="Ver ${esc(p.n)} en grande"><canvas></canvas></button>
          <figcaption><b>${esc(p.n)}</b><small>${p.vr ? "Video Room" : "Tu sala"} · ${p.id}</small></figcaption>
          <div class="mat-btns"><button type="button" class="btn-primary small" data-a="${puedeCompartir && matchMedia("(pointer:coarse)").matches ? "compartir" : "bajar"}">${puedeCompartir && matchMedia("(pointer:coarse)").matches ? "Compartir" : "Descargar"}</button><button type="button" class="btn-ghost small" data-a="${puedeCompartir && matchMedia("(pointer:coarse)").matches ? "bajar" : "texto"}">${puedeCompartir && matchMedia("(pointer:coarse)").matches ? "Bajar" : "Texto"}</button></div>`;
        fig.querySelector(".mat-lienzo").onclick = () => abrirVisor(p);
        fig.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => accion(b.dataset.a, p, b)));
        fila.appendChild(fig); obs.observe(fig);
      }
      grid.appendChild(sec);
    }
    pintarTextos(); pintarChips();
    const nT = textosDeVista().reduce((n, g) => n + g.items.length, 0);
    $("mat-cuenta").textContent = `${piezas.length ? piezas.length + (piezas.length === 1 ? " diseño" : " diseños") : ""}${piezas.length && nT ? " · " : ""}${nT ? nT + " textos" : ""}`;
    $("mat-zip").hidden = !piezas.length;
  }
  function pintarChips() {
    const cuenta = (id) => C.PIEZAS.filter((p) => p.redes.includes(id)).length;
    const chips = [{ id: "todo", n: "Todo", c: C.PIEZAS.length }].concat(C.REDES.map((r) => ({ id: r.id, n: r.n, c: cuenta(r.id) })), [{ id: "textos", n: "Textos", c: C.TEXTOS.reduce((n, g) => n + g.items.length, 0) }]);
    $("mat-chips").innerHTML = chips.map((c) => `<button type="button" data-red="${c.id}" class="${c.id === S.red ? "on" : ""}">${esc(c.n)} <i>${c.c}</i></button>`).join("");
    $("mat-chips").querySelectorAll("button").forEach((b) => (b.onclick = () => { S.red = b.dataset.red; guardar(); history.replaceState(null, "", S.red === "todo" ? location.pathname : "#" + S.red); construir(); $("mat-chips").scrollIntoView({ block: "start", behavior: "smooth" }); }));
    const activo = $("mat-chips").querySelector("button.on"); if (activo) $("mat-chips").scrollLeft = Math.max(0, activo.offsetLeft - 16);
  }

  /* ── textos para copiar ─────────────────────────────────────────────── */
  const textosDeVista = () => C.TEXTOS.filter((g) => S.red === "todo" || S.red === "textos" || g.red === S.red || (g.red === "todas" && S.red !== "imprimir"));
  function pintarTextos() {
    const cont = $("mat-textos"), grupos = textosDeVista();
    cont.innerHTML = grupos.length ? `<h2 class="mat-h2">Textos para copiar</h2>` + grupos.map((g, gi) => `<div class="mat-tgrupo"><h3>${esc(g.grupo)}</h3><div class="mat-tfila">${g.items.map((it, ii) => `<article class="mat-tcard"><header><b>${esc(it.t)}</b><button type="button" class="btn-ghost small" data-g="${gi}" data-i="${ii}">Copiar</button></header><pre class="mat-texto">${esc(escribir(it.x, g.red === "todas" ? S.red : g.red, /Video Room/.test(it.t)))}</pre></article>`).join("")}</div></div>`).join("") : "";
    cont.querySelectorAll("button[data-g]").forEach((b) => (b.onclick = () => { const g = grupos[+b.dataset.g], it = g.items[+b.dataset.i]; copiar(escribir(it.x, g.red === "todas" ? S.red : g.red, /Video Room/.test(it.t)), b); }));
  }
  function copiar(txt, boton) {
    const ok = () => { toast("Copiado."); if (boton) { const t = boton.textContent; boton.textContent = "Copiado ✓"; setTimeout(() => (boton.textContent = t), 1400); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => toast("No se pudo copiar."));
    else { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch { toast("No se pudo copiar."); } ta.remove(); }
  }

  /* ── acciones sobre una pieza ───────────────────────────────────────── */
  function descargar(blob, nombre) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
  async function accion(a, pieza, boton) {
    const d = datos(redDe(pieza));
    try {
      if (a === "texto") return copiar(captionDe(pieza), boton);
      if (boton) boton.disabled = true;
      if (a === "bajar" || a === "jpg") { const ext = a === "jpg" ? "jpg" : "png"; descargar(await M.aBlob(pieza, d, ext), nombreArchivo(pieza, ext)); toast("Descargado. El texto para publicarla está en «Texto»."); }
      else if (a === "compartir") {
        const blob = await M.aBlob(pieza, d, "png"), file = new File([blob], nombreArchivo(pieza, "png"), { type: "image/png" });
        if (puedeCompartir && navigator.canShare({ files: [file] })) { try { await navigator.clipboard.writeText(captionDe(pieza)); } catch {} try { await navigator.share({ files: [file], text: captionDe(pieza) }); toast("El texto quedó copiado: pégalo al publicar.", 3500); } catch (e) { if (e && e.name !== "AbortError") throw e; } }
        else { descargar(blob, file.name); toast("Tu navegador no comparte imágenes: la descargamos."); }
      } else if (a === "imagen") { await navigator.clipboard.write([new ClipboardItem({ "image/png": await M.aBlob(pieza, d, "png") })]); toast("Imagen copiada: pégala donde quieras."); }
    } catch (e) { toast("No se pudo. Intenta descargar la imagen."); }
    if (boton) boton.disabled = false;
  }

  /* ── vista en grande ────────────────────────────────────────────────── */
  let enVisor = null;
  function pintarVisor() {
    if (!enVisor) return; const p = enVisor, F = C.FORMATOS[p.f], cv = $("visor-canvas");
    const caja = cv.parentElement.getBoundingClientRect(), esc2 = Math.min(caja.width / F.w, caja.height / F.h, 1);
    cv.style.width = Math.round(F.w * esc2) + "px"; cv.style.height = Math.round(F.h * esc2) + "px";
    M.pintarEn(cv, p, datos(redDe(p)), Math.min(F.w, Math.round(F.w * esc2 * Math.min(2, window.devicePixelRatio || 1))));
    $("visor-titulo").textContent = p.n; $("visor-formato").textContent = `${F.n} · ${F.w}×${F.h} px · ${F.para}`;
    $("visor-texto").textContent = captionDe(p);
  }
  function abrirVisor(p) { enVisor = p; $("mat-visor").hidden = false; document.body.classList.add("mat-con-visor"); pintarVisor(); }
  function cerrarVisor() { enVisor = null; $("mat-visor").hidden = true; document.body.classList.remove("mat-con-visor"); }
  function moverVisor(dir) { const l = piezasDeVista(); if (!enVisor || !l.length) return; const i = l.indexOf(enVisor); enVisor = l[(i + dir + l.length) % l.length]; pintarVisor(); }
  $("visor-cerrar").onclick = cerrarVisor; $("visor-ant").onclick = () => moverVisor(-1); $("visor-sig").onclick = () => moverVisor(1);
  $("mat-visor").addEventListener("click", (e) => { if (e.target.id === "mat-visor" || e.target.classList.contains("visor-cuerpo")) cerrarVisor(); });
  $("mat-visor").querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => enVisor && accion(b.dataset.a, enVisor, b)));
  $("visor-compartir").hidden = !puedeCompartir; $("visor-imagen").hidden = !puedeCopiarImagen;
  window.addEventListener("resize", () => { if (enVisor) pintarVisor(); });

  /* ── todo en un zip (sin compresión: los PNG ya vienen comprimidos) ─── */
  const TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = TABLA[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function armarZip(archivos) {
    const enc = new TextEncoder(), ahora = new Date(), hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1), fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    const partes = [], central = []; let pos = 0;
    for (const a of archivos) {
      const nombre = enc.encode(a.nombre), crc = crc32(a.datos), cab = new DataView(new ArrayBuffer(30));
      cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true); cab.setUint16(8, 0, true); cab.setUint16(10, hora, true); cab.setUint16(12, fecha, true); cab.setUint32(14, crc, true); cab.setUint32(18, a.datos.length, true); cab.setUint32(22, a.datos.length, true); cab.setUint16(26, nombre.length, true); cab.setUint16(28, 0, true);
      partes.push(new Uint8Array(cab.buffer), nombre, a.datos);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, hora, true); cen.setUint16(14, fecha, true); cen.setUint32(16, crc, true); cen.setUint32(20, a.datos.length, true); cen.setUint32(24, a.datos.length, true); cen.setUint16(28, nombre.length, true); cen.setUint32(42, pos, true);
      central.push(new Uint8Array(cen.buffer), nombre); pos += 30 + nombre.length + a.datos.length;
    }
    const tamCentral = central.reduce((n, x) => n + x.length, 0), fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true); fin.setUint32(12, tamCentral, true); fin.setUint32(16, pos, true);
    return new Blob(partes.concat(central, [new Uint8Array(fin.buffer)]), { type: "application/zip" });
  }
  $("mat-zip").onclick = async () => {
    const b = $("mat-zip"), piezas = piezasDeVista(), original = b.textContent; if (!piezas.length || b.disabled) return;
    b.disabled = true; const archivos = [], redTxt = S.red === "todo" ? "todo" : S.red;
    try {
      for (let i = 0; i < piezas.length; i++) {
        b.textContent = `Preparando ${i + 1} de ${piezas.length}…`;
        const p = piezas[i], F = C.FORMATOS[p.f], blob = await M.aBlob(p, datos(redDe(p)), "png");
        archivos.push({ nombre: `${F.n.replace(/[:/]/g, "-")}/${nombreArchivo(p, "png")}`, datos: new Uint8Array(await blob.arrayBuffer()) });
        await new Promise((r) => setTimeout(r, 0));
      }
      const lineas = ["MATERIALES PARA COMPARTIR · VIDEO ROOM", "", "── Texto sugerido para cada imagen ──", ""];
      for (const p of piezas) lineas.push(`[${p.id}] ${p.n}`, captionDe(p), "");
      lineas.push("── Más textos para copiar ──", "");
      for (const g of textosDeVista()) { lineas.push(`▸ ${g.grupo}`, ""); for (const it of g.items) lineas.push(`· ${it.t}`, escribir(it.x, g.red === "todas" ? S.red : g.red, /Video Room/.test(it.t)), ""); }
      archivos.push({ nombre: "Textos para publicar.txt", datos: new TextEncoder().encode(lineas.join("\r\n")) });
      descargar(armarZip(archivos), `VideoRoom-Materiales-${redTxt}${personal() ? "-" + room.slug : ""}.zip`);
      toast(`Listo: ${piezas.length} imágenes y los textos, en un zip.`, 3500);
    } catch (e) { toast("No se pudo armar el zip. Descarga las piezas una por una."); }
    b.textContent = original; b.disabled = false;
  };

  /* ── personalizar ───────────────────────────────────────────────────── */
  function pintarYo() {
    const yo = $("mat-yo");
    if (me) yo.innerHTML = `${me.avatar_url ? `<img src="${esc(me.avatar_url)}" alt="" referrerpolicy="no-referrer">` : ""}<div><b>${esc(me.name || "")}</b><small>${room ? esc(HOST + "/" + room.slug) : "Aún no tienes sala"}</small></div>`;
    else yo.innerHTML = `<div class="mat-anon"><b>Ponles tu nombre, tu link y tu QR</b><small>Entra con Google y todos los diseños se personalizan solos.</small><div data-login-ct="ancho" data-texto="Entrar con Google"></div></div>`;
    if (!me && window.LoginCT && LoginCT.montar) { const el = yo.querySelector("[data-login-ct]"); if (el) try { LoginCT.montar(el, "ancho"); } catch {} }
    const sinSala = !room;
    ["mat-con-nombre", "mat-con-foto"].forEach((id) => { $(id).disabled = sinSala; $(id).closest(".mat-palanca").classList.toggle("apagada", sinSala); });
    $("mat-con-foto").disabled = sinSala || !foto; $("mat-con-foto").closest(".mat-palanca").classList.toggle("apagada", sinSala || !foto);
  }
  function enlazarControles() {
    const campo = (id, llave) => { const el = $(id); el.value = S[llave] || ""; el.oninput = () => { S[llave] = el.value; if (llave === "nombre") nombreTocado = true; guardar(); repintar(); }; };
    campo("mat-nombre", "nombre"); campo("mat-tema", "tema"); campo("mat-cuando", "cuando");
    const palanca = (id, llave) => { const el = $(id), sw = el.closest(".switch"); el.checked = !!S[llave]; sw.classList.toggle("on", el.checked); el.onchange = () => { S[llave] = el.checked; sw.classList.toggle("on", el.checked); guardar(); repintar(); }; };
    palanca("mat-con-nombre", "conNombre"); palanca("mat-con-qr", "conQR"); palanca("mat-con-foto", "conFoto"); palanca("mat-medir", "medir");
    $("mat-estilos").querySelectorAll("button").forEach((b) => { b.classList.toggle("on", b.dataset.e === S.estilo); b.onclick = () => { S.estilo = b.dataset.e; guardar(); $("mat-estilos").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); repintar(); }; });
  }
  async function cargarSesion() {
    try {
      const r = await fetch("/api/wallet/me"); if (!r.ok) return;
      me = await r.json();
      const rr = await fetch("/api/rooms/mine"); if (rr.ok) room = await rr.json();
      else if (rr.status === 401) { me = null; return; } // la sesión ya no vale (lo de «me» venía de la memoria rápida)
      if (!nombreTocado && me.name) { S.nombre = me.name; $("mat-nombre").value = me.name; }
      if (me.avatar_url) { try { const b = await (await fetch("/api/wallet/avatar")).blob(); if (b.size > 200) foto = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(b); }); } catch {} }
    } catch {}
  }

  /* ── cerrar como un modal ───────────────────────────────────────────── */
  function cerrar() {
    let deCasa = false; try { deCasa = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch {}
    if (deCasa && history.length > 1) history.back(); else location.href = me ? "/app/monedero" : "/?ver=1";
  }
  $("mat-cerrar").onclick = cerrar;
  $("mat-abrir").onclick = () => { const ab = $("mat-perso").classList.toggle("abierto"); $("mat-abrir").setAttribute("aria-expanded", String(ab)); $("mat-abrir").textContent = ab ? "Listo" : "Personalizar"; };
  document.addEventListener("keydown", (e) => {
    const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "");
    if (e.key === "Escape") { if (enCampo) return e.target.blur(); if (enVisor) cerrarVisor(); else cerrar(); }
    else if (enVisor && !enCampo && e.key === "ArrowLeft") moverVisor(-1);
    else if (enVisor && !enCampo && e.key === "ArrowRight") moverVisor(1);
  });

  /* ── arranque ───────────────────────────────────────────────────────── */
  (async function () {
    // La vista (qué red) no se recuerda entre visitas: se llega a «Todo», o a la red del enlace (#tiktok).
    const h = location.hash.replace("#", ""); S.red = h && (h === "textos" || C.REDES.some((r) => r.id === h)) ? h : "todo";
    enlazarControles(); pintarYo();
    $("mat-sub").textContent = `${C.PIEZAS.length} diseños y ${C.TEXTOS.reduce((n, g) => n + g.items.length, 0)} textos listos. Descarga, copia y publica.`;
    await M.listo();
    construir();
    await cargarSesion();
    pintarYo(); repintar();
  })();
  // Para probar en consola (por ejemplo, con una foto cualquiera).
  window.__mat = { S, datos, piezas: piezasDeVista, abrirVisor, repintar, ponerFoto: (src) => new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => { foto = im; pintarYo(); repintar(); res(true); }; im.onerror = () => res(false); im.src = src; }) };
})();

// RLR · Materiales para compartir: la página. Arma la galería por red y por
// formato, la personaliza con los datos de la persona (nombre, link, foto,
// QR) y deja descargar, compartir o copiar cada pieza y cada texto.
// El catálogo vive en materiales-catalogo.js; el dibujo, en materiales-motor.js.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const C = window.MaterialesCatalogo, M = window.MaterialesMotor, V = window.MaterialesVideo, HOST = M.HOST;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LLAVE = "vr_materiales";
  const S = Object.assign({ nombre: "", tema: "", cuando: "", fecha: "", modoCuando: "fecha", tzBase: "", tzOtros: [], conNombre: true, conQR: true, conFoto: true, foto2: "", c1: M.C1, c2: M.C2, medir: true, estilo: "original", musica: "ritmo", red: "todo" }, (() => { try { return JSON.parse(localStorage.getItem(LLAVE) || "{}"); } catch { return {}; } })());
  const guardar = () => { try { localStorage.setItem(LLAVE, JSON.stringify(S)); } catch { try { localStorage.setItem(LLAVE, JSON.stringify(Object.assign({}, S, { foto2: "" }))); } catch {} } };
  // foto1 = la de tu perfil (Google); foto2 = la otra, opcional, que adjuntas aquí. Máximo dos.
  let me = null, room = null, foto1 = null, foto2 = null, nombreTocado = !!S.nombre;
  if (!Array.isArray(S.tzOtros)) S.tzOtros = [];
  if (S.musica === "propia") S.musica = "ritmo"; // el audio propio no se guarda entre visitas
  const fotosActivas = () => [S.conFoto ? foto1 : null, foto2].filter(Boolean);

  /* ── fecha, hora y horarios por país ────────────────────────────────── */
  const zona = (id) => C.ZONAS.find((z) => z.id === id) || null;
  if (!zona(S.tzBase)) { // el país principal: el de este aparato si está en la lista; si no, México
    let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
    const z = C.ZONAS.find((x) => x.tz === tz) || zona(C.ZONA_DE_TZ[tz]);
    S.tzBase = z ? z.id : C.ZONAS[0].id;
  }
  S.tzOtros = S.tzOtros.filter((id) => zona(id) && id !== S.tzBase).slice(0, 3);
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"], DIAS_C = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"], MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const formatos = new Map();
  /** Cómo se lee un instante en el reloj de un huso: año, mes, día, hora, minuto y día de la semana. */
  function partesEn(ms, tz) {
    let f = formatos.get(tz);
    if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }); formatos.set(tz, f); }
    const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, m: +o.month, d: +o.day, H: +o.hour % 24, M: +o.minute, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) };
  }
  /** «2026-10-17T20:00» dicho en el reloj de `tz` → el instante real (ms). Aguanta cambios de horario. */
  function instanteDe(local, tz) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || ""); if (!m) return null;
    const meta = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); let utc = meta;
    for (let i = 0; i < 3; i++) { const p = partesEn(utc, tz), visto = Date.UTC(p.y, p.m - 1, p.d, p.H, p.M); if (visto === meta) break; utc -= visto - meta; }
    return utc;
  }
  const horaTxt = (H, M, h24) => (h24 ? `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}` : `${H % 12 || 12}:${String(M).padStart(2, "0")} ${H < 12 ? "am" : "pm"}`);
  const diaNum = (p) => Date.UTC(p.y, p.m - 1, p.d) / 86400000;
  /** La sesión, ya convertida: texto principal, fecha larga y la hora en cada país. null si no hay fecha. */
  function agenda() {
    if (S.modoCuando !== "fecha" || !S.fecha) return null;
    const base = zona(S.tzBase), ms = instanteDe(S.fecha, base.tz); if (ms == null) return null;
    const pb = partesEn(ms, base.tz), hoy = partesEn(Date.now(), base.tz), dif = diaNum(pb) - diaNum(hoy);
    const rel = dif === 0 ? "Hoy" : dif === 1 ? "Mañana" : "", hora = horaTxt(pb.H, pb.M, base.h24);
    const larga = `${cap(DIAS[pb.wd])} ${pb.d} de ${MESES[pb.m - 1]}`, conAnio = `${larga} de ${pb.y}`;
    const horarios = [{ pais: base.c, hora, nota: "" }].concat(S.tzOtros.map(zona).filter(Boolean).map((z) => { const p = partesEn(ms, z.tz); return { pais: z.c, hora: horaTxt(p.H, p.M, z.h24), nota: diaNum(p) !== diaNum(pb) ? `${DIAS[p.wd]} ${p.d}` : "" }; }));
    return { ms, base, hora, larga: pb.y !== hoy.y ? conAnio : larga, conAnio, cuando: `${rel || `${cap(DIAS_C[pb.wd])} ${pb.d} ${MESES_C[pb.m - 1]}`} · ${hora}`, horarios };
  }
  const notaDe = (h) => (h.nota ? ` (${h.nota})` : "");
  const puedeCompartir = !!(navigator.share && navigator.canShare);
  const puedeCopiarImagen = !!(navigator.clipboard && window.ClipboardItem);

  function toast(msg, ms) { const t = $("mat-toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), ms || 2600); }

  /* ── datos con los que se pinta y se escribe ────────────────────────── */
  const datos = (red) => {
    const ag = agenda();
    return { nombre: S.nombre.trim(), slug: room && room.slug, fotos: fotosActivas(), tema: S.tema.trim(), cuando: ag ? ag.cuando : (S.modoCuando === "texto" ? S.cuando.trim() : ""), fechaLarga: ag ? ag.conAnio : "", horarios: ag ? ag.horarios : [], precio: room && room.price_cents ? "$" + Math.round(room.price_cents / 100).toLocaleString("es-MX") : "$20", conNombre: S.conNombre, conQR: S.conQR, estilo: S.estilo, c1: S.c1, c2: S.c2, red: red || S.red };
  };
  const personal = () => !!(S.conNombre && room && room.slug);
  function linkPara(red, vr) {
    const sala = personal() && !vr;
    const r = !red || red === "todo" || red === "todas" || red === "textos" ? "" : red === "imprimir" ? "qr" : red;
    const q = S.medir && r ? `?de=${r}` : "";
    return sala ? `https://${HOST}/${room.slug}${q}` : q ? `https://${HOST}/${q}` : `https://${HOST}`;
  }
  function escribir(str, red, vr) {
    const tema = S.tema.trim(), nombre = S.nombre.trim(), d = datos(red), ag = agenda();
    const cuandoTxt = ag ? `${ag.larga}, ${ag.hora}${ag.horarios.length > 1 ? ` (hora de ${ag.base.c})` : ""}` : (S.modoCuando === "texto" && S.cuando.trim()) || "Hoy";
    return String(str)
      .replace(/\{horariosLinea\}/g, ag && ag.horarios.length > 1 ? `\n\n🌎 ${ag.horarios.map((h) => `${h.pais} ${h.hora}${notaDe(h)}`).join(" · ")}` : "")
      .replace(/\{horariosLista\}/g, ag ? `📅 ${ag.conAnio}\n${ag.horarios.map((h) => `• ${h.pais}: ${h.hora}${notaDe(h)}`).join("\n")}` : `• ${cuandoTxt}`)
      .replace(/\{link\}/g, linkPara(red, vr))
      .replace(/\{linkLimpio\}/g, personal() && !vr ? `${HOST}/${room.slug}` : HOST)
      .replace(/\{precio\}/g, d.precio)
      .replace(/\{cuando\}/g, cuandoTxt)
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
  function cambio() { ultimoVideo = null; guardar(); pintarZonas(); if (firmaFaltas() !== firmaPintada) construir(); else repintar(); }
  let tRep = 0;
  function repintar() { clearTimeout(tRep); tRep = setTimeout(() => { document.querySelectorAll(".mat-pieza").forEach((f) => { f._sucio = true; }); visibles.forEach((f) => pintarTarjeta(f)); pintarTextos(); if (!$("mat-visor").hidden) pintarVisor(); }, 120); }
  /** Hay piezas que piden algo para tener sentido: los horarios piden fecha; la foto de perfil, una foto. */
  const leFalta = (p) => (p.pide === "fecha" ? (agenda() ? "" : "fecha") : p.pide === "foto" ? (fotosActivas().length ? "" : "foto") : "");
  const firmaFaltas = () => C.PIEZAS.filter((p) => p.pide).map((p) => leFalta(p)).join("|");
  let firmaPintada = "";
  function abrirPanel(idFoco) {
    const pe = $("mat-perso"); if (!pe.classList.contains("abierto")) $("mat-abrir").click();
    pe.scrollIntoView({ block: "start", behavior: "smooth" });
    const el = $(idFoco); if (el) setTimeout(() => { try { el.focus(); if (el.showPicker) el.showPicker(); } catch {} }, 350);
  }
  function resolverFalta(falta) {
    if (falta === "fecha") { if (S.modoCuando !== "fecha") { S.modoCuando = "fecha"; pintarCuando(); } abrirPanel("mat-fecha"); }
    else if (!me) { if (window.VRLogin) VRLogin.entrar(); }
    else $("foto-2-archivo").click();
  }
  const piezasDeVista = () => (S.red === "textos" ? [] : C.PIEZAS.filter((p) => S.red === "todo" || p.redes.includes(S.red)));

  function construir() {
    const grid = $("mat-grid"); obs.disconnect(); visibles.clear(); grid.textContent = ""; firmaPintada = firmaFaltas();
    const piezas = piezasDeVista();
    for (const f of Object.keys(C.FORMATOS)) {
      const grupo = piezas.filter((p) => p.f === f); if (!grupo.length) continue;
      const F = C.FORMATOS[f], sec = document.createElement("section"); sec.className = "mat-grupo f-" + f;
      sec.innerHTML = `<h2>${esc(F.n)} <small>${F.w}×${F.h} · ${esc(F.para)}</small><span>${grupo.length}</span></h2><div class="mat-fila"></div>`;
      const fila = sec.querySelector(".mat-fila");
      for (const p of grupo) {
        const fig = document.createElement("figure"), falta = leFalta(p), movil = puedeCompartir && matchMedia("(pointer:coarse)").matches, conV = M.conVideo(p);
        fig.className = "mat-pieza" + (falta ? " falta" : ""); fig._pieza = p; fig._sucio = true; fig.dataset.id = p.id;
        fig.innerHTML = `<button type="button" class="mat-lienzo" style="aspect-ratio:${F.w}/${F.h}" aria-label="Ver ${esc(p.n)} en grande"><canvas></canvas></button>
          <figcaption><b>${esc(p.n)}</b><small>${p.vr ? "Video Room" : "Tu sala"} · ${p.id}</small></figcaption>
          <div class="mat-btns">${falta ? `<button type="button" class="btn-ghost small" data-falta="${falta}">${falta === "fecha" ? "Elegir fecha y hora" : "Agregar mi foto"}</button>` : movil ? `<button type="button" class="btn-primary small" data-a="compartir">Compartir</button>${conV ? `<button type="button" class="btn-ghost small" data-video="1">▶ Video</button>` : `<button type="button" class="btn-ghost small" data-a="bajar">Bajar</button>`}` : `<button type="button" class="btn-primary small" data-a="bajar">Descargar</button>${conV ? `<button type="button" class="btn-ghost small" data-video="1">▶ Video</button>` : `<button type="button" class="btn-ghost small" data-a="texto">Texto</button>`}`}</div>`;
        fig.querySelectorAll("[data-video]").forEach((b) => (b.onclick = () => abrirVisor(p, "video")));
        fig.querySelectorAll("[data-falta]").forEach((b) => (b.onclick = () => resolverFalta(b.dataset.falta)));
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

  /* ── vista en grande: imagen o video ────────────────────────────────── */
  let enVisor = null, modoVisor = "imagen", pararVideo = null, grabando = false, ultimoVideo = null;
  const detener = () => { if (pararVideo) { pararVideo(); pararVideo = null; } };
  function pintarVisor() {
    if (!enVisor || grabando) return; const p = enVisor, F = C.FORMATOS[p.f], cv = $("visor-canvas"), conV = M.conVideo(p) && !leFalta(p);
    if (!conV) modoVisor = "imagen";
    const caja = cv.parentElement.getBoundingClientRect(), esc2 = Math.min(caja.width / F.w, caja.height / F.h, 1);
    cv.style.width = Math.round(F.w * esc2) + "px"; cv.style.height = Math.round(F.h * esc2) + "px";
    const ancho = Math.min(F.w, Math.round(F.w * esc2 * Math.min(2, window.devicePixelRatio || 1)));
    $("visor-titulo").textContent = p.n; $("visor-formato").textContent = `${F.n} · ${F.w}×${F.h} px · ${F.para}`;
    $("visor-texto").textContent = captionDe(p);
    $("visor-modo").hidden = !conV; $("visor-modo").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === modoVisor));
    $("visor-imagen-zona").hidden = modoVisor !== "imagen"; $("visor-video-zona").hidden = modoVisor !== "video";
    detener();
    if (modoVisor === "video") { pintarMusicas(); pararVideo = V.reproducir(cv, p, datos(redDe(p)), { anchoPx: ancho, musica: S.musica === "propia" && !V.audioPropio() ? "" : S.musica, sinSonido: () => notaVideo("Toca un audio para oírlo.") }); }
    else M.pintarEn(cv, p, datos(redDe(p)), ancho);
  }
  function abrirVisor(p, modo) { enVisor = p; modoVisor = modo === "video" && M.conVideo(p) ? "video" : "imagen"; $("mat-visor").hidden = false; document.body.classList.add("mat-con-visor"); notaVideo(""); pintarVisor(); }
  function cerrarVisor() { if (grabando) return; detener(); enVisor = null; $("mat-visor").hidden = true; document.body.classList.remove("mat-con-visor"); }
  function moverVisor(dir) { const l = piezasDeVista(); if (!enVisor || !l.length || grabando) return; const i = l.indexOf(enVisor); enVisor = l[(i + dir + l.length) % l.length]; notaVideo(""); pintarVisor(); }
  $("visor-cerrar").onclick = cerrarVisor; $("visor-ant").onclick = () => moverVisor(-1); $("visor-sig").onclick = () => moverVisor(1);
  $("mat-visor").addEventListener("click", (e) => { if (e.target.id === "mat-visor" || e.target.classList.contains("visor-cuerpo")) cerrarVisor(); });
  $("mat-visor").querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => enVisor && accion(b.dataset.a, enVisor, b)));
  $("visor-modo").querySelectorAll("button").forEach((b) => (b.onclick = () => { if (grabando) return; modoVisor = b.dataset.m; pintarVisor(); }));
  $("visor-compartir").hidden = !puedeCompartir; $("visor-imagen").hidden = !puedeCopiarImagen;
  window.addEventListener("resize", () => { if (enVisor) pintarVisor(); });

  /* ── el video: audio, grabar, descargar y compartir ─────────────────── */
  const notaVideo = (t) => { const n = $("video-nota"); if (n) n.textContent = t || (V.puedeGrabar() ? "Se graba aquí mismo, en tu navegador. Tarda lo que dura el video." : "Este navegador no puede grabar video. Usa Chrome o Safari actualizados."); };
  function pintarMusicas() {
    const propia = V.audioPropio(), c = $("visor-musicas");
    c.innerHTML = V.MUSICAS.map((m) => `<button type="button" data-m="${m.id}" class="${S.musica === m.id ? "on" : ""}">${esc(m.n)}</button>`).join("") + (propia ? `<button type="button" data-m="propia" class="${S.musica === "propia" ? "on" : ""}" title="${esc(propia.nombre)}">🎵 ${esc(propia.nombre.replace(/\.[a-z0-9]+$/i, "").slice(0, 16))}</button>` : "") + `<button type="button" id="audio-subir" class="subir">${propia ? "Cambiar mi audio" : "＋ Mi audio"}</button>`;
    c.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { if (grabando) return; S.musica = b.dataset.m; guardar(); ultimoVideo = null; pintarVisor(); }));
    $("audio-subir").onclick = () => { if (!grabando) $("audio-propio").click(); };
    $("video-bajar").disabled = !V.puedeGrabar(); $("video-compartir").hidden = !puedeCompartir || !V.puedeGrabar();
  }
  $("audio-propio").onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    try { await V.ponerPropia(f); S.musica = "propia"; ultimoVideo = null; toast("Tu audio quedó puesto. Se usa desde el principio."); pintarVisor(); }
    catch { toast("No se pudo leer ese audio. Prueba con MP3 o M4A."); }
  };
  const firmaVideo = (p) => p.id + "|" + JSON.stringify(S) + "|" + (room ? room.slug : "") + "|" + (V.audioPropio() ? V.audioPropio().nombre : "") + "|" + redDe(p) + "|" + fotosActivas().length;
  async function hacerVideo(boton) {
    const p = enVisor, firma = firmaVideo(p); if (ultimoVideo && ultimoVideo.firma === firma) return ultimoVideo;
    const cv = $("visor-canvas"), texto = boton.textContent, musica = S.musica === "propia" && !V.audioPropio() ? "" : S.musica;
    detener(); grabando = true; document.body.classList.add("mat-grabando"); notaVideo("Grabando. No cambies de pestaña.");
    try {
      const r = await V.grabar(cv, p, datos(redDe(p)), { musica, alAvance: (x) => { boton.textContent = `Grabando ${Math.round(x * 100)} %`; } });
      ultimoVideo = Object.assign({ firma }, r);
      notaVideo(r.ext === "mp4" ? `Listo: MP4 de ${Math.round(r.segundos)} segundos${musica ? ", con audio" : ", sin audio"}.` : "Tu navegador grabó en WebM. TikTok e Instagram piden MP4: usa Chrome o Safari actualizados.");
      return ultimoVideo;
    } finally { grabando = false; document.body.classList.remove("mat-grabando"); boton.textContent = texto; pintarVisor(); }
  }
  const nombreVideo = (p, ext) => nombreArchivo(p, ext);
  $("video-bajar").onclick = async () => {
    if (!enVisor || grabando) return; const p = enVisor;
    try { const v = await hacerVideo($("video-bajar")); descargar(v.blob, nombreVideo(p, v.ext)); toast("Video descargado. El texto para publicarlo está abajo."); }
    catch (e) { toast(e && e.message === "audio_bloqueado" ? "El navegador no soltó el audio. Toca otra vez." : e && e.message === "sin_grabadora" ? "Este navegador no puede grabar video." : "No se pudo grabar. Intenta de nuevo."); }
  };
  $("video-compartir").onclick = async () => {
    if (!enVisor || grabando) return; const p = enVisor;
    try {
      const v = await hacerVideo($("video-compartir")), file = new File([v.blob], nombreVideo(p, v.ext), { type: v.blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.clipboard.writeText(captionDe(p)); } catch {} try { await navigator.share({ files: [file], text: captionDe(p) }); toast("El texto quedó copiado: pégalo al publicar.", 3500); } catch (e) { if (e && e.name !== "AbortError") throw e; } }
      else { descargar(v.blob, file.name); toast("Tu navegador no comparte videos: lo descargamos."); }
    } catch (e) { toast("No se pudo. Intenta descargar el video."); }
  };

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
    if (me) {
      const inicial = esc((me.name || "?").trim().charAt(0).toUpperCase());
      yo.innerHTML = `<div class="mat-fotos" role="group" aria-label="Fotos (hasta dos)">
          <button type="button" class="mat-foto${S.conFoto && foto1 ? " on" : ""}" id="foto-1" ${foto1 ? "" : "disabled"} title="${foto1 ? (S.conFoto ? "Tu foto de perfil: toca para no usarla" : "Tu foto de perfil: toca para usarla") : "Tu cuenta no tiene foto de perfil"}" aria-pressed="${S.conFoto && foto1 ? "true" : "false"}">${me.avatar_url && foto1 ? `<img src="${esc(me.avatar_url)}" alt="Tu foto de perfil" referrerpolicy="no-referrer">` : `<span>${inicial}</span>`}</button>
          <span class="mat-foto-caja"><button type="button" class="mat-foto${foto2 ? " on" : " vacia"}" id="foto-2" title="${foto2 ? "Cambiar la otra foto" : "Agregar otra foto (opcional)"}">${foto2 ? `<img src="${S.foto2}" alt="La otra foto">` : "<span>＋</span>"}</button>${foto2 ? `<button type="button" class="mat-foto-x" id="foto-2-x" aria-label="Quitar la otra foto" title="Quitar la otra foto">✕</button>` : ""}</span>
        </div>
        <div class="mat-yo-txt"><b>${esc(me.name || "")}</b><small>${room ? esc(HOST + "/" + room.slug) : "Aún no tienes sala"}</small><small class="mat-nota">${foto2 ? "Toca la foto para cambiarla" : "＋ agrega otra foto, opcional"}</small></div>`;
      const f1 = $("foto-1"); if (f1) f1.onclick = () => { S.conFoto = !S.conFoto; pintarYo(); cambio(); };
      $("foto-2").onclick = () => $("foto-2-archivo").click();
      const fx = $("foto-2-x"); if (fx) fx.onclick = () => { S.foto2 = ""; foto2 = null; pintarYo(); cambio(); toast("Foto quitada."); };
    } else {
      yo.innerHTML = `<div class="mat-anon"><b>Ponles tu nombre, tu link y tu QR</b><small>Entra con Google y todos los diseños se personalizan solos.</small><div data-login-ct="ancho" data-texto="Entrar con Google"></div></div>`;
      if (window.LoginCT && LoginCT.montar) { const el = yo.querySelector("[data-login-ct]"); if (el) try { LoginCT.montar(el, "ancho"); } catch {} }
    }
    const sinSala = !room; $("mat-con-nombre").disabled = sinSala; $("mat-con-nombre").closest(".mat-palanca").classList.toggle("apagada", sinSala);
  }
  // La otra foto: se achica en el navegador y se queda en este aparato (no sube a ningún servidor).
  const cargarImagen = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  $("foto-2-archivo").onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const im = await cargarImagen(URL.createObjectURL(f)), lado = Math.min(im.width, im.height), tam = Math.min(640, lado), cv = document.createElement("canvas");
      cv.width = cv.height = tam; cv.getContext("2d").drawImage(im, (im.width - lado) / 2, (im.height - lado) / 2, lado, lado, 0, 0, tam, tam);
      S.foto2 = cv.toDataURL("image/jpeg", 0.86); foto2 = await cargarImagen(S.foto2);
      pintarYo(); cambio(); toast(foto1 && S.conFoto ? "Listo: salen las dos fotos. Toca la de tu perfil si quieres solo la nueva." : "Foto agregada.", 3600);
    } catch { toast("No se pudo leer esa imagen. Prueba con otra (JPG o PNG)."); }
  };
  function pintarCuando() {
    const conFecha = S.modoCuando === "fecha";
    $("mat-modo").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === S.modoCuando));
    $("mat-fecha-fila").hidden = !conFecha; $("mat-cuando").hidden = conFecha; $("mat-horarios").hidden = !conFecha;
    $("mat-fecha").value = S.fecha || ""; $("mat-fecha-x").hidden = !S.fecha;
  }
  function pintarZonas() {
    const sel = $("mat-tz"), opcion = (z) => `<option value="${z.id}">${z.b} ${esc(z.n)}</option>`;
    if (!sel.options.length) { sel.innerHTML = C.ZONAS.map(opcion).join(""); sel.onchange = () => { S.tzBase = sel.value; S.tzOtros = S.tzOtros.filter((id) => id !== S.tzBase); cambio(); }; }
    sel.value = S.tzBase;
    const usados = new Set([S.tzBase].concat(S.tzOtros)), cont = $("mat-tz-chips");
    cont.innerHTML = S.tzOtros.map((id) => { const z = zona(id); return z ? `<span class="mat-chip">${z.b} ${esc(z.c)}<button type="button" data-q="${id}" aria-label="Quitar ${esc(z.c)}">✕</button></span>` : ""; }).join("") + (S.tzOtros.length < 3 ? `<select id="mat-tz-mas" aria-label="Agregar el horario de otro país"><option value="">＋ Agregar país</option>${C.ZONAS.filter((z) => !usados.has(z.id)).map(opcion).join("")}</select>` : `<span class="mat-nota">Máximo 3</span>`);
    cont.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { S.tzOtros = S.tzOtros.filter((id) => id !== b.dataset.q); cambio(); }));
    const mas = $("mat-tz-mas"); if (mas) mas.onchange = () => { if (mas.value && S.tzOtros.length < 3) { S.tzOtros.push(mas.value); cambio(); } };
    const ag = agenda();
    $("mat-horarios-vista").textContent = ag ? `${ag.conAnio} · ${ag.horarios.map((h) => `${h.pais} ${h.hora}${notaDe(h)}`).join(" · ")}` : "Elige fecha y hora: aquí ves la conversión a cada país.";
    $("mat-horarios-vista").classList.toggle("lista", !!ag);
  }
  function pintarColores() {
    $("mat-c1").value = S.c1; $("mat-c2").value = S.c2;
    $("mat-c-reset").hidden = S.c1.toUpperCase() === M.C1 && S.c2.toUpperCase() === M.C2;
  }
  function enlazarControles() {
    const campo = (id, llave) => { const el = $(id); el.value = S[llave] || ""; el.oninput = () => { S[llave] = el.value; if (llave === "nombre") nombreTocado = true; cambio(); }; };
    campo("mat-nombre", "nombre"); campo("mat-tema", "tema"); campo("mat-cuando", "cuando");
    const palanca = (id, llave) => { const el = $(id), sw = el.closest(".switch"); el.checked = !!S[llave]; sw.classList.toggle("on", el.checked); el.onchange = () => { S[llave] = el.checked; sw.classList.toggle("on", el.checked); cambio(); }; };
    palanca("mat-con-nombre", "conNombre"); palanca("mat-con-qr", "conQR"); palanca("mat-medir", "medir");
    $("mat-estilos").querySelectorAll("button").forEach((b) => { b.classList.toggle("on", b.dataset.e === S.estilo); b.onclick = () => { S.estilo = b.dataset.e; $("mat-estilos").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); cambio(); }; });
    $("mat-modo").querySelectorAll("button").forEach((b) => (b.onclick = () => { S.modoCuando = b.dataset.m; pintarCuando(); cambio(); }));
    $("mat-fecha").oninput = () => { S.fecha = $("mat-fecha").value; $("mat-fecha-x").hidden = !S.fecha; cambio(); };
    $("mat-fecha-x").onclick = () => { S.fecha = ""; pintarCuando(); cambio(); };
    const color = (id, llave) => { $(id).oninput = () => { S[llave] = $(id).value.toUpperCase(); pintarColores(); cambio(); }; };
    color("mat-c1", "c1"); color("mat-c2", "c2");
    $("mat-c-reset").onclick = () => { S.c1 = M.C1; S.c2 = M.C2; pintarColores(); cambio(); toast("De vuelta a los colores de Video Room."); };
    pintarCuando(); pintarZonas(); pintarColores();
  }
  async function cargarSesion() {
    if (S.foto2) { try { foto2 = await cargarImagen(S.foto2); } catch { S.foto2 = ""; } }
    try {
      const r = await fetch("/api/wallet/me"); if (!r.ok) return;
      me = await r.json();
      const rr = await fetch("/api/rooms/mine"); if (rr.ok) room = await rr.json();
      else if (rr.status === 401) { me = null; return; } // la sesión ya no vale (lo de «me» venía de la memoria rápida)
      if (!nombreTocado && me.name) { S.nombre = me.name; $("mat-nombre").value = me.name; }
      if (me.avatar_url) { try { const b = await (await fetch("/api/wallet/avatar")).blob(); if (b.size > 200) foto1 = await cargarImagen(URL.createObjectURL(b)); } catch {} }
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
    $("mat-sub").textContent = `${C.PIEZAS.length} diseños, ${C.PIEZAS.filter(M.conVideo).length} también en video con audio, y ${C.TEXTOS.reduce((n, g) => n + g.items.length, 0)} textos. Descarga, copia y publica.`;
    await M.listo();
    construir();
    await cargarSesion();
    pintarYo(); cambio();
  })();
  // Para probar en consola (por ejemplo, con una foto cualquiera).
  window.__mat = { S, datos, piezas: piezasDeVista, abrirVisor, repintar, agenda, cambio, ponerFoto: (src, cual) => new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => { if (cual === 2) { foto2 = im; S.foto2 = src; } else foto1 = im; pintarYo(); cambio(); res(true); }; im.onerror = () => res(false); im.src = src; }) };
})();

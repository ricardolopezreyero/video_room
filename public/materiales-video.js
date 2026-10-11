// RLR · Materiales en video: el mismo diseño, con movimiento y con audio,
// hecho por completo en el navegador. Nada se sube a ningún servidor.
//
//  · El motor pinta la pieza en un momento dado (segundos). Aquí se corre el
//    reloj: para verla en bucle o para convertirla en archivo.
//  · EL ARCHIVO se arma cuadro por cuadro (WebCodecs): cada cuadro se pinta en
//    su instante exacto y se codifica en H.264; la música se mezcla aparte, con
//    su entrada y su salida, y se codifica en AAC. Sale siempre un MP4 de 30
//    cuadros por segundo, sin cuadros perdidos y sin esperar el tiempo real,
//    que es lo que piden TikTok, Instagram, Facebook, YouTube y WhatsApp.
//  · Si el navegador no trae ese codificador, se graba el lienzo en vivo
//    (MediaRecorder), como antes: tarda lo que dura el video.
//  · LA MÚSICA es de la casa: seis fondos sin voz hechos con ElevenLabs para
//    Video Room (src/lib/musica.ts), nivelados y en /musica/. Cada pieza trae
//    el suyo según lo que dice. También se puede subir un audio propio, que no
//    sale del aparato, o bajar el video limpio, sin audio.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const M = window.MaterialesMotor, C = window.MaterialesCatalogo;
  const MUSICAS = [{ id: "auto", n: "La de la pieza" }, { id: "vivo", n: "En vivo" }, { id: "noche", n: "Noche" }, { id: "aviso", n: "Aviso" }, { id: "calma", n: "Calma" }, { id: "fiesta", n: "Fiesta" }, { id: "acustica", n: "Acústica" }];
  // Cada tipo de pieza tiene su fondo: el anuncio de hoy no suena igual que una cita o que un horario.
  const DE_PIEZA = { hero: "vivo", anuncio: "vivo", perfil: "vivo", retrato: "vivo", tipo: "fiesta", bloque: "aviso", precio: "aviso", qrGrande: "aviso", cita: "calma", lista: "noche", horarios: "noche" };
  /** Qué fondo le toca a esta pieza con lo que eligió la persona ("auto" = el suyo). */
  const musicaDe = (pieza, eleccion) => (!eleccion || eleccion === "auto" || (eleccion !== "propia" && !MUSICAS.some((m) => m.id === eleccion)) ? DE_PIEZA[pieza.a] || "vivo" : eleccion);
  let ac = null; const contexto = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
  const TONADAS = new Map(); let propia = null; // { nombre, buffer }
  const decodificar = (datos) => new Promise((ok, mal) => contexto().decodeAudioData(datos, ok, mal));

  function cargarMusica(id) {
    if (id === "propia") return propia ? Promise.resolve(propia.buffer) : Promise.reject(new Error("sin_audio_propio"));
    if (!TONADAS.has(id)) TONADAS.set(id, (async () => { const r = await fetch(`/musica/${id}.mp3`); if (!r.ok) throw new Error("no_bajo_la_musica"); return decodificar(await r.arrayBuffer()); })().catch((e) => { TONADAS.delete(id); throw e; }));
    return TONADAS.get(id);
  }
  /** Un audio de la persona (su voz, su canción). Se queda en este aparato. */
  async function ponerPropia(archivo) { const buffer = await decodificar(await archivo.arrayBuffer()); propia = { nombre: archivo.name, buffer }; return propia; }
  const audioPropio = () => propia;

  /** Pone a sonar un fondo durante `segundos`, con entrada y salida suaves. Devuelve cómo callarlo. `destino` es para grabarlo. */
  async function sonar(id, segundos, destino) {
    const a = contexto();
    if (a.state !== "running") { await Promise.race([a.resume(), new Promise((ok) => setTimeout(ok, 1500))]); if (a.state !== "running") throw new Error("audio_bloqueado"); } // sin un toque de la persona, el navegador no suelta el sonido
    const buf = await cargarMusica(id), fuente = a.createBufferSource(), vol = a.createGain(), t0 = a.currentTime + 0.02, fin = Math.min(segundos, buf.duration);
    fuente.buffer = buf; fuente.connect(vol); vol.connect(destino || a.destination);
    vol.gain.setValueAtTime(0, t0); vol.gain.linearRampToValueAtTime(0.85, t0 + 0.3); vol.gain.setValueAtTime(0.85, t0 + Math.max(0.4, fin - 1.4)); vol.gain.linearRampToValueAtTime(0, t0 + fin);
    fuente.start(t0); fuente.stop(t0 + fin + 0.05);
    return () => { try { vol.gain.cancelScheduledValues(a.currentTime); vol.gain.setTargetAtTime(0, a.currentTime, 0.04); fuente.stop(a.currentTime + 0.2); } catch (e) { /* ya había terminado */ } };
  }

  const TIPOS = ['video/mp4;codecs="avc1.640028,mp4a.40.2"', 'video/mp4;codecs="avc1.42E01F,mp4a.40.2"', "video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.42E01F", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  function tipoDeVideo(conAudio) { try { const lista = conAudio ? TIPOS : TIPOS.filter((t) => !/mp4a|opus/.test(t)).concat(TIPOS); return (window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && lista.find((t) => MediaRecorder.isTypeSupported(t))) || ""; } catch (e) { return ""; } }
  const puedeGrabar = () => !!tipoDeVideo(false);

  /** Graba la pieza en video sobre ese lienzo (queda a tamaño real mientras graba). */
  async function grabar(lienzo, pieza, d, o) {
    o = o || {}; const musica = o.musica || "", alAvance = o.alAvance || (() => {});
    const tipo = tipoDeVideo(!!musica); if (!tipo) throw new Error("sin_grabadora");
    await M.listo();
    const F = C.FORMATOS[pieza.f], plan = M.planDe(pieza, d, F.w), dd = Object.assign({}, d, { plan });
    M.pintarEn(lienzo, pieza, Object.assign({}, dd, { m: 0 }), F.w);
    const flujo = lienzo.captureStream(30); let pistas = flujo.getVideoTracks(), salida = null;
    if (musica) { await cargarMusica(musica); salida = contexto().createMediaStreamDestination(); pistas = pistas.concat(salida.stream.getAudioTracks()); }
    const grabadora = new MediaRecorder(new MediaStream(pistas), { mimeType: tipo, videoBitsPerSecond: 8e6, audioBitsPerSecond: 160000 }), trozos = [];
    grabadora.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); };
    const listo = new Promise((ok, mal) => { grabadora.onstop = ok; grabadora.onerror = (e) => mal(e.error || new Error("no_se_pudo_grabar")); });
    let callar = null; if (musica) callar = await sonar(musica, plan.D, salida);
    grabadora.start(); const t0 = performance.now();
    await new Promise((ok) => {
      const cuadro = () => { const t = (performance.now() - t0) / 1000; M.pintarEn(lienzo, pieza, Object.assign({}, dd, { m: Math.min(t, plan.D) }), F.w); alAvance(Math.min(1, t / plan.D)); if (t >= plan.D + 0.12) ok(); else if (document.hidden) setTimeout(cuadro, 33); else requestAnimationFrame(cuadro); };
      cuadro();
    });
    grabadora.stop(); await listo; if (callar) callar(); flujo.getTracks().forEach((p) => p.stop());
    const mp4 = tipo.indexOf("video/mp4") === 0;
    return { blob: new Blob(trozos, { type: mp4 ? "video/mp4" : "video/webm" }), ext: mp4 ? "mp4" : "webm", segundos: plan.D };
  }

  /* ── el archivo, cuadro por cuadro (WebCodecs + MP4) ────────────────── */
  const FPS = 30, SR = 44100, BITS_VIDEO = 5e6, BITS_AUDIO = 160000;
  const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.640032", "avc1.42001f"];
  const soporte = new Map();
  async function configVideo(w, h) {
    const k = w + "x" + h; if (soporte.has(k)) return soporte.get(k);
    let ok = null;
    if (window.VideoEncoder && window.VideoFrame && window.Mp4Muxer) for (const codec of CODECS) { const cfg = { codec, width: w, height: h, bitrate: BITS_VIDEO, framerate: FPS, avc: { format: "avc" } }; try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) { ok = cfg; break; } } catch (e) { /* ese no */ } }
    soporte.set(k, ok); return ok;
  }
  let audioCfg; // undefined = sin probar; null = este navegador no codifica AAC
  async function configAudio() {
    if (audioCfg !== undefined) return audioCfg;
    const cfg = { codec: "mp4a.40.2", sampleRate: SR, numberOfChannels: 2, bitrate: BITS_AUDIO };
    try { audioCfg = window.AudioEncoder && window.AudioData && (await AudioEncoder.isConfigSupported(cfg)).supported ? cfg : null; } catch (e) { audioCfg = null; }
    return audioCfg;
  }
  /** ¿Se puede armar el MP4 cuadro por cuadro en este navegador? (con audio pide además el codificador AAC) */
  async function puedeCodificar(conAudio) { return !!(await configVideo(1080, 1920)) && (!conAudio || !!(await configAudio())); }

  // La música del video, ya mezclada: entra suave, se sostiene y se va antes del final.
  async function mezclar(id, segundos) {
    const buf = await cargarMusica(id), n = Math.ceil(segundos * SR), oc = new OfflineAudioContext(2, n, SR);
    const fuente = oc.createBufferSource(), vol = oc.createGain(), fin = Math.min(segundos, buf.duration);
    fuente.buffer = buf; fuente.connect(vol); vol.connect(oc.destination);
    vol.gain.setValueAtTime(0, 0); vol.gain.linearRampToValueAtTime(0.85, 0.3); vol.gain.setValueAtTime(0.85, Math.max(0.4, fin - 1.4)); vol.gain.linearRampToValueAtTime(0, fin);
    fuente.start(0);
    return oc.startRendering();
  }
  const ceder = () => new Promise((ok) => setTimeout(ok, 0));

  async function codificar(pieza, d, o) {
    const musica = o.musica || "", alAvance = o.alAvance || (() => {});
    const F = C.FORMATOS[pieza.f], W = F.w - (F.w % 2), H = F.h - (F.h % 2);
    const cfgV = await configVideo(W, H), cfgA = musica ? await configAudio() : null;
    if (!cfgV || (musica && !cfgA)) throw new Error("sin_codificador");
    await M.listo();
    const plan = M.planDe(pieza, d, F.w), dd = Object.assign({}, d, { plan }), total = Math.round(plan.D * FPS);
    const pista = musica ? await mezclar(musica, total / FPS) : null;
    const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
    const mux = new Muxer({ target: new ArrayBufferTarget(), fastStart: "in-memory", firstTimestampBehavior: "offset", video: { codec: "avc", width: W, height: H, frameRate: FPS }, audio: pista ? { codec: "aac", numberOfChannels: 2, sampleRate: SR } : undefined });
    let falla = null;
    const ve = new VideoEncoder({ output: (trozo, meta) => mux.addVideoChunk(trozo, meta), error: (e) => (falla = e) });
    ve.configure(cfgV);
    const lienzo = document.createElement("canvas"), us = 1e6 / FPS;
    for (let i = 0; i < total; i++) {
      if (falla) throw falla;
      M.pintarEn(lienzo, pieza, Object.assign({}, dd, { m: Math.min(i / FPS, plan.D) }), F.w);
      const cuadro = new VideoFrame(lienzo, { timestamp: Math.round(i * us), duration: Math.round(us) });
      ve.encode(cuadro, { keyFrame: i % (FPS * 2) === 0 }); cuadro.close();
      if (i % 3 === 0) { alAvance((i / total) * (pista ? 0.92 : 1)); await ceder(); }
      while (ve.encodeQueueSize > 6) await ceder(); // que el codificador no se atragante
    }
    await ve.flush(); ve.close(); if (falla) throw falla;
    if (pista) {
      const ae = new AudioEncoder({ output: (trozo, meta) => mux.addAudioChunk(trozo, meta), error: (e) => (falla = e) });
      ae.configure(cfgA);
      const izq = pista.getChannelData(0), der = pista.numberOfChannels > 1 ? pista.getChannelData(1) : izq, PASO = 4410;
      for (let p = 0; p < pista.length; p += PASO) {
        const n = Math.min(PASO, pista.length - p), datos = new Float32Array(n * 2);
        datos.set(izq.subarray(p, p + n), 0); datos.set(der.subarray(p, p + n), n);
        const ad = new AudioData({ format: "f32-planar", sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((p / SR) * 1e6), data: datos });
        ae.encode(ad); ad.close();
        if ((p / PASO) % 20 === 0) await ceder();
      }
      await ae.flush(); ae.close(); if (falla) throw falla;
    }
    mux.finalize(); alAvance(1);
    return { blob: new Blob([mux.target.buffer], { type: "video/mp4" }), ext: "mp4", segundos: total / FPS, conAudio: !!pista, exacto: true };
  }

  /** Convierte la pieza en video. Primero cuadro por cuadro; si el navegador no puede, graba el lienzo en vivo. */
  async function hacer(lienzoDeRespaldo, pieza, d, o) {
    o = o || {};
    if (await puedeCodificar(!!o.musica)) { try { return await codificar(pieza, d, o); } catch (e) { if (e && e.message === "no_bajo_la_musica") throw e; console.warn("codificar falló, se graba en vivo", e); soporte.clear(); } }
    const r = await grabar(lienzoDeRespaldo || document.createElement("canvas"), pieza, d, o);
    return Object.assign(r, { conAudio: !!o.musica, exacto: false });
  }

  /** La reproduce en bucle sobre el lienzo (para verla antes de bajarla). Devuelve cómo pararla. */
  function reproducir(lienzo, pieza, d, o) {
    o = o || {}; const ancho = o.anchoPx, musica = o.musica || "";
    let vivo = true, callar = null, plan = null, t0 = 0, raf = 0;
    const arrancar = async () => {
      if (!vivo) return; plan = M.planDe(pieza, d, ancho); t0 = performance.now();
      if (callar) { callar(); callar = null; }
      if (musica) { try { callar = await sonar(musica, plan.D, null); } catch (e) { if (o.sinSonido) o.sinSonido(e); } t0 = performance.now(); }
      cuadro();
    };
    const cuadro = () => {
      if (!vivo) return; const t = (performance.now() - t0) / 1000;
      M.pintarEn(lienzo, pieza, Object.assign({}, d, { plan, m: Math.min(t, plan.D) }), ancho);
      if (t >= plan.D + 0.9) arrancar(); else raf = document.hidden ? setTimeout(cuadro, 200) : requestAnimationFrame(cuadro);
    };
    M.listo().then(arrancar);
    return () => { vivo = false; cancelAnimationFrame(raf); clearTimeout(raf); if (callar) callar(); };
  }

  /** ¿Este navegador puede hacer videos, de una forma o de la otra? */
  const puedeHacer = () => !!(window.VideoEncoder && window.Mp4Muxer) || puedeGrabar();
  window.MaterialesVideo = { MUSICAS, musicaDe, hacer, codificar, puedeCodificar, puedeHacer, grabar, reproducir, ponerPropia, audioPropio, cargarMusica, tipoDeVideo, puedeGrabar };
})();

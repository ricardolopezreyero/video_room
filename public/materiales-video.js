// RLR · Materiales en video: el mismo diseño, con movimiento y con audio,
// hecho por completo en el navegador (la misma técnica que en Cupido).
//  · El motor pinta la pieza en un momento dado (segundos); aquí se corre el
//    reloj: para verla en bucle o para grabarla.
//  · Se graba tomando el lienzo cuadro por cuadro (30 por segundo) y
//    mezclando el audio. Sale en MP4 donde el navegador puede; si no, en WebM.
//  · El audio: cuatro fondos de la casa (en /musica/) o un audio propio que
//    la persona sube y que no sale de su aparato.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const M = window.MaterialesMotor, C = window.MaterialesCatalogo;
  const MUSICAS = [{ id: "", n: "Sin audio" }, { id: "ritmo", n: "Ritmo" }, { id: "piano", n: "Piano" }, { id: "guitarra", n: "Guitarra" }, { id: "cuerdas", n: "Cuerdas" }];
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

  window.MaterialesVideo = { MUSICAS, grabar, reproducir, ponerPropia, audioPropio, cargarMusica, tipoDeVideo, puedeGrabar };
})();

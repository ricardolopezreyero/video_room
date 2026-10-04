// RLR · Motor de video: la máxima calidad que caben el aparato y el internet
// de cada quien, en este segundo — y la estabilidad para que un corte no sea
// un drama.
//
// El objetivo NO es ahorrar internet: es usar el que hay, con un margen para
// que nunca se trabe. Dos ejes y una regla del producto: cuando falta
// capacidad, primero se sacrifican cuadros por segundo y luego resolución;
// cuando sobra, se recupera primero la resolución y luego los cuadros.
//
// Tres piezas:
//  1. La escalera: todas las combinaciones (resolución × fps) que la cámara
//     puede dar, ordenadas de mejor a peor, con los kilobits por segundo que
//     cada peldaño necesita para verse bien.
//  2. El códec: el que este aparato codifica por hardware Y que todos los
//     aparatos del público decodifican por hardware (H.264 casi siempre).
//  3. Los motores: el del creador mide el ancho de banda y el CPU cada 2 s y
//     mueve el peldaño; el del espectador mide lo que le llega (cuadros
//     tirados, congelamientos, jitter) y lo que su aparato decodifica sin
//     sufrir, y pide la capa que corresponde.
window.MotorVideo = (() => {
  "use strict";
  const _k = "eye", _rev = 181218;

  // ---------- 1. La escalera ----------
  const RES = [[3840, 2160], [2560, 1440], [1920, 1080], [1280, 720], [960, 540], [640, 360]];
  const FPS = [60, 30, 24, 15];
  // Tres capas simulcast: f (completa), h (mitad), q (cuarto). Lo que cuesta
  // mandar las tres, relativo a la capa completa.
  const PESO_CAPAS = 1 + 1 / 3.5 + 1 / 10;

  // Bits por píxel por cuadro: generosos a propósito (queremos calidad, no
  // ahorro). VP9/AV1 rinden lo mismo con ~25 % menos.
  function kbps(w, h, fps, codec) {
    const bpp = /vp9|av1/i.test(codec || "") ? 0.055 : 0.075;
    return Math.round((w * h * fps * bpp) / 1000);
  }

  function escalera(maxW, maxH, maxFps, codec) {
    const peld = [];
    for (const [w, h] of RES) {
      if (h > maxH + 1 || w > maxW + 1) continue;
      for (const f of FPS) {
        if (f > maxFps + 0.5) continue;
        peld.push({ w, h, fps: f, kbps: kbps(w, h, f, codec) });
      }
    }
    if (!peld.length) {
      const f = Math.min(30, Math.round(maxFps) || 30);
      peld.push({ w: maxW, h: maxH, fps: f, kbps: kbps(maxW, maxH, f, codec) });
    }
    return peld; // índice 0 = el mejor peldaño
  }

  function etiqueta(p, codec, kbpsReal) {
    if (!p) return "";
    const partes = [`${p.h}p`, `${p.fps} fps`];
    if (codec) partes.push(codec);
    if (kbpsReal) partes.push(`${(kbpsReal / 1000).toFixed(1)} Mb/s`);
    return partes.join(" · ");
  }

  // ---------- 2. El códec ----------
  // H.264 es el único que decodifican por hardware prácticamente todos los
  // teléfonos (iPhone incluido): si este aparato lo codifica, va primero. El
  // SFU no transcodifica, así que lo que el creador manda es lo que todos
  // reciben — por eso la universalidad pesa más que la eficiencia. AV1 y
  // H.265 se quedan como respaldo: muchos celulares del público no los
  // decodifican por hardware y se calientan o tiran cuadros.
  async function elegirCodecs({ w = 1920, h = 1080, fps = 30 } = {}) {
    const recv = window.RTCRtpReceiver && RTCRtpReceiver.getCapabilities && RTCRtpReceiver.getCapabilities("video");
    const send = window.RTCRtpSender && RTCRtpSender.getCapabilities && RTCRtpSender.getCapabilities("video");
    if (!recv || !send) return { lista: null, nombre: "auto", eficiente: true };
    const puedeEnviar = new Set(send.codecs.map((c) => c.mimeType.toLowerCase()));
    const familias = ["video/H264", "video/VP9", "video/VP8"];
    const info = {};
    for (const fam of familias) {
      if (!puedeEnviar.has(fam.toLowerCase())) continue;
      const variante = recv.codecs.find((c) => c.mimeType === fam && (fam !== "video/H264" || /profile-level-id=(42e01f|42001f|4d001f|640c1f)/i.test(c.sdpFmtpLine || "")))
        || recv.codecs.find((c) => c.mimeType === fam);
      if (!variante) continue;
      let eff = { supported: true, smooth: true, powerEfficient: false };
      try {
        if (navigator.mediaCapabilities && navigator.mediaCapabilities.encodingInfo) {
          const perfil = fam === "video/H264" ? ((variante.sdpFmtpLine || "").match(/profile-level-id=([0-9a-f]+)/i) || [])[1] : null;
          eff = await navigator.mediaCapabilities.encodingInfo({
            type: "webrtc",
            video: { contentType: fam + (perfil ? `; profile-level-id=${perfil}` : ""), width: w, height: h, framerate: fps, bitrate: kbps(w, h, fps, fam) * 1000 },
          });
        }
      } catch {}
      if (eff.supported === false) continue;
      info[fam] = eff;
    }
    const orden = familias.filter((f) => info[f]);
    if (!orden.length) return { lista: null, nombre: "auto", eficiente: true };
    const elegido = orden[0];
    const esAux = (c) => /rtx|red|ulpfec|flexfec/i.test(c.mimeType);
    const lista = [];
    for (const fam of orden) lista.push(...recv.codecs.filter((c) => c.mimeType === fam));
    lista.push(...recv.codecs.filter((c) => !esAux(c) && !orden.includes(c.mimeType)));
    lista.push(...recv.codecs.filter(esAux));
    return { lista, nombre: elegido.replace("video/", ""), eficiente: !!info[elegido].powerEfficient, suave: info[elegido].smooth !== false };
  }

  // Hasta dónde codifica este aparato sin sufrir (por hardware y sin tirar
  // cuadros). Devuelve el peor índice permitido (0 = todo) sobre la escalera.
  async function techoCodificacion(peld, codecNombre) {
    if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.encodingInfo) return 0;
    const mime = `video/${codecNombre === "auto" ? "VP8" : codecNombre}`;
    for (let i = 0; i < peld.length; i++) {
      const p = peld[i];
      try {
        const r = await navigator.mediaCapabilities.encodingInfo({
          type: "webrtc",
          video: { contentType: mime + (codecNombre === "H264" ? "; profile-level-id=42e01f" : ""), width: p.w, height: p.h, framerate: p.fps, bitrate: p.kbps * 1000 },
        });
        if (r.supported && r.smooth && r.powerEfficient) return i;
      } catch {
        return 0;
      }
    }
    // Nada es "eficiente": acepta lo que sea "suave" (fluido aunque gaste batería).
    for (let i = 0; i < peld.length; i++) {
      try {
        const p = peld[i];
        const r = await navigator.mediaCapabilities.encodingInfo({ type: "webrtc", video: { contentType: mime, width: p.w, height: p.h, framerate: p.fps, bitrate: p.kbps * 1000 } });
        if (r.supported && r.smooth) return i;
      } catch { return 0; }
    }
    return Math.max(0, peld.length - 1);
  }

  // ---------- Audio: Opus a la máxima calidad ----------
  // Estéreo si la fuente lo da, FEC en banda (recupera paquetes perdidos sin
  // pedirlos de vuelta), sin DTX (sin "huecos" al callar), hasta 128 kb/s. Se
  // aplica a la oferta y a la respuesta: la respuesta es la que gobierna lo
  // que nuestro codificador manda. El SFU solo reenvía paquetes, así que no
  // le afecta.
  const OPUS_EXTRA = { stereo: "1", "sprop-stereo": "1", maxaveragebitrate: "128000", useinbandfec: "1", usedtx: "0", maxplaybackrate: "48000" };
  function mejorarAudioSdp(sdp) {
    if (!sdp) return sdp;
    const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
    if (!m) return sdp;
    const pt = m[1];
    const re = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
    const linea = (kv) => `a=fmtp:${pt} ` + Object.entries(kv).map(([k, v]) => (v === undefined ? k : `${k}=${v}`)).join(";");
    if (re.test(sdp)) {
      return sdp.replace(re, (_, params) => {
        const kv = {};
        params.split(";").forEach((p) => { const [k, v] = p.split("="); if (k && k.trim()) kv[k.trim()] = v; });
        Object.assign(kv, OPUS_EXTRA);
        return linea(kv);
      });
    }
    return sdp.replace(m[0], `${m[0]}\r\n${linea(OPUS_EXTRA)}`);
  }
  // Escalones de audio según el ancho de banda: nunca por debajo de 32 kb/s
  // (voz clara); 128 kb/s cuando sobra (música, ambiente).
  const AUDIO_KBPS = [128, 96, 64, 48, 32];

  // ---------- 3a. Motor del creador ----------
  // Cada 2 s lee el ancho de banda disponible (lo estima el propio WebRTC),
  // la pérdida y el motivo por el que el codificador se limita (cpu / ancho de
  // banda). Con eso mueve el peldaño: baja rápido (una lectura mala confirmada
  // por otra), sube con calma (tres lecturas buenas y 6 s desde el último
  // cambio). Si el CPU no puede con un peldaño, lo marca como techo y lo
  // vuelve a intentar un minuto después.
  class MotorPublicador {
    constructor({ pc, sender, audioSender, track, codec, onCambio }) {
      this.pc = pc; this.sender = sender; this.audioSender = audioSender || null;
      this.codec = codec || "auto"; this.onCambio = onCambio || (() => {});
      this.ema = null; this.buenas = 0; this.malas = 0; this.cpuMalas = 0;
      this.techoCpu = 0; this.techoHasta = 0; this.techoAparato = 0;
      this.actual = null; this.indice = null; this.ultimoCambio = 0;
      this.bytesPrev = null; this.tPrev = null; this.kbpsReal = 0;
      this.audioKbps = 128; this.timer = null; this.pausado = false;
      this.setTrack(track);
    }
    setTrack(track) {
      this.track = track;
      const s = (track && track.getSettings && track.getSettings()) || {};
      let caps = {};
      try { caps = (track && track.getCapabilities && track.getCapabilities()) || {}; } catch {}
      const maxW = (caps.width && caps.width.max) || s.width || 1280;
      const maxH = (caps.height && caps.height.max) || s.height || 720;
      const maxFps = (caps.frameRate && caps.frameRate.max) || s.frameRate || 30;
      // Compartir pantalla: 30 fps bastan para pantalla y 60 cuestan el doble.
      const esPantalla = track && track.getSettings && /screen|window|monitor|browser/i.test((s.displaySurface || "") + (track.label || ""));
      this.peld = escalera(maxW, maxH, esPantalla ? Math.min(30, maxFps) : maxFps, this.codec);
      this.esPantalla = !!esPantalla;
      this.techoCpu = 0; this.cpuMalas = 0;
      // Fuente nueva (otra cámara, pantalla): mismo peldaño, re-aplicado a la
      // nueva escalera, para no arrancar desde abajo.
      if (this.indice != null) {
        this.indice = Math.min(this.indice, this.peld.length - 1);
        this.actual = null;
        this.aplicar(this.indice, "fuente").catch(() => {});
      }
    }
    async arrancar() {
      // Techo del aparato (lo que codifica sin sufrir) y punto de partida: un
      // peldaño cómodo (≤1080p30) para que el primer cuadro salga ya; de ahí
      // se sube conforme el ancho de banda lo confirma.
      try { this.techoAparato = await techoCodificacion(this.peld, this.codec); } catch { this.techoAparato = 0; }
      let inicio = this.peld.findIndex((p) => p.h <= 1080 && p.fps <= 30);
      if (inicio < 0) inicio = this.peld.length - 1;
      await this.aplicar(Math.max(inicio, this.techoAparato), "inicio");
      clearInterval(this.timer);
      this.timer = setInterval(() => this.paso().catch(() => {}), 2000);
    }
    detener() { clearInterval(this.timer); this.timer = null; }
    setPc(pc, sender, audioSender) { this.pc = pc; this.sender = sender; this.audioSender = audioSender || this.audioSender; this.bytesPrev = null; this.ema = null; }

    async leer() {
      const r = { disponible: null, rtt: null, perdida: null, limitacion: "none", fps: null, alto: null, kbps: null };
      const stats = await this.pc.getStats();
      let bytes = 0, hayBytes = false;
      stats.forEach((s) => {
        if (s.type === "candidate-pair" && s.state === "succeeded") {
          if (s.availableOutgoingBitrate != null) r.disponible = s.availableOutgoingBitrate;
          if (s.currentRoundTripTime != null) r.rtt = s.currentRoundTripTime;
        }
        if (s.type === "outbound-rtp" && s.kind === "video") {
          if (s.bytesSent != null) { bytes += s.bytesSent; hayBytes = true; }
          if (!s.rid || s.rid === "f") {
            if (s.qualityLimitationReason) r.limitacion = s.qualityLimitationReason;
            if (s.framesPerSecond != null) r.fps = s.framesPerSecond;
            if (s.frameHeight != null) r.alto = s.frameHeight;
          }
        }
        if (s.type === "remote-inbound-rtp" && s.kind === "video" && s.fractionLost != null) r.perdida = s.fractionLost;
      });
      const t = performance.now();
      if (hayBytes && this.bytesPrev != null && t > this.tPrev) r.kbps = Math.round(((bytes - this.bytesPrev) * 8) / (t - this.tPrev));
      this.bytesPrev = hayBytes ? bytes : null; this.tPrev = t;
      return r;
    }

    async paso() {
      if (this.pausado || !this.pc || this.pc.connectionState === "closed") return;
      const l = await this.leer();
      this.kbpsReal = l.kbps || 0;
      if (l.disponible != null) this.ema = this.ema == null ? l.disponible : this.ema * 0.6 + l.disponible * 0.4;

      // CPU: dos lecturas seguidas limitadas por cpu → el peldaño actual es
      // demasiado para este aparato ahora mismo; techo un peldaño abajo, por 60 s.
      if (l.limitacion === "cpu") this.cpuMalas++; else this.cpuMalas = 0;
      if (this.cpuMalas >= 2 && this.indice != null && this.indice < this.peld.length - 1) {
        this.techoCpu = this.indice + 1; this.techoHasta = Date.now() + 60000; this.cpuMalas = 0;
      }
      if (this.techoCpu && Date.now() > this.techoHasta) this.techoCpu = 0;

      // Peldaño que cabe en el ancho de banda (80 % del estimado, tres capas).
      const presupuesto = this.ema != null ? (this.ema * 0.8) / 1000 : null;
      let objetivo = this.indice == null ? 0 : this.indice;
      if (presupuesto != null) {
        objetivo = this.peld.findIndex((p) => p.kbps * PESO_CAPAS <= presupuesto);
        if (objetivo < 0) objetivo = this.peld.length - 1;
      }
      const mala = (l.perdida != null && l.perdida > 0.05) || (l.rtt != null && l.rtt > 0.4) || l.limitacion === "bandwidth";
      const buena = (l.perdida == null || l.perdida < 0.01) && (l.rtt == null || l.rtt < 0.2) && l.limitacion === "none";
      if (mala) { this.malas++; this.buenas = 0; } else if (buena) { this.buenas++; this.malas = 0; } else { this.malas = 0; this.buenas = 0; }

      objetivo = Math.max(objetivo, this.techoCpu, this.techoAparato);
      const actual = this.indice == null ? this.peld.length - 1 : this.indice;
      const desde = Date.now() - this.ultimoCambio;
      if (objetivo > actual || (mala && this.malas >= 2)) {
        // Bajar: ya (si la red se queja dos veces, un peldaño aunque el estimado no lo diga).
        const destino = objetivo > actual ? objetivo : Math.min(this.peld.length - 1, actual + 1);
        if (destino !== actual && desde > 2500) await this.aplicar(destino, "baja");
        if (mala) this.malas = 0;
      } else if (objetivo < actual && this.buenas >= 3 && desde > 6000) {
        // Subir: un peldaño por vez, con calma.
        await this.aplicar(actual - 1, "sube");
        this.buenas = 0;
      }
      // Audio: escalón según ancho de banda sobrante (nunca menos de 32 kb/s).
      if (this.audioSender && presupuesto != null) {
        const sobra = presupuesto - (this.actual ? this.actual.kbps * PESO_CAPAS : 0);
        const kb = sobra > 600 ? 128 : sobra > 300 ? 96 : sobra > 150 ? 64 : sobra > 60 ? 48 : 32;
        if (kb !== this.audioKbps) await this.ajustarAudio(kb);
      }
      this.onCambio(this.actual, { codec: this.codec, kbps: this.kbpsReal, disponible: this.ema, limitacion: l.limitacion, rtt: l.rtt, perdida: l.perdida, motivo: null });
    }

    async ajustarAudio(kb) {
      this.audioKbps = kb;
      try {
        const p = this.audioSender.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = kb * 1000;
        await this.audioSender.setParameters(p);
      } catch {}
    }

    async aplicar(i, motivo) {
      i = Math.max(0, Math.min(this.peld.length - 1, i));
      const p = this.peld[i];
      const antes = this.actual;
      this.indice = i; this.actual = p; this.ultimoCambio = Date.now();
      // 1) La cámara captura justo lo del peldaño: capturar 4K para mandar
      //    360p gasta batería sin ganar nada.
      if (this.track && this.track.readyState === "live" && !this.esPantalla && (!antes || antes.w !== p.w || antes.fps !== p.fps)) {
        try { await this.track.applyConstraints({ width: { ideal: p.w }, height: { ideal: p.h }, frameRate: { ideal: p.fps, max: p.fps } }); } catch {}
      }
      // 2) El codificador: tope de bits y de fps por capa. La regla del
      //    producto va aquí también: ante apuros, el codificador conserva la
      //    resolución y baja cuadros (maintain-resolution).
      try {
        const params = this.sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        params.degradationPreference = "maintain-resolution";
        for (const e of params.encodings) {
          if (params.encodings.length === 1 || e.rid === "f") { e.maxBitrate = p.kbps * 1000; e.maxFramerate = p.fps; e.active = true; }
          else if (e.rid === "h") { e.maxBitrate = Math.round((p.kbps * 1000) / 3.5); e.maxFramerate = Math.min(30, p.fps); e.active = p.h >= 540; }
          else if (e.rid === "q") { e.maxBitrate = Math.round((p.kbps * 1000) / 10); e.maxFramerate = Math.min(15, p.fps); e.active = p.h >= 360; }
        }
        await this.sender.setParameters(params);
      } catch {}
      this.onCambio(p, { codec: this.codec, kbps: this.kbpsReal, disponible: this.ema, motivo });
    }
  }

  // ---------- 3b. Lo que ve el espectador ----------
  // Lee lo que de verdad está llegando: cuadros tirados, congelamientos,
  // jitter, pérdida, rtt, y cuánto tarda este aparato en decodificar cada
  // cuadro. Con eso, quien lo llama decide pedir otra capa.
  class LectorEntrada {
    constructor(pc) { this.pc = pc; this.prev = null; }
    async leer() {
      const r = { rtt: null, perdida: null, fps: null, alto: null, ancho: null, congelamientos: 0, tirados: 0, jitter: null, msDecod: null, codec: null, kbps: null };
      const stats = await this.pc.getStats();
      let codecId = null, ahora = { lost: 0, recv: 0, freeze: 0, dropped: 0, decoded: 0, decodeTime: 0, bytes: 0, t: performance.now() };
      stats.forEach((s) => {
        if (s.type === "candidate-pair" && s.state === "succeeded" && s.currentRoundTripTime != null) r.rtt = s.currentRoundTripTime;
        if (s.type === "inbound-rtp" && s.kind === "video") {
          ahora.lost = s.packetsLost || 0; ahora.recv = s.packetsReceived || 0; ahora.freeze = s.freezeCount || 0;
          ahora.dropped = s.framesDropped || 0; ahora.decoded = s.framesDecoded || 0; ahora.decodeTime = s.totalDecodeTime || 0; ahora.bytes = s.bytesReceived || 0;
          if (s.framesPerSecond != null) r.fps = s.framesPerSecond;
          if (s.frameHeight != null) { r.alto = s.frameHeight; r.ancho = s.frameWidth; }
          if (s.jitter != null) r.jitter = s.jitter;
          codecId = s.codecId || null;
        }
      });
      if (codecId) { const c = stats.get ? stats.get(codecId) : null; if (c && c.mimeType) r.codec = c.mimeType.replace("video/", ""); }
      if (this.prev) {
        const dl = ahora.lost - this.prev.lost, dr = ahora.recv - this.prev.recv;
        r.perdida = dl + dr > 0 ? dl / (dl + dr) : 0;
        r.congelamientos = Math.max(0, ahora.freeze - this.prev.freeze);
        r.tirados = Math.max(0, ahora.dropped - this.prev.dropped);
        const dd = ahora.decoded - this.prev.decoded;
        if (dd > 0) r.msDecod = ((ahora.decodeTime - this.prev.decodeTime) * 1000) / dd;
        if (ahora.t > this.prev.t) r.kbps = Math.round(((ahora.bytes - this.prev.bytes) * 8) / (ahora.t - this.prev.t));
      }
      this.prev = ahora;
      return r;
    }
  }

  // ¿Qué capa aguanta este aparato sin tirar cuadros ni calentarse? Se
  // pregunta una vez, con el códec real que está llegando. Devuelve "f", "h" o "q".
  async function techoDecodificacion(codec, w, h, fps) {
    if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.decodingInfo || !codec) return "f";
    const mime = `video/${codec}` + (/h264/i.test(codec) ? "; profile-level-id=42e01f" : "");
    const probar = async (ww, hh, ff) => {
      try {
        const r = await navigator.mediaCapabilities.decodingInfo({ type: "webrtc", video: { contentType: mime, width: ww, height: hh, framerate: ff, bitrate: kbps(ww, hh, ff, codec) * 1000 } });
        return r.supported && r.smooth && (r.powerEfficient || hh <= 720);
      } catch { return true; }
    };
    if (await probar(w, h, fps)) return "f";
    if (await probar(Math.round(w / 2), Math.round(h / 2), Math.min(30, fps))) return "h";
    return "q";
  }

  // Estabilidad vs. en vivo: cuando la red tiembla, un colchón de unos cientos
  // de ms evita congelamientos a cambio de ese retraso; cuando se calma, se
  // quita y vuelve el "en vivo" puro. Solo donde el navegador lo soporta.
  function ajustarColchon(pc, ms) {
    try {
      for (const rc of pc.getReceivers()) {
        if ("jitterBufferTarget" in rc) rc.jitterBufferTarget = ms > 0 ? ms : null;
        else if ("playoutDelayHint" in rc) rc.playoutDelayHint = ms > 0 ? ms / 1000 : null;
      }
    } catch {}
  }

  // ---------- 4. Filtros de color, por GPU ----------
  // Un clic y se pone, sin retraso: la cámara pasa por un shader de WebGL
  // (saturación, contraste, sepia, blanco y negro, calidez) y lo que sale de
  // ahí es lo que se publica y lo que el creador ve en su vista previa. Con
  // "normal" no pasa por nada: la cámara va directa y el bucle se pausa.
  const FILTROS = {
    normal: { nombre: "Normal", icono: "🎥", desc: "Tu cámara tal cual.", sat: 1, con: 1, bri: 0, sep: 0, gris: 0, cal: 0 },
    color: { nombre: "Más color", icono: "🌈", desc: "Colores más vivos y un poco más de contraste.", sat: 1.4, con: 1.08, bri: 0.01, sep: 0, gris: 0, cal: 0.15 },
    suave: { nombre: "Menos color", icono: "🌫️", desc: "Tonos suaves, más calma en la imagen.", sat: 0.65, con: 0.96, bri: 0.03, sep: 0, gris: 0, cal: 0.2 },
    bn: { nombre: "Blanco y negro", icono: "⬛", desc: "Clásico, con buen contraste.", sat: 1, con: 1.12, bri: 0.02, sep: 0, gris: 1, cal: 0 },
    sepia: { nombre: "Sepia", icono: "🟤", desc: "Cálido, como foto antigua.", sat: 1, con: 1.04, bri: 0.02, sep: 0.85, gris: 0, cal: 0.1 },
  };
  const VS = "attribute vec2 p; varying vec2 t; void main(){ t = vec2((p.x+1.0)/2.0, (1.0-p.y)/2.0); gl_Position = vec4(p,0.0,1.0); }";
  const FS = `precision mediump float; varying vec2 t; uniform sampler2D u; uniform float sat, con, bri, sep, gris, cal;
    void main(){
      vec3 c = texture2D(u, t).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = mix(c, vec3(l), gris);
      vec3 s = vec3(dot(c, vec3(0.393,0.769,0.189)), dot(c, vec3(0.349,0.686,0.168)), dot(c, vec3(0.272,0.534,0.131)));
      c = mix(c, s, sep);
      c = (c - 0.5) * con + 0.5 + bri;
      c += vec3(0.05, 0.015, -0.05) * cal;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`;
  function crearFiltro({ track }) {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: false, desynchronized: true });
    if (!gl || !canvas.captureStream) return null;
    const sh = (tipo, src) => { const h = gl.createShader(tipo); gl.shaderSource(h, src); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    let prog;
    try {
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch { return null; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const U = {}; for (const k of ["sat", "con", "bri", "sep", "gris", "cal"]) U[k] = gl.getUniformLocation(prog, k);

    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.autoplay = true;
    video.style.cssText = "position:fixed; left:-9999px; top:0; width:2px; height:2px;";
    document.body.appendChild(video);
    const salida = canvas.captureStream(0);
    const outTrack = salida.getVideoTracks()[0];
    let actual = FILTROS.normal, nombre = "normal", activo = false, vivo = true;
    function setFuente(t) { video.srcObject = new MediaStream([t]); video.play().catch(() => {}); }
    setFuente(track);
    function cuadro() {
      if (!vivo) return;
      if (activo && video.readyState >= 2 && video.videoWidth) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; gl.viewport(0, 0, canvas.width, canvas.height); }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
        gl.uniform1f(U.sat, actual.sat); gl.uniform1f(U.con, actual.con); gl.uniform1f(U.bri, actual.bri);
        gl.uniform1f(U.sep, actual.sep); gl.uniform1f(U.gris, actual.gris); gl.uniform1f(U.cal, actual.cal);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (outTrack.requestFrame) outTrack.requestFrame();
      }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(cuadro); else requestAnimationFrame(cuadro);
    }
    cuadro();
    return {
      track: outTrack,
      get nombre() { return nombre; },
      get activo() { return activo; },
      setFiltro(n) { actual = FILTROS[n] || FILTROS.normal; nombre = FILTROS[n] ? n : "normal"; activo = nombre !== "normal"; },
      setFuente,
      destruir() { vivo = false; try { outTrack.stop(); } catch {} try { video.srcObject = null; video.remove(); } catch {} },
    };
  }

  return { escalera, kbps, etiqueta, elegirCodecs, techoCodificacion, mejorarAudioSdp, AUDIO_KBPS, MotorPublicador, LectorEntrada, techoDecodificacion, ajustarColchon, FILTROS, crearFiltro, _rev };
})();

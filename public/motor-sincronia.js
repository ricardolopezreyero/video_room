// RLR · Motor de sincronía: que una conversación en vivo entre dos personas
// se sienta como estar en el mismo cuarto, y que el público la vea acomodada.
//
// De dónde sale el retraso entre que alguien habla y el otro lo oye (boca a
// oído), con cifras típicas en una conexión normal:
//   captura de audio 10 ms · procesado (eco, ruido) 10–20 ms · Opus 20 ms de
//   cuadro + 5 de anticipación · red hasta el SFU 15–30 ms · SFU 1–3 ms · red
//   del SFU acá 15–30 ms · colchón de llegada 20–150 ms · bocina 20–40 ms.
//   El video suma un cuadro al capturar (33 ms a 30 fps) y otro al decodificar
//   y pintar, por eso SIEMPRE llega después que el audio.
// Lo que sí se puede mover desde el navegador:
//   1. El colchón de llegada (jitterBufferTarget). Es el único pedazo grande
//      que controlamos. Para quien conversa arranca en cero y solo crece si
//      hay cortes; para quien mira, se iguala al del creador.
//   2. Cómo se codifica lo que sale: audio mono de voz a 64 kb/s con corrección
//      de errores, video a 30 fps (un cuadro menos de espera que a 24) con
//      prioridad a los cuadros por segundo sobre la resolución, y H.264 para
//      que todos los aparatos lo decodifiquen por hardware (decodificar rápido
//      también es latencia).
//   3. La captura: buffer de audio de 10 ms y cámara a 720p30, que se escala
//      al tamaño que la sala le dé.
// Lo que NO se puede mover: el navegador alinea audio y video del mismo
// emisor retrasando al que llega antes (el audio) hasta el video. Por eso
// bajar la latencia del VIDEO es bajar la del audio también: cada cuadro de
// menos en el camino del video son 33 ms menos en la conversación.
//
// Dos reglas distintas según quién escucha:
//   · Conversación (el creador oyendo al invitado, el invitado oyendo al
//     creador): el colchón más chico que la red aguante. Sube 30 ms cuando
//     hay ocultamiento de audio, congelamientos o pérdida; baja 10 ms tras
//     seis segundos limpios. Audio y video con el mismo objetivo, para que la
//     alineación del navegador no tenga que agregar nada.
//   · Alineado (el público oyendo al invitado): el invitado llega con el
//     mismo retraso que el creador, medido en vivo. Así una pregunta y su
//     respuesta se oyen al ritmo en que ocurrieron, no la respuesta antes de
//     que termine la pregunta.
window.MotorSincronia = (() => {
  "use strict";
  const _k = "eye", _rev = 181218;

  // Tamaños de la ficha del invitado (los pone el creador) → cómo codifica.
  // El que manda es el mismo para toda la sala, así que la ficha chica recibe
  // 360p y la de a dúo 720p, sin que el invitado toque nada.
  const TAMANOS = {
    1: { nombre: "Ficha", scale: 2, kbps: 500 },
    2: { nombre: "Mediana", scale: 1.5, kbps: 1200 },
    3: { nombre: "A dúo", scale: 1, kbps: 2500 },
    4: { nombre: "Protagonista", scale: 1, kbps: 3500 },
  };
  const FIJO_MS = 75; // captura + codificar + decodificar + pintar, estimado
  const TOPE_CONVERSACION = 150;

  // ---------- Captura ----------
  function capturaVoz() {
    return { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 }, latency: { ideal: 0.01 }, voiceIsolation: true };
  }
  function capturaCamara() {
    return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" };
  }

  // ---------- Lo que sale ----------
  // Opus como voz: mono, 64 kb/s, con corrección de errores dentro del propio
  // paquete (FEC) y sin silencios "recortados" (DTX apaga el flujo y al volver
  // cuesta un cuadro). Se escribe en la respuesta del SFU porque el
  // codificador obedece lo que el otro lado dice que quiere.
  const OPUS_VOZ = { stereo: "0", "sprop-stereo": "0", maxaveragebitrate: "64000", useinbandfec: "1", usedtx: "0", maxplaybackrate: "48000", cbr: "0" };
  function sdpVozConversacion(sdp) {
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
        Object.assign(kv, OPUS_VOZ);
        return linea(kv);
      });
    }
    return sdp.replace(m[0], `${m[0]}\r\n${linea(OPUS_VOZ)}`);
  }
  // Cuadros por segundo antes que resolución: en una conversación, que la
  // boca se mueva fluida importa más que ver cada pelo. `pantalla` invierte
  // la regla (texto nítido, 15 fps bastan).
  async function emisor(sender, tamano, { pantalla = false } = {}) {
    if (!sender || !sender.getParameters) return;
    const t = TAMANOS[tamano] || TAMANOS[1];
    try {
      const p = sender.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].scaleResolutionDownBy = pantalla ? 1 : t.scale;
      p.encodings[0].maxBitrate = t.kbps * 1000;
      p.encodings[0].maxFramerate = pantalla ? 15 : 30;
      p.degradationPreference = pantalla ? "maintain-resolution" : "maintain-framerate";
      await sender.setParameters(p);
    } catch {}
  }

  // ---------- Medir lo que llega ----------
  const previas = new WeakMap();
  async function medir(pc) {
    const r = { rtt: null, bufferAudioMs: null, bufferVideoMs: null, ocultamiento: 0, congelamientos: 0, perdida: 0, jitterAudioMs: null, jitterVideoMs: null, bocaOidoMs: null };
    let stats;
    try { stats = await pc.getStats(); } catch { return r; }
    const ahora = { t: performance.now(), aDelay: 0, aCount: 0, vDelay: 0, vCount: 0, ocultas: 0, muestras: 0, lost: 0, recv: 0, freeze: 0 };
    stats.forEach((s) => {
      if (s.type === "candidate-pair" && s.state === "succeeded" && s.currentRoundTripTime != null) r.rtt = s.currentRoundTripTime;
      if (s.type !== "inbound-rtp") return;
      ahora.lost += s.packetsLost || 0; ahora.recv += s.packetsReceived || 0;
      if (s.kind === "audio") {
        ahora.aDelay = s.jitterBufferDelay || 0; ahora.aCount = s.jitterBufferEmittedCount || 0;
        ahora.ocultas = s.concealedSamples || 0; ahora.muestras = s.totalSamplesReceived || 0;
        if (s.jitter != null) r.jitterAudioMs = s.jitter * 1000;
      } else if (s.kind === "video") {
        ahora.vDelay = s.jitterBufferDelay || 0; ahora.vCount = s.jitterBufferEmittedCount || 0;
        ahora.freeze = s.freezeCount || 0;
        if (s.jitter != null) r.jitterVideoMs = s.jitter * 1000;
      }
    });
    const prev = previas.get(pc);
    if (prev) {
      const da = ahora.aCount - prev.aCount, dv = ahora.vCount - prev.vCount;
      if (da > 0) r.bufferAudioMs = ((ahora.aDelay - prev.aDelay) / da) * 1000;
      if (dv > 0) r.bufferVideoMs = ((ahora.vDelay - prev.vDelay) / dv) * 1000;
      const dm = ahora.muestras - prev.muestras;
      if (dm > 0) r.ocultamiento = Math.max(0, ahora.ocultas - prev.ocultas) / dm;
      r.congelamientos = Math.max(0, ahora.freeze - prev.freeze);
      const dl = ahora.lost - prev.lost, dr = ahora.recv - prev.recv;
      r.perdida = dl + dr > 0 ? Math.max(0, dl) / (dl + dr) : 0;
    }
    previas.set(pc, ahora);
    // Boca a oído, estimado: ida del que habla al SFU más vuelta del SFU acá
    // (≈ un RTT completo), lo que espera en el colchón y lo fijo de codificar.
    if (r.rtt != null && r.bufferAudioMs != null) r.bocaOidoMs = Math.round(r.rtt * 1000 + r.bufferAudioMs + FIJO_MS);
    return r;
  }

  // Un solo objetivo para audio y video: la alineación del navegador no
  // tiene que agregar nada por su cuenta. 0 = lo mínimo que la red aguante.
  function fijarObjetivo(pc, ms) {
    try {
      for (const rc of pc.getReceivers()) {
        if ("jitterBufferTarget" in rc) rc.jitterBufferTarget = ms;
        else if ("playoutDelayHint" in rc) rc.playoutDelayHint = ms / 1000;
      }
    } catch {}
  }

  // ---------- Regla 1: conversación ----------
  function conversacion(pc, { onEstado } = {}) {
    let actual = pc, objetivo = 0, aplicado = -1, limpio = 0, ultima = null;
    fijarObjetivo(actual, 0);
    const tic = async () => {
      const m = await medir(actual);
      ultima = m;
      const malo = m.ocultamiento > 0.03 || m.congelamientos > 0 || m.perdida > 0.05;
      if (malo) { objetivo = Math.min(TOPE_CONVERSACION, objetivo + 30); limpio = 0; }
      else if (++limpio >= 6) { objetivo = Math.max(0, objetivo - 10); limpio = 0; }
      if (objetivo !== aplicado) { fijarObjetivo(actual, objetivo); aplicado = objetivo; }
      if (onEstado) onEstado({ ...m, objetivoMs: objetivo, modo: "conversacion" });
    };
    const timer = setInterval(tic, 1000);
    return {
      detener: () => clearInterval(timer),
      estado: () => ({ objetivoMs: objetivo, ultima, modo: "conversacion" }),
      // La conexión principal del espectador se reemplaza al cambiar de
      // calidad o reconectar: el motor sigue con la nueva, mismo objetivo.
      rePc: (nuevo) => { actual = nuevo; aplicado = -1; limpio = 0; },
    };
  }

  // ---------- Regla 2: alineado al creador ----------
  // Cada 2 s se mide cuánto espera el audio del creador en su colchón y se le
  // pide al del invitado esperar lo mismo. Promedio móvil y banda muerta de
  // 20 ms para no estar moviendo el objetivo a cada rato.
  function alineado(pcPrincipal, pcInvitado, { onEstado } = {}) {
    let principal = pcPrincipal, meta = null, aplicado = -1, ultima = null;
    const tic = async () => {
      const [mp, mi] = await Promise.all([medir(principal), medir(pcInvitado)]);
      ultima = { creador: mp, invitado: mi };
      if (mp.bufferAudioMs != null) meta = meta == null ? mp.bufferAudioMs : meta * 0.5 + mp.bufferAudioMs * 0.5;
      if (meta != null) {
        const obj = Math.max(0, Math.min(2000, Math.round(meta)));
        if (aplicado < 0 || Math.abs(obj - aplicado) > 20) { fijarObjetivo(pcInvitado, obj); aplicado = obj; }
      }
      if (onEstado) onEstado({ ...mi, objetivoMs: aplicado < 0 ? null : aplicado, modo: "alineado" });
    };
    const timer = setInterval(tic, 2000);
    return {
      detener: () => clearInterval(timer),
      estado: () => ({ objetivoMs: aplicado, ultima, modo: "alineado" }),
      rePrincipal: (nuevo) => { principal = nuevo; },
    };
  }

  return { TAMANOS, capturaVoz, capturaCamara, sdpVozConversacion, emisor, medir, fijarObjetivo, conversacion, alineado, _rev };
})();

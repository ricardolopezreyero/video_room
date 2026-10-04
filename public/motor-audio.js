// RLR · Motor de audio: captar todo, limpiar poquito, poner la voz al frente.
//
// Un buen audio cambia la experiencia entera, y casi nadie lo cuida. Aquí se
// cuida en tres pasos:
//
//  1. Captación. Al micrófono se le pide todo: 48 kHz, estéreo si lo da, y el
//     procesamiento del navegador solo cuando ayuda (cancelación de eco y
//     supresión de ruido en modo Voz; en modo Música se apagan, porque esos
//     filtros están hechos para llamadas y aplastan los instrumentos).
//  2. Procesamiento (Web Audio, en el aparato del creador, ~10 ms): corte de
//     graves que no son voz, un poco menos de "caja" en 160 Hz, presencia en
//     3 kHz (donde vive la inteligibilidad), aire arriba de 9 kHz, una puerta
//     suave que baja el ruido de fondo cuando nadie habla (nunca corta a
//     cero: lo ambiente que es parte del video se queda), un compresor que
//     empareja el volumen y un limitador para que nada distorsione. Si el
//     creador comparte pantalla con audio (música, un video), ese audio entra
//     por debajo de la voz y baja solo cuando la persona habla (ducking):
//     primero la voz, luego los instrumentos.
//  3. Entrega: dos versiones del mismo audio ya procesado, "audio" (Opus
//     hasta 128 kb/s, estéreo, FEC) y "audio_lo" (48 kb/s) para quien anda
//     con red floja; el SFU reenvía la que pide cada espectador.
//
// Tres modos, porque la máquina no puede adivinar qué ruido es molesto y cuál
// es parte de la escena: Voz (clase, consultoría), Música (instrumentos,
// canto) y Ambiente (calle, naturaleza, taller). El creador elige en el dock.
window.MotorAudio = (() => {
  "use strict";
  const _k = "eye", _rev = 181218;

  // Un ajuste por ambiente: qué se le pide al micrófono y cómo se trata la
  // señal. "pad" baja la entrada cuando la fuente es muy fuerte (concierto).
  const MODOS = {
    voz: {
      nombre: "Voz", icono: "🎙️", desc: "Clase, consultoría, plática. Eco y ruido fuera, tu voz al frente.",
      captura: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      hp: 85, shelfBajo: { f: 160, g: -2.5 }, presencia: { f: 3000, q: 0.9, g: 3 }, aire: { f: 9000, g: 1.5 },
      comp: { th: -24, knee: 12, ratio: 3, att: 0.004, rel: 0.18 }, puerta: { umbral: -50 }, ducking: 0.18, pad: 1,
    },
    musica: {
      nombre: "Música", icono: "🎵", desc: "Instrumentos o canto en casa. Sin los filtros de llamada que los aplastan.",
      captura: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      hp: 30, shelfBajo: null, presencia: { f: 2500, q: 1.2, g: 1.5 }, aire: { f: 11000, g: 1 },
      comp: { th: -16, knee: 20, ratio: 1.8, att: 0.02, rel: 0.35 }, puerta: null, ducking: 0.5, pad: 1,
    },
    concierto: {
      nombre: "Concierto", icono: "🎸", desc: "Música fuerte en vivo. Entrada atenuada para que no sature, dinámica completa.",
      captura: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      hp: 35, shelfBajo: { f: 120, g: -1.5 }, presencia: { f: 2500, q: 1.2, g: 1 }, aire: { f: 10000, g: 1 },
      comp: { th: -12, knee: 24, ratio: 1.5, att: 0.03, rel: 0.4 }, puerta: null, ducking: 0.6, pad: 0.55,
    },
    sala: {
      nombre: "Sala", icono: "🛋️", desc: "Cuarto con eco. Menos retumbo, más claridad en la voz.",
      captura: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      hp: 110, shelfBajo: { f: 250, g: -3 }, presencia: { f: 3200, q: 1, g: 3.5 }, aire: { f: 8000, g: 1 },
      comp: { th: -22, knee: 10, ratio: 3.5, att: 0.004, rel: 0.2 }, puerta: { umbral: -48 }, ducking: 0.18, pad: 1,
    },
    carro: {
      nombre: "Carro", icono: "🚗", desc: "Motor y camino de fondo. Se quita el retumbo grave, la voz sube.",
      captura: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      hp: 160, shelfBajo: { f: 220, g: -4 }, presencia: { f: 3000, q: 1, g: 3 }, aire: { f: 7000, g: 2 },
      comp: { th: -24, knee: 10, ratio: 3, att: 0.004, rel: 0.2 }, puerta: { umbral: -44 }, ducking: 0.18, pad: 1,
    },
    calle: {
      nombre: "Calle", icono: "🏙️", desc: "Tráfico, viento, gente. Ruido fuera cuando no hablas, tu voz clara.",
      captura: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      hp: 130, shelfBajo: { f: 200, g: -3 }, presencia: { f: 3000, q: 1, g: 3 }, aire: { f: 8000, g: 1.5 },
      comp: { th: -22, knee: 10, ratio: 3.5, att: 0.004, rel: 0.2 }, puerta: { umbral: -42 }, ducking: 0.18, pad: 1,
    },
  };
  const ORDEN_MODOS = ["voz", "musica", "concierto", "sala", "carro", "calle"];

  // Lo que se le pide al micrófono según el modo. Siempre lo máximo que dé.
  function capturaPara(modo) {
    const m = MODOS[modo] || MODOS.voz; // "auto" arranca como voz y se ajusta después
    const c = { channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 24 }, latency: { ideal: 0.01 }, ...m.captura };
    // Chrome (macOS/Windows) tiene aislamiento de voz por hardware/SO: solo en Voz.
    if (modo === "voz") c.voiceIsolation = true;
    return c;
  }

  // Puerta/expansor suave como AudioWorklet (corre en el hilo de audio, sin
  // cortes). Baja −18 dB cuando el nivel cae del umbral; sube en 3 ms al
  // volver la voz, baja en 250 ms al callar. Con histéresis de 6 dB para no
  // aletear. Nunca corta a cero: el ambiente que es parte del video se queda.
  const PUERTA_SRC = `
    class VrPuerta extends AudioWorkletProcessor {
      static get parameterDescriptors() { return [{ name: "umbral", defaultValue: -50 }, { name: "activa", defaultValue: 1 }]; }
      constructor() { super(); this.env = 0; this.g = 1; this.abierta = true; }
      process(inputs, outputs, params) {
        const inp = inputs[0], out = outputs[0];
        if (!inp || !inp.length) return true;
        const activa = params.activa[0] > 0.5;
        const abre = Math.pow(10, params.umbral[0] / 20), cierra = abre * 0.5;
        const kAtt = 1 - Math.exp(-1 / (sampleRate * 0.003)), kRel = Math.exp(-1 / (sampleRate * 0.25)), kEnv = Math.exp(-1 / (sampleRate * 0.02));
        const n = inp[0].length;
        for (let i = 0; i < n; i++) {
          let pico = 0;
          for (let c = 0; c < inp.length; c++) { const v = Math.abs(inp[c][i]); if (v > pico) pico = v; }
          this.env = pico > this.env ? pico : this.env * kEnv + pico * (1 - kEnv);
          if (this.abierta && this.env < cierra) this.abierta = false;
          else if (!this.abierta && this.env > abre) this.abierta = true;
          const objetivo = (!activa || this.abierta) ? 1 : 0.125;
          this.g = objetivo > this.g ? this.g + (objetivo - this.g) * kAtt : this.g * kRel + objetivo * (1 - kRel);
          for (let c = 0; c < out.length; c++) out[c][i] = (inp[c] || inp[0])[i] * this.g;
        }
        return true;
      }
    }
    registerProcessor("vr-puerta", VrPuerta);
  `;

  function db(v) { return v <= 0 ? -120 : 20 * Math.log10(v); }

  // Arma la cadena. Devuelve el track procesado (o el crudo si el contexto de
  // audio no puede arrancar todavía: iOS exige un toque; en cuanto lo hay, se
  // avisa con onListo(trackProcesado) para reemplazarlo en la conexión).
  async function crear({ micTrack, modo = "auto", onListo, onNivel, onModoAuto }) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !micTrack) return { track: micTrack, procesado: false, setModo() {}, setMusica() {}, nivel: () => null, destruir() {}, modo };
    const ctx = new AudioCtx({ sampleRate: 48000, latencyHint: "interactive" });
    let m = MODOS[modo] || MODOS.voz;
    const fuente = ctx.createMediaStreamSource(new MediaStream([micTrack]));
    const pad = ctx.createGain(); pad.gain.value = 1;

    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.Q.value = 0.707;
    const shelfBajo = ctx.createBiquadFilter(); shelfBajo.type = "lowshelf";
    const presencia = ctx.createBiquadFilter(); presencia.type = "peaking";
    const aire = ctx.createBiquadFilter(); aire.type = "highshelf";
    const comp = ctx.createDynamicsCompressor();
    const vozGain = ctx.createGain();
    const musicaGain = ctx.createGain(); musicaGain.gain.value = 1;
    const suma = ctx.createGain();
    const limitador = ctx.createDynamicsCompressor();
    limitador.threshold.value = -2; limitador.knee.value = 0; limitador.ratio.value = 20; limitador.attack.value = 0.001; limitador.release.value = 0.06;
    const salida = ctx.createGain(); salida.gain.value = 0.98;
    const medidor = ctx.createAnalyser(); medidor.fftSize = 1024;
    const dest = ctx.createMediaStreamDestination();

    let puerta = null;
    try {
      if (ctx.audioWorklet) {
        const url = URL.createObjectURL(new Blob([PUERTA_SRC], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(url);
        puerta = new AudioWorkletNode(ctx, "vr-puerta", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        URL.revokeObjectURL(url);
      }
    } catch { puerta = null; }

    fuente.connect(pad); pad.connect(hp); hp.connect(shelfBajo); shelfBajo.connect(presencia); presencia.connect(aire);
    let cola = aire;
    if (puerta) { aire.connect(puerta); cola = puerta; }
    cola.connect(comp); comp.connect(vozGain); vozGain.connect(suma); vozGain.connect(medidor);
    musicaGain.connect(suma);
    suma.connect(limitador); limitador.connect(salida); salida.connect(dest);

    // "auto": escucha el ambiente y elige el ajuste; cualquier otro, fijo.
    let elegido = modo;
    let autoNombre = "voz";
    function aplicarModo(nuevo) {
      elegido = nuevo;
      if (nuevo === "auto") { aplicarAjuste(autoNombre); return; }
      aplicarAjuste(nuevo);
    }
    function aplicarAjuste(nuevo) {
      m = MODOS[nuevo] || MODOS.voz;
      const t = ctx.currentTime, k = 0.05;
      pad.gain.setTargetAtTime(m.pad ?? 1, t, k);
      hp.frequency.setTargetAtTime(m.hp, t, k);
      shelfBajo.frequency.setTargetAtTime(m.shelfBajo ? m.shelfBajo.f : 160, t, k);
      shelfBajo.gain.setTargetAtTime(m.shelfBajo ? m.shelfBajo.g : 0, t, k);
      presencia.frequency.setTargetAtTime(m.presencia.f, t, k);
      presencia.Q.setTargetAtTime(m.presencia.q, t, k);
      presencia.gain.setTargetAtTime(m.presencia.g, t, k);
      aire.frequency.setTargetAtTime(m.aire ? m.aire.f : 9000, t, k);
      aire.gain.setTargetAtTime(m.aire ? m.aire.g : 0, t, k);
      comp.threshold.setTargetAtTime(m.comp.th, t, k);
      comp.knee.setTargetAtTime(m.comp.knee, t, k);
      comp.ratio.setTargetAtTime(m.comp.ratio, t, k);
      comp.attack.setTargetAtTime(m.comp.att, t, k);
      comp.release.setTargetAtTime(m.comp.rel, t, k);
      if (puerta) {
        puerta.parameters.get("activa").setValueAtTime(m.puerta ? 1 : 0, t);
        puerta.parameters.get("umbral").setValueAtTime(m.puerta ? m.puerta.umbral : -120, t);
      }
      // El micrófono también cambia de trato (eco, supresión, ganancia).
      try { micTrack.applyConstraints(m.captura).catch(() => {}); } catch {}
    }
    aplicarModo(modo);

    // Ducking: cuando hay voz, lo demás baja; al callar, vuelve en ~0.6 s.
    let musicaFuente = null;
    const datos = new Float32Array(medidor.fftSize);
    let nivelDb = -120, hablando = false;
    const medir = setInterval(() => {
      try {
        medidor.getFloatTimeDomainData(datos);
        let s = 0;
        for (let i = 0; i < datos.length; i++) s += datos[i] * datos[i];
        nivelDb = db(Math.sqrt(s / datos.length));
        const ahoraHabla = nivelDb > -42;
        if (ahoraHabla !== hablando) {
          hablando = ahoraHabla;
          if (musicaFuente) musicaGain.gain.setTargetAtTime(hablando ? m.ducking : 1, ctx.currentTime, hablando ? 0.08 : 0.6);
        }
        if (onNivel) onNivel(nivelDb);
      } catch {}
    }, 50);

    // ---- Auto: ¿qué ambiente es? ----
    // Cada segundo mide la señal cruda: nivel, piso de ruido (lo que queda
    // cuando nadie habla), y cuánta energía hay en graves (motor, camino),
    // medios (voz) y agudos (viento, tráfico), más qué tan continua es
    // (música sostiene; la voz hace pausas). Cada 5 s decide y solo cambia si
    // la misma lectura se repite dos veces: nada de brincar de ajuste.
    const clasif = ctx.createAnalyser(); clasif.fftSize = 2048; clasif.smoothingTimeConstant = 0.6;
    fuente.connect(clasif);
    const espectro = new Float32Array(clasif.frequencyBinCount);
    const onda = new Float32Array(clasif.fftSize);
    const hist = []; // {rms (dBFS), low, mid, high}
    let candidato = null, repeticiones = 0;
    function medirAmbiente() {
      try {
        clasif.getFloatFrequencyData(espectro);
        const hz = (i) => (i * ctx.sampleRate) / clasif.fftSize;
        let low = 0, mid = 0, high = 0, total = 0;
        for (let i = 1; i < espectro.length; i++) {
          const p = Math.pow(10, espectro[i] / 10), f = hz(i);
          total += p;
          if (f < 150) low += p; else if (f < 3000) mid += p; else if (f > 5000) high += p;
        }
        if (total <= 0) return;
        clasif.getFloatTimeDomainData(onda);
        let s2 = 0;
        for (let i = 0; i < onda.length; i++) s2 += onda[i] * onda[i];
        hist.push({ rms: db(Math.sqrt(s2 / onda.length)), low: low / total, mid: mid / total, high: high / total });
        if (hist.length > 15) hist.shift();
      } catch {}
    }
    function decidirAmbiente() {
      if (hist.length < 8) return null;
      const rmsOrd = hist.map((h) => h.rms).sort((a, b) => a - b);
      const piso = rmsOrd[Math.floor(rmsOrd.length * 0.15)];
      const pico = rmsOrd[Math.floor(rmsOrd.length * 0.9)];
      const prom = (k) => hist.reduce((a, h) => a + h[k], 0) / hist.length;
      const low = prom("low"), high = prom("high");
      const continuo = (pico - piso) < 9; // casi sin pausas: música / ruido constante
      // Música primero: sostenida y ancha (graves y agudos a la vez). Luego
      // carro (graves dominantes con piso alto) y calle (agudos con piso alto).
      if (continuo && low > 0.2 && high > 0.1 && pico > -45) return "musica";
      if (low > 0.5 && piso > -62) return "carro";
      if (high > 0.22 && piso > -58) return "calle";
      return "voz";
    }
    const autoTimer = setInterval(() => {
      medirAmbiente();
      if (elegido !== "auto" || hist.length % 5 !== 0) return;
      const d = decidirAmbiente();
      if (!d) return;
      if (d === candidato) repeticiones++; else { candidato = d; repeticiones = 1; }
      if (repeticiones >= 2 && d !== autoNombre) {
        autoNombre = d;
        aplicarAjuste(d);
        if (onModoAuto) onModoAuto(d);
      }
    }, 1000);

    const procesado = dest.stream.getAudioTracks()[0];
    let listo = ctx.state === "running";
    try { await ctx.resume(); listo = ctx.state === "running"; } catch {}
    if (!listo) {
      // iOS/Safari: el contexto arranca con el primer toque. Mientras, va el
      // micrófono crudo; al arrancar, se avisa para cambiar al procesado.
      const intentar = async () => {
        try { await ctx.resume(); } catch {}
        if (ctx.state === "running") {
          listo = true;
          document.removeEventListener("pointerdown", intentar, true);
          document.removeEventListener("keydown", intentar, true);
          if (onListo) onListo(procesado);
        }
      };
      document.addEventListener("pointerdown", intentar, true);
      document.addEventListener("keydown", intentar, true);
    }

    return {
      get track() { return listo ? procesado : micTrack; },
      procesadoTrack: procesado,
      get procesado() { return listo; },
      /** El ajuste que suena ahora (en Auto, el que eligió el motor). */
      get modo() { return Object.keys(MODOS).find((k) => MODOS[k] === m) || "voz"; },
      /** Lo que el creador pidió: "auto" o un ajuste fijo. */
      get elegido() { return elegido; },
      setModo: aplicarModo,
      // Audio de la pantalla compartida (música, un video): por debajo de la voz.
      setMusica(track) {
        if (musicaFuente) { try { musicaFuente.disconnect(); } catch {} musicaFuente = null; }
        if (track) {
          musicaFuente = ctx.createMediaStreamSource(new MediaStream([track]));
          musicaFuente.connect(musicaGain);
          musicaGain.gain.setTargetAtTime(hablando ? m.ducking : 1, ctx.currentTime, 0.1);
        }
      },
      nivel: () => nivelDb,
      destruir() { clearInterval(medir); clearInterval(autoTimer); try { ctx.close(); } catch {} },
    };
  }

  function nombreModo(modo) { return modo === "auto" ? "Auto" : (MODOS[modo] || MODOS.voz).nombre; }

  return { MODOS, ORDEN_MODOS, capturaPara, crear, nombreModo, _rev };
})();

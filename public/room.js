// RLR
(() => {
  const _k = "eye", _rev = 181218; // build marker
  const slug = document.body.dataset.slug;
  const $ = (id) => document.getElementById(id);
  const player = $("player");
  const overlay = $("overlay");
  const controls = $("controls");
  const ticker = $("ticker");
  const toastEl = $("toast");
  const sub = $("sub");
  const connectSpinner = $("connect-spinner");
  const originalSub = sub.textContent;

  let isOwner = false;
  let me = null;
  let pc = null;
  let ws = null;
  let sessionEnded = false;
  let chatVisible = true;
  let waveformStarted = false;
  let connectingTimer = null;

  // Estado de los controles del creador durante la transmisión (cámara, mic,
  // pantalla compartida, cambio de cámara). Nada de esto toca el backend: todo
  // se resuelve con replaceTrack()/track.enabled sobre el mismo track ya
  // negociado, así que Cloudflare Calls no necesita renegociar nada.
  let videoSender = null;
  let cameraTrack = null;
  let micTrack = null;
  let micOn = true;
  let camOn = true;
  let usingScreenShare = false;
  let preferredFacing = "user";
  let shownMicToast = false;
  let shownCamToast = false;
  let qualityTimer = null;

  function buzz() {
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function videoConstraints() {
    return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, facingMode: preferredFacing };
  }

  function toast(msg, ms = 4000) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  // El momento de "conectar en vivo" (entrar a ver / empezar a transmitir) es
  // la promesa central del producto — nunca debe sentirse como un silencio
  // muerto entre el clic y que aparece el video. Estos helpers dan reacción
  // instantánea al toque, avisan en qué etapa real va la conexión, y si de
  // plano tarda, tranquilizan en vez de dejar al usuario dudando.
  function beginConnecting(message) {
    overlay.classList.add("connecting");
    connectSpinner.style.display = "flex";
    sub.textContent = message;
    clearTimeout(connectingTimer);
    connectingTimer = setTimeout(() => {
      sub.textContent = "Esto puede tardar unos segundos si tu conexión es lenta…";
    }, 4500);
  }

  function updateConnecting(message) {
    sub.textContent = message;
  }

  function endConnecting() {
    clearTimeout(connectingTimer);
    overlay.classList.remove("connecting");
    connectSpinner.style.display = "none";
    sub.textContent = originalSub;
  }

  // El overlay se queda visible hasta que de verdad hay imagen — se revela el
  // video con un crossfade en vez de un salto brusco de display:none.
  function hideOverlaySmoothly() {
    clearTimeout(connectingTimer);
    overlay.classList.remove("connecting");
    connectSpinner.style.display = "none";
    overlay.classList.add("fade-out");
    setTimeout(() => {
      overlay.style.display = "none";
    }, 460);
  }

  function showControlsWithEntrance() {
    controls.style.display = "flex";
    controls.classList.add("entering");
    setTimeout(() => controls.classList.remove("entering"), 450);
  }

  function requireLogin() {
    window.location.href = "/login";
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      requireLogin();
      throw new Error("no_session");
    }
    return res.json();
  }

  // Evita doble-clic/doble-tap disparando la misma acción dos veces (muy común
  // en móvil): deshabilita el botón mientras la petición está en curso.
  function guarded(el, fn) {
    let busy = false;
    el.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      el.disabled = true;
      try {
        await fn();
      } finally {
        busy = false;
        el.disabled = false;
      }
    });
  }

  function connectWs() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/room/${slug}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "viewers") {
        // podría mostrarse "N viendo" si se agrega en el overlay
      } else if (msg.type === "entrada") {
        if (isOwner) {
          toast(`+$10 · ${msg.name} entró`);
          ticker.textContent = `$${(msg.ticker_cents / 100).toFixed(0)} esta sesión`;
        }
      } else if (msg.type === "tip") {
        showTipBand(msg.from, msg.amount_cents, msg.message);
        if (isOwner) {
          toast(`+$${Math.round(msg.amount_cents * 0.9 / 100)} · ${msg.from} te mandó dinero 💵`);
          ticker.textContent = `$${(msg.ticker_cents / 100).toFixed(0)} esta sesión`;
        }
      } else if (msg.type === "hearts") {
        // contador de corazones agregado
      } else if (msg.type === "comment") {
        appendChatMessage(msg.name, msg.body);
      } else if (msg.type === "ended") {
        sessionEnded = true;
        toast("La transmisión terminó.");
        setTimeout(() => location.reload(), 2000);
      }
    };
    // El socket puede caerse por cambios de red (wifi/datos, la app pasa a segundo
    // plano, etc.) sin que el DO ni la transmisión hayan terminado — reconectamos.
    ws.onclose = () => {
      if (sessionEnded) return;
      setTimeout(connectWs, 2000);
    };
  }

  function showTipBand(from, amountCents, message) {
    const band = document.createElement("div");
    band.className = "tip-band";
    band.textContent = `${from} mandó $${Math.round(amountCents / 100)}${message ? ` — "${message}"` : ""}`;
    document.body.appendChild(band);
    setTimeout(() => band.remove(), amountCents >= 50000 ? 6000 : 4000);
  }

  // Los comentarios son eventos fugaces: solo viven en el DOM mientras la
  // pestaña está abierta. Se arman con createElement/textContent (nunca
  // innerHTML) para que no haya forma de inyectar HTML desde un comentario.
  function appendChatMessage(name, body) {
    const feed = $("chat-feed");
    const row = document.createElement("div");
    row.className = "chat-msg";
    const nameEl = document.createElement("span");
    nameEl.className = "chat-msg-name";
    nameEl.textContent = name;
    const bodyEl = document.createElement("span");
    bodyEl.className = "chat-msg-body";
    bodyEl.textContent = ` ${body}`;
    row.appendChild(nameEl);
    row.appendChild(bodyEl);
    feed.appendChild(row);
    feed.scrollTop = feed.scrollHeight;
    while (feed.children.length > 200) feed.removeChild(feed.firstChild);
  }

  async function sendComment() {
    const input = $("chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const res = await api(`/api/rooms/${slug}/comment`, { body: { text } });
    if (res.error === "sin_pase") toast("Necesitas un pase vigente para comentar.");
    else if (res.error === "sala_cerrada") toast("La sala ya cerró.");
    else if (res.error) toast("No se pudo enviar tu comentario.");
  }

  function revealChatUI() {
    $("btn-chat").style.display = "inline-block";
    $("chat-panel").style.display = chatVisible ? "flex" : "none";
  }

  // Onda que reacciona al audio real (el del stream entrante para el
  // espectador, el propio mic para el creador) — puro adorno visual en el
  // cliente, no toca nada del servidor. Se dibuja como una curva continua
  // suavizada sobre datos de dominio del tiempo (la forma real de la onda,
  // no un espectro de barras) y el canvas se escala al devicePixelRatio real
  // de la pantalla para que se vea nítida en cualquier dispositivo.
  function setupWaveform(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtx.resume().catch(() => {});
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const canvas = $("chat-wave");
      const ctx2d = canvas.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 3);

      function resize() {
        const w = canvas.clientWidth || 120;
        const h = canvas.clientHeight || 22;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      resize();
      window.addEventListener("resize", resize);

      const SAMPLES = 56; // puntos de muestreo de la onda; el resto se interpola suave
      const step = Math.floor(data.length / SAMPLES);

      (function draw() {
        requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(data);
        const w = canvas.clientWidth || 120;
        const h = canvas.clientHeight || 22;
        const mid = h / 2;
        ctx2d.clearRect(0, 0, w, h);

        const points = [];
        for (let i = 0; i < SAMPLES; i++) {
          const v = (data[i * step] - 128) / 128; // -1..1
          points.push({ x: (i / (SAMPLES - 1)) * w, y: mid - v * mid * 0.9 });
        }

        ctx2d.beginPath();
        ctx2d.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const midX = (points[i].x + points[i + 1].x) / 2;
          const midY = (points[i].y + points[i + 1].y) / 2;
          ctx2d.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        const last = points[points.length - 1];
        ctx2d.lineTo(last.x, last.y);

        // relleno con degradado hacia el centro: le da cuerpo a la onda en
        // vez de una simple línea, sensación de "audio real" más premium.
        ctx2d.lineTo(w, mid);
        ctx2d.lineTo(0, mid);
        ctx2d.closePath();
        const gradient = ctx2d.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, "rgba(86,239,159,.85)");
        gradient.addColorStop(1, "rgba(86,239,159,.05)");
        ctx2d.fillStyle = gradient;
        ctx2d.fill();

        // trazo nítido encima del relleno para definir bien la curva
        ctx2d.beginPath();
        ctx2d.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const midX = (points[i].x + points[i + 1].x) / 2;
          const midY = (points[i].y + points[i + 1].y) / 2;
          ctx2d.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        ctx2d.lineTo(last.x, last.y);
        ctx2d.strokeStyle = "#56EF9F";
        ctx2d.lineWidth = 1.5;
        ctx2d.lineJoin = "round";
        ctx2d.lineCap = "round";
        ctx2d.stroke();
      })();
    } catch {
      // sin soporte de Web Audio API: la barra de comentarios sigue funcionando sin la onda
    }
  }

  function maybeSetupWaveform(stream) {
    if (waveformStarted || !stream.getAudioTracks().length) return;
    waveformStarted = true;
    setupWaveform(stream);
  }

  async function startPublishing(sessionId) {
    updateConnecting("Accediendo a tu cámara y micrófono…");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints(),
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      throw new Error("sin_camara");
    }
    player.srcObject = stream;
    player.muted = true;
    cameraTrack = stream.getVideoTracks()[0];
    micTrack = stream.getAudioTracks()[0];
    pc = new RTCPeerConnection();
    const tracks = [];
    stream.getTracks().forEach((track, i) => {
      const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
      if (track.kind === "video") videoSender = transceiver.sender;
      tracks.push({ mid: String(i), trackName: track.kind });
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    updateConnecting("Conectando con el estudio…");
    const res = await api(`/api/rooms/${slug}/publish`, { body: { sdp: offer.sdp, tracks } });
    if (res.error) throw new Error("publish_error");
    await pc.setRemoteDescription({ type: "answer", sdp: res.answer_sdp });
    hideOverlaySmoothly();
    showControlsWithEntrance();
    ticker.style.display = "block";
    $("btn-stop").style.display = "inline-block";
    showCreatorToolbar();
    revealChatUI();
    maybeSetupWaveform(stream);
    toast("✨ Estás en vivo, disfruta.", 6000);
  }

  // Botones de 💵/🎤 son para el viewer (mandar dinero / levantar la mano) y no
  // aplican en la propia sala del creador — se ocultan y en su lugar aparecen
  // los controles reales de transmisión.
  function showCreatorToolbar() {
    $("btn-tip").style.display = "none";
    $("btn-hand").style.display = "none";
    $("btn-mic").style.display = "inline-block";
    $("btn-cam").style.display = "inline-block";
    if ("getDisplayMedia" in navigator.mediaDevices) {
      $("btn-screen").style.display = "inline-block";
    }
    setupCameraSwitcher();
    startQualityMonitor();
  }

  function toggleMic() {
    micOn = !micOn;
    buzz();
    if (micTrack) micTrack.enabled = micOn;
    $("btn-mic").textContent = micOn ? "🎙️" : "🔇";
    $("btn-mic").classList.toggle("off", !micOn);
    if (!micOn && !shownMicToast) {
      shownMicToast = true;
      toast("Tu voz está en pausa. Nadie te escucha hasta que la actives. 🤫");
    }
  }

  function toggleCam() {
    camOn = !camOn;
    buzz();
    if (cameraTrack) cameraTrack.enabled = camOn;
    $("btn-cam").textContent = camOn ? "📷" : "🚫";
    $("btn-cam").classList.toggle("off", !camOn);
    if (!camOn && !shownCamToast) {
      shownCamToast = true;
      toast("Tu cámara está en pausa.");
    }
  }

  async function toggleScreenShare() {
    buzz();
    if (usingScreenShare) return stopScreenShare();
    let screenStream;
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    } catch {
      return; // el creador canceló el selector nativo
    }
    const screenTrack = screenStream.getVideoTracks()[0];
    await videoSender.replaceTrack(screenTrack);
    if (cameraTrack) cameraTrack.stop();
    cameraTrack = screenTrack;
    cameraTrack.enabled = camOn;
    player.srcObject = micTrack ? new MediaStream([screenTrack, micTrack]) : screenStream;
    screenTrack.onended = () => stopScreenShare();
    usingScreenShare = true;
    $("btn-screen").classList.add("active");
    $("btn-screen").title = "Dejar de compartir pantalla";
    toast("🖥️ Ahora compartes tu pantalla. Tu cámara se reanuda cuando la detengas.");
  }

  async function stopScreenShare() {
    if (!usingScreenShare) return;
    usingScreenShare = false;
    $("btn-screen").classList.remove("active");
    $("btn-screen").title = "Compartir pantalla";
    let camStream;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(), audio: false });
    } catch {
      return toast("No se pudo reactivar la cámara.");
    }
    const camTrack = camStream.getVideoTracks()[0];
    camTrack.enabled = camOn;
    await videoSender.replaceTrack(camTrack);
    if (cameraTrack) cameraTrack.stop();
    cameraTrack = camTrack;
    player.srcObject = micTrack ? new MediaStream([camTrack, micTrack]) : camStream;
  }

  async function setupCameraSwitcher() {
    let devices;
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      return;
    }
    const cams = devices.filter((d) => d.kind === "videoinput");
    if (cams.length < 2) return; // nada que cambiar
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (isTouch) {
      $("btn-flip-cam").style.display = "inline-block";
      guarded($("btn-flip-cam"), () => switchCamera({ flip: true }));
    } else {
      const select = $("cam-select");
      select.innerHTML = cams.map((d, i) => `<option value="${d.deviceId}">${d.label || `Cámara ${i + 1}`}</option>`).join("");
      select.style.display = "inline-block";
      select.onchange = () => switchCamera({ deviceId: select.value });
    }
  }

  async function switchCamera({ flip, deviceId }) {
    if (usingScreenShare) return; // no aplica mientras comparte pantalla
    if (flip) preferredFacing = preferredFacing === "user" ? "environment" : "user";
    const constraints = flip ? { ...videoConstraints() } : { ...videoConstraints(), deviceId: { exact: deviceId } };
    let newStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    } catch {
      return toast("No se pudo cambiar de cámara.");
    }
    const newTrack = newStream.getVideoTracks()[0];
    newTrack.enabled = camOn;
    await videoSender.replaceTrack(newTrack);
    if (cameraTrack) cameraTrack.stop();
    cameraTrack = newTrack;
    player.srcObject = micTrack ? new MediaStream([newTrack, micTrack]) : newStream;
  }

  function startQualityMonitor() {
    const el = $("conn-quality");
    el.style.display = "block";
    qualityTimer = setInterval(async () => {
      if (!pc) return;
      let rtt = null;
      let fractionLost = null;
      try {
        const stats = await pc.getStats();
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.state === "succeeded" && r.currentRoundTripTime != null) {
            rtt = r.currentRoundTripTime;
          }
          if (r.type === "remote-inbound-rtp" && r.fractionLost != null) {
            fractionLost = r.fractionLost;
          }
        });
      } catch {
        return;
      }
      let level = "good";
      if ((rtt != null && rtt > 0.3) || (fractionLost != null && fractionLost > 0.05)) level = "bad";
      else if (rtt != null && rtt > 0.15) level = "ok";
      el.className = `conn-quality ${level}`;
      el.title = level === "good"
        ? "Tu conexión va perfecta"
        : level === "ok"
        ? "Tu conexión está algo inestable"
        : "Tu conexión está débil — acércate al router si puedes";
    }, 3000);
  }

  async function startSubscribing() {
    updateConnecting("Conectando con la transmisión…");
    const res = await api(`/api/rooms/${slug}/subscribe`, { body: {} });
    if (res.error) {
      endConnecting();
      const msg = res.error === "creador_no_transmitiendo" ? "El creador aún no transmite. Vuelve a intentar en un momento."
        : res.error === "sin_pase" ? "Necesitas un pase para ver esta sala."
        : "No se pudo conectar.";
      return toast(msg);
    }
    updateConnecting("Sintonizando la señal…");
    pc = new RTCPeerConnection();
    let firstFrame = false;
    // El overlay no se va hasta que de verdad hay imagen — así nunca se ve un
    // recuadro negro detrás de un overlay que ya desapareció.
    function onFirstFrame() {
      if (firstFrame) return;
      firstFrame = true;
      hideOverlaySmoothly();
      showControlsWithEntrance();
      revealChatUI();
    }
    pc.ontrack = (ev) => {
      player.srcObject = ev.streams[0];
      maybeSetupWaveform(ev.streams[0]);
      onFirstFrame();
    };
    if (res.offer_sdp) {
      await pc.setRemoteDescription({ type: "offer", sdp: res.offer_sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await api(`/api/rooms/${slug}/renegotiate`, { body: { session_id: res.viewer_session_id, sdp: answer.sdp } });
    }
    // Respaldo: si por lo que sea "ontrack" nunca dispara (raro, pero pasa en
    // algunas redes), no dejamos al espectador mirando el overlay para siempre.
    setTimeout(onFirstFrame, 6000);
  }

  function openTipSheet() {
    const amounts = [2000, 5000, 10000, 20000, 50000];
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = `
      <div class="sheet-inner">
        <h3>Mandar dinero</h3>
        <div class="amounts">${amounts.map((a) => `<button data-amt="${a}">$${a / 100}</button>`).join("")}</div>
        <input id="tip-msg" maxlength="60" placeholder="Mensaje (opcional)">
        <button id="tip-cancel">Cancelar</button>
      </div>`;
    document.body.appendChild(sheet);
    let sent = false;
    sheet.querySelectorAll("[data-amt]").forEach((btn) => {
      btn.onclick = async () => {
        if (sent) return;
        sent = true;
        sheet.querySelectorAll("[data-amt]").forEach((b) => (b.disabled = true));
        const amount_cents = Number(btn.dataset.amt);
        const messageInput = sheet.querySelector("#tip-msg");
        const message = messageInput ? messageInput.value : "";
        const res = await api(`/api/rooms/${slug}/tip`, { body: { amount_cents, message } });
        sheet.remove();
        if (res.error === "saldo_insuficiente") toast("Sin saldo suficiente. Recarga en tu monedero.");
        else if (res.error) toast("No se pudo mandar el dinero.");
      };
    });
    sheet.querySelector("#tip-cancel").onclick = () => sheet.remove();
  }

  let lastTap = 0;
  player.addEventListener("click", () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      toast("❤️");
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "heart" }));
      }
    }
    lastTap = now;
  });

  async function init() {
    const status = await fetch(`/api/rooms/${slug}/status`).then((r) => r.json());
    if (status.error) return;
    try {
      const meRes = await fetch("/api/wallet/me");
      if (meRes.ok) me = await meRes.json();
    } catch {}

    connectWs();

    const isLive = !!status.live_session;
    isOwner = !!(me && status.room.owner_id === me.id);

    if (isOwner) {
      $("btn-enter").style.display = "none";
      $("btn-notify").style.display = "none";
      $("btn-start").style.display = isLive ? "none" : "block";
      if (isLive) {
        overlay.style.display = "none";
        controls.style.display = "flex";
        ticker.style.display = "block";
        $("btn-stop").style.display = "inline-block";
        revealChatUI();
      }
    }

    guarded($("btn-enter"), async () => {
      if (!me) return requireLogin();
      beginConnecting("Verificando tu pase…");
      const res = await api(`/api/rooms/${slug}/pass`, { body: { device_id: "web" } });
      if (res.error === "saldo_insuficiente") { endConnecting(); return toast("Sin saldo. Ve a tu monedero para recargar."); }
      if (res.error) { endConnecting(); return toast("No se pudo entrar a la sala."); }
      await startSubscribing();
    });
    guarded($("btn-notify"), async () => {
      if (!me) return requireLogin();
      await api(`/api/rooms/${slug}/notify-me`, { body: {} });
      toast("Listo, te avisamos cuando abra.");
    });
    guarded($("btn-start"), async () => {
      if (!me) return requireLogin();
      beginConnecting("Preparando tu transmisión…");
      const res = await api(`/api/rooms/${slug}/start`, { body: {} });
      if (res.error) { endConnecting(); return toast("No se pudo iniciar."); }
      try {
        await startPublishing(res.session_id);
      } catch (err) {
        endConnecting();
        const msg = err && err.message === "sin_camara"
          ? "No pudimos usar tu cámara o micrófono. Revisa los permisos del navegador."
          : "No se pudo iniciar la transmisión.";
        toast(msg, 6000);
        await api(`/api/rooms/${slug}/stop`, { body: {} }).catch(() => {});
      }
    });
    guarded($("btn-stop"), async () => {
      const res = await api(`/api/rooms/${slug}/stop`, { body: {} });
      sessionEnded = true;
      if (qualityTimer) clearInterval(qualityTimer);
      toast(`Ganaste $${Math.round((res.earned_cents ?? 0) / 100)} · Pico ${res.peak_viewers ?? 0} personas`, 8000);
    });
    guarded($("btn-tip"), async () => {
      if (!me) return requireLogin();
      openTipSheet();
    });
    guarded($("btn-mic"), async () => toggleMic());
    guarded($("btn-cam"), async () => toggleCam());
    guarded($("btn-screen"), async () => toggleScreenShare());
    guarded($("btn-chat"), async () => {
      chatVisible = !chatVisible;
      $("chat-panel").style.display = chatVisible ? "flex" : "none";
    });
    guarded($("btn-chat-send"), async () => {
      if (!me) return requireLogin();
      await sendComment();
    });
    $("chat-input").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!me) return requireLogin();
      sendComment();
    });
    $("dim-slider").addEventListener("input", (e) => {
      const val = Number(e.target.value);
      player.style.filter = val >= 100 ? "" : `brightness(${val}%)`;
    });
  }

  init();
})();

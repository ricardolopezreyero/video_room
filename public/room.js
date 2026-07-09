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

  let isOwner = false;
  let pc = null;
  let ws = null;
  let sessionEnded = false;

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

  async function startPublishing(sessionId) {
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
    const res = await api(`/api/rooms/${slug}/publish`, { body: { sdp: offer.sdp, tracks } });
    if (res.error) throw new Error("publish_error");
    await pc.setRemoteDescription({ type: "answer", sdp: res.answer_sdp });
    overlay.style.display = "none";
    controls.style.display = "flex";
    ticker.style.display = "block";
    $("btn-stop").style.display = "inline-block";
    showCreatorToolbar();
    toast("✨ Estás en vivo. Gracias por regalar tu tiempo — disfrútalo.", 6000);
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
    const res = await api(`/api/rooms/${slug}/subscribe`, { body: {} });
    if (res.error) {
      const msg = res.error === "creador_no_transmitiendo" ? "El creador aún no transmite. Vuelve a intentar en un momento."
        : res.error === "sin_pase" ? "Necesitas un pase para ver esta sala."
        : "No se pudo conectar.";
      return toast(msg);
    }
    pc = new RTCPeerConnection();
    pc.ontrack = (ev) => {
      player.srcObject = ev.streams[0];
    };
    if (res.offer_sdp) {
      await pc.setRemoteDescription({ type: "offer", sdp: res.offer_sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await api(`/api/rooms/${slug}/renegotiate`, { body: { session_id: res.viewer_session_id, sdp: answer.sdp } });
    }
    overlay.style.display = "none";
    controls.style.display = "flex";
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
    let me = null;
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
      }
    }

    guarded($("btn-enter"), async () => {
      if (!me) return requireLogin();
      const res = await api(`/api/rooms/${slug}/pass`, { body: { device_id: "web" } });
      if (res.error === "saldo_insuficiente") return toast("Sin saldo. Ve a tu monedero para recargar.");
      if (res.error) return toast("No se pudo entrar a la sala.");
      await startSubscribing();
    });
    guarded($("btn-notify"), async () => {
      if (!me) return requireLogin();
      await api(`/api/rooms/${slug}/notify-me`, { body: {} });
      toast("Listo, te avisamos cuando abra.");
    });
    guarded($("btn-start"), async () => {
      if (!me) return requireLogin();
      const res = await api(`/api/rooms/${slug}/start`, { body: {} });
      if (res.error) return toast("No se pudo iniciar.");
      try {
        await startPublishing(res.session_id);
      } catch (err) {
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
  }

  init();
})();

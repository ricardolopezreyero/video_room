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

  function connectWs() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/room/${slug}`);
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
        toast("La transmisión terminó.");
        setTimeout(() => location.reload(), 2000);
      }
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
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    player.srcObject = stream;
    player.muted = true;
    pc = new RTCPeerConnection();
    const tracks = [];
    stream.getTracks().forEach((track, i) => {
      const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
      tracks.push({ mid: String(i), trackName: track.kind });
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await api(`/api/rooms/${slug}/publish`, { body: { sdp: offer.sdp, tracks } });
    if (res.error) return toast("No se pudo iniciar la transmisión.");
    await pc.setRemoteDescription({ type: "answer", sdp: res.answer_sdp });
    overlay.style.display = "none";
    controls.style.display = "flex";
    ticker.style.display = "block";
    $("btn-stop").style.display = "inline-block";
  }

  async function startSubscribing() {
    const res = await api(`/api/rooms/${slug}/subscribe`, { body: {} });
    if (res.error) return toast(res.error === "creador_no_transmitiendo" ? "El creador aún no transmite." : "No se pudo conectar.");
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
    sheet.querySelectorAll("[data-amt]").forEach((btn) => {
      btn.onclick = async () => {
        const amount_cents = Number(btn.dataset.amt);
        const message = $("tip-msg") ? sheet.querySelector("#tip-msg").value : "";
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
      // doble tap = corazón (visual local, agregación real vía DO en siguiente iteración)
      toast("❤️");
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

    $("btn-enter").onclick = async () => {
      if (!me) return requireLogin();
      const res = await api(`/api/rooms/${slug}/pass`, { body: { device_id: "web" } });
      if (res.error === "saldo_insuficiente") return toast("Sin saldo. Ve a tu monedero para recargar.");
      if (res.error) return toast("No se pudo entrar a la sala.");
      await startSubscribing();
    };
    $("btn-notify").onclick = async () => {
      if (!me) return requireLogin();
      await api(`/api/rooms/${slug}/notify-me`, { body: {} });
      toast("Listo, te avisamos cuando abra.");
    };
    $("btn-start").onclick = async () => {
      if (!me) return requireLogin();
      const res = await api(`/api/rooms/${slug}/start`, { body: {} });
      if (res.error) return toast("No se pudo iniciar.");
      await startPublishing(res.session_id);
    };
    $("btn-stop").onclick = async () => {
      const res = await api(`/api/rooms/${slug}/stop`, { body: {} });
      toast(`Ganaste $${Math.round((res.earned_cents ?? 0) / 100)} · Pico ${res.peak_viewers ?? 0} personas`, 8000);
    };
    $("btn-tip").onclick = () => {
      if (!me) return requireLogin();
      openTipSheet();
    };
  }

  init();
})();

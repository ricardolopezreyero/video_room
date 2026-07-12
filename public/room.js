// RLR
(() => {
  const _k = "eye", _rev = 181218; // build marker
  const slug = document.body.dataset.slug;
  const $ = (id) => document.getElementById(id);
  const player = $("player");
  const overlay = $("overlay");
  const controls = $("controls");
  const studioBar = $("studio-bar");
  const tickerText = $("ticker-text");
  const viewerCountEl = $("viewer-count");
  const liveTimerEl = $("live-timer");
  const viewerPresenceEl = $("viewer-presence");
  const presenceCountEl = $("presence-count");
  const toastEl = $("toast");
  const sub = $("sub");
  const connectSpinner = $("connect-spinner");
  const originalSub = sub.textContent;
  // Los permisos de cámara/pantalla a veces se quedan colgados (el picker
  // nativo no resuelve ni rechaza la promesa) — sin esto, el botón que lo
  // disparó queda deshabilitado para siempre, ya que guarded() solo se
  // reactiva cuando la función que envuelve finalmente termina.
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
  }
  // Identifica esta pestaña/dispositivo — se manda al WebSocket y a /subscribe
  // para que una misma cuenta solo pueda estar viendo activamente desde un
  // lugar a la vez (ver handleKicked()).
  const connectionId = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}_${Math.random()}`;

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
  let shownBadConnToast = false;
  let qualityTimer = null;
  let liveTimerInterval = null;
  let shownHeartHintToast = false;
  let shownPrivacyToast = false;
  let handRaised = false;
  let handRaiseTimer = null;

  // El creador publica 3 calidades de video (alta = la cámara tal cual, media
  // y baja = la misma imagen redibujada más chica en un <canvas> oculto). Así
  // el espectador puede pedir solo la calidad que quiere ver, sin gastar ancho
  // de banda en resoluciones que ni va a mostrar — ver setupTieredVideoTracks().
  let hiddenSourceVideo = null;

  function setHiddenSourceTrack(track) {
    if (!hiddenSourceVideo) {
      hiddenSourceVideo = document.createElement("video");
      hiddenSourceVideo.muted = true;
      hiddenSourceVideo.playsInline = true;
      hiddenSourceVideo.style.cssText = "position:fixed; left:-9999px; top:0; width:2px; height:2px;";
      document.body.appendChild(hiddenSourceVideo);
    }
    hiddenSourceVideo.srcObject = new MediaStream([track]);
    hiddenSourceVideo.play().catch(() => {});
  }

  function setupTieredVideoTracks(track) {
    setHiddenSourceTrack(track);
    const specs = [
      { width: 640, height: 360, fps: 24 },
      { width: 320, height: 180, fps: 15 },
    ];
    const canvases = specs.map((s) => {
      const canvas = document.createElement("canvas");
      canvas.width = s.width;
      canvas.height = s.height;
      return { ctx: canvas.getContext("2d"), width: s.width, height: s.height, canvas };
    });
    (function draw() {
      requestAnimationFrame(draw);
      if (hiddenSourceVideo.readyState >= 2) {
        canvases.forEach((c) => c.ctx.drawImage(hiddenSourceVideo, 0, 0, c.width, c.height));
      }
    })();
    return {
      mediumTrack: canvases[0].canvas.captureStream(specs[0].fps).getVideoTracks()[0],
      lowTrack: canvases[1].canvas.captureStream(specs[1].fps).getVideoTracks()[0],
    };
  }

  function buzz() {
    if (navigator.vibrate) navigator.vibrate(10);
  }

  // Cronómetro de "cuánto llevo en vivo" — nace en el momento exacto en que
  // arranca a transmitir, o (si recarga la página a medio stream) desde la
  // hora real que ya guarda el servidor, para que nunca se vea en ceros.
  function startLiveTimer(startedAtMs) {
    clearInterval(liveTimerInterval);
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
      const ss = String(s).padStart(2, "0");
      liveTimerEl.textContent = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
    };
    tick();
    liveTimerInterval = setInterval(tick, 1000);
  }

  // Cada corazón (doble-tap en el video) se ve como una animación flotando
  // sobre el video, para TODOS los conectados (no solo quien lo mandó) — así
  // el chat de texto queda libre para preguntas y comentarios reales, en vez
  // de llenarse de "jaja"/"+1" como pasa en Zoom.
  function spawnFloatingHeart() {
    const heart = document.createElement("div");
    heart.className = "floating-heart";
    heart.textContent = "❤️";
    heart.style.left = `${38 + Math.random() * 24}%`;
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 2200);
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

  // Tres motivos posibles cierran el mismo socket con el mismo mensaje
  // {type:"kicked"}: esta cuenta empezó a ver desde otro dispositivo (sin
  // motivo explícito), el creador la expulsó (temporal, puede reintentar), o
  // el creador la bloqueó (permanente — ya no puede volver a entrar, /pass y
  // /comment lo rechazan del lado del servidor).
  function handleKicked(reason) {
    if (pc) { try { pc.close(); } catch {} pc = null; }
    stopViewerQualityMonitor();
    player.srcObject = null;
    controls.style.display = "none";
    const chatPanel = $("chat-panel");
    if (chatPanel) chatPanel.style.display = "none";
    overlay.classList.remove("fade-out", "connecting");
    overlay.style.display = "flex";
    connectSpinner.style.display = "none";
    if (reason === "blocked") {
      sub.textContent = "El anfitrión te bloqueó de esta sala. Ya no puedes volver a entrar.";
      $("btn-enter").style.display = "none";
      $("btn-notify").style.display = "none";
      toast("🚫 El anfitrión te bloqueó de esta sala.", 6000);
    } else if (reason === "kicked") {
      sub.textContent = "El anfitrión te sacó de la sala en vivo. Puedes volver a entrar si quieres.";
      $("btn-enter").style.display = "block";
      toast("👢 El anfitrión te sacó de la sala.", 6000);
    } else {
      sub.textContent = "Tu sesión se movió a otro dispositivo. Toca \"Entrar\" si quieres seguir viendo aquí.";
      $("btn-enter").style.display = "block";
      toast("📱 Otro dispositivo con tu cuenta empezó a ver esta sala.", 6000);
    }
  }

  function requireLogin() {
    window.location.href = "/login";
  }

  // Sin un límite de tiempo, una red inestable (mucho más común en vivo desde
  // el celular, saliendo de wifi o con poca señal) deja el fetch colgado para
  // siempre — el botón que lo disparó (guarded() lo deshabilita mientras
  // espera) nunca se vuelve a habilitar. 12s es generoso pero finito: mejor
  // fallar y poder reintentar que quedarse esperando sin saberlo.
  async function api(path, opts = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let res;
    try {
      res = await fetch(path, {
        method: opts.body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new Error("red_inestable");
    } finally {
      clearTimeout(timeout);
    }
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
    ws = new WebSocket(`${proto}://${location.host}/ws/room/${slug}?cid=${connectionId}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "viewers") {
        if (isOwner) viewerCountEl.textContent = `👁 ${msg.count}`;
        else presenceCountEl.textContent = msg.count;
      } else if (msg.type === "kicked") {
        handleKicked(msg.reason);
      } else if (msg.type === "entrada") {
        if (isOwner) {
          toast(`+$10 · ${msg.name} entró`);
          tickerText.textContent = `$${(msg.ticker_cents / 100).toFixed(0)}`;
        }
      } else if (msg.type === "tip") {
        showTipBand(msg.from, msg.avatar_url, msg.amount_cents, msg.message);
        if (isOwner) {
          toast(`+$${Math.round(msg.amount_cents * 0.9 / 100)} · ${msg.from} te mandó dinero 💵`);
          tickerText.textContent = `$${(msg.ticker_cents / 100).toFixed(0)}`;
        }
      } else if (msg.type === "hearts") {
        spawnFloatingHeart();
      } else if (msg.type === "comment") {
        appendChatMessage(msg.id, msg.user_id, msg.name, msg.avatar_url, msg.body, msg.is_owner);
      } else if (msg.type === "comment_liked") {
        updateCommentLikes(msg.comment_id, msg.likes);
      } else if (msg.type === "pinned") {
        $("pinned-text").textContent = `${msg.name}: ${msg.body}`;
        const pinnedAvatar = $("pinned-avatar");
        if (msg.avatar_url) { pinnedAvatar.src = msg.avatar_url; pinnedAvatar.style.display = "block"; }
        else pinnedAvatar.style.display = "none";
        $("pinned-msg").style.display = "flex";
      } else if (msg.type === "unpinned") {
        $("pinned-msg").style.display = "none";
      } else if (msg.type === "raise_hand") {
        if (isOwner) toast(`🎤 ${msg.name} levantó la mano`, 5000);
      } else if (msg.type === "ended") {
        sessionEnded = true;
        toast("La transmisión terminó. Como prometimos, nada quedó grabado.", 6000);
        setTimeout(() => location.reload(), 6000);
      }
    };
    // El socket puede caerse por cambios de red (wifi/datos, la app pasa a segundo
    // plano, etc.) sin que el DO ni la transmisión hayan terminado — reconectamos.
    ws.onclose = () => {
      if (sessionEnded) return;
      setTimeout(connectWs, 2000);
    };
  }

  function showTipBand(from, avatarUrl, amountCents, message) {
    const band = document.createElement("div");
    band.className = "tip-band";
    if (avatarUrl) {
      const img = document.createElement("img");
      img.className = "tip-band-avatar";
      img.src = avatarUrl;
      band.appendChild(img);
    }
    const textEl = document.createElement("span");
    textEl.textContent = `${from} mandó $${Math.round(amountCents / 100)}${message ? ` — "${message}"` : ""}`;
    band.appendChild(textEl);
    document.body.appendChild(band);
    setTimeout(() => band.remove(), amountCents >= 50000 ? 6000 : 4000);
  }

  // Los comentarios son eventos fugaces: solo viven en el DOM mientras la
  // pestaña está abierta. Se arman con createElement/textContent (nunca
  // innerHTML) para que no haya forma de inyectar HTML desde un comentario.
  function appendChatMessage(commentId, userId, name, avatarUrl, body, isOwnerMsg) {
    const feed = $("chat-feed");
    const row = document.createElement("div");
    row.className = isOwnerMsg ? "chat-msg owner" : "chat-msg";
    if (commentId) row.dataset.commentId = commentId;
    const avatarEl = document.createElement(avatarUrl ? "img" : "span");
    avatarEl.className = "chat-msg-avatar";
    if (avatarUrl) avatarEl.src = avatarUrl;
    row.appendChild(avatarEl);
    const nameEl = document.createElement("span");
    nameEl.className = "chat-msg-name";
    nameEl.textContent = name;
    const bodyEl = document.createElement("span");
    bodyEl.className = "chat-msg-body";
    bodyEl.textContent = ` ${body}`;
    row.appendChild(nameEl);
    row.appendChild(bodyEl);
    const likeEl = document.createElement("span");
    likeEl.className = "like-count";
    likeEl.style.display = "none";
    row.appendChild(likeEl);
    // Fijar un comentario es una herramienta del creador para que se note que
    // está atendiendo algo puntual — el botón solo existe en su propia pantalla.
    if (isOwner) {
      const pinBtn = document.createElement("button");
      pinBtn.className = "pin-trigger";
      pinBtn.textContent = "📌";
      pinBtn.title = "Destacar este comentario";
      pinBtn.onclick = () => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "pin", name, body, avatar_url: avatarUrl }));
      };
      row.appendChild(pinBtn);
      // Moderación: Like/Silenciar/Expulsar/Bloquear — solo sobre comentarios
      // de otras personas, nunca sobre los propios del creador.
      if (commentId && userId && !isOwnerMsg) {
        const kebabBtn = document.createElement("button");
        kebabBtn.className = "kebab-trigger";
        kebabBtn.textContent = "⋮";
        kebabBtn.title = "Moderar";
        kebabBtn.onclick = (ev) => openCommentActions(ev, commentId, userId, name);
        row.appendChild(kebabBtn);
      }
    }
    feed.appendChild(row);
    feed.scrollTop = feed.scrollHeight;
    while (feed.children.length > 200) feed.removeChild(feed.firstChild);
  }

  function updateCommentLikes(commentId, likes) {
    if (!commentId) return;
    const row = $("chat-feed").querySelector(`[data-comment-id="${CSS.escape(commentId)}"]`);
    const likeEl = row && row.querySelector(".like-count");
    if (!likeEl) return;
    likeEl.textContent = likes > 0 ? `❤️ ${likes}` : "";
    likeEl.style.display = likes > 0 ? "inline" : "none";
  }

  // Popover compartido de moderación: se reposiciona junto al comentario que
  // se tocó en vez de tener un menú propio por cada fila del chat.
  const commentActionsEl = $("comment-actions");
  let moderationTarget = null;

  function closeCommentActions() {
    commentActionsEl.style.display = "none";
    moderationTarget = null;
  }

  function openCommentActions(ev, commentId, userId, name) {
    ev.stopPropagation();
    moderationTarget = { commentId, userId, name };
    commentActionsEl.style.display = "block";
    const rect = ev.currentTarget.getBoundingClientRect();
    const menuWidth = commentActionsEl.offsetWidth || 170;
    let left = rect.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    commentActionsEl.style.left = `${left}px`;
    let top = rect.top - commentActionsEl.offsetHeight - 6;
    if (top < 8) top = rect.bottom + 6;
    commentActionsEl.style.top = `${top}px`;
  }

  document.addEventListener("click", (ev) => {
    if (commentActionsEl.style.display === "block" && !commentActionsEl.contains(ev.target)) closeCommentActions();
  });

  commentActionsEl.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.onclick = async () => {
      if (!moderationTarget) return;
      const { commentId, userId, name } = moderationTarget;
      const action = btn.dataset.action;
      closeCommentActions();
      if (action === "like") {
        await api(`/api/rooms/${slug}/like-comment`, { body: { comment_id: commentId } });
      } else if (action === "mute") {
        await api(`/api/rooms/${slug}/mute`, { body: { user_id: userId } });
        toast(`🔇 Silenciado: ${name}`);
      } else if (action === "kick") {
        await api(`/api/rooms/${slug}/kick`, { body: { user_id: userId } });
        toast(`👢 Expulsado: ${name}`);
      } else if (action === "block") {
        if (!confirm(`¿Bloquear a ${name}? Ya no va a poder entrar a tu sala ni ver la transmisión.`)) return;
        await api(`/api/rooms/${slug}/block`, { body: { user_id: userId } });
        toast(`🚫 Bloqueado: ${name}`);
      }
    };
  });

  // Panel de espectadores conectados ahora mismo, ordenado de mayor a menor
  // donador — exclusivo del creador, con las mismas acciones de moderación
  // pero aplicadas desde la lista completa en vez de un comentario puntual.
  async function openViewersSheet() {
    const sheet = $("viewers-sheet");
    const list = $("viewers-list");
    list.innerHTML = "";
    sheet.style.display = "flex";
    const res = await api(`/api/rooms/${slug}/viewers`);
    const viewers = res.viewers || [];
    if (viewers.length === 0) {
      const empty = document.createElement("p");
      empty.className = "viewers-empty";
      empty.textContent = "Nadie conectado en este momento.";
      list.appendChild(empty);
      return;
    }
    viewers.forEach((v, i) => {
      const li = document.createElement("li");
      li.className = "donor-row";

      const rank = document.createElement("div");
      rank.className = "donor-rank";
      rank.textContent = String(i + 1);
      li.appendChild(rank);

      if (v.avatar_url) {
        const img = document.createElement("img");
        img.className = "donor-avatar";
        img.src = v.avatar_url;
        li.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "donor-avatar";
        li.appendChild(ph);
      }

      const info = document.createElement("div");
      info.className = "donor-info";
      const nameEl = document.createElement("div");
      nameEl.className = "donor-name";
      nameEl.textContent = v.name;
      info.appendChild(nameEl);
      li.appendChild(info);

      const total = document.createElement("div");
      total.className = "donor-total";
      total.textContent = `$${Math.round(v.total_cents / 100)}`;
      li.appendChild(total);

      const actions = document.createElement("div");
      actions.className = "viewer-row-actions";

      const muteBtn = document.createElement("button");
      muteBtn.textContent = "🔇";
      muteBtn.title = v.is_muted ? "Reactivar" : "Silenciar";
      muteBtn.classList.toggle("active", v.is_muted);
      muteBtn.onclick = async () => {
        await api(`/api/rooms/${slug}/${v.is_muted ? "unmute" : "mute"}`, { body: { user_id: v.user_id } });
        v.is_muted = !v.is_muted;
        muteBtn.title = v.is_muted ? "Reactivar" : "Silenciar";
        muteBtn.classList.toggle("active", v.is_muted);
      };
      actions.appendChild(muteBtn);

      const kickBtn = document.createElement("button");
      kickBtn.textContent = "👢";
      kickBtn.title = "Expulsar";
      kickBtn.onclick = async () => {
        await api(`/api/rooms/${slug}/kick`, { body: { user_id: v.user_id } });
        li.remove();
      };
      actions.appendChild(kickBtn);

      const blockBtn = document.createElement("button");
      blockBtn.textContent = "🚫";
      blockBtn.className = "danger";
      blockBtn.title = v.is_blocked ? "Desbloquear" : "Bloquear";
      blockBtn.classList.toggle("active", v.is_blocked);
      blockBtn.onclick = async () => {
        if (!v.is_blocked && !confirm(`¿Bloquear a ${v.name}? Ya no va a poder entrar a tu sala ni ver la transmisión.`)) return;
        await api(`/api/rooms/${slug}/${v.is_blocked ? "unblock" : "block"}`, { body: { user_id: v.user_id } });
        v.is_blocked = !v.is_blocked;
        if (v.is_blocked) {
          li.remove();
        } else {
          blockBtn.title = "Bloquear";
          blockBtn.classList.remove("active");
        }
      };
      actions.appendChild(blockBtn);

      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  $("viewers-close").onclick = () => { $("viewers-sheet").style.display = "none"; };
  $("viewers-sheet").addEventListener("click", (ev) => {
    if (ev.target.id === "viewers-sheet") $("viewers-sheet").style.display = "none";
  });

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

  // Medidor de espectro tipo estudio de grabación: barras por banda de
  // frecuencia (no una sola onda pareja) que suben rápido y bajan con calma,
  // como un medidor de audio real — así se ve genuinamente distinto según lo
  // que capta el mic (silencio se aplana, voz mueve bandas distintas).
  function setupWaveform(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtx.resume().catch(() => {});
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256; // 128 bandas de frecuencia
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const canvas = $("chat-wave");
      const ctx2d = canvas.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 3);

      function resize() {
        const w = canvas.clientWidth || 120;
        const h = canvas.clientHeight || 32;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      resize();
      window.addEventListener("resize", resize);

      const BAR_COUNT = 26;
      const barLevels = new Array(BAR_COUNT).fill(0);
      // Agrupa las bandas de forma logarítmica (más resolución en graves y
      // medios, donde vive la voz humana) y descarta el ruido de muy alta
      // frecuencia — igual que un analizador de espectro real.
      const maxBin = Math.floor(freqData.length * 0.65);
      const edges = [];
      for (let i = 0; i <= BAR_COUNT; i++) {
        edges.push(Math.max(1, Math.floor(maxBin * Math.pow(i / BAR_COUNT, 1.8))));
      }
      const canRound = typeof ctx2d.roundRect === "function";

      (function draw() {
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(freqData);
        const w = canvas.clientWidth || 120;
        const h = canvas.clientHeight || 32;
        ctx2d.clearRect(0, 0, w, h);

        const gap = 2;
        const barWidth = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;

        for (let i = 0; i < BAR_COUNT; i++) {
          const start = edges[i];
          const end = Math.max(edges[i + 1], start + 1);
          let sum = 0;
          for (let j = start; j < end; j++) sum += freqData[j];
          const avg = sum / (end - start);
          const target = (avg / 255) * h;
          // Sube rápido (se siente al instante), baja con calma (el "decay"
          // clásico de un medidor de estudio, no un parpadeo nervioso).
          barLevels[i] = target > barLevels[i]
            ? barLevels[i] + (target - barLevels[i]) * 0.65
            : barLevels[i] * 0.8;

          const barH = Math.max(barLevels[i], 2);
          const x = i * (barWidth + gap);
          const y = h - barH;
          const grad = ctx2d.createLinearGradient(0, y, 0, h);
          grad.addColorStop(0, "#B9FFDD");
          grad.addColorStop(1, "#22A66B");
          ctx2d.fillStyle = grad;
          if (canRound) {
            const r = Math.min(barWidth / 2, 2.5);
            ctx2d.beginPath();
            ctx2d.roundRect(x, y, barWidth, barH, [r, r, 0, 0]);
            ctx2d.fill();
          } else {
            ctx2d.fillRect(x, y, barWidth, barH);
          }
        }
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
    const { mediumTrack, lowTrack } = setupTieredVideoTracks(cameraTrack);
    pc = new RTCPeerConnection();
    const tracks = [];
    const toPublish = [
      { track: micTrack, name: "audio" },
      { track: cameraTrack, name: "video_high" },
      { track: mediumTrack, name: "video_medium" },
      { track: lowTrack, name: "video_low" },
    ];
    toPublish.forEach(({ track, name }, i) => {
      const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
      if (name === "video_high") videoSender = transceiver.sender;
      tracks.push({ mid: String(i), trackName: name });
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    updateConnecting("Conectando con el estudio…");
    const res = await api(`/api/rooms/${slug}/publish`, { body: { sdp: offer.sdp, tracks } });
    if (res.error) throw new Error("publish_error");
    await pc.setRemoteDescription({ type: "answer", sdp: res.answer_sdp });
    hideOverlaySmoothly();
    showControlsWithEntrance();
    studioBar.style.display = "flex";
    startLiveTimer(Date.now());
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
    // Compartir pantalla es un caso de escritorio (mostrar una presentación,
    // una terminal de trading) — en touch, además de no tener mucho sentido
    // (¿compartir la pantalla de tu propio celular?), el picker nativo de
    // captura de pantalla en móvil resultó poco confiable: cancelarlo dejaba
    // el botón y el de cambiar de cámara sin responder. Se oculta en touch en
    // vez de arriesgar esa combinación.
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (!isTouchDevice && "getDisplayMedia" in navigator.mediaDevices) {
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
      screenStream = await withTimeout(
        navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false }),
        15000
      );
    } catch {
      return; // el creador canceló el selector nativo, o tardó demasiado
    }
    const screenTrack = screenStream.getVideoTracks()[0];
    await videoSender.replaceTrack(screenTrack);
    if (cameraTrack) cameraTrack.stop();
    cameraTrack = screenTrack;
    cameraTrack.enabled = camOn;
    setHiddenSourceTrack(screenTrack); // las calidades media/baja siguen la pantalla compartida
    player.srcObject = micTrack ? new MediaStream([screenTrack, micTrack]) : screenStream;
    screenTrack.onended = () => stopScreenShare();
    usingScreenShare = true;
    $("btn-screen").classList.add("active");
    $("btn-screen").title = "Dejar de compartir pantalla";
    // Se oculta el panel de chat mientras comparte pantalla — menos distracción,
    // y si su pantalla todavía muestra esta misma página, un "espejo infinito"
    // con menos elementos encima se ve/graba mejor. Vuelve solo al terminar.
    $("chat-panel").style.display = "none";
    toast("🖥️ Compartiendo pantalla. Si tu pantalla muestra esta misma página, cambia a la app que quieres mostrar — la transmisión sigue aunque salgas de aquí.", 9000);
  }

  async function stopScreenShare() {
    if (!usingScreenShare) return;
    usingScreenShare = false;
    $("btn-screen").classList.remove("active");
    $("btn-screen").title = "Compartir pantalla";
    $("chat-panel").style.display = chatVisible ? "flex" : "none";
    let camStream;
    try {
      camStream = await withTimeout(
        navigator.mediaDevices.getUserMedia({ video: videoConstraints(), audio: false }),
        10000
      );
    } catch {
      return toast("No se pudo reactivar la cámara. Vuelve a tocar el botón de pantalla para intentar de nuevo.", 6000);
    }
    const camTrack = camStream.getVideoTracks()[0];
    camTrack.enabled = camOn;
    await videoSender.replaceTrack(camTrack);
    if (cameraTrack) cameraTrack.stop();
    cameraTrack = camTrack;
    setHiddenSourceTrack(camTrack);
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
      newStream = await withTimeout(navigator.mediaDevices.getUserMedia({ video: constraints, audio: false }), 10000);
    } catch {
      return toast("No se pudo cambiar de cámara. Intenta de nuevo.", 5000);
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
      // El title de arriba no se ve en celular (no hay hover) — un toast una
      // sola vez avisa igual quien transmite desde el teléfono.
      if (level === "bad" && !shownBadConnToast) {
        shownBadConnToast = true;
        toast("📶 Tu conexión se ve débil — acércate al router si puedes.", 6000);
      }
    }, 3000);
  }

  // Calidad de video del espectador: siempre entra rápido (audio + baja) y
  // sube sola a la calidad objetivo, se puede fijar a mano, o se adapta sola
  // según qué tan buena esté la conexión — ver plan "Calidad de video
  // seleccionable y adaptativa". El audio nunca se degrada, solo el video.
  let qualityPref = localStorage.getItem("vr_quality") || "auto";
  let effectiveTier = null; // 'low'|'medium'|'high'|'off' — lo que de verdad está llegando
  let rampUpTimer = null;
  let viewerQualityTimer = null;
  let switchingQuality = false;
  let shownAutoDownToast = false;
  let shownAutoUpToast = false;
  let goodStreak = 0;
  let badStreak = 0;

  function targetTierForPref() {
    if (qualityPref === "off") return "off";
    if (qualityPref === "auto") return "high";
    return qualityPref;
  }

  function updateAudioOnlyBadge() {
    $("audio-only-badge").style.display = effectiveTier === "off" ? "block" : "none";
  }

  // Pide una calidad concreta, arma un RTCPeerConnection nuevo, y resuelve en
  // cuanto llega el primer track (o a los 6s, de respaldo, por si la red no
  // manda nada — no dejamos al espectador esperando para siempre).
  async function subscribeAt(tier) {
    const res = await api(`/api/rooms/${slug}/subscribe`, { body: { quality: tier, cid: connectionId } });
    if (res.error) return { error: res.error };
    const newPc = new RTCPeerConnection();
    const ready = new Promise((resolve) => {
      let done = false;
      newPc.ontrack = (ev) => {
        player.srcObject = ev.streams[0];
        maybeSetupWaveform(ev.streams[0]);
        if (!done) { done = true; resolve(); }
      };
      setTimeout(() => { if (!done) { done = true; resolve(); } }, 6000);
    });
    if (res.offer_sdp) {
      await newPc.setRemoteDescription({ type: "offer", sdp: res.offer_sdp });
      const answer = await newPc.createAnswer();
      await newPc.setLocalDescription(answer);
      await api(`/api/rooms/${slug}/renegotiate`, { body: { session_id: res.viewer_session_id, sdp: answer.sdp } });
    }
    await ready;
    return { pc: newPc };
  }

  // Cambia de calidad ya conectado: cierra la sesión vieja y abre una nueva
  // pidiendo el track que corresponde — un parpadeo breve es normal (mismo
  // comportamiento que el selector de calidad de YouTube/Twitch).
  async function switchQuality(newTier, opts = {}) {
    if (switchingQuality || newTier === effectiveTier) return;
    switchingQuality = true;
    clearTimeout(rampUpTimer);
    const oldPc = pc;
    const result = await subscribeAt(newTier);
    switchingQuality = false;
    if (result.error) {
      if (!opts.silent) toast("No se pudo cambiar la calidad.");
      return;
    }
    if (oldPc) oldPc.close();
    pc = result.pc;
    effectiveTier = newTier;
    updateAudioOnlyBadge();
    if (!opts.silent) {
      const labels = { high: "Alta", medium: "Media", low: "Baja", off: "Apagado (solo audio)" };
      toast(`Calidad: ${labels[newTier]}`);
    }
  }

  function setupQualitySelector() {
    const select = $("quality-select");
    select.value = qualityPref;
    select.style.display = "inline-block";
    select.onchange = () => {
      qualityPref = select.value;
      localStorage.setItem("vr_quality", qualityPref);
      clearTimeout(rampUpTimer);
      if (qualityPref === "auto") {
        startViewerQualityMonitor();
        switchQuality("high");
      } else {
        stopViewerQualityMonitor();
        switchQuality(qualityPref);
      }
    };
  }

  function stopViewerQualityMonitor() {
    clearInterval(viewerQualityTimer);
    viewerQualityTimer = null;
  }

  // Solo corre en modo "Auto". Sondea la conexión cada 4s; baja un escalón
  // rápido (2 lecturas malas seguidas) para no dejar que se trabe, sube un
  // escalón con calma (3 lecturas buenas seguidas) para no ir subiendo y
  // bajando. Nunca apaga el video sola — eso lo decide el espectador.
  function startViewerQualityMonitor() {
    stopViewerQualityMonitor();
    goodStreak = 0;
    badStreak = 0;
    viewerQualityTimer = setInterval(async () => {
      if (!pc || switchingQuality || effectiveTier === "off") return;
      let rtt = null;
      let lost = null;
      try {
        const stats = await pc.getStats();
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.state === "succeeded" && r.currentRoundTripTime != null) {
            rtt = r.currentRoundTripTime;
          }
          if (r.type === "inbound-rtp" && r.kind === "video" && r.packetsLost != null && r.packetsReceived != null) {
            const total = r.packetsLost + r.packetsReceived;
            lost = total > 0 ? r.packetsLost / total : 0;
          }
        });
      } catch {
        return;
      }
      const bad = (rtt != null && rtt > 0.35) || (lost != null && lost > 0.06);
      const good = (rtt == null || rtt < 0.15) && (lost == null || lost < 0.02);
      if (bad) { badStreak++; goodStreak = 0; } else if (good) { goodStreak++; badStreak = 0; } else { badStreak = 0; goodStreak = 0; }

      const order = ["low", "medium", "high"];
      const idx = order.indexOf(effectiveTier);
      if (badStreak >= 2 && idx > 0) {
        badStreak = 0;
        switchQuality(order[idx - 1], { silent: true });
        if (!shownAutoDownToast) {
          shownAutoDownToast = true;
          toast("📶 Bajamos la calidad para que no se trabe.");
        }
      } else if (goodStreak >= 3 && idx < order.length - 1) {
        goodStreak = 0;
        switchQuality(order[idx + 1], { silent: true });
        if (!shownAutoUpToast) {
          shownAutoUpToast = true;
          toast("✨ Tu conexión mejoró, subimos la calidad.");
        }
      }
    }, 4000);
  }

  async function startSubscribing() {
    updateConnecting("Conectando con la transmisión…");
    const initialTier = qualityPref === "off" ? "off" : "low";
    updateConnecting("Sintonizando la señal…");
    const result = await subscribeAt(initialTier);
    if (result.error) {
      endConnecting();
      const msg = result.error === "creador_no_transmitiendo" ? "El creador aún no transmite. Vuelve a intentar en un momento."
        : result.error === "sin_pase" ? "Necesitas un pase para ver esta sala."
        : "No se pudo conectar.";
      return toast(msg);
    }
    pc = result.pc;
    effectiveTier = initialTier;
    updateAudioOnlyBadge();
    hideOverlaySmoothly();
    showControlsWithEntrance();
    revealChatUI();
    setupQualitySelector();
    viewerPresenceEl.style.display = "flex";

    // Arrancamos bajo para que la entrada sea rápida, y subimos a la calidad
    // objetivo (1080p por default, vía "Auto") en cuanto ya hay imagen fluyendo.
    const target = targetTierForPref();
    if (target !== initialTier) {
      rampUpTimer = setTimeout(() => switchQuality(target, { silent: true }), 1500);
    }
    if (qualityPref === "auto") startViewerQualityMonitor();

    // Descubribilidad del doble-tap: nadie adivina solo que ahí se manda un
    // corazón — se avisa una sola vez, ya con imagen en pantalla.
    if (!shownHeartHintToast) {
      shownHeartHintToast = true;
      setTimeout(() => toast("💡 Doble toque en el video para mandar un corazón ❤️", 5000), 3000);
    }
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
      // El feedback visual lo da spawnFloatingHeart() cuando llega el eco del
      // propio WebSocket — así el que toca ve exactamente lo mismo que el resto.
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
      // El slider de "atenuar video" es para que un espectador ajuste lo que
      // ve — no aplica a quien transmite.
      $("dim-slider").style.display = "none";
      // Ver quién está conectado (ordenado por donación) es solo del creador
      // — reusa el mismo conteo que ya tenía en el studio-bar como entrada.
      viewerCountEl.classList.add("clickable");
      viewerCountEl.onclick = openViewersSheet;
      if (isLive) {
        overlay.style.display = "none";
        controls.style.display = "flex";
        studioBar.style.display = "flex";
        startLiveTimer(status.live_session.started_at * 1000);
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
      let res;
      try {
        res = await api(`/api/rooms/${slug}/stop`, { body: {} });
      } catch {
        // Con conexión mala esto puede tardar hasta 12s antes de fallar —
        // el botón se queda deshabilitado ese rato (evita un doble tap que
        // mande dos "stop"), pero nunca más que eso, y queda claro que puede
        // volver a tocarlo.
        return toast("No se pudo terminar la transmisión — revisa tu conexión y vuelve a tocar \"Terminar\".", 7000);
      }
      if (res.error) return toast("No se pudo terminar la transmisión. Vuelve a tocar \"Terminar\".", 6000);
      sessionEnded = true;
      if (qualityTimer) clearInterval(qualityTimer);
      if (liveTimerInterval) clearInterval(liveTimerInterval);
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
      $("btn-chat").classList.toggle("active", chatVisible);
    });
    // Levantar la mano es una señal privada y ligera para pedir la atención
    // del creador, distinta del chat (una pregunta real) y del corazón (una
    // reacción emocional) — cada canal sirve para algo distinto, y ninguno
    // ensucia a los otros. Se resetea sola a los 45s si nadie la baja.
    guarded($("btn-hand"), async () => {
      if (!me) return requireLogin();
      handRaised = !handRaised;
      $("btn-hand").textContent = handRaised ? "✋" : "🎤";
      $("btn-hand").classList.toggle("active", handRaised);
      clearTimeout(handRaiseTimer);
      if (handRaised) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "raise_hand", name: me.name }));
        }
        toast("✋ Le avisamos al creador.");
        handRaiseTimer = setTimeout(() => {
          handRaised = false;
          $("btn-hand").textContent = "🎤";
          $("btn-hand").classList.remove("active");
        }, 45000);
      }
    });
    if (isOwner) $("btn-unpin").style.display = "inline-block";
    guarded($("btn-unpin"), async () => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "unpin" }));
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
    // Refuerza, justo en el momento en que alguien va a escribir por primera
    // vez, que nada de esto se guarda — el lugar exacto donde vive la duda.
    $("chat-input").addEventListener("focus", () => {
      if (shownPrivacyToast) return;
      shownPrivacyToast = true;
      toast("🔒 Nada de esto se guarda. Habla con toda confianza.", 5000);
    });
    $("dim-slider").addEventListener("input", (e) => {
      const val = Number(e.target.value);
      player.style.filter = val >= 100 ? "" : `brightness(${val}%)`;
    });
  }

  init();
})();

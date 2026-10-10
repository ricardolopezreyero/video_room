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
  // "$37.50" cuando hay centavos, "$50" cuando no: nunca un redondeo en dinero.
  function pesos(cents) {
    const c = Math.round(Number(cents) || 0);
    return `$${(c / 100).toLocaleString("es-MX", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  }
  function horaCDMX(unix) {
    return new Date(unix * 1000).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit" });
  }
  function irARecargar(faltaCents) {
    const volver = location.pathname;
    setTimeout(() => { location.href = `/app/monedero?volver=${encodeURIComponent(volver)}&falta=${Math.max(0, faltaCents)}`; }, 1600);
  }
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
  let ownerStreamStopped = false;
  let tipOptions = [2000, 5000, 10000, 20000];
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
  // Motor de video (ver motor-video.js): el del creador mueve resolución,
  // fps, bits y códec según su aparato y su internet; el espectador pide la
  // capa que su aparato y su red aguantan. Y la reconexión de los dos lados.
  let motor = null;
  let motorAudio = null;
  let micTrackCrudo = null;
  let micTrackLo = null;
  let audioModo = localStorage.getItem("vr_audio_modo") || "auto";
  let filtro = null;
  let filtroNombre = localStorage.getItem("vr_filtro") || "normal";
  let audioSender = null;
  let audioLoSender = null;
  let codecNombre = "auto";
  let publishGen = 0;
  let republishTimer = null;
  let republicando = false;
  let roomTitle = "";
  let viewerSessionId = null;
  let videoMid = null;
  let simulcastViewer = false;
  let viewerCap = "f";
  let viewerCapChecked = false;
  let lector = null;
  let colchonMs = 0;
  let reconectando = false;
  let viewerReconnTimer = null;
  let ownerOfflineSince = 0;
  let ownerOfflineTimer = null;
  let esperaTimer = null;
  let bannerTimer = null;
  let enterLabel = "";
  let liveTimerInterval = null;
  let shownHeartHintToast = false;
  let shownPrivacyToast = false;
  let handRaised = false;
  let handRaiseTimer = null;

  // Las tres calidades que puede pedir un espectador (alta/media/baja) las
  // genera el propio codificador de video en simulcast (ver publicar()):
  // una sola cámara, tres capas, cero redibujado en canvas. Antes la media y
  // la baja se pintaban 60 veces por segundo en dos canvas ocultos, lo que
  // calentaba el teléfono del creador y le quitaba cuadros a la capa alta.

  function buzz(ms = 10) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // El "sentir del clic" es uno solo para todos los controles de la sala: una
  // vibración corta en el instante en que el dedo baja (no cuando termina la
  // acción, que puede tardar), a la par del encogimiento que hace el CSS en
  // :active. Delegado en el dock para que valga también para botones que se
  // muestren después (pantalla, girar cámara).
  controls.addEventListener("pointerdown", (ev) => {
    const btn = ev.target.closest("button, select");
    if (btn && !btn.disabled) buzz(8);
  }, { passive: true });
  $("btn-stop").addEventListener("pointerdown", () => buzz(14), { passive: true });

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

  // Se pide lo máximo que la cámara pueda dar (hasta 4K a 60 fps); el motor
  // ajusta después la captura al peldaño que de verdad cabe en el internet y
  // el aparato de ese momento.
  function videoConstraints() {
    return { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 60 }, facingMode: preferredFacing };
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
  // Al terminar la transmisión, el creador ya sabe que se acabó — no tiene
  // sentido que su cámara/mic sigan encendidos varios segundos más mientras
  // se espera el aviso a los espectadores. Apaga todo de inmediato; el
  // recargar la página (para dejar todo limpio) puede esperar un poco más,
  // lo justo para leer cuánto ganó.
  function stopOwnerMediaNow() {
    if (ownerStreamStopped) return;
    ownerStreamStopped = true;
    if (llamadaCon) terminarLlamada();
    soltarWakeLock();
    if (motor) motor.detener();
    if (motorAudio) { try { motorAudio.destruir(); } catch {} }
    if (filtro) { try { filtro.destruir(); } catch {} }
    if (micTrackCrudo) { try { micTrackCrudo.stop(); } catch {} }
    if (micTrackLo) { try { micTrackLo.stop(); } catch {} }
    clearTimeout(republishTimer);
    if (cameraTrack) { try { cameraTrack.stop(); } catch {} }
    if (micTrack) { try { micTrack.stop(); } catch {} }
    if (pc) { try { pc.close(); } catch {} pc = null; }
    player.srcObject = null;
    setTimeout(() => location.reload(), 2500);
  }

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
    if (window.LoginCT) LoginCT.entrar();
    else window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
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
          toast(msg.cortesia ? `${msg.name} entró (cortesía)` : msg.member ? `${msg.name} entró (miembro)` : `+${pesos(msg.creator_cents ?? 1000)} · ${msg.name} entró`);
          tickerText.textContent = pesos(msg.ticker_cents);
        }
      } else if (msg.type === "tip") {
        showTipBand(msg.from, msg.avatar_url, msg.amount_cents, msg.message);
        if (msg.fila) crearChat().recibir(msg.fila);
        if (isOwner) {
          toast(`+${pesos(msg.creator_cents ?? msg.amount_cents)} · ${msg.from} te mandó dinero 💵`);
          tickerText.textContent = pesos(msg.ticker_cents);
        }
      } else if (msg.type === "hearts") {
        spawnFloatingHeart();
      } else if (msg.type === "chat_inicio") {
        crearChat().inicio(msg);
      } else if (msg.type === "comment") {
        crearChat().recibir(msg);
      } else if (msg.type === "comment_liked") {
        if (chat) chat.likes(msg.comment_id, msg.likes, msg.seq);
      } else if (msg.type === "pinned") {
        if (msg.fila) crearChat().recibir(msg.fila);
        $("pinned-text").textContent = `${msg.name}: ${msg.body}`;
        const pinnedAvatar = $("pinned-avatar");
        if (msg.avatar_url) { pinnedAvatar.src = msg.avatar_url; pinnedAvatar.style.display = "block"; }
        else pinnedAvatar.style.display = "none";
        // Destacado pagado: dorado, con el monto, y se baja solo al vencer.
        const pinnedEl = $("pinned-msg");
        clearTimeout(paidPinTimer);
        pinnedEl.classList.toggle("paid", !!msg.paid_cents);
        let amt = pinnedEl.querySelector(".pinned-paid-amt");
        if (msg.paid_cents) {
          if (!amt) { amt = document.createElement("span"); amt.className = "pinned-paid-amt"; pinnedEl.insertBefore(amt, $("pinned-text")); }
          amt.textContent = `$${Math.round(msg.paid_cents / 100)}`;
          if (msg.until) paidPinTimer = setTimeout(() => { pinnedEl.style.display = "none"; pinnedEl.classList.remove("paid"); }, Math.max(1000, msg.until - Date.now()));
        } else if (amt) amt.remove();
        pinnedEl.style.display = "flex";
      } else if (msg.type === "unpinned") {
        $("pinned-msg").style.display = "none";
      } else if (msg.type === "raise_hand") {
        if (isOwner) toast(`🎤 ${msg.name} levantó la mano`, 5000);
      } else if (msg.type === "owner_offline") {
        if (!isOwner) {
          ownerOfflineSince = msg.since || Date.now();
          clearTimeout(ownerOfflineTimer);
          ownerOfflineTimer = setTimeout(() => { if (ownerOfflineSince) mostrarEsperaCreador(msg.grace_ms || 0); }, 4000);
        }
      } else if (msg.type === "owner_online") {
        if (!isOwner) detenerEsperaCreador(false);
      } else if (msg.type === "republished") {
        // La señal vive en otra sesión del SFU: quien estaba viendo se reengancha solo.
        if (!isOwner && me && effectiveTier != null) reconectarEspectador("republished");
      } else if (msg.type === "ended") {
        sessionEnded = true;
        detenerEsperaCreador(true);
        if (isOwner) {
          stopOwnerMediaNow();
        } else if (me && pc) {
          // Propina de despedida: quien estaba viendo puede agradecer antes de
          // que la página se reinicie. Vale 10 minutos después del cierre.
          if (pc) { try { pc.close(); } catch {} pc = null; }
          player.srcObject = null;
          despedidaSuave();
        } else {
          toast("La transmisión terminó. Como prometimos, nada quedó grabado.", 6000);
          setTimeout(() => location.reload(), 6000);
        }
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
  // Un toque de estatus en el momento en que algo se gana: discreto, una
  // sola línea, y nunca encima de un aviso de dinero.
  function announceRelics(list) {
    if (!Array.isArray(list) || !list.length) return;
    const r = list[0];
    const extra = list.length > 1 ? ` (+${list.length - 1})` : "";
    setTimeout(() => toast(`${r.icon} Nueva reliquia: ${r.name}${extra} — ${r.how}`, 6500), 1200);
    if (navigator.vibrate) navigator.vibrate([12, 60, 12]);
  }

  // ── El chat en vivo vive en chat.js (ChatVivo): ventana de filas con tope,
  // scroll que no brinca, búsqueda, filtros, teclas. room.js solo le pasa lo
  // que llega por el socket y le presta las acciones de la sala.
  const TECLAS = [];
  const teclaPor = new Map();
  function registrarTecla(tecla, descripcion, fn, opts = {}) {
    const reg = { tecla, descripcion, fn, ...opts };
    TECLAS.push(reg);
    teclaPor.set(tecla, reg);
  }
  let chat = null;
  function crearChat() {
    if (chat || !window.ChatVivo) return chat;
    chat = ChatVivo.crear({
      feed: $("chat-feed"), panel: $("chat-panel"), slug, api, toast,
      esCreador: () => isOwner, yo: () => me, nombreCreador: () => roomTitle,
      onCitar: (f) => citar(f),
      onFijar: (f) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "pin", name: f.name, body: f.body, avatar_url: f.avatar_url })); },
      onModerar: (ev, f) => openCommentActions(ev, f.id, f.user_id, f.name),
      onLike: (f) => { if (f && f.id) api(`/api/rooms/${slug}/like-comment`, { body: { comment_id: f.id } }).catch(() => {}); },
      onCorazon: () => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "heart" })); },
      registrarTecla,
    });
    return chat;
  }
  // Tocar un nombre (o la tecla r) deja «@Nombre » listo en la caja: así la
  // persona mencionada ve su mensaje marcado y lo encuentra con el filtro @.
  function citar(f) {
    if (!f || !f.name) return;
    const input = $("chat-input");
    const etiqueta = "@" + f.name.trim().split(/\s+/)[0] + " ";
    if (!input.value.includes(etiqueta)) input.value = etiqueta + input.value;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
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
    // «$50 gracias» o «$100»: es dinero, no un comentario. Se abre la hoja
    // con el monto y el mensaje puestos; un toque lo manda.
    const dinero = !isOwner && text.match(/^\$\s?(\d{1,4})(?:\s+(.*))?$/);
    if (dinero) {
      const monto = Number(dinero[1]) * 100;
      if (monto >= 1000 && monto <= 500000) { input.value = ""; openTipSheet({ monto, mensaje: (dinero[2] || "").trim() }); return; }
    }
    input.value = "";
    const res = await api(`/api/rooms/${slug}/comment`, { body: { text } });
    if (res.error === "sin_pase") toast("Necesitas un pase vigente para comentar.");
    else if (res.error === "sala_cerrada") toast("La sala ya cerró.");
    else if (res.error === "despacio") { input.value = text; toast("Un momento… un comentario a la vez.", 1800); }
    else if (res.error) { input.value = text; toast("No se pudo enviar tu comentario."); }
    else if (chat) chat.irEnVivo(); // lo que escribes, lo ves: al mandar regresas a lo vivo
  }

  function revealChatUI() {
    $("btn-chat").style.display = "flex";
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

  async function startPublishing(sessionId, opts = {}) {
    updateConnecting(opts.reanudar ? "Reanudando tu transmisión…" : "Accediendo a tu cámara y micrófono…");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints(),
        // Al micrófono se le pide todo (48 kHz, estéreo) y el trato del modo
        // elegido (Voz / Música / Ambiente); ver motor-audio.js.
        audio: MotorAudio.capturaPara(audioModo),
      });
    } catch {
      throw new Error("sin_camara");
    }
    player.srcObject = stream;
    player.muted = true;
    cameraTrack = stream.getVideoTracks()[0];
    micTrackCrudo = stream.getAudioTracks()[0];
    try { cameraTrack.contentHint = "motion"; } catch {}
    pedirWakeLock(); // transmitiendo, la pantalla no se apaga sola
    // La cadena de audio: lo que se publica es el micrófono ya procesado.
    if (motorAudio) { try { motorAudio.destruir(); } catch {} }
    motorAudio = await MotorAudio.crear({
      micTrack: micTrackCrudo,
      modo: audioModo,
      onModoAuto: (n) => { const m = MotorAudio.MODOS[n]; toast(`🎧 Auto: ${m ? m.icono + " " + m.nombre : n}. ${m ? m.desc : ""}`, 5000); pintarAudioEnHoja(); },
      onListo: (procesado) => { micTrack = procesado; if (audioSender) audioSender.replaceTrack(procesado).catch(() => {}); if (audioLoSender) { try { micTrackLo = procesado.clone(); audioLoSender.replaceTrack(micTrackLo).catch(() => {}); } catch {} } },
    });
    micTrack = motorAudio.track;
    try { micTrack.contentHint = /musica|concierto/.test(audioModo) ? "music" : "speech"; } catch {}
    // Filtros de color: la cámara pasa por la GPU solo cuando hay un filtro.
    if (filtro) { try { filtro.destruir(); } catch {} }
    filtro = MotorVideo.crearFiltro ? MotorVideo.crearFiltro({ track: cameraTrack, onPerdido: () => { toast("El efecto de color se apagó (la app estuvo en el fondo). Tu cámara sigue saliendo normal.", 5000); aplicarFiltro("normal"); } }) : null;
    if (filtro) filtro.setFiltro(filtroNombre); else filtroNombre = "normal";
    player.srcObject = new MediaStream([fuenteVideo()]);
    await publicar("Conectando con el estudio…");
    hideOverlaySmoothly();
    showControlsWithEntrance();
    studioBar.style.display = "flex";
    if (!opts.reanudar) startLiveTimer(Date.now());
    showCreatorToolbar();
    revealChatUI();
    maybeSetupWaveform(new MediaStream([micTrack]));
    toast(opts.reanudar ? "✅ Tu transmisión se reanudó. Tu público se reconecta solo." : "✨ Estás en vivo, disfruta.", 6000);
  }

  // El creador recargó la página (o el celular mató la pestaña al cambiar de
  // app) con la transmisión abierta: se vuelve a publicar sola, sin tocar
  // nada. Si el navegador no deja usar la cámara sin un toque, queda el botón.
  async function reanudarPublicacion(sessionId) {
    // Si en 3 s no arrancó (el navegador está preguntando por la cámara, o
    // no deja usarla sin un toque), aparece el botón para retomar a mano; si
    // lo automático termina después, el botón se va solo.
    const mostrarBoton = () => {
      overlay.classList.remove("fade-out");
      overlay.style.display = "flex";
      $("btn-start").textContent = "🔴 Reanudar mi transmisión";
      $("btn-start").style.display = "block";
      sub.textContent = "Tu transmisión sigue abierta. Toca para volver a transmitir desde aquí.";
    };
    const espera = setTimeout(mostrarBoton, 3000);
    try {
      await startPublishing(sessionId, { reanudar: true });
      clearTimeout(espera);
      $("btn-start").style.display = "none";
    } catch {
      clearTimeout(espera);
      mostrarBoton();
    }
  }

  // Arma la conexión con el SFU y publica audio + video. El video va en
  // simulcast: tres capas (f completa, h mitad, q cuarto) del mismo
  // codificador, para que cada espectador reciba la que su internet aguanta
  // sin que el creador haga nada. Se usa al arrancar y cada vez que hay que
  // volver a publicar después de un corte.
  async function publicar(mensaje, opts = {}) {
    const gen = ++publishGen;
    const nuevoPc = new RTCPeerConnection();
    const simulcast = opts.simulcast !== false;
    const ajustes = (cameraTrack.getSettings && cameraTrack.getSettings()) || {};
    const codec = await MotorVideo.elegirCodecs({ w: ajustes.width || 1920, h: ajustes.height || 1080, fps: ajustes.frameRate || 30 });
    codecNombre = codec.nombre;
    const audioTx = nuevoPc.addTransceiver(micTrack, { direction: "sendonly" });
    // Segunda versión del mismo audio, a 48 kb/s, para quien anda con red floja.
    try { if (micTrackLo) micTrackLo.stop(); } catch {}
    micTrackLo = micTrack.clone();
    const audioLoTx = nuevoPc.addTransceiver(micTrackLo, { direction: "sendonly", sendEncodings: [{ maxBitrate: 48000 }] });
    const videoTx = nuevoPc.addTransceiver(fuenteVideo(), simulcast
      ? {
          direction: "sendonly",
          sendEncodings: [
            { rid: "f", scaleResolutionDownBy: 1 },
            { rid: "h", scaleResolutionDownBy: 2 },
            { rid: "q", scaleResolutionDownBy: 4 },
          ],
        }
      : { direction: "sendonly" });
    if (codec.lista) { try { videoTx.setCodecPreferences(codec.lista); } catch {} }
    const offer = await nuevoPc.createOffer();
    await nuevoPc.setLocalDescription(offer);
    if (mensaje) updateConnecting(mensaje);
    // Sin simulcast el track se llama "video_high": es el nombre que el
    // camino viejo de /subscribe entrega a todos los espectadores.
    const tracks = [
      { mid: audioTx.mid != null ? String(audioTx.mid) : "0", trackName: "audio" },
      { mid: audioLoTx.mid != null ? String(audioLoTx.mid) : "1", trackName: "audio_lo" },
      { mid: videoTx.mid != null ? String(videoTx.mid) : "2", trackName: simulcast ? "video" : "video_high" },
    ];
    const res = await api(`/api/rooms/${slug}/publish`, { body: { sdp: offer.sdp, tracks } });
    if (res.error) {
      try { nuevoPc.close(); } catch {}
      // El SFU no aceptó la oferta en simulcast: se intenta una vez a la
      // antigua (una sola capa) antes de darse por vencido.
      if (simulcast && res.error === "calls_error") return publicar(mensaje, { simulcast: false });
      throw new Error("publish_error");
    }
    if (gen !== publishGen) { try { nuevoPc.close(); } catch {} return; }
    // La respuesta del SFU es la que gobierna nuestro codificador de audio: se
    // le piden estéreo, FEC y hasta 128 kb/s (el SFU solo reenvía paquetes).
    await nuevoPc.setRemoteDescription({ type: "answer", sdp: MotorVideo.mejorarAudioSdp(res.answer_sdp) });
    const viejo = pc;
    pc = nuevoPc;
    videoSender = videoTx.sender;
    audioSender = audioTx.sender;
    audioLoSender = audioLoTx.sender;
    if (viejo && viejo !== nuevoPc) { try { viejo.close(); } catch {} }
    vigilarConexionCreador(nuevoPc);
    if (motor) {
      motor.setPc(pc, videoSender, audioSender);
    } else {
      motor = new MotorVideo.MotorPublicador({ pc, sender: videoSender, audioSender, track: cameraTrack, codec: codecNombre, onCambio: pintarCalidadCreador });
      motor.arrancar().catch(() => {});
    }
  }

  // El track de video que sale: el de la GPU si hay filtro puesto, la cámara
  // tal cual si no. Compartiendo pantalla, siempre la pantalla (texto nítido).
  function fuenteVideo() {
    if (usingScreenShare || !filtro || !filtro.activo) return cameraTrack;
    return filtro.track;
  }

  // ---- Efectos de color: un clic y se pone ----
  async function aplicarFiltro(nombre) {
    filtroNombre = MotorVideo.FILTROS[nombre] ? nombre : "normal";
    localStorage.setItem("vr_filtro", filtroNombre);
    if (filtro) filtro.setFiltro(filtroNombre);
    if (!usingScreenShare) {
      const salida = fuenteVideo();
      if (videoSender) { try { await videoSender.replaceTrack(salida); } catch {} }
      player.srcObject = micTrack ? new MediaStream([salida, micTrack]) : new MediaStream([salida]);
    }
    const f = MotorVideo.FILTROS[filtroNombre];
    toast(`${f.icono} ${f.nombre}. ${f.desc}`, 3500);
  }
  function hojaDeOpciones({ titulo, sub, opciones, actual, onElegir }) {
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = `
      <div class="sheet-inner">
        <h3>${titulo}</h3>
        ${sub ? `<p class="sheet-sub">${sub}</p>` : ""}
        <div class="fx-grid">${opciones.map((o) => `<button class="fx-item${o.id === actual ? " active" : ""}" data-id="${o.id}"><span class="fx-icon">${o.icono}</span><span class="fx-nombre">${o.nombre}</span><span class="fx-desc">${o.desc}</span></button>`).join("")}</div>
        <button id="fx-cerrar">Cerrar</button>
      </div>`;
    document.body.appendChild(sheet);
    const cerrar = () => sheet.remove();
    sheet.querySelector("#fx-cerrar").onclick = cerrar;
    sheet.addEventListener("click", (e) => { if (e.target === sheet) cerrar(); });
    sheet.querySelectorAll(".fx-item").forEach((b) => {
      b.addEventListener("pointerdown", () => buzz(8), { passive: true });
      b.onclick = () => { sheet.querySelectorAll(".fx-item").forEach((x) => x.classList.toggle("active", x === b)); onElegir(b.dataset.id); };
    });
    return sheet;
  }
  function abrirHojaEfectos() {
    const opciones = Object.entries(MotorVideo.FILTROS).map(([id, f]) => ({ id, ...f }));
    hojaDeOpciones({
      titulo: "🎨 Efectos de color",
      sub: filtro ? "Se aplica al instante a lo que tu público ve. Toca otro para cambiar." : "Tu navegador no permite filtros por GPU aquí; la cámara sale tal cual.",
      opciones, actual: filtroNombre,
      onElegir: (id) => aplicarFiltro(id),
    });
  }
  let hojaAudio = null;
  function abrirHojaAudio() {
    const opciones = [{ id: "auto", icono: "✨", nombre: "Auto", desc: "Escucha el ambiente y elige solo el mejor ajuste. Cambia si te mueves." }]
      .concat(MotorAudio.ORDEN_MODOS.map((id) => ({ id, ...MotorAudio.MODOS[id] })));
    hojaAudio = hojaDeOpciones({
      titulo: "🎧 Ajuste de audio",
      sub: "Un toque y las frecuencias se acomodan a tu ambiente. En Auto, el motor decide por ti.",
      opciones, actual: audioModo,
      onElegir: (id) => {
        audioModo = id;
        localStorage.setItem("vr_audio_modo", audioModo);
        if (motorAudio) motorAudio.setModo(audioModo);
        try { if (micTrack) micTrack.contentHint = /musica|concierto/.test(motorAudio ? motorAudio.modo : audioModo) ? "music" : "speech"; } catch {}
        const m = MotorAudio.MODOS[id];
        toast(id === "auto" ? `✨ Auto: ahora suena como ${MotorAudio.nombreModo(motorAudio ? motorAudio.modo : "voz")}; se ajusta solo si cambias de ambiente.` : `${m.icono} ${m.nombre}. ${m.desc}`, 4500);
        pintarAudioEnHoja();
      },
    });
    pintarAudioEnHoja();
  }
  // En Auto, la hoja enseña qué ajuste está sonando ahora mismo.
  function pintarAudioEnHoja() {
    if (!hojaAudio || !document.body.contains(hojaAudio)) return;
    const auto = hojaAudio.querySelector('.fx-item[data-id="auto"] .fx-desc');
    if (auto && motorAudio) auto.textContent = audioModo === "auto" ? `Ahora suena como ${MotorAudio.nombreModo(motorAudio.modo)}. Cambia solo si te mueves de ambiente.` : "Escucha el ambiente y elige solo el mejor ajuste. Cambia si te mueves.";
  }

  // Lo que el creador ve de su propia señal: "1080p · 30 fps · H264 · 4.1 Mb/s".
  function pintarCalidadCreador(p, info) {
    const el = $("stream-quality");
    if (!el) return;
    el.textContent = MotorVideo.etiqueta(p, info && info.codec !== "auto" ? info.codec : null, info && info.kbps) + (motor ? ` · audio ${motor.audioKbps} kb/s` : "");
    if (info && info.motivo === "baja") el.title = "Bajamos un peldaño para que no se trabe (primero cuadros, luego resolución).";
    else if (info && info.motivo === "sube") el.title = "Tu internet dio para más: subimos un peldaño.";
  }

  // Si la conexión del creador se cae (cambio de red, túnel, wifi que se va),
  // se vuelve a publicar sola en cuanto hay red: nueva sesión en el SFU y
  // los espectadores se reenganchan solos (el Durable Object les avisa).
  function vigilarConexionCreador(conn) {
    conn.onconnectionstatechange = () => {
      if (conn !== pc || sessionEnded || ownerStreamStopped) return;
      const st = conn.connectionState;
      if (st === "failed") republicar("failed");
      else if (st === "disconnected") {
        clearTimeout(republishTimer);
        republishTimer = setTimeout(() => {
          if (conn === pc && conn.connectionState === "disconnected") republicar("disconnected");
        }, 4000);
      } else if (st === "connected") clearTimeout(republishTimer);
    };
  }
  async function republicar(motivo) {
    if (republicando || sessionEnded || ownerStreamStopped || !cameraTrack) return;
    republicando = true;
    const el = $("stream-quality");
    if (el) el.textContent = "reconectando…";
    toast("📶 Se cortó tu conexión. Reconectando la transmisión… tu público ve que estás volviendo.", 6000);
    let espera = 1500;
    while (!sessionEnded && !ownerStreamStopped) {
      try {
        await publicar(null);
        toast("✅ Volviste. Tu público se reconecta solo.", 4000);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, espera));
        espera = Math.min(12000, Math.round(espera * 1.8));
      }
    }
    republicando = false;
  }
  window.addEventListener("online", () => {
    if (isOwner && pc && pc.connectionState !== "connected" && !sessionEnded) republicar("online");
  });

  // Botones de 💵/🎤 son para el viewer (mandar dinero / levantar la mano) y no
  // aplican en la propia sala del creador — se ocultan y en su lugar aparecen
  // los controles reales de transmisión.
  function showCreatorToolbar() {
    $("btn-tip").style.display = "none";
    $("btn-hand").style.display = "none";
    $("btn-mic").style.display = "flex";
    $("btn-cam").style.display = "flex";
    // Se muestra si el navegador de verdad soporta compartir pantalla (en la
    // mayoría de navegadores móviles ni siquiera existe la API, así que ahí
    // no aparece solo). El withTimeout() de toggleScreenShare()/stopScreenShare()
    // ya evita que cancelar el picker nativo deje los botones sin responder.
    if ("getDisplayMedia" in navigator.mediaDevices) {
      $("btn-screen").style.display = "flex";
    }
    $("btn-fx").style.display = "flex";
    $("btn-audio").style.display = "flex";
    setupCameraSwitcher();
    startQualityMonitor();
    $("btn-call").style.display = "flex";
    // Si ya hubo una llamada con alguien, se ofrece retomarla con un toque.
    const par = localStorage.getItem(`vr_llamada_${slug}`);
    if (par) setTimeout(() => toast(`📞 ¿Volver a la llamada con ${par}? Toca "Llamada".`, 6000), 7000);
  }

  // ---- Pantalla encendida ----
  // Transmitiendo o viendo en la tele, el teléfono no debe dormirse. Wake Lock
  // donde existe (Chrome, Safari 16.4+; se pide de nuevo al volver al frente
  // porque el sistema lo suelta); donde no, un video mudo de 1 px en bucle,
  // que es lo que el sistema respeta para no apagar la pantalla.
  let wakeLock = null, wakeDeseado = false, noSleepVideo = null;
  async function pedirWakeLock() {
    wakeDeseado = true;
    if ("wakeLock" in navigator) {
      try { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); return; } catch {}
    }
    if (!noSleepVideo) {
      noSleepVideo = document.createElement("video");
      noSleepVideo.setAttribute("playsinline", ""); noSleepVideo.muted = true; noSleepVideo.loop = true;
      noSleepVideo.style.cssText = "position:fixed; left:-9999px; top:0; width:1px; height:1px; opacity:0;";
      // mp4 mínimo (un cuadro negro): basta para que el sistema lo cuente como "reproduciendo".
      noSleepVideo.src = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE1MiByMjg1NCBlOWE1OTAzIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTMgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAA3//728P4FNjuZQQAAAu5tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAZAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACGHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAZAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAgAAAAIAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAGQAAAAAAAEAAAAAAZBtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAACgAAAAEAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAE7bWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAA+3N0YmwAAACXc3RzZAAAAAAAAAABAAAAh2F2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAgACAEgAAABIAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY//8AAAAxYXZjQwFkAAr/4QAYZ2QACqzZX4iIhAAAAwAEAAADAFA8SJZYAQAGaOvjyyLAAAAAGHN0dHMAAAAAAAAAAQAAAAEAAAQAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAABRzdHN6AAAAAAAAAsUAAAABAAAAFHN0Y28AAAAAAAAAAQAAADAAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjU2LjQwLjEwMQ==";
      document.body.appendChild(noSleepVideo);
    }
    noSleepVideo.play().catch(() => {});
  }
  function soltarWakeLock() {
    wakeDeseado = false;
    if (wakeLock) { try { wakeLock.release(); } catch {} wakeLock = null; }
    if (noSleepVideo) { try { noSleepVideo.pause(); } catch {} }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (wakeDeseado) pedirWakeLock();
    // iPhone y Android pueden apagar la cámara al mandar la app al fondo: al
    // volver, si el track murió, se vuelve a pedir y se cambia en caliente.
    if (isOwner && cameraTrack && cameraTrack.readyState === "ended" && !usingScreenShare && !ownerStreamStopped && !sessionEnded) reactivarCamara();
  });
  async function reactivarCamara() {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(), audio: false });
      const t = st.getVideoTracks()[0];
      t.enabled = camOn;
      cameraTrack = t;
      try { t.contentHint = "motion"; } catch {}
      if (filtro) filtro.setFuente(t);
      if (videoSender) await videoSender.replaceTrack(fuenteVideo());
      if (motor) motor.setTrack(t);
      player.srcObject = micTrack ? new MediaStream([fuenteVideo(), micTrack]) : new MediaStream([fuenteVideo()]);
      toast("📷 Tu cámara volvió.", 3000);
    } catch {
      toast("Tu cámara se detuvo al salir de la app. Toca 📷 dos veces para reactivarla.", 6000);
    }
  }

  // ---- Modo tele: la pantalla del teléfono se vuelve solo el video ----
  // La tele recibe lo que el teléfono muestra (AirPlay en iPhone → Apple TV o
  // Roku con AirPlay; Duplicar pantalla en Android → Roku, Fire TV, Android
  // TV). Aquí la pantalla se limpia: solo el video, a pantalla completa donde
  // el navegador lo permite, sin que el teléfono se duerma, con pista para
  // girarlo si está vertical. Si el navegador ofrece mandar el video directo
  // (AirPlay/Transmitir), se intenta primero.
  let modoTv = false, tvOcultarTimer = null, modoTvAuto = false;
  const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const esAndroid = /Android/.test(navigator.userAgent);
  function pantallaCompleta(on) {
    const d = document, el = d.documentElement;
    try {
      if (on) {
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (req) { const r = req.call(el, { navigationUI: "hide" }); if (r && r.catch) r.catch(() => {}); }
      } else if (d.fullscreenElement || d.webkitFullscreenElement) {
        const ex = d.exitFullscreen || d.webkitExitFullscreen || d.msExitFullscreen;
        if (ex) { const r = ex.call(d); if (r && r.catch) r.catch(() => {}); }
      }
    } catch {}
  }
  function pistaOrientacion() {
    const hint = $("tv-hint");
    if (!hint) return;
    hint.style.display = modoTv && window.innerHeight > window.innerWidth ? "block" : "none";
  }
  function mostrarSalirTv() {
    const b = $("tv-exit");
    if (!b || !modoTv) return;
    b.style.display = "inline-flex";
    clearTimeout(tvOcultarTimer);
    tvOcultarTimer = setTimeout(() => { b.style.display = "none"; }, 3500);
  }
  function entrarTv() {
    modoTv = true;
    document.body.classList.add("modo-tv");
    pantallaCompleta(true);
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); } catch {}
    pedirWakeLock();
    pistaOrientacion();
    mostrarSalirTv();
    if (player.paused) player.play().catch(() => {});
  }
  function salirTv() {
    if (!modoTv) return;
    modoTv = false;
    document.body.classList.remove("modo-tv");
    pantallaCompleta(false);
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch {}
    if (!isOwner) soltarWakeLock();
    $("tv-exit").style.display = "none";
    $("tv-hint").style.display = "none";
  }
  window.addEventListener("resize", pistaOrientacion);
  document.addEventListener("fullscreenchange", () => { if (modoTv && !document.fullscreenElement) salirTv(); });
  async function abrirHojaTele() {
    const pasosIOS = `<ol class="tv-pasos"><li>Abre el <strong>Centro de control</strong> (desliza desde la esquina superior derecha).</li><li>Toca <strong>Duplicar pantalla</strong> (dos rectángulos).</li><li>Elige tu <strong>Apple TV</strong> o tu <strong>Roku</strong> (los Roku recientes aceptan AirPlay).</li></ol>`;
    const pasosAndroid = `<ol class="tv-pasos"><li>Baja los <strong>ajustes rápidos</strong> desde arriba.</li><li>Toca <strong>Transmitir</strong>, <strong>Smart View</strong> o <strong>Duplicar pantalla</strong> (el nombre cambia según la marca).</li><li>Elige tu <strong>Roku</strong>, <strong>Fire TV</strong> o <strong>Android TV</strong>. En el Roku, activa antes <em>Ajustes → Sistema → Duplicación de pantalla</em>.</li></ol>`;
    const pasos = esIOS ? pasosIOS : esAndroid ? pasosAndroid : `<p class="sheet-sub">Desde una computadora: conecta la tele por HDMI o usa AirPlay (Mac) / Transmitir (Chrome, menú ⋮ → Transmitir → Pantalla).</p>`;
    const puedeDirecto = !!(player.remote && typeof player.remote.prompt === "function");
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = `
      <div class="sheet-inner">
        <h3>📺 Ver en la tele</h3>
        <p class="sheet-sub">La tele muestra lo que ves aquí. Primero limpia la pantalla (solo el video, sin que el teléfono se apague) y luego duplícala a la tele desde tu sistema:</p>
        ${pasos}
        ${puedeDirecto ? `<button id="tv-directo" class="btn-ghost">Mandar el video directo (AirPlay / Transmitir)</button>` : ""}
        <button id="tv-ir" class="btn-primary">Modo tele: solo el video</button>
        <button id="tv-cancel">Cancelar</button>
      </div>`;
    document.body.appendChild(sheet);
    const cerrar = () => sheet.remove();
    sheet.querySelector("#tv-cancel").onclick = cerrar;
    sheet.querySelector("#tv-ir").onclick = () => { cerrar(); entrarTv(); toast(esIOS ? "📺 Ahora abre el Centro de control → Duplicar pantalla." : esAndroid ? "📺 Ahora baja los ajustes rápidos → Transmitir / Smart View." : "📺 Listo: duplica esta pantalla a tu tele.", 7000); };
    const directo = sheet.querySelector("#tv-directo");
    if (directo) directo.onclick = async () => {
      try {
        await player.remote.prompt();
        toast("📺 Si tu tele lo acepta, el video ya va para allá.", 5000);
        cerrar();
      } catch {
        directo.style.display = "none";
        toast("Tu navegador no manda el video en vivo directo. Usa Modo tele + Duplicar pantalla.", 6000);
      }
    };
  }

  // ---- Modo llamada: dos salas, dos vías ----
  // Tú transmites desde tu sala y, en la misma pantalla, ves la sala de la
  // otra persona (entras a ella como cualquier espectador: paga su hora, y
  // ella entra a la tuya). La otra sala abre dentro de un recuadro con
  // ?modo=llamada (solo su video, sin chat ni dock) y tu cámara queda chica
  // en una esquina. Para verlo en la tele: AirPlay (iPhone → Apple TV) o
  // Duplicar pantalla (Android → Roku); lo que se refleja es esta pantalla.
  let llamadaCon = null;
  function slugDeLlamada(texto) {
    const t = (texto || "").trim();
    if (!t) return null;
    try {
      const u = new URL(t, location.href);
      if (u.origin === location.origin) return (u.pathname.split("/").filter(Boolean)[0] || "").toLowerCase() || null;
    } catch {}
    return t.replace(/^@/, "").replace(/^\/+/, "").split(/[/?#\s]/)[0].toLowerCase() || null;
  }
  function iniciarLlamada(otra) {
    if (!otra || otra === slug) return toast("Esa es tu propia sala. Pega el link de la otra persona.");
    llamadaCon = otra;
    localStorage.setItem(`vr_llamada_${slug}`, otra);
    $("call-frame").src = `/${encodeURIComponent(otra)}?modo=llamada`;
    $("call-wrap").style.display = "block";
    document.body.classList.add("en-llamada");
    $("btn-call").classList.add("active");
    if (chatVisible) { chatVisible = false; $("chat-panel").style.display = "none"; $("btn-chat").classList.remove("active"); }
    toast(`📞 Viendo la sala de ${otra}. Para la tele: AirPlay o Duplicar pantalla.`, 6000);
  }
  function terminarLlamada() {
    llamadaCon = null;
    $("call-frame").src = "about:blank";
    $("call-wrap").style.display = "none";
    document.body.classList.remove("en-llamada");
    $("btn-call").classList.remove("active");
  }
  function abrirHojaLlamada() {
    if (llamadaCon) return terminarLlamada();
    const recordada = localStorage.getItem(`vr_llamada_${slug}`) || "";
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = `
      <div class="sheet-inner">
        <h3>📞 Llamada: ver a otra persona mientras transmites</h3>
        <p class="sheet-sub">Pega el link de su sala. Entras a su sala como cualquier persona (pagas su hora con tu saldo) y ella entra a la tuya: dos salas, dos vías. Tu cámara queda chiquita en una esquina y la de ella en grande.</p>
        <input id="call-slug" placeholder="video.capitaltorreon.com/su-nombre" value="${recordada.replace(/"/g, "&quot;")}" autocapitalize="off" autocorrect="off" spellcheck="false">
        <p class="sheet-sub">Para verlo en la tele: en iPhone, AirPlay a tu Apple TV; en Android, «Duplicar pantalla» a tu Roku. Lo que se refleja es exactamente esta pantalla.</p>
        <button id="call-go" class="btn-primary">Ver su sala</button>
        <button id="call-cancel">Cancelar</button>
      </div>`;
    document.body.appendChild(sheet);
    const cerrar = () => sheet.remove();
    sheet.querySelector("#call-cancel").onclick = cerrar;
    const ir = () => { const otra = slugDeLlamada(sheet.querySelector("#call-slug").value); if (!otra) return toast("Pega el link o el nombre de su sala."); cerrar(); iniciarLlamada(otra); };
    sheet.querySelector("#call-go").onclick = ir;
    sheet.querySelector("#call-slug").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ir(); } });
    setTimeout(() => sheet.querySelector("#call-slug").focus(), 50);
  }

  function toggleMic() {
    micOn = !micOn;
    if (micTrack) micTrack.enabled = micOn;
    if (micTrackLo) micTrackLo.enabled = micOn;
    $("btn-mic").textContent = micOn ? "🎙️" : "🔇";
    $("btn-mic").classList.toggle("off", !micOn);
    if (!micOn && !shownMicToast) {
      shownMicToast = true;
      toast("Tu voz está en pausa. Nadie te escucha hasta que la actives. 🤫");
    }
  }

  function toggleCam() {
    camOn = !camOn;
    if (cameraTrack) cameraTrack.enabled = camOn;
    $("btn-cam").textContent = camOn ? "📷" : "🚫";
    $("btn-cam").classList.toggle("off", !camOn);
    if (!camOn && !shownCamToast) {
      shownCamToast = true;
      toast("Tu cámara está en pausa.");
    }
  }

  async function toggleScreenShare() {
    if (usingScreenShare) return stopScreenShare();
    let screenStream;
    try {
      screenStream = await withTimeout(
        navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }),
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
    try { screenTrack.contentHint = "detail"; } catch {} // texto nítido antes que movimiento
    if (motor) motor.setTrack(screenTrack);
    player.srcObject = micTrack ? new MediaStream([screenTrack, micTrack]) : screenStream;
    screenTrack.onended = () => stopScreenShare();
    // Si la pantalla trae audio (música, un video), entra por debajo de la
    // voz y baja solo cuando hablas: primero la voz, luego los instrumentos.
    const screenAudio = screenStream.getAudioTracks()[0] || null;
    if (motorAudio) motorAudio.setMusica(screenAudio);
    usingScreenShare = true;
    $("btn-screen").classList.add("active");
    $("btn-screen").title = "Dejar de compartir pantalla";
    // Se oculta el panel de chat mientras comparte pantalla — menos distracción,
    // y si su pantalla todavía muestra esta misma página, un "espejo infinito"
    // con menos elementos encima se ve/graba mejor. Vuelve solo al terminar.
    $("chat-panel").style.display = "none";
    toast(screenAudio
      ? "🖥️ Compartiendo pantalla con su audio, por debajo de tu voz. Si muestra esta misma página, cambia a la app que quieres enseñar."
      : "🖥️ Compartiendo pantalla. Si tu pantalla muestra esta misma página, cambia a la app que quieres mostrar — la transmisión sigue aunque salgas de aquí.", 9000);
  }

  async function stopScreenShare() {
    if (!usingScreenShare) return;
    usingScreenShare = false;
    if (motorAudio) motorAudio.setMusica(null);
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
    if (cameraTrack) cameraTrack.stop();
    cameraTrack = camTrack;
    try { camTrack.contentHint = "motion"; } catch {}
    if (filtro) filtro.setFuente(camTrack);
    await videoSender.replaceTrack(fuenteVideo());
    if (motor) motor.setTrack(camTrack);
    player.srcObject = micTrack ? new MediaStream([fuenteVideo(), micTrack]) : new MediaStream([fuenteVideo()]);
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
      $("btn-flip-cam").style.display = "flex";
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
    if (cameraTrack) cameraTrack.stop();
    cameraTrack = newTrack;
    try { newTrack.contentHint = "motion"; } catch {}
    if (filtro) filtro.setFuente(newTrack);
    await videoSender.replaceTrack(fuenteVideo());
    if (motor) motor.setTrack(newTrack);
    player.srcObject = micTrack ? new MediaStream([fuenteVideo(), micTrack]) : new MediaStream([fuenteVideo()]);
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

  const ORDEN = ["low", "medium", "high"];
  const RID = { high: "f", medium: "h", low: "q" };
  const TOPE = { f: 2, h: 1, q: 0 };

  // En "Auto" la meta es la máxima… que este aparato decodifique sin sufrir
  // (ver techoDecodificacion): un teléfono viejo recibe la media aunque su
  // internet dé para la alta, porque la alta la tiraría a cuadros.
  function targetTierForPref() {
    if (qualityPref === "off") return "off";
    if (qualityPref === "auto") return ORDEN[Math.min(2, TOPE[viewerCap] ?? 2)];
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
        player.muted = false; // el espectador oye; el "muted" del HTML era solo para arrancar
        player.play().catch(() => {});
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
    return { pc: newPc, sessionId: res.viewer_session_id, videoMid: res.video_mid || null, simulcast: !!res.simulcast };
  }

  // Hace oficial una conexión nueva del espectador: cierra la vieja, guarda
  // lo necesario para cambiar de capa sin reconectar y la pone a vigilar.
  function adoptarConexionEspectador(result) {
    const vieja = pc;
    pc = result.pc;
    viewerSessionId = result.sessionId;
    videoMid = result.videoMid;
    simulcastViewer = result.simulcast;
    if (vieja && vieja !== pc) { try { vieja.close(); } catch {} }
    lector = new MotorVideo.LectorEntrada(pc);
    viewerCapChecked = false;
    colchonMs = 0;
    vigilarConexionEspectador(pc);
  }

  // Cambia de calidad ya conectado. Con simulcast el SFU cambia la capa en la
  // misma conexión (sin parpadeo); si el creador publica a la vieja (tres
  // tracks) o el cambio falla, se vuelve a suscribir como antes.
  async function switchQuality(newTier, opts = {}) {
    if (switchingQuality || newTier === effectiveTier || reconectando) return;
    switchingQuality = true;
    clearTimeout(rampUpTimer);
    const labels = { high: "Alta", medium: "Media", low: "Baja", off: "Apagado (solo audio)" };
    if (simulcastViewer && videoMid && viewerSessionId && pc && newTier !== "off" && effectiveTier !== "off") {
      let r;
      try { r = await api(`/api/rooms/${slug}/layer`, { body: { session_id: viewerSessionId, mid: videoMid, rid: RID[newTier] } }); } catch { r = { error: "red" }; }
      if (!r.error) {
        switchingQuality = false;
        effectiveTier = newTier;
        updateAudioOnlyBadge();
        if (!opts.silent) toast(`Calidad: ${labels[newTier]}`);
        return;
      }
    }
    const result = await subscribeAt(newTier);
    switchingQuality = false;
    if (result.error) {
      if (!opts.silent) toast("No se pudo cambiar la calidad.");
      return;
    }
    adoptarConexionEspectador(result);
    effectiveTier = newTier;
    updateAudioOnlyBadge();
    if (!opts.silent) toast(`Calidad: ${labels[newTier]}`);
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
        switchQuality(targetTierForPref());
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

  // Lo que el espectador ve de la señal: "1080p30" junto al conteo de la sala.
  function pintarCalidadEspectador(l) {
    const el = $("viewer-quality");
    if (!el) return;
    el.textContent = l && l.alto ? `${l.alto}p${l.fps ? Math.round(l.fps) : ""}` : "";
  }

  // Solo corre en modo "Auto". Cada 2 s lee lo que de verdad llega (pérdida,
  // rtt, congelamientos, cuadros tirados, cuánto tarda este aparato en
  // decodificar) y decide: baja un escalón rápido (2 lecturas malas), sube
  // con calma (3 buenas) y nunca por encima del techo del aparato. Con red
  // temblorosa pone un colchón de unos cientos de ms (estabilidad a cambio de
  // ese retraso) y lo quita cuando se calma. Nunca apaga el video sola.
  function startViewerQualityMonitor() {
    stopViewerQualityMonitor();
    goodStreak = 0;
    badStreak = 0;
    viewerQualityTimer = setInterval(async () => {
      if (!pc || switchingQuality || reconectando || effectiveTier === "off" || !lector) return;
      let l;
      try { l = await lector.leer(); } catch { return; }
      pintarCalidadEspectador(l);
      if (!viewerCapChecked && l.codec && l.alto) {
        viewerCapChecked = true;
        const factor = effectiveTier === "high" ? 1 : effectiveTier === "medium" ? 2 : 4;
        const alto = l.alto * factor;
        MotorVideo.techoDecodificacion(l.codec, Math.round((alto * 16) / 9), alto, Math.max(30, Math.round(l.fps || 30)))
          .then((cap) => { viewerCap = cap; })
          .catch(() => {});
      }
      const presupuestoDecod = l.fps ? (1000 / l.fps) * 0.75 : 25;
      const bad = (l.rtt != null && l.rtt > 0.35) || (l.perdida != null && l.perdida > 0.06) || l.congelamientos > 0 || l.tirados > 8 || (l.msDecod != null && l.msDecod > presupuestoDecod);
      const good = (l.rtt == null || l.rtt < 0.15) && (l.perdida == null || l.perdida < 0.02) && l.congelamientos === 0 && l.tirados <= 2;
      if (bad) { badStreak++; goodStreak = 0; } else if (good) { goodStreak++; badStreak = 0; } else { badStreak = 0; goodStreak = 0; }

      if (bad && colchonMs < 500) { colchonMs = colchonMs ? 500 : 250; MotorVideo.ajustarColchon(pc, colchonMs); }
      else if (goodStreak >= 5 && colchonMs) { colchonMs = colchonMs === 500 ? 250 : 0; MotorVideo.ajustarColchon(pc, colchonMs); }

      const idx = ORDEN.indexOf(effectiveTier);
      const tope = Math.min(ORDEN.length - 1, TOPE[viewerCap] ?? 2);
      if ((badStreak >= 2 && idx > 0) || idx > tope) {
        badStreak = 0;
        switchQuality(ORDEN[Math.min(idx - 1, tope)], { silent: true });
        if (!shownAutoDownToast) {
          shownAutoDownToast = true;
          toast("📶 Bajamos la calidad para que no se trabe.");
        }
      } else if (goodStreak >= 3 && idx < tope) {
        goodStreak = 0;
        switchQuality(ORDEN[idx + 1], { silent: true });
        if (!shownAutoUpToast) {
          shownAutoUpToast = true;
          toast("✨ Tu conexión mejoró, subimos la calidad.");
        }
      }
    }, 2000);
  }

  // ---- Cortes: los del espectador y los del creador ----
  function mostrarBanner(texto, sub, volvio) {
    const b = $("reconnect-banner");
    if (!b) return;
    $("reconnect-text").textContent = texto;
    $("reconnect-sub").textContent = sub || "";
    b.classList.toggle("volvio", !!volvio);
    b.style.display = "flex";
    clearTimeout(bannerTimer);
  }
  function ocultarBanner(despedida) {
    const b = $("reconnect-banner");
    if (!b) return;
    player.classList.remove("esperando");
    if (despedida) {
      mostrarBanner(despedida, "", true);
      bannerTimer = setTimeout(() => { b.style.display = "none"; }, 2200);
    } else {
      b.style.display = "none";
    }
  }
  function fmtEspera(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  // Al creador se le fue el internet: se dice quién falta, cuánto llevamos
  // esperando y que el chat sigue vivo. Un parpadeo del socket (menos de 4 s)
  // no merece pantalla.
  // Quien ya está viendo lo ve como franja sobre el video; quien todavía no
  // entró lo lee en la portada, con "Entrar" apagado: no se le cobra una hora
  // de una sala cuyo creador no está.
  let esperaDentro = false;
  function mostrarEsperaCreador(graceMs) {
    esperaDentro = effectiveTier != null;
    if (esperaDentro) player.classList.add("esperando");
    const pinta = () => {
      if (!ownerOfflineSince) return;
      const llevamos = Date.now() - ownerOfflineSince;
      const quedan = graceMs ? Math.max(0, graceMs - llevamos) : 0;
      const titulo = `${roomTitle || "El creador"} perdió la conexión`;
      const detalle = `Esperando a que vuelva… ${fmtEspera(llevamos)}` + (esperaDentro ? " · El chat sigue vivo." : ".") + (graceMs ? ` Si no vuelve en ${fmtEspera(quedan)}, la transmisión se cierra sola.` : "");
      if (esperaDentro) mostrarBanner(titulo, detalle);
      else {
        sub.textContent = `${titulo}. ${detalle}`;
        $("btn-enter").disabled = true;
        $("btn-enter").textContent = "Esperando al creador…";
      }
    };
    pinta();
    clearInterval(esperaTimer);
    esperaTimer = setInterval(pinta, 1000);
  }
  function detenerEsperaCreador(silencioso) {
    clearInterval(esperaTimer);
    clearTimeout(ownerOfflineTimer);
    const estaba = !!ownerOfflineSince;
    ownerOfflineSince = 0;
    if (!estaba) return;
    if (esperaDentro) {
      if (silencioso) ocultarBanner(); else ocultarBanner(`${roomTitle || "El creador"} volvió`);
    } else {
      sub.textContent = originalSub;
      const be = $("btn-enter");
      be.disabled = false;
      if (be.textContent === "Esperando al creador…") be.textContent = enterLabel || "Entrar";
      if (!silencioso) toast(`✅ ${roomTitle || "El creador"} volvió.`, 4000);
    }
  }
  // La propia conexión del espectador se cayó: se vuelve a suscribir sola,
  // con pausas crecientes, hasta que vuelva la señal. El pase sigue vigente
  // y no se cobra de nuevo.
  function vigilarConexionEspectador(conn) {
    conn.onconnectionstatechange = () => {
      if (conn !== pc || sessionEnded) return;
      const st = conn.connectionState;
      if (st === "failed") reconectarEspectador("failed");
      else if (st === "disconnected") {
        clearTimeout(viewerReconnTimer);
        viewerReconnTimer = setTimeout(() => {
          if (conn === pc && conn.connectionState === "disconnected") reconectarEspectador("disconnected");
        }, 4000);
      } else if (st === "connected") clearTimeout(viewerReconnTimer);
    };
  }
  async function reconectarEspectador(motivo) {
    if (reconectando || sessionEnded || !me || effectiveTier == null) return;
    reconectando = true;
    if (motivo === "republished") mostrarBanner("Un momento…", `${roomTitle || "El creador"} volvió. Reconectando la señal…`);
    else mostrarBanner("Se cortó tu conexión", "Reconectando… Tu hora sigue igual y no se te cobra de nuevo.");
    let espera = 1500;
    while (!sessionEnded) {
      let result;
      try { result = await subscribeAt(effectiveTier === "off" ? "off" : (effectiveTier || "low")); } catch { result = { error: "red" }; }
      if (!result.error) {
        adoptarConexionEspectador(result);
        ocultarBanner("Listo, volviste");
        break;
      }
      await new Promise((r) => setTimeout(r, espera));
      espera = Math.min(15000, Math.round(espera * 1.6));
    }
    reconectando = false;
  }
  window.addEventListener("online", () => {
    if (!isOwner && pc && pc.connectionState !== "connected" && !sessionEnded) reconectarEspectador("online");
  });

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
    adoptarConexionEspectador(result);
    effectiveTier = initialTier;
    updateAudioOnlyBadge();
    hideOverlaySmoothly();
    pedirWakeLock(); // viendo, el teléfono tampoco se duerme
    if (modoTvAuto) setTimeout(entrarTv, 600);
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

  // --- Meta de propinas: la barra que todos ven llenarse ---
  // Hoja de dinero. Un toque en el monto y ya se fue: sin confirmación, sin
  // porcentajes, sin "destacar". Si la persona ya mandó algo, su último monto
  // va primero y en grande. «Otro» abre un campo para la cantidad que sea.
  // El mensaje es opcional y, si lo hay, queda arriba del chat un minuto
  // para todos, gratis. Lo que mandas llega completo.
  let ultimoMonto = Number(localStorage.getItem("vr_ultimo_monto") || 0) || 0;
  function openTipSheet(opts = {}) {
    const quien = roomTitle || "quien transmite";
    const amounts = [...tipOptions];
    if (ultimoMonto && !amounts.includes(ultimoMonto)) amounts.unshift(ultimoMonto);
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = `
      <div class="sheet-inner dinero">
        <h3>${opts.farewell ? `Gracias por acompañar a ${quien}` : `Mandar dinero a ${quien}`}</h3>
        <p class="sheet-sub">${opts.farewell ? "La transmisión terminó y nada quedó grabado. Si te gustó, puedes dejarle algo: le llega con tu nombre." : "Llega completo y al instante, con tu nombre. Los dos reciben su recibo."}</p>
        <div class="amounts">${amounts.map((a) => `<button data-amt="${a}" class="${a === ultimoMonto ? "ultimo" : ""}">${pesos(a)}${a === ultimoMonto ? "<small>otra vez</small>" : ""}</button>`).join("")}<button data-otro="1" class="otro">Otro</button></div>
        <div class="otro-fila" id="tip-otro" hidden><span>$</span><input id="tip-otro-monto" type="number" inputmode="numeric" min="10" max="5000" step="10" placeholder="cantidad"><button id="tip-otro-ok" class="btn-primary">Mandar</button></div>
        <input id="tip-msg" maxlength="140" placeholder="Mensaje (opcional) · se ve arriba del chat un minuto" value="${opts.mensaje ? String(opts.mensaje).replace(/"/g, "&quot;") : ""}">
        <button id="tip-cancel">${opts.farewell ? "Cerrar" : "Cancelar"}</button>
      </div>`;
    document.body.appendChild(sheet);
    let sent = false;
    const finish = () => { sheet.remove(); if (opts.farewell) setTimeout(() => location.reload(), 600); };
    async function mandar(amount_cents) {
      if (sent) return;
      if (!(amount_cents >= 1000 && amount_cents <= 500000)) return toast("Entre $10 y $5,000.");
      sent = true;
      sheet.querySelectorAll("button").forEach((b) => (b.disabled = true));
      const message = (sheet.querySelector("#tip-msg").value || "").trim();
      const res = await api(`/api/rooms/${slug}/tip`, { body: { amount_cents, message } });
      finish();
      if (res.error === "saldo_insuficiente") {
        const falta = Math.max(0, amount_cents - gastableDe(me, res));
        toast(`Te faltan ${pesos(falta)}. Te llevamos a recargar y te regresamos aquí; la sala sigue abierta.`, 5000);
        irARecargar(falta);
      } else if (res.error === "sala_cerrada") toast("La sala ya cerró hace rato. No se te cobró nada.");
      else if (res.error === "limite_propinas_alcanzado") toast("Ya mandaste el máximo de esta transmisión ($2,000). Gracias de verdad.");
      else if (res.error) toast("No se pudo mandar. No se te cobró nada; intenta de nuevo.");
      else {
        ultimoMonto = amount_cents; try { localStorage.setItem("vr_ultimo_monto", String(amount_cents)); } catch {}
        restarGastable(amount_cents);
        toast(`💵 Llegó completo. ${quien} ya lo vio con tu nombre.`, 4500);
        announceRelics(res.new_relics);
      }
    }
    if (opts.monto) { // vino del chat ("$50 gracias"): un solo toque para confirmar
      const b = sheet.querySelector(`[data-amt="${opts.monto}"]`);
      if (b) { b.classList.add("ultimo"); b.innerHTML = `${pesos(opts.monto)}<small>mandar</small>`; }
      else { sheet.querySelector("#tip-otro").hidden = false; sheet.querySelector("#tip-otro-monto").value = String(Math.round(opts.monto / 100)); }
    }
    sheet.querySelectorAll("[data-amt]").forEach((btn) => (btn.onclick = () => mandar(Number(btn.dataset.amt))));
    sheet.querySelector("[data-otro]").onclick = () => { const f = sheet.querySelector("#tip-otro"); f.hidden = false; sheet.querySelector("#tip-otro-monto").focus(); };
    sheet.querySelector("#tip-otro-ok").onclick = () => mandar(Math.round(Number(sheet.querySelector("#tip-otro-monto").value || 0)) * 100);
    sheet.querySelector("#tip-otro-monto").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sheet.querySelector("#tip-otro-ok").click(); } });
    sheet.querySelector("#tip-cancel").onclick = finish;
  }
  // Cuánto puede gastar la persona: lo recargado + lo ganado. El servidor
  // manda la cifra exacta cuando no alcanza; si no, la estimamos de /me.
  function gastableDe(yo, res) {
    if (res && typeof res.gastable_cents === "number") return res.gastable_cents;
    if (!yo) return 0;
    if (typeof yo.gastable_cents === "number") return yo.gastable_cents;
    return (yo.balance_cents || 0) + (yo.creator_balance_cents || 0);
  }
  function restarGastable(cents) {
    if (!me) return;
    if (typeof me.gastable_cents === "number") me.gastable_cents = Math.max(0, me.gastable_cents - cents);
    me.balance_cents = Math.max(0, (me.balance_cents || 0) - cents);
  }
  // Al terminar la transmisión no hay modal: una línea abajo, con un botón.
  // Quien quiera dejar algo lo toca; quien no, lee que nada quedó grabado y ya.
  function despedidaSuave() {
    const fin = document.createElement("div");
    fin.className = "despedida";
    fin.innerHTML = `<div class="despedida-txt"><b>La transmisión terminó.</b> Nada quedó grabado, como prometimos.</div><button class="btn-ghost" id="desp-gracias">💵 Dejarle algo a ${roomTitle || "quien transmitió"}</button><button class="btn-ghost" id="desp-cerrar">Cerrar</button>`;
    document.body.appendChild(fin);
    fin.querySelector("#desp-gracias").onclick = () => { fin.remove(); openTipSheet({ farewell: true }); };
    fin.querySelector("#desp-cerrar").onclick = () => location.reload();
    setTimeout(() => { if (document.body.contains(fin)) location.reload(); }, 90000);
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
    // Los datos de arranque (estado de la sala, quién soy, oferta) vienen
    // incrustados en el HTML (ver src/index.ts): cero viajes antes de que la
    // sala sea usable. Si por lo que sea no vinieran, se piden los tres a la
    // vez, no uno tras otro.
    let status, offer;
    const inicio = window.__VR_INICIO || null;
    if (inicio && inicio.status) {
      status = inicio.status; me = inicio.me || null; offer = inicio.offer || {};
    } else {
      [status, me, offer] = await Promise.all([
        fetch(`/api/rooms/${slug}/status`).then((r) => r.json()),
        fetch("/api/wallet/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/rooms/${slug}/offer`).then((r) => r.json()).catch(() => ({})),
      ]);
    }
    if (status.error) return;
    roomTitle = status.room.title || "";

    connectWs();

    const isLive = !!status.live_session;
    isOwner = !!(me && status.room.owner_id === me.id);

    // Oferta de la sala: precio por hora, membresía y meta de propinas. Lo
    // que el espectador necesita saber antes de pagar, dicho claro.
    try {
      tipOptions = offer.tip_options_cents || tipOptions;
      const price = Math.round((offer.price_cents || 2000) / 100);
      $("btn-enter").textContent = offer.member_until ? "Entrar · eres miembro" : offer.cortesia || !offer.price_cents ? "Entrar · gratis" : `Entrar · $${price} la hora`;
      enterLabel = $("btn-enter").textContent;
      // Volvió del login con la intención de entrar: si la entrada no cuesta
      // (cortesía o miembro), entra sola; si cuesta, se queda a un toque.
      if (me && isLive && !isOwner && sessionStorage.getItem("vr_intencion") === "entrar") {
        sessionStorage.removeItem("vr_intencion");
        if (offer.cortesia || !offer.price_cents || offer.member_until) setTimeout(() => $("btn-enter").click(), 300);
      }
      if (!isOwner && offer.membership_cents) {
        const mb = $("btn-membership");
        if (offer.member_until) {
          mb.textContent = `Miembro hasta el ${new Date(offer.member_until * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`;
          mb.disabled = true;
        } else {
          const etiquetaMb = `Membresía · ${pesos(offer.membership_cents)} al mes, entra siempre`;
          mb.textContent = etiquetaMb;
          // Dos toques en el mismo botón, sin diálogo del navegador: el primero
          // dice exactamente qué se cobra y qué se obtiene; el segundo confirma.
          let confirmando = null;
          guarded(mb, async () => {
            if (!me) return requireLogin();
            if (!confirmando) {
              mb.textContent = `Confirmar ${pesos(offer.membership_cents)} · 30 días, entras siempre`;
              mb.classList.add("confirmando");
              confirmando = setTimeout(() => { confirmando = null; mb.textContent = etiquetaMb; mb.classList.remove("confirmando"); }, 6000);
              return;
            }
            clearTimeout(confirmando); confirmando = null; mb.classList.remove("confirmando");
            const res = await api(`/api/rooms/${slug}/membership`, { body: {} });
            if (res.error === "saldo_insuficiente") {
              mb.textContent = etiquetaMb;
              const falta = Math.max(0, offer.membership_cents - gastableDe(me, res));
              toast(`Te faltan ${pesos(falta)} para la membresía. Te llevamos a recargar y te regresamos aquí.`, 5000);
              return irARecargar(falta);
            }
            if (res.error) { mb.textContent = etiquetaMb; return toast("No se pudo comprar la membresía. No se te cobró nada; intenta de nuevo."); }
            const hasta = res.expires_at ? new Date(res.expires_at * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "long" }) : null;
            toast(`🪪 Ya eres miembro${hasta ? ` hasta el ${hasta}` : ""}. Entra cuando quieras, sin pagar la hora. Tu recibo va en camino.`, 6000);
            mb.textContent = hasta ? `Miembro hasta el ${hasta}` : "Eres miembro"; mb.disabled = true;
            $("btn-enter").textContent = "Entrar · eres miembro";
          });
        }
        mb.style.display = isLive ? "inline-flex" : "inline-flex";
      }
    } catch {}

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
        reanudarPublicacion(status.live_session.id);
      }
    }

    guarded($("btn-enter"), async () => {
      if (!me) { try { sessionStorage.setItem("vr_intencion", "entrar"); } catch {} return requireLogin(); }
      beginConnecting("Verificando tu pase…");
      const res = await api(`/api/rooms/${slug}/pass`, { body: { device_id: "web" } });
      if (res.error === "saldo_insuficiente") {
        endConnecting();
        const falta = Math.max(0, (res.price_cents || 2000) - gastableDe(me, res));
        toast(`Te faltan ${pesos(falta)} para entrar. Te llevamos a recargar y te regresamos a esta sala; sigue abierta.`, 6000);
        return irARecargar(falta);
      }
      if (res.error === "sala_cerrada") { endConnecting(); return toast("La sala cerró hace un momento. No se te cobró nada."); }
      if (res.error) { endConnecting(); return toast("No se pudo entrar. No se te cobró nada; intenta de nuevo."); }
      await startSubscribing();
      if (res.charged && res.expires_at) toast(`🎟️ Adentro. Tu hora vale hasta las ${horaCDMX(res.expires_at)}; puedes salir y volver. Tu recibo va en camino a tu correo.`, 6500);
      else if (res.cortesia) toast("🎟️ Adentro, cortesía de la casa. Nada se graba.", 4000);
      else if (res.member) toast("🪪 Adentro como miembro, sin pagar la hora.", 4000);
      announceRelics(res.new_relics);
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
      stopOwnerMediaNow();
      const relic = Array.isArray(res.new_relics) && res.new_relics[0];
      toast(
        `Ganaste $${Math.round((res.earned_cents ?? 0) / 100)} · Pico ${res.peak_viewers ?? 0} personas${relic ? ` · ${relic.icon} ${relic.name}` : ""}`,
        2400
      );
    });
    guarded($("btn-tip"), async () => {
      if (!me) return requireLogin();
      openTipSheet();
    });
    guarded($("btn-mic"), async () => toggleMic());
    guarded($("btn-cam"), async () => toggleCam());
    guarded($("btn-screen"), async () => toggleScreenShare());
    guarded($("btn-call"), async () => abrirHojaLlamada());
    guarded($("btn-fx"), async () => abrirHojaEfectos());
    guarded($("btn-audio"), async () => abrirHojaAudio());
    guarded($("btn-tv"), async () => abrirHojaTele());
    $("tv-exit").addEventListener("click", salirTv);
    player.addEventListener("pointerdown", () => { if (modoTv) mostrarSalirTv(); }, { passive: true });
    // ?modo=tv (una tele con navegador, o un link pensado para ella): al
    // empezar a ver, la pantalla se limpia sola.
    if (new URLSearchParams(location.search).get("modo") === "tv") modoTvAuto = true;
    $("call-close").addEventListener("click", terminarLlamada);
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
    // ── Teclas (solo computadora) ──────────────────────────────────────────
    // Cada acción de la sala se registra una vez; el chat registra las suyas
    // en chat.js. «?» abre la lista completa. Nada de esto estorba al escribir:
    // dentro de una caja de texto las teclas son letras, y Esc suelta la caja.
    registrarTecla("?", "Ver todas las teclas", () => abrirTeclas(), { grupo: "Sala", etiqueta: "?" });
    registrarTecla("d", "Mandar dinero", () => { if (!isOwner) $("btn-tip").click(); }, { grupo: "Sala", publico: true });
    registrarTecla("h", "Mandar un corazón", () => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "heart" })); }, { grupo: "Sala" });
    registrarTecla("n", "Levantar la mano", () => { if (!isOwner) $("btn-hand").click(); }, { grupo: "Sala", publico: true });
    registrarTecla("o", "Ocultar / mostrar el chat", () => $("btn-chat").click(), { grupo: "Sala" });
    registrarTecla("m", "Silenciar / activar el micrófono", () => toggleMic(), { grupo: "Quien transmite", creador: true });
    registrarTecla("v", "Apagar / encender la cámara", () => toggleCam(), { grupo: "Quien transmite", creador: true });
    let teclasUsadas = Number(localStorage.getItem("vr_teclas") || 0);
    const pista = $("teclas-pista");
    if (pista && window.ChatVivo && ChatVivo.ESCRITORIO && teclasUsadas < 3) pista.hidden = false;
    document.addEventListener("keydown", (e) => {
      if (!window.ChatVivo || !ChatVivo.ESCRITORIO) return;
      const t = e.target;
      const enCampo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "Escape" && enCampo) { t.blur(); return; }
      if (enCampo || e.metaKey || e.ctrlKey || e.altKey) return;
      if ($("teclas-sheet").style.display === "flex" && e.key !== "?") { if (e.key === "Escape") $("teclas-sheet").style.display = "none"; return; }
      const reg = teclaPor.get(e.key);
      if (!reg || (reg.creador && !isOwner) || (reg.publico && isOwner)) return;
      e.preventDefault();
      reg.fn();
      if (!reg.oculta && teclasUsadas < 3) { teclasUsadas++; localStorage.setItem("vr_teclas", String(teclasUsadas)); if (teclasUsadas >= 3 && pista) pista.hidden = true; }
    });
    function abrirTeclas() {
      const sheet = $("teclas-sheet");
      if (sheet.style.display === "flex") { sheet.style.display = "none"; return; }
      const lista = $("teclas-lista");
      lista.textContent = "";
      const grupos = new Map();
      for (const r of TECLAS) {
        if (r.oculta || !r.descripcion || (r.creador && !isOwner) || (r.publico && isOwner)) continue;
        if (!grupos.has(r.grupo)) grupos.set(r.grupo, []);
        grupos.get(r.grupo).push(r);
      }
      for (const [g, regs] of grupos) {
        const h = document.createElement("h4"); h.textContent = g; lista.appendChild(h);
        for (const r of regs) { const fila = document.createElement("div"); fila.className = "tecla-fila"; const k = document.createElement("kbd"); k.textContent = r.etiqueta || r.tecla; const d = document.createElement("span"); d.textContent = r.descripcion; fila.appendChild(k); fila.appendChild(d); lista.appendChild(fila); }
      }
      const extra = document.createElement("div"); extra.className = "tecla-fila"; const k2 = document.createElement("kbd"); k2.textContent = "Enter"; const d2 = document.createElement("span"); d2.textContent = "Enviar lo escrito · en la búsqueda: siguiente resultado"; extra.appendChild(k2); extra.appendChild(d2); lista.appendChild(extra);
      sheet.style.display = "flex";
    }
    $("teclas-close").onclick = () => { $("teclas-sheet").style.display = "none"; };
    $("teclas-sheet").addEventListener("click", (ev) => { if (ev.target.id === "teclas-sheet") $("teclas-sheet").style.display = "none"; });
    if ($("chat-teclas")) $("chat-teclas").onclick = abrirTeclas;
    $("dim-slider").addEventListener("input", (e) => {
      const val = Number(e.target.value);
      player.style.filter = val >= 100 ? "" : `brightness(${val}%)`;
    });
  }

  init();

  // Solo en local: simular mensajes del socket y leer el estado del motor
  // desde la consola, para probar cortes sin cortar nada.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.__vr = {
      simular: (msg) => ws && ws.onmessage({ data: JSON.stringify(msg) }),
      estado: () => ({ isOwner, effectiveTier, viewerCap, colchonMs, simulcastViewer, reconectando, ownerOfflineSince, codecNombre, peldano: motor && motor.actual, escalera: motor && motor.peld, audio: motorAudio && { modo: motorAudio.modo, elegido: motorAudio.elegido, procesado: motorAudio.procesado, nivel: motorAudio.nivel() }, filtro: filtro && { nombre: filtro.nombre, activo: filtro.activo }, chat: chat && chat.estado() }),
      chat: () => chat,
      hojaDinero: (o) => openTipSheet(o || {}),
      despedida: () => despedidaSuave(),
    };
  }
})();

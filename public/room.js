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
    setTimeout(acomodarPronto, 50);
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
    limpiarPalabra();
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
    limpiarPalabra();
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
        mostrarMano(msg.user_id, msg.name);
      } else if (msg.type === "palabra") {
        if (msg.dar) {
          conPalabra.add(msg.user_id);
          if (me && msg.user_id === me.id && !isOwner) ofrecerPalabra();
        } else {
          conPalabra.delete(msg.user_id);
          if (me && msg.user_id === me.id) {
            if (hojaPalabra) { hojaPalabra.remove(); hojaPalabra = null; }
            dejarPalabra({ porElCreador: true });
          } else {
            quitarFichaInvitado(msg.user_id, { silencioso: !isOwner });
          }
        }
      } else if (msg.type === "invitado_tamano") {
        aplicarTamano(msg.user_id, msg.tamano || 1);
      } else if (msg.type === "invitado_acomodo") {
        if (msg.acomodo) aplicarAcomodo(msg.user_id, msg.acomodo);
      } else if (msg.type === "escena") {
        aplicarEscena(msg.modo);
      } else if (msg.type === "invitado_pantalla") {
        aplicarPantalla(msg.user_id, msg.pantalla);
      } else if (msg.type === "invitado") {
        recibirInvitado(msg.invitado);
      } else if (msg.type === "invitados") {
        (msg.lista || []).forEach(recibirInvitado);
        if (msg.escena && msg.escena !== escena) aplicarEscena(msg.escena);
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
        limpiarPalabra();
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
    const bp = $("ca-palabra");
    bp.style.display = userId && me && userId !== me.id ? "block" : "none";
    bp.textContent = conPalabra.has(userId) ? "🔕 Quitar la palabra" : "🎤 Dar la palabra";
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
      } else if (action === "palabra") {
        if (conPalabra.has(userId)) await quitarPalabraA(userId, name); else await darPalabraA(userId, name);
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

      const palBtn = document.createElement("button");
      palBtn.textContent = "🎤";
      palBtn.title = v.tiene_palabra ? "Quitar la palabra" : "Dar la palabra";
      palBtn.classList.toggle("active", !!v.tiene_palabra);
      palBtn.onclick = async () => {
        if (v.tiene_palabra) await quitarPalabraA(v.user_id, v.name); else await darPalabraA(v.user_id, v.name);
        v.tiene_palabra = conPalabra.has(v.user_id);
        palBtn.title = v.tiene_palabra ? "Quitar la palabra" : "Dar la palabra";
        palBtn.classList.toggle("active", v.tiene_palabra);
      };
      actions.appendChild(palBtn);

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
    sincronizarInvitados();
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
    setTimeout(acomodarPronto, 50);
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
    setTimeout(acomodarPronto, 50);
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

  // ---- La palabra: el creador deja hablar a quien ve ----
  // Quien recibe la palabra publica su voz (y su cámara, si quiere) en una
  // sesión propia del SFU; toda la sala, el creador incluido, la jala a una
  // conexión aparte de la de la transmisión, así que cambiar de calidad o
  // reconectar no la toca. Su ficha se enciende en verde mientras habla.
  const invitadosEl = $("invitados");
  const manosEl = $("manos");
  const invitados = new Map(); // uid → { info, pc, el, sfu, nivelTimer }
  const invitadosPendientes = new Map(); // llegaron antes de poder suscribirse
  const conPalabra = new Set(); // uids con la palabra (para los menús del creador)
  const MAX_PALABRA = 4;
  let miPalabra = null; // { pc, stream, el, mudo, medidor, nivelTimer, videoSender, tamano, pantalla, sincPrincipal } cuando yo hablo
  let hojaPalabra = null;
  const escenarioEl = $("escenario");
  const NOMBRE_TAMANO = { 1: "Ficha", 2: "Mediana", 3: "A dúo", 4: "Protagonista" };
  let escena = "fichas"; // "fichas" (cada quien su tamaño o su lugar) | "mesa" (todos parejos)
  const appEl = $("app");
  const escTxt = (t) => String(t ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const inicialDe = (n) => ((n || "").trim().charAt(0) || "?").toUpperCase();

  function puedoOirInvitados() { return !sessionEnded && (isOwner ? !!pc : !!viewerSessionId); }

  function fichaInvitado(info, { yo = false } = {}) {
    const el = document.createElement("div");
    el.className = `invitado${yo ? " yo" : ""}`;
    el.dataset.uid = info.user_id;
    const cara = info.avatar_url ? `<img src="${escTxt(info.avatar_url)}" alt="">` : `<div class="inicial">${escTxt(inicialDe(info.name))}</div>`;
    el.innerHTML = `${cara}<span class="invitado-nombre">${escTxt(yo ? "Tú" : info.name)}</span>`;
    if (isOwner && !yo) {
      // El creador manda: un toque sube el tamaño (ficha → mediana → a dúo →
      // protagonista → ficha); arrastrar la pone donde quiera; la esquina la
      // redimensiona. Toda la sala ve lo mismo.
      el.classList.add("tocable");
      el.title = "Toca: tamaño · Arrastra: mover · Esquina o pellizco: redimensionar";
      el.insertAdjacentHTML("beforeend", `<span class="invitado-lat"></span><span class="invitado-tam">⤢</span><span class="invitado-redim" title="Redimensionar"></span>`);
      armarArrastre(el, info.user_id);
    }
    if (yo || isOwner) {
      const x = document.createElement("button");
      x.className = "invitado-x";
      x.textContent = "✕";
      x.title = yo ? "Dejar la palabra" : `Quitarle la palabra a ${info.name}`;
      x.onclick = (e) => { e.stopPropagation(); if (yo) dejarPalabra(); else quitarPalabraA(info.user_id, info.name); };
      el.appendChild(x);
    }
    escenarioEl.appendChild(el);
    return el;
  }
  // La ficha pasa de foto a video: un solo elemento que trae audio y video.
  function ponerVideoEnFicha(el, stream, { muted = false, espejo = false } = {}) {
    el.querySelectorAll("audio, img, .inicial").forEach((n) => n.remove());
    let v = el.querySelector("video");
    if (!v) { v = document.createElement("video"); v.playsInline = true; v.autoplay = true; v.setAttribute("playsinline", ""); el.insertBefore(v, el.firstChild); }
    v.muted = muted;
    v.classList.toggle("espejo", espejo);
    v.srcObject = stream;
    v.play().catch(() => {});
    el.classList.add("con-video");
  }
  function ponerAudioEnFicha(el, stream) {
    if (el.querySelector("video")) return;
    let a = el.querySelector("audio");
    if (!a) { a = document.createElement("audio"); a.autoplay = true; el.appendChild(a); }
    a.srcObject = stream;
    a.play().catch(() => {});
  }
  // La ficha se enciende con la voz: sube al instante, se apaga medio segundo después.
  function vigilarVoz(el, nivel) {
    let apagar = 0;
    return setInterval(() => {
      const n = nivel();
      if (n > 0.015) { el.classList.add("hablando"); apagar = Date.now() + 500; }
      else if (apagar && Date.now() > apagar) { el.classList.remove("hablando"); apagar = 0; }
    }, 150);
  }
  function nivelDeReceptor(conn) {
    return () => {
      try {
        const rx = conn.getReceivers().find((r) => r.track && r.track.kind === "audio");
        if (!rx || !rx.getSynchronizationSources) return 0;
        const fuentes = rx.getSynchronizationSources();
        return fuentes.length ? (fuentes[0].audioLevel || 0) : 0;
      } catch { return 0; }
    };
  }
  function medidorLocal(track) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      ctx.resume().catch(() => {});
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(new MediaStream([track])).connect(an);
      const buf = new Uint8Array(an.fftSize);
      return {
        nivel: () => { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; } return Math.sqrt(s / buf.length); },
        cerrar: () => ctx.close().catch(() => {}),
      };
    } catch { return { nivel: () => 0, cerrar: () => {} }; }
  }

  async function suscribirInvitado(info) {
    if (me && info.user_id === me.id) return; // mi propia voz no se oye de vuelta
    const previo = invitados.get(info.user_id);
    if (previo && previo.sfu === info.sfuSessionId) return;
    if (previo) quitarFichaInvitado(info.user_id, { silencioso: true });
    const res = await api(`/api/rooms/${slug}/invitado/subscribe`, { body: { user_id: info.user_id } });
    if (res.error || !res.offer_sdp) return;
    const npc = new RTCPeerConnection();
    const el = fichaInvitado(info);
    const entrada = { info, pc: npc, el, sfu: info.sfuSessionId, nivelTimer: null };
    invitados.set(info.user_id, entrada);
    conPalabra.add(info.user_id);
    npc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      if (ev.track.kind === "video") ponerVideoEnFicha(el, stream);
      else ponerAudioEnFicha(el, stream);
    };
    try {
      await npc.setRemoteDescription({ type: "offer", sdp: res.offer_sdp });
      const answer = await npc.createAnswer();
      await npc.setLocalDescription(answer);
      await api(`/api/rooms/${slug}/renegotiate`, { body: { session_id: res.session_id, sdp: answer.sdp } });
    } catch {
      quitarFichaInvitado(info.user_id, { silencioso: true });
      return;
    }
    entrada.nivelTimer = vigilarVoz(el, nivelDeReceptor(npc));
    armarSincronia(entrada);
    el.classList.toggle("pantalla", !!info.pantalla);
    acomodar();
    if (isOwner) toast(`🎙️ ${info.name} está al aire. Toca su ficha para elegir tamaño; arrástrala para moverla.`, 5000);
  }
  // Quien conversa (el creador, o yo cuando tengo la palabra) oye al invitado
  // con el colchón mínimo; el público lo oye alineado al creador.
  function armarSincronia(entrada) {
    if (entrada.sinc) entrada.sinc.detener();
    const latEl = entrada.el.querySelector(".invitado-lat");
    const onEstado = (m) => { if (latEl) latEl.textContent = m.bocaOidoMs != null ? `≈ ${m.bocaOidoMs} ms` : ""; };
    if (!window.MotorSincronia) { entrada.sinc = null; return; }
    entrada.sinc = (isOwner || miPalabra) ? MotorSincronia.conversacion(entrada.pc, { onEstado }) : (pc ? MotorSincronia.alineado(pc, entrada.pc, { onEstado }) : null);
  }
  function rearmarSincronias() { for (const e of invitados.values()) armarSincronia(e); }
  // ---- El acomodo: un solo motor para todas las pantallas ----
  // Mide la zona libre (debajo de las barras de arriba, encima del dock) y
  // coloca ahí al creador y a cada ficha, en píxeles calculados aquí y no en
  // CSS fijo: así un teléfono chico, una tablet y una tele acomodan lo mismo,
  // con aire alrededor y sin que nada quede detrás de un botón. Lo que viaja
  // a la sala es solo la intención (tamaño 1–4, lugar libre en % de la zona,
  // mesa); cada pantalla la pinta como le cabe.
  //
  // Reglas que salen de recorrer las combinaciones (1 a 4 personas, teléfono
  // vertical u horizontal, tablet, computadora, tele; creador y público):
  //  · Las fichas chicas van en fila arriba a la derecha en vertical (cuatro
  //    caben en 320 px) y en columna a la derecha en horizontal.
  //  · Mediana: recuadro arriba a la derecha, nunca abajo (ahí viven el chat
  //    y el dock). Las chicas se corren debajo.
  //  · A dúo: mitad y mitad en horizontal; arriba y abajo en vertical. Las
  //    chicas viven del lado del creador.
  //  · Protagonista: llena la zona; el creador queda chico arriba a la
  //    izquierda (arriba a la derecha está su propia barra de estudio).
  //  · Mesa: cuadrícula de todos con el creador primero; la última fila se
  //    centra; en vertical las columnas bajan.
  //  · Libre: donde el creador la soltó, imantada a bordes y centro, con
  //    mínimo de 15 % de ancho y nunca fuera de la zona.
  //  · Cualquier cambio (gira el teléfono, entra o sale alguien, se abre el
  //    modo tele) se recalcula entero; las transiciones de 250 ms evitan
  //    saltos. Nada de esto toca el video: solo dónde se pinta.
  const AIRE = 8, GAP = 10;
  function zona() {
    const a = appEl.getBoundingClientRect();
    let top = AIRE, bottom = a.height - AIRE;
    for (const el of [studioBar, viewerPresenceEl, $("audio-only-badge")]) {
      if (!el || getComputedStyle(el).display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.height) top = Math.max(top, r.bottom - a.top + AIRE);
    }
    if (getComputedStyle(controls).display !== "none") {
      const r = controls.getBoundingClientRect();
      if (r.height) bottom = Math.min(bottom, r.top - a.top - AIRE);
    }
    return { x: AIRE, y: top, w: Math.max(120, a.width - 2 * AIRE), h: Math.max(120, bottom - top), vertical: a.width < a.height, ancho: a.width, alto: a.height };
  }
  const px = (el, r) => { el.style.left = `${Math.round(r.x)}px`; el.style.top = `${Math.round(r.y)}px`; el.style.width = `${Math.round(r.w)}px`; el.style.height = `${Math.round(r.h)}px`; };
  const dePct = (z, a) => ({ x: z.x + (a.x / 100) * z.w, y: z.y + (a.y / 100) * z.h, w: (a.w / 100) * z.w, h: (a.h / 100) * z.h });
  const aPct = (z, r) => ({ x: ((r.x - z.x) / z.w) * 100, y: ((r.y - z.y) / z.h) * 100, w: (r.w / z.w) * 100, h: (r.h / z.h) * 100 });
  const redondea = (a) => ({ x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10, w: Math.round(a.w * 10) / 10, h: Math.round(a.h * 10) / 10 });
  function acotar(a) {
    const w = Math.max(15, Math.min(100, a.w)), h = Math.max(15, Math.min(100, a.h));
    return { w, h, x: Math.max(0, Math.min(100 - w, a.x)), y: Math.max(0, Math.min(100 - h, a.y)) };
  }
  // Imán: a 12 px de un borde o del centro, se pega.
  function imantar(z, r) {
    const IMAN = 12, o = { ...r };
    for (const c of [z.x, z.x + (z.w - r.w) / 2, z.x + z.w - r.w]) if (Math.abs(o.x - c) < IMAN) o.x = c;
    for (const c of [z.y, z.y + (z.h - r.h) / 2, z.y + z.h - r.h]) if (Math.abs(o.y - c) < IMAN) o.y = c;
    return o;
  }
  function fichas() {
    const l = [...invitados.values()].map((e) => ({ el: e.el, info: e.info }));
    if (miPalabra && me) l.push({ el: miPalabra.el, info: { user_id: me.id, tamano: miPalabra.tamanoSala || 1, acomodo: miPalabra.acomodo || null } });
    return l;
  }
  function rejilla(z, n) {
    let cols = n <= 1 ? 1 : n === 2 ? (z.vertical ? 1 : 2) : n <= 4 ? 2 : 3;
    if (n === 3 && !z.vertical) cols = 3;
    if (n >= 5 && z.vertical) cols = 2;
    const filas = Math.ceil(n / cols), w = (z.w - GAP * (cols - 1)) / cols, h = (z.h - GAP * (filas - 1)) / filas;
    const celdas = [];
    for (let i = 0; i < n; i++) {
      const fila = Math.floor(i / cols), col = i % cols, enFila = Math.min(cols, n - fila * cols);
      const sangria = ((cols - enFila) * (w + GAP)) / 2;
      celdas.push({ x: z.x + sangria + col * (w + GAP), y: z.y + fila * (h + GAP), w, h });
    }
    return celdas;
  }
  let arrastrando = null; // uid de la ficha que el creador trae en la mano
  function acomodar() {
    const z = zona(), lista = fichas();
    let playerRect = null, destacada = null;
    if (escena === "mesa") {
      const celdas = rejilla(z, lista.length + 1);
      playerRect = celdas[0];
      lista.forEach((f, i) => { f.el.classList.remove("chica"); if (f.info.user_id !== arrastrando) px(f.el, celdas[i + 1]); });
    } else {
      destacada = lista.find((f) => f.info.tamano > 1 && !f.info.acomodo) || null;
      const libres = lista.filter((f) => f.info.acomodo && f !== destacada);
      const chicas = lista.filter((f) => f !== destacada && !f.info.acomodo);
      let zc = z; // dónde viven las chicas
      if (destacada) {
        const t = destacada.info.tamano;
        if (t === 2) {
          const w = Math.min(z.w * (z.vertical ? 0.5 : 0.36), 440), h = w * 0.75;
          px(destacada.el, { x: z.x + z.w - w, y: z.y, w, h });
          zc = { ...z, y: z.y + h + GAP, h: z.h - h - GAP };
        } else if (t === 3) {
          if (z.vertical) { const h = (z.h - GAP) / 2; playerRect = { x: z.x, y: z.y, w: z.w, h }; px(destacada.el, { x: z.x, y: z.y + h + GAP, w: z.w, h }); }
          else { const w = (z.w - GAP) / 2; playerRect = { x: z.x, y: z.y, w, h: z.h }; px(destacada.el, { x: z.x + w + GAP, y: z.y, w, h: z.h }); }
          zc = playerRect;
        } else {
          px(destacada.el, z);
          const w = Math.min(z.w * 0.34, 300), h = (w * 9) / 16;
          playerRect = { x: z.x, y: z.y, w, h };
          zc = { ...z, x: z.x + w + GAP, w: z.w - w - GAP };
        }
      }
      libres.forEach((f) => { if (f.info.user_id !== arrastrando) px(f.el, dePct(z, f.info.acomodo)); });
      const s = Math.max(56, Math.min(84, Math.round(z.w * 0.17)));
      chicas.forEach((f, i) => {
        if (f.info.user_id === arrastrando) return;
        if (z.vertical) px(f.el, { x: zc.x + zc.w - (i + 1) * s - i * GAP, y: zc.y, w: s, h: s });
        else px(f.el, { x: zc.x + zc.w - s, y: zc.y + i * (s + GAP), w: s, h: s });
      });
      lista.forEach((f) => f.el.classList.toggle("chica", chicas.includes(f)));
    }
    if (playerRect) { player.classList.add("escena"); px(player, playerRect); }
    else { player.classList.remove("escena"); player.style.left = player.style.top = player.style.width = player.style.height = ""; }
    const modo = escena === "mesa" ? "mesa" : destacada ? String(destacada.info.tamano) : lista.some((f) => f.info.acomodo) ? "libre" : "";
    if (modo) document.body.dataset.escena = modo; else delete document.body.dataset.escena;
    lista.forEach((f) => { const tam = f.el.querySelector(".invitado-tam"); if (tam) tam.textContent = f === destacada ? `${f.info.tamano}/4` : "⤢"; });
    $("btn-mesa").classList.toggle("active", escena === "mesa");
    pintarBotonMesa();
    if (miPalabra) { const r = miPalabra.el.getBoundingClientRect(); codificarSegunAncho((r.width / Math.max(1, z.ancho)) * 100); }
  }
  let acomodoPendiente = 0;
  function acomodarPronto() { cancelAnimationFrame(acomodoPendiente); acomodoPendiente = requestAnimationFrame(acomodar); }
  window.addEventListener("resize", acomodarPronto);
  window.addEventListener("orientationchange", () => setTimeout(acomodar, 350));
  function pintarBotonMesa() { $("btn-mesa").style.display = isOwner && invitados.size ? "inline-block" : "none"; }
  // Lo que manda el creador, aplicado en esta pantalla.
  function aplicarTamano(uid, t) {
    for (const e of invitados.values()) { if (e.info.user_id === uid) { e.info.tamano = t; e.info.acomodo = null; } else if (t > 1 && e.info.tamano > 1) e.info.tamano = 1; }
    if (miPalabra && me) { if (uid === me.id) { miPalabra.tamanoSala = t; miPalabra.acomodo = null; } else if (t > 1 && miPalabra.tamanoSala > 1) miPalabra.tamanoSala = 1; }
    acomodar();
    if (miPalabra && me && uid === me.id && t >= 3) toast(t === 4 ? "🎬 El creador te puso de protagonista: tu video llena la pantalla de toda la sala." : "🎬 Estás a dúo con el creador: la sala los ve a los dos.", 5000);
  }
  function aplicarAcomodo(uid, a) {
    const e = invitados.get(uid);
    if (e) { e.info.acomodo = a; e.info.tamano = 1; }
    if (miPalabra && me && uid === me.id) { miPalabra.acomodo = a; miPalabra.tamanoSala = 1; }
    if (uid !== arrastrando) acomodar();
  }
  function aplicarEscena(modo) { escena = modo === "mesa" ? "mesa" : "fichas"; acomodar(); }
  function aplicarPantalla(uid, on) {
    const e = invitados.get(uid);
    if (e) e.el.classList.toggle("pantalla", !!on);
  }
  // El invitado codifica según qué tan grande lo ve la sala: 360p chico,
  // 480p mediano, 720p grande. Solo cuando cambia de escalón.
  function codificarSegunAncho(wPct) {
    if (!miPalabra || !miPalabra.videoSender || !window.MotorSincronia) return;
    const t = wPct < 25 ? 1 : wPct < 45 ? 2 : 3;
    if (t === miPalabra.tamano) return;
    miPalabra.tamano = t;
    MotorSincronia.emisor(miPalabra.videoSender, t, { pantalla: !!miPalabra.pantalla });
  }
  async function cambiarTamano(uid, t) {
    const r = await api(`/api/rooms/${slug}/palabra/tamano`, { body: { user_id: uid, tamano: t } });
    if (r.error) return toast("No se pudo cambiar el tamaño.", 3000);
  }
  async function cambiarEscena(modo) {
    const r = await api(`/api/rooms/${slug}/palabra/escena`, { body: { modo } });
    if (r.error) return toast("No se pudo cambiar el acomodo.", 3000);
    toast(modo === "mesa" ? "⊞ Mesa: todos parejos, tú incluido. Así lo ve toda la sala." : "Fichas: cada quien a su tamaño o donde la pongas.", 3500);
  }

  // -- La hoja de una ficha (creador): tamaño, mesa, quitar --
  // Un toque abre esto; nada cambia por accidente. Los cuatro tamaños se ven
  // dibujados, el actual marcado.
  function abrirHojaFicha(uid) {
    const e = invitados.get(uid);
    if (!e) return;
    const actual = e.info.acomodo ? 0 : e.info.tamano;
    const pict = (t) => `<span class="pict pict-${t}"><i class="pc"></i><i class="pi"></i></span>`;
    const sheet = document.createElement("div");
    sheet.className = "sheet hoja-ficha";
    sheet.innerHTML = `
      <div class="sheet-inner">
        <h3>🎛 ${escTxt(e.info.name)}</h3>
        <p class="sheet-sub">Cómo la ve toda la sala. También puedes arrastrarla a donde quieras y estirarla desde la esquina.</p>
        <div class="tam-grid">${[1, 2, 3, 4].map((t) => `<button data-t="${t}" class="${t === actual && escena !== "mesa" ? "active" : ""}">${pict(t)}<b>${NOMBRE_TAMANO[t]}</b></button>`).join("")}</div>
        <button id="hf-mesa" class="hf-mesa ${escena === "mesa" ? "active" : ""}">⊞ ${escena === "mesa" ? "Salir de la mesa" : "Mesa: todos parejos"}</button>
        <button id="hf-quitar" class="hf-quitar">🔕 Quitar la palabra</button>
        <button id="hf-cerrar">Cerrar</button>
      </div>`;
    document.body.appendChild(sheet);
    const cerrar = () => sheet.remove();
    sheet.addEventListener("click", (ev) => { if (ev.target === sheet) cerrar(); });
    sheet.querySelector("#hf-cerrar").onclick = cerrar;
    sheet.querySelectorAll(".tam-grid button").forEach((b) => { b.onclick = () => { cerrar(); if (escena === "mesa") cambiarEscena("fichas"); cambiarTamano(uid, Number(b.dataset.t)); }; });
    sheet.querySelector("#hf-mesa").onclick = () => { cerrar(); cambiarEscena(escena === "mesa" ? "fichas" : "mesa"); };
    sheet.querySelector("#hf-quitar").onclick = () => { cerrar(); quitarPalabraA(uid, e.info.name); };
  }

  // -- Arrastrar, estirar y pellizcar (creador) --
  // Un dedo mueve; la esquina o dos dedos cambian el tamaño; un toque corto
  // abre la hoja. Mientras el creador trae la ficha en la mano, lo que llega
  // de vuelta del servidor no la mueve (sería un tirón).
  function armarArrastre(el, uid) {
    const dedos = new Map(); // pointerId → {x, y}
    let modo = null, base = null, movio = false, ultimo = null, ultimoEnvio = 0, pinzaBase = 0, z = null;
    const enviar = (a, fin) => {
      const ahora = Date.now();
      if (!fin && ahora - ultimoEnvio < 150) return;
      ultimoEnvio = ahora;
      api(`/api/rooms/${slug}/palabra/acomodo`, { body: { user_id: uid, acomodo: redondea(a) } }).catch(() => {});
    };
    const rectActual = () => { const r = el.getBoundingClientRect(), a = appEl.getBoundingClientRect(); return { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height }; };
    const dist = () => { const [p, q] = [...dedos.values()]; return Math.hypot(p.x - q.x, p.y - q.y); };
    const soltarTodo = () => {
      window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); window.removeEventListener("pointercancel", soltar);
      dedos.clear(); el.classList.remove("arrastrando"); arrastrando = null;
    };
    const mover = (ev) => {
      const d = dedos.get(ev.pointerId);
      if (!d || !base) return;
      d.x = ev.clientX; d.y = ev.clientY;
      if (dedos.size >= 2) {
        if (!pinzaBase) { pinzaBase = dist(); base = rectActual(); modo = "pinza"; }
        const k = dist() / (pinzaBase || 1), w = base.w * k, h = base.h * k;
        empezar(); ultimo = { x: base.x + (base.w - w) / 2, y: base.y + (base.h - h) / 2, w, h };
      } else {
        const dx = ev.clientX - d.x0, dy = ev.clientY - d.y0;
        if (!movio && Math.hypot(dx, dy) < 8) return;
        empezar();
        ultimo = modo === "redim" ? { ...base, w: base.w + dx, h: base.h + dy } : imantar(z, { ...base, x: base.x + dx, y: base.y + dy });
      }
      const a = acotar(aPct(z, ultimo));
      px(el, dePct(z, a));
      enviar(a, false);
    };
    const empezar = () => {
      if (movio) return;
      movio = true; arrastrando = uid;
      el.classList.remove("chica"); el.classList.add("arrastrando");
      escenarioEl.appendChild(el); // encima de las demás
    };
    const soltar = (ev) => {
      if (!dedos.has(ev.pointerId)) return;
      dedos.delete(ev.pointerId);
      try { el.releasePointerCapture(ev.pointerId); } catch {}
      if (dedos.size) { pinzaBase = 0; base = rectActual(); const d = [...dedos.values()][0]; d.x0 = d.x; d.y0 = d.y; return; }
      const fueToque = !movio;
      soltarTodo();
      if (fueToque) { abrirHojaFicha(uid); return; }
      const a = redondea(acotar(aPct(z, ultimo || rectActual())));
      const e = invitados.get(uid); if (e) { e.info.acomodo = a; e.info.tamano = 1; }
      acomodar();
      enviar(a, true);
    };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || escena === "mesa") return;
      if (ev.target.closest(".invitado-x, .invitado-pantalla")) return;
      if (!dedos.size) { z = zona(); base = rectActual(); movio = false; ultimo = null; pinzaBase = 0; modo = ev.target.classList.contains("invitado-redim") ? "redim" : "mover"; window.addEventListener("pointermove", mover); window.addEventListener("pointerup", soltar); window.addEventListener("pointercancel", soltar); }
      dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY });
      try { el.setPointerCapture(ev.pointerId); } catch {}
      ev.preventDefault();
    });
  }

  function quitarFichaInvitado(uid, { silencioso = false } = {}) {
    invitadosPendientes.delete(uid);
    const e = invitados.get(uid);
    if (!e) return;
    invitados.delete(uid);
    clearInterval(e.nivelTimer);
    if (e.sinc) e.sinc.detener();
    try { e.pc.close(); } catch {}
    e.el.remove();
    acomodar();
    if (!silencioso && isOwner) toast(`${e.info.name} dejó la palabra.`, 3000);
  }
  function recibirInvitado(info) {
    if (!info || !info.sfuSessionId) return;
    if (me && info.user_id === me.id) return;
    invitadosPendientes.set(info.user_id, info);
    sincronizarInvitados();
  }
  // Se llama en cuanto se puede oír la sala (creador publicando, espectador
  // suscrito) y cada vez que llega alguien nuevo al aire.
  function sincronizarInvitados() {
    if (!puedoOirInvitados()) return;
    for (const [uid, info] of [...invitadosPendientes]) {
      invitadosPendientes.delete(uid);
      suscribirInvitado(info).catch(() => {});
    }
  }
  function limpiarPalabra() {
    dejarPalabra({ porElCreador: true, silencioso: true });
    for (const uid of [...invitados.keys()]) quitarFichaInvitado(uid, { silencioso: true });
    invitadosPendientes.clear();
    conPalabra.clear();
    manosEl.innerHTML = "";
    escena = "fichas";
    acomodar();
  }

  // -- Del lado del creador --
  async function darPalabraA(userId, name) {
    const r = await api(`/api/rooms/${slug}/palabra`, { body: { user_id: userId, dar: true } });
    if (r.error === "cupo") return toast(`Ya hay ${MAX_PALABRA} personas con la palabra. Quítasela a alguien primero.`, 5000);
    if (r.error) return toast("No se pudo dar la palabra.", 4000);
    conPalabra.add(userId);
    quitarMano(userId);
    toast(`🎤 Le diste la palabra a ${name}. Cuando acepte, aparece su ficha y toda la sala la escucha.`, 5000);
  }
  async function quitarPalabraA(userId, name) {
    await api(`/api/rooms/${slug}/palabra`, { body: { user_id: userId, dar: false } });
    conPalabra.delete(userId);
    quitarFichaInvitado(userId, { silencioso: true });
    toast(`🔕 Le quitaste la palabra a ${name}.`, 3500);
  }
  // Manos levantadas: una tarjeta por persona con el botón de dar la palabra.
  function mostrarMano(userId, name) {
    if (!isOwner) return;
    if (!userId) return toast(`🎤 ${name} levantó la mano`, 5000);
    quitarMano(userId);
    const card = document.createElement("div");
    card.className = "mano";
    card.dataset.uid = userId;
    const lleno = conPalabra.size >= MAX_PALABRA;
    card.innerHTML = `<span>✋ ${escTxt(name)}</span><button class="mano-dar" ${lleno ? "disabled" : ""}>${lleno ? `Cupo lleno (${MAX_PALABRA})` : "🎤 Dar la palabra"}</button><button class="mano-x" aria-label="Cerrar">✕</button>`;
    card.querySelector(".mano-dar").onclick = () => { if (conPalabra.size >= MAX_PALABRA) return toast(`Ya hay ${MAX_PALABRA} personas con la palabra. Quítale la palabra a alguien primero.`, 4000); darPalabraA(userId, name); };
    card.querySelector(".mano-x").onclick = () => card.remove();
    manosEl.appendChild(card);
    while (manosEl.children.length > 3) manosEl.firstChild.remove();
    setTimeout(() => card.remove(), 45000);
    buzz(12);
  }
  function quitarMano(userId) {
    manosEl.querySelectorAll(".mano").forEach((c) => { if (c.dataset.uid === userId) c.remove(); });
  }

  // -- Del lado de quien recibe la palabra --
  function ofrecerPalabra() {
    if (miPalabra || hojaPalabra) return;
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = `
      <div class="sheet-inner">
        <h3>🎤 ${escTxt(roomTitle || "Quien transmite")} te dio la palabra</h3>
        <p class="sheet-sub">Toda la sala te va a escuchar. Elige cómo entrar; puedes dejar la palabra cuando quieras.</p>
        <div class="palabra-opciones">
          <button data-video="0"><b>🎙️ Solo mi voz</b><small>Tu ficha muestra tu foto y se enciende cuando hablas.</small></button>
          <button data-video="1"><b>🎙️📷 Mi voz y mi cámara</b><small>Tu ficha muestra tu video, chiquito, junto a la transmisión.</small></button>
        </div>
        <button id="palabra-no">Ahora no</button>
      </div>`;
    document.body.appendChild(sheet);
    hojaPalabra = sheet;
    const cerrar = () => { sheet.remove(); hojaPalabra = null; };
    sheet.querySelector("#palabra-no").onclick = () => { cerrar(); api(`/api/rooms/${slug}/invitado/salir`, { body: {} }).catch(() => {}); };
    sheet.querySelectorAll(".palabra-opciones button").forEach((b) => {
      b.addEventListener("pointerdown", () => buzz(8), { passive: true });
      b.onclick = () => { cerrar(); tomarPalabra(b.dataset.video === "1"); };
    });
  }
  async function tomarPalabra(conVideo) {
    let stream;
    toast(conVideo ? "Pidiendo tu micrófono y tu cámara…" : "Pidiendo tu micrófono…", 3000);
    try {
      const MS = window.MotorSincronia;
      stream = await withTimeout(navigator.mediaDevices.getUserMedia({
        audio: MS ? MS.capturaVoz() : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: conVideo ? (MS ? MS.capturaCamara() : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" }) : false,
      }), 15000);
    } catch {
      return toast("No pudimos usar tu micrófono. Revisa los permisos del navegador y pide la palabra otra vez.", 6000);
    }
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0] || null;
    if (!audioTrack) { stream.getTracks().forEach((t) => t.stop()); return toast("No encontramos un micrófono.", 5000); }
    try { audioTrack.contentHint = "speech"; if (videoTrack) videoTrack.contentHint = "motion"; } catch {}
    const npc = new RTCPeerConnection();
    const aTx = npc.addTransceiver(audioTrack, { direction: "sendonly" });
    const vTx = videoTrack ? npc.addTransceiver(videoTrack, { direction: "sendonly", sendEncodings: [{ maxBitrate: 500000, maxFramerate: 30, scaleResolutionDownBy: 2 }] }) : null;
    // H.264 primero: lo decodifican por hardware todos los aparatos, y
    // decodificar rápido también es menos latencia.
    if (vTx && window.MotorVideo && MotorVideo.elegirCodecs) {
      try { const codec = await MotorVideo.elegirCodecs({ w: 1280, h: 720, fps: 30 }); if (codec.lista) vTx.setCodecPreferences(codec.lista); } catch {}
    }
    const offer = await npc.createOffer();
    await npc.setLocalDescription(offer);
    const tracks = [{ mid: aTx.mid != null ? String(aTx.mid) : "0", trackName: "audio" }];
    if (vTx) tracks.push({ mid: vTx.mid != null ? String(vTx.mid) : "1", trackName: "video" });
    let res;
    try { res = await api(`/api/rooms/${slug}/invitado/publish`, { body: { sdp: offer.sdp, tracks, video: !!videoTrack } }); } catch { res = { error: "red" }; }
    if (res.error) {
      stream.getTracks().forEach((t) => t.stop());
      try { npc.close(); } catch {}
      return toast(res.error === "sin_palabra" ? "El creador ya retomó la palabra." : "No se pudo entrar al aire. Intenta de nuevo.", 5000);
    }
    try { await npc.setRemoteDescription({ type: "answer", sdp: window.MotorSincronia ? MotorSincronia.sdpVozConversacion(res.answer_sdp) : res.answer_sdp }); } catch {
      stream.getTracks().forEach((t) => t.stop());
      try { npc.close(); } catch {}
      return toast("No se pudo entrar al aire. Intenta de nuevo.", 5000);
    }
    const el = fichaInvitado({ user_id: me.id, name: me.name, avatar_url: me.avatar_url || null }, { yo: true });
    if (videoTrack) ponerVideoEnFicha(el, new MediaStream([videoTrack]), { muted: true, espejo: true });
    const medidor = medidorLocal(audioTrack);
    miPalabra = { pc: npc, stream, el, mudo: false, medidor, nivelTimer: null, videoSender: vTx ? vTx.sender : null, tamano: 1, pantalla: null, camara: videoTrack, sincPrincipal: null };
    miPalabra.nivelTimer = vigilarVoz(el, () => (miPalabra && miPalabra.mudo ? 0 : medidor.nivel()));
    if (miPalabra.videoSender && window.MotorSincronia) MotorSincronia.emisor(miPalabra.videoSender, 1);
    // Con cámara y en escritorio, también puede compartir su pantalla.
    if (videoTrack && navigator.mediaDevices.getDisplayMedia) {
      const b = document.createElement("button");
      b.className = "invitado-pantalla"; b.textContent = "🖥️"; b.title = "Compartir mi pantalla";
      b.onclick = (ev) => { ev.stopPropagation(); alternarPantallaInvitado(b); };
      el.appendChild(b);
    }
    // Conversación: al creador lo oigo con el colchón mínimo, y a los demás
    // invitados también. El colchón automático del espectador se apaga.
    if (window.MotorSincronia && pc) { colchonMs = 0; miPalabra.sincPrincipal = MotorSincronia.conversacion(pc); }
    rearmarSincronias();
    acomodar();
    conPalabra.add(me.id);
    pintarBotonMano();
    toast(videoTrack ? "🎙️📷 Estás al aire: toda la sala te escucha y te ve en tu ficha." : "🎙️ Estás al aire: toda la sala te escucha.", 6000);
  }
  function dejarPalabra({ porElCreador = false, silencioso = false } = {}) {
    if (!miPalabra) return;
    const m = miPalabra;
    miPalabra = null;
    clearInterval(m.nivelTimer);
    m.medidor.cerrar();
    if (m.sincPrincipal) m.sincPrincipal.detener();
    if (m.pantalla) { try { m.pantalla.getTracks().forEach((t) => t.stop()); } catch {} }
    m.stream.getTracks().forEach((t) => t.stop());
    try { m.pc.close(); } catch {}
    m.el.remove();
    acomodar();
    if (me) conPalabra.delete(me.id);
    rearmarSincronias();
    pintarBotonMano();
    if (!porElCreador) api(`/api/rooms/${slug}/invitado/salir`, { body: {} }).catch(() => {});
    if (!silencioso) toast(porElCreador ? "El creador retomó la palabra. Gracias por participar." : "Dejaste la palabra.", 4000);
  }
  async function alternarPantallaInvitado(boton) {
    if (!miPalabra || !miPalabra.videoSender) return;
    if (miPalabra.pantalla) {
      miPalabra.pantalla.getTracks().forEach((t) => t.stop());
      miPalabra.pantalla = null;
      await miPalabra.videoSender.replaceTrack(miPalabra.camara).catch(() => {});
      ponerVideoEnFicha(miPalabra.el, new MediaStream([miPalabra.camara]), { muted: true, espejo: true });
      if (window.MotorSincronia) MotorSincronia.emisor(miPalabra.videoSender, miPalabra.tamano);
      miPalabra.el.classList.remove("pantalla");
      api(`/api/rooms/${slug}/invitado/pantalla`, { body: { pantalla: false } }).catch(() => {});
      boton.classList.remove("active"); boton.title = "Compartir mi pantalla";
      return toast("Volviste a tu cámara.", 2500);
    }
    let pantalla;
    try { pantalla = await withTimeout(navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }), 15000); } catch { return; }
    const track = pantalla.getVideoTracks()[0];
    try { track.contentHint = "detail"; } catch {}
    miPalabra.pantalla = pantalla;
    await miPalabra.videoSender.replaceTrack(track).catch(() => {});
    ponerVideoEnFicha(miPalabra.el, new MediaStream([track]), { muted: true, espejo: false });
    if (window.MotorSincronia) MotorSincronia.emisor(miPalabra.videoSender, miPalabra.tamano, { pantalla: true });
    miPalabra.el.classList.add("pantalla");
    api(`/api/rooms/${slug}/invitado/pantalla`, { body: { pantalla: true } }).catch(() => {});
    track.onended = () => { if (miPalabra && miPalabra.pantalla) alternarPantallaInvitado(boton); };
    boton.classList.add("active"); boton.title = "Volver a mi cámara";
    toast("🖥️ Compartiendo tu pantalla con la sala. El creador puede ponerla en grande.", 5000);
  }
  function alternarMiVoz() {
    if (!miPalabra) return;
    miPalabra.mudo = !miPalabra.mudo;
    miPalabra.stream.getAudioTracks().forEach((t) => { t.enabled = !miPalabra.mudo; });
    miPalabra.el.classList.toggle("mudo", miPalabra.mudo);
    pintarBotonMano();
    toast(miPalabra.mudo ? "🔇 Tu voz está en pausa." : "🎙️ Tu voz vuelve a salir.", 2500);
  }
  // Con la palabra, el botón de la mano se vuelve el de tu voz.
  function pintarBotonMano() {
    const b = $("btn-hand");
    if (miPalabra) {
      b.textContent = miPalabra.mudo ? "🔇" : "🎙️";
      b.dataset.label = miPalabra.mudo ? "En pausa" : "Al aire";
      b.classList.add("active");
      b.classList.toggle("off", miPalabra.mudo);
    } else {
      b.textContent = handRaised ? "✋" : "🎤";
      b.dataset.label = "Mano";
      b.classList.toggle("active", handRaised);
      b.classList.remove("off");
    }
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
    if (miPalabra && miPalabra.sincPrincipal) miPalabra.sincPrincipal.rePc(pc);
    for (const e of invitados.values()) if (e.sinc && e.sinc.rePrincipal) e.sinc.rePrincipal(pc);
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

      // Con la palabra, el colchón lo gobierna el motor de sincronía (mínimo).
      if (miPalabra) { /* nada */ }
      else if (bad && colchonMs < 500) { colchonMs = colchonMs ? 500 : 250; MotorVideo.ajustarColchon(pc, colchonMs); }
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
    sincronizarInvitados();
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
    guarded($("btn-mesa"), async () => cambiarEscena(escena === "mesa" ? "fichas" : "mesa"));
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
      if (miPalabra) return alternarMiVoz();
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

  // Llegó aquí por un link que no existía tal cual y lo adivinamos (ver
  // lib/rescate.ts): se le dice de frente a qué sala lo trajimos, para que
  // nadie le pague a quien no buscaba.
  try {
    const m = document.cookie.match(/(?:^|; )vr_trajo=([^;]*)/);
    if (m) {
      document.cookie = "vr_trajo=; path=/; max-age=0";
      const decia = decodeURIComponent(decodeURIComponent(m[1])).slice(0, 60);
      if (decia) setTimeout(() => toast(`El link decía «${decia}». Te trajimos a la sala de ${roomTitle || "esta persona"}; si no es la que buscabas, revisa el link.`, 9000), 900);
    }
  } catch {}

  // Solo en local: simular mensajes del socket y leer el estado del motor
  // desde la consola, para probar cortes sin cortar nada.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.__vr = {
      simular: (msg) => ws && ws.onmessage({ data: JSON.stringify(msg) }),
      estado: () => ({ isOwner, effectiveTier, viewerCap, colchonMs, simulcastViewer, reconectando, ownerOfflineSince, codecNombre, peldano: motor && motor.actual, escalera: motor && motor.peld, audio: motorAudio && { modo: motorAudio.modo, elegido: motorAudio.elegido, procesado: motorAudio.procesado, nivel: motorAudio.nivel() }, filtro: filtro && { nombre: filtro.nombre, activo: filtro.activo }, chat: chat && chat.estado() }),
      chat: () => chat,
      hojaDinero: (o) => openTipSheet(o || {}),
      despedida: () => despedidaSuave(),
      // La palabra, para probar acomodos sin un invitado real: una ficha
      // falsa (sin conexión) que entra a la misma lista que las de verdad.
      palabra: {
        simular: (info) => {
          const i = { user_id: info.user_id || `falso_${invitados.size + 1}`, name: info.name || "Invitado", avatar_url: info.avatar_url || null, sfuSessionId: "falso", tamano: info.tamano || 1, acomodo: info.acomodo || null };
          const el = fichaInvitado(i);
          invitados.set(i.user_id, { info: i, pc: { getReceivers: () => [], close() {} }, el, sfu: "falso", nivelTimer: null, sinc: null });
          acomodar();
          return i.user_id;
        },
        escena: (m) => aplicarEscena(m),
        quitar: (uid) => quitarFichaInvitado(uid, { silencioso: true }),
        estado: () => ({ escena, zona: zona(), invitados: [...invitados.values()].map((e) => ({ uid: e.info.user_id, tamano: e.info.tamano, acomodo: e.info.acomodo })), miPalabra: !!miPalabra }),
        acomodar: () => acomodar(),
        tamano: (uid, t) => aplicarTamano(uid, t),
        acomodo: (uid, a) => aplicarAcomodo(uid, a),
        hoja: (uid) => abrirHojaFicha(uid),
      },
    };
  }
})();

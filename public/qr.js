// RLR · Generador de QR del creador. Un toque dice dónde lo va a poner
// (Instagram, WhatsApp, puerta del local…) y el link ya lleva la etiqueta
// (UTM) para que Estadísticas cuente de dónde vino cada persona. Los UTM a
// mano quedan escondidos bajo «UTM ▸»: están para quien sabe, no estorban a
// quien no. La foto de Google al centro es opcional. Baja en SVG, PNG o JPG,
// o copia el link y el código SVG. Usa qr-lib.js (Kazuhiko Arase, MIT).
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const DOMINIO = "video.capitaltorreon.com";
  const LLAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const PRESETS = [
    { id: "", n: "Sin etiqueta", utm: {} },
    { id: "instagram", n: "Instagram", utm: { utm_source: "instagram", utm_medium: "social", utm_content: "bio" } },
    { id: "facebook", n: "Facebook", utm: { utm_source: "facebook", utm_medium: "social", utm_content: "post" } },
    { id: "whatsapp", n: "WhatsApp", utm: { utm_source: "whatsapp", utm_medium: "mensaje" } },
    { id: "tiktok", n: "TikTok", utm: { utm_source: "tiktok", utm_medium: "social", utm_content: "bio" } },
    { id: "youtube", n: "YouTube", utm: { utm_source: "youtube", utm_medium: "video", utm_content: "descripcion" } },
    { id: "correo", n: "Correo", utm: { utm_source: "correo", utm_medium: "email", utm_content: "firma" } },
    { id: "puerta", n: "Puerta o local", utm: { utm_source: "qr", utm_medium: "impreso", utm_content: "puerta" } },
    { id: "tarjeta", n: "Tarjeta", utm: { utm_source: "qr", utm_medium: "impreso", utm_content: "tarjeta" } },
    { id: "cartel", n: "Cartel o volante", utm: { utm_source: "qr", utm_medium: "impreso", utm_content: "cartel" } },
  ];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const limpiarUtm = (v) => String(v || "").trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

  function montar(cont, o) {
    const slug = o.slug, nombre = o.nombre || "", toast = o.toast || (() => {});
    const E = { preset: "", utm: {}, foto: !!o.avatar, fotoData: null, abiertoUtm: false };
    cont.innerHTML = `
      <div class="qr-tool">
        <div class="qr-dos">
          <div class="qr-vista">
            <div class="qr-svg" id="qr-svg" aria-label="Tu código QR"></div>
            <div class="qr-url" id="qr-url"></div>
          </div>
          <div class="qr-ajustes">
            <div class="label">¿Dónde lo vas a poner?</div>
            <p class="muted" style="margin:4px 0 10px">Un toque y el link ya sabe de dónde vino cada persona. Lo ves en Estadísticas.</p>
            <div class="qr-chips" id="qr-presets">${PRESETS.map((p) => `<button type="button" data-p="${p.id}" class="${p.id === "" ? "on" : ""}">${esc(p.n)}</button>`).join("")}</div>
            <label class="qr-check"><input type="checkbox" id="qr-foto" ${E.foto ? "checked" : ""} ${o.avatar ? "" : "disabled"}> Mi foto en el centro${o.avatar ? "" : ' <span class="muted">(tu cuenta no tiene foto)</span>'}</label>
            <button type="button" class="qr-utm-toggle" id="qr-utm-toggle"><b>UTM</b> <span class="muted">opcional, si sabes usarlos</span> <i>▸</i></button>
            <div class="qr-utm" id="qr-utm" hidden>
              ${LLAVES.map((k) => `<label><span>${k.replace("utm_", "")}</span><input type="text" data-k="${k}" placeholder="${{ utm_source: "de dónde: instagram, qr…", utm_medium: "cómo: social, impreso…", utm_campaign: "campaña: verano-2026", utm_content: "lugar: puerta, bio…", utm_term: "término (raro)" }[k]}" autocomplete="off" spellcheck="false" maxlength="80"></label>`).join("")}
              <p class="muted" style="margin:6px 0 0">Solo letras, números y guiones; se guardan en minúsculas. Estadísticas los muestra como fuente · medio · campaña · contenido.</p>
            </div>
          </div>
        </div>
        <div class="qr-acciones">
          <button type="button" class="btn-primary" data-bajar="png">Bajar PNG</button>
          <button type="button" class="btn-ghost" data-bajar="svg">Bajar SVG</button>
          <button type="button" class="btn-ghost" data-bajar="jpg">Bajar JPG</button>
          <button type="button" class="btn-ghost" id="qr-copiar-link">Copiar link</button>
          <button type="button" class="btn-ghost" id="qr-copiar-img" hidden>Copiar imagen</button>
          <button type="button" class="btn-ghost" id="qr-copiar-svg">Copiar código SVG</button>
        </div>
        <p class="muted" style="margin:10px 0 0;font-size:12px">Pruébalo con la cámara de tu teléfono antes de imprimir. Mínimo 3 cm de lado; el SVG se agranda sin perder nada.</p>
      </div>`;
    const $ = (id) => cont.querySelector("#" + id);
    const inputs = [...cont.querySelectorAll("[data-k]")];

    function url() {
      const q = new URLSearchParams();
      for (const k of LLAVES) { const v = limpiarUtm(E.utm[k]); if (v) q.set(k, v); }
      const s = q.toString();
      return `https://${DOMINIO}/${slug}${s ? "?" + s : ""}`;
    }
    function nombreArchivo(ext) {
      const etiqueta = limpiarUtm(E.utm.utm_content || E.utm.utm_source || "");
      return `qr-${DOMINIO.replace(/\./g, "-")}-${slug}${etiqueta ? "-" + etiqueta : ""}.${ext}`;
    }
    // ── el QR como SVG (nivel H: aguanta la foto al centro y una impresión mediocre)
    function svg({ tam = 1024, paraPantalla = false } = {}) {
      const q = qrcode(0, "H"); q.addData(url()); q.make();
      const n = q.getModuleCount(), zona = 4, total = n + zona * 2;
      let d = "";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + zona} ${r + zona}h1v1h-1z`;
      let foto = "";
      if (E.foto && E.fotoData) {
        const cx = total / 2, rFondo = n * 0.2, rFoto = n * 0.165;
        foto = `<circle cx="${cx}" cy="${cx}" r="${rFondo}" fill="#fff"/><clipPath id="qrf"><circle cx="${cx}" cy="${cx}" r="${rFoto}"/></clipPath><image href="${E.fotoData}" x="${cx - rFoto}" y="${cx - rFoto}" width="${rFoto * 2}" height="${rFoto * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#qrf)"/><circle cx="${cx}" cy="${cx}" r="${rFoto}" fill="none" stroke="#56EF9F" stroke-width="${n * 0.012}"/>`;
      }
      const attrs = paraPantalla ? `width="100%" height="100%"` : `width="${tam}" height="${tam}"`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ${attrs} shape-rendering="crispEdges"><title>${esc(nombre ? nombre + " · " : "")}${DOMINIO}/${esc(slug)}</title><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#0d1117"/>${foto}</svg>`;
    }
    function pintar() {
      $("qr-svg").innerHTML = svg({ paraPantalla: true });
      $("qr-url").textContent = url().replace(/^https:\/\//, "");
    }
    // ── PNG / JPG: el SVG se dibuja en un canvas de 1024 px sobre blanco
    function aPng(tipo) {
      return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement("canvas"); cv.width = cv.height = 1024;
          const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1024, 1024); ctx.drawImage(img, 0, 0, 1024, 1024);
          cv.toBlob((b) => (b ? res(b) : rej(new Error("sin imagen"))), tipo === "jpg" ? "image/jpeg" : "image/png", 0.95);
        };
        img.onerror = () => rej(new Error("svg"));
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg({ tam: 1024 }));
      });
    }
    function bajar(blob, nombreArch) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombreArch; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    cont.querySelectorAll("[data-bajar]").forEach((b) => (b.onclick = async () => {
      const f = b.dataset.bajar; b.disabled = true;
      try {
        if (f === "svg") bajar(new Blob([svg({ tam: 1024 })], { type: "image/svg+xml" }), nombreArchivo("svg"));
        else bajar(await aPng(f), nombreArchivo(f));
        toast(`QR listo (${f.toUpperCase()}). Pruébalo con la cámara antes de imprimir.`);
      } catch { toast("No se pudo generar la imagen. Prueba bajar el SVG."); }
      b.disabled = false;
    }));
    $("qr-copiar-link").onclick = () => { navigator.clipboard.writeText(url()).then(() => toast("Link copiado" + (Object.keys(E.utm).some((k) => E.utm[k]) ? " con su etiqueta." : ".")), () => toast("No se pudo copiar.")); };
    $("qr-copiar-svg").onclick = () => { navigator.clipboard.writeText(svg({ tam: 512 })).then(() => toast("Código SVG copiado: pégalo en tu diseño o en tu página."), () => toast("No se pudo copiar.")); };
    if (navigator.clipboard && window.ClipboardItem) {
      const ci = $("qr-copiar-img"); ci.hidden = false;
      ci.onclick = async () => { try { const b = await aPng("png"); await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); toast("Imagen copiada: pégala en WhatsApp, Instagram o un documento."); } catch { toast("Tu navegador no deja copiar imágenes; baja el PNG."); } };
    }
    // ── presets y UTM
    function aplicarPreset(id) {
      const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
      E.preset = p.id; E.utm = { ...p.utm };
      cont.querySelectorAll("#qr-presets button").forEach((b) => b.classList.toggle("on", b.dataset.p === p.id));
      inputs.forEach((i) => (i.value = E.utm[i.dataset.k] || ""));
      pintar();
    }
    cont.querySelectorAll("#qr-presets button").forEach((b) => (b.onclick = () => aplicarPreset(b.dataset.p)));
    inputs.forEach((i) => (i.oninput = () => {
      E.utm[i.dataset.k] = i.value;
      // Si lo que hay ya no coincide con un preset, ninguno queda encendido
      const coincide = PRESETS.find((p) => LLAVES.every((k) => limpiarUtm(p.utm[k] || "") === limpiarUtm(E.utm[k] || "")));
      E.preset = coincide ? coincide.id : null;
      cont.querySelectorAll("#qr-presets button").forEach((b) => b.classList.toggle("on", !!coincide && b.dataset.p === coincide.id));
      pintar();
    }));
    $("qr-utm-toggle").onclick = () => { E.abiertoUtm = !E.abiertoUtm; $("qr-utm").hidden = !E.abiertoUtm; $("qr-utm-toggle").classList.toggle("abierto", E.abiertoUtm); if (E.abiertoUtm) inputs[0].focus(); };
    $("qr-foto").onchange = (e) => { E.foto = e.target.checked; pintar(); };
    // La foto se trae por nuestro propio dominio (ver /api/wallet/avatar) y
    // se incrusta como data URL: el SVG queda completo en un solo archivo.
    if (o.avatar) {
      fetch("/api/wallet/avatar").then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })).then((data) => { E.fotoData = data; pintar(); }).catch(() => { E.foto = false; $("qr-foto").checked = false; $("qr-foto").disabled = true; pintar(); });
    }
    pintar();
    return { url, svg, aplicarPreset };
  }
  window.QRSala = { montar, PRESETS };
})();

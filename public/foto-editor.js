// RLR · Editor de foto: adjuntar una foto y acomodarla. Es una pieza suelta
// (no depende del resto de la página) para usarla donde haga falta una foto
// bien encuadrada: arrastrar para moverla, rueda, pellizco o deslizador para
// acercarla o alejarla, y centrarla de un toque. Todo pasa en el navegador.
//
//   const r = await FotoEditor.abrir({ titulo, src, x, y, z, conQuitar, extra })
//   r = null (canceló) · { accion: "guardar", src, x, y, z, recorte }
//       · { accion: "quitar" } · { accion: "<la de extra>" }
//
//   src      la foto original (achicada a 1400 px como máximo), como data URL
//   x, y     cuánto se movió del centro, en fracción del marco (0 = centrada)
//   z        acercamiento: 1 = la foto llena el marco justo; hasta 5
//   recorte  el resultado: un JPEG cuadrado de 720 px, listo para usarse
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const LADO = 720, MAX_ORIGINAL = 1400, Z_MAX = 5;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cargar = (src) => new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(new Error("no_es_imagen")); im.src = src; });

  /** Lee un archivo de imagen y lo deja como data URL, achicado para que quepa y pinte rápido. */
  async function leerArchivo(archivo) {
    const url = URL.createObjectURL(archivo);
    try { return achicar(await cargar(url)); } finally { URL.revokeObjectURL(url); }
  }
  function achicar(im) {
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, f = Math.min(1, MAX_ORIGINAL / Math.max(w, h)), cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * f)); cv.height = Math.max(1, Math.round(h * f));
    const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(im, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.88);
  }
  // La cuenta del encuadre: la foto siempre cubre el marco; x, y se topan para que no asome el fondo.
  function medidas(im, lado, t) {
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, z = Math.min(Z_MAX, Math.max(1, t.z || 1)), esc0 = (lado / Math.min(w, h)) * z, aw = w * esc0, ah = h * esc0;
    const mx = (aw - lado) / 2 / lado, my = (ah - lado) / 2 / lado, x = Math.min(mx, Math.max(-mx, t.x || 0)), y = Math.min(my, Math.max(-my, t.y || 0));
    return { z, x, y, aw, ah, dx: (lado - aw) / 2 + x * lado, dy: (lado - ah) / 2 + y * lado };
  }
  function pintar(cv, im, t) { const lado = cv.width, m = medidas(im, lado, t), c = cv.getContext("2d"); c.imageSmoothingQuality = "high"; c.fillStyle = "#111"; c.fillRect(0, 0, lado, lado); c.drawImage(im, m.dx, m.dy, m.aw, m.ah); return m; }
  /** El recorte final de una foto con su encuadre: JPEG cuadrado. */
  async function recortar(src, t, lado) {
    const im = typeof src === "string" ? await cargar(src) : src, cv = document.createElement("canvas"); cv.width = cv.height = lado || LADO;
    pintar(cv, im, t || {}); return cv.toDataURL("image/jpeg", 0.9);
  }

  let abierto = null;
  function abrir(o) {
    o = o || {}; if (abierto) abierto(null);
    return new Promise((resolver) => {
      const t = { x: o.x || 0, y: o.y || 0, z: o.z || 1 }; let src = o.src || "", im = null;
      const caja = document.createElement("div"); caja.className = "fe-fondo"; caja.setAttribute("role", "dialog"); caja.setAttribute("aria-modal", "true"); caja.setAttribute("aria-label", o.titulo || "Acomoda tu foto");
      caja.innerHTML = `<div class="fe-hoja">
        <header><b>${esc(o.titulo || "Acomoda tu foto")}</b><button type="button" class="fe-x" data-a="cerrar" aria-label="Cerrar">✕</button></header>
        <div class="fe-marco" data-marco tabindex="0" aria-label="Arrastra para mover la foto. Usa la rueda, el pellizco o las teclas más y menos para acercarla."><canvas width="640" height="640"></canvas><i class="fe-circulo"></i><p class="fe-vacio" data-vacio>Toca «Elegir foto» para adjuntar una.</p></div>
        <p class="fe-pista" data-pista>Arrastra la foto para moverla.</p>
        <div class="fe-zoom"><button type="button" data-a="menos" aria-label="Alejar">−</button><input type="range" min="100" max="${Z_MAX * 100}" value="100" step="1" data-z aria-label="Acercamiento"><button type="button" data-a="mas" aria-label="Acercar">＋</button><button type="button" class="fe-centrar" data-a="centrar">Centrar</button></div>
        <div class="fe-fila"><button type="button" class="fe-btn" data-a="elegir">${src ? "Cambiar foto" : "Elegir foto"}</button>${(o.extra || []).map((e) => `<button type="button" class="fe-btn" data-extra="${esc(e.accion)}">${esc(e.texto)}</button>`).join("")}${o.conQuitar ? `<button type="button" class="fe-btn fe-quitar" data-a="quitar">Quitar</button>` : ""}</div>
        <div class="fe-fila fe-final"><button type="button" class="fe-btn" data-a="cerrar">Cancelar</button><button type="button" class="fe-btn fe-lleno" data-a="guardar">Usar esta foto</button></div>
        <input type="file" accept="image/*" hidden data-archivo>
      </div>`;
      document.body.appendChild(caja); document.body.classList.add("fe-abierto");
      const cv = caja.querySelector("canvas"), marco = caja.querySelector("[data-marco]"), rango = caja.querySelector("[data-z]"), archivo = caja.querySelector("[data-archivo]"), guardarB = caja.querySelector('[data-a="guardar"]');
      const dibujar = () => {
        caja.querySelector("[data-vacio]").hidden = !!im; guardarB.disabled = !im; rango.disabled = !im;
        if (!im) { const c = cv.getContext("2d"); c.fillStyle = "#161a22"; c.fillRect(0, 0, cv.width, cv.height); return; }
        const m = pintar(cv, im, t); t.x = m.x; t.y = m.y; t.z = m.z; rango.value = String(Math.round(t.z * 100));
        caja.querySelector("[data-pista]").textContent = t.z > 1.01 ? `Acercada ${Math.round(t.z * 100)} %. Arrastra para moverla.` : "Arrastra la foto para moverla. Acércala con el deslizador.";
      };
      const poner = async (nuevo, reinicia) => { try { im = await cargar(nuevo); src = nuevo; if (reinicia) { t.x = 0; t.y = 0; t.z = 1; } caja.querySelector('[data-a="elegir"]').textContent = "Cambiar foto"; dibujar(); } catch (e) { im = null; dibujar(); } };
      const zoom = (z, cx, cy) => {
        // Acercar hacia donde está el dedo o el cursor, no hacia el centro.
        const antes = t.z, nuevo = Math.min(Z_MAX, Math.max(1, z)); if (!im || nuevo === antes) return;
        const px = (cx == null ? 0.5 : cx) - 0.5, py = (cy == null ? 0.5 : cy) - 0.5, k = nuevo / antes;
        t.x = px - (px - t.x) * k; t.y = py - (py - t.y) * k; t.z = nuevo; dibujar();
      };
      const cerrar = (r) => { abierto = null; document.removeEventListener("keydown", tecla, true); caja.remove(); document.body.classList.remove("fe-abierto"); resolver(r); };
      abierto = cerrar;

      // Mover con un dedo o el ratón; acercar con dos dedos.
      const dedos = new Map(); let pellizco = 0;
      const enMarco = (e) => { const r = marco.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, lado: r.width }; };
      marco.addEventListener("pointerdown", (e) => { if (!im) return; try { marco.setPointerCapture(e.pointerId); } catch (err) { /* hay navegadores que no dejan capturar ese puntero: se mueve igual */ } dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); pellizco = 0; marco.classList.add("moviendo"); });
      marco.addEventListener("pointermove", (e) => {
        if (!dedos.has(e.pointerId) || !im) return; const antes = dedos.get(e.pointerId), lado = marco.getBoundingClientRect().width;
        if (dedos.size === 1) { t.x += (e.clientX - antes.x) / lado; t.y += (e.clientY - antes.y) / lado; dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); dibujar(); return; }
        dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...dedos.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = marco.getBoundingClientRect();
        if (pellizco) zoom(t.z * (d / pellizco), ((a.x + b.x) / 2 - r.left) / r.width, ((a.y + b.y) / 2 - r.top) / r.height);
        pellizco = d;
      });
      const soltar = (e) => { dedos.delete(e.pointerId); pellizco = 0; if (!dedos.size) marco.classList.remove("moviendo"); };
      marco.addEventListener("pointerup", soltar); marco.addEventListener("pointercancel", soltar);
      marco.addEventListener("wheel", (e) => { if (!im) return; e.preventDefault(); const p = enMarco(e); zoom(t.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), p.x, p.y); }, { passive: false });
      marco.addEventListener("dblclick", (e) => { const p = enMarco(e); zoom(t.z < 1.9 ? 2 : 1, p.x, p.y); });
      rango.oninput = () => zoom(rango.value / 100);
      function tecla(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return cerrar(null); }
        if (!im || e.target.tagName === "INPUT") return;
        const paso = e.shiftKey ? 0.1 : 0.02, mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
        if (mov) { e.preventDefault(); t.x += mov[0]; t.y += mov[1]; dibujar(); } else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoom(t.z * 1.1); } else if (e.key === "-") { e.preventDefault(); zoom(t.z / 1.1); } else if (e.key === "0") { e.preventDefault(); t.x = 0; t.y = 0; t.z = 1; dibujar(); } else if (e.key === "Enter") { e.preventDefault(); guardarB.click(); }
      }
      document.addEventListener("keydown", tecla, true);
      archivo.onchange = async () => { const f = archivo.files && archivo.files[0]; archivo.value = ""; if (!f) return; try { await poner(await leerArchivo(f), true); } catch (e) { caja.querySelector("[data-pista]").textContent = "No se pudo leer esa imagen. Prueba con otra (JPG o PNG)."; } };
      caja.addEventListener("click", async (e) => {
        if (e.target === caja) return cerrar(null);
        const b = e.target.closest("[data-a],[data-extra]"); if (!b) return;
        if (b.dataset.extra) return cerrar({ accion: b.dataset.extra });
        const a = b.dataset.a;
        if (a === "cerrar") cerrar(null);
        else if (a === "elegir") archivo.click();
        else if (a === "menos") zoom(t.z / 1.15);
        else if (a === "mas") zoom(t.z * 1.15);
        else if (a === "centrar") { t.x = 0; t.y = 0; t.z = 1; dibujar(); }
        else if (a === "quitar") cerrar({ accion: "quitar" });
        else if (a === "guardar" && im) cerrar({ accion: "guardar", src, x: t.x, y: t.y, z: t.z, recorte: await recortar(im, t, LADO) });
      });
      if (src) poner(src, false); else { dibujar(); if (o.pedirArchivo !== false) setTimeout(() => archivo.click(), 60); }
      setTimeout(() => marco.focus(), 30);
    });
  }

  window.FotoEditor = { abrir, recortar, leerArchivo, achicar, LADO };
})();

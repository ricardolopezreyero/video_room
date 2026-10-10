// RLR · Candidatos: la pantalla de fichas de las personas que el equipo salió
// a buscar para un puesto. Es un módulo suelto, hecho para llevarse a otra
// app: no depende de nada de Video Room y no lleva a nadie adentro. Las
// fichas llegan del servidor, solo a quien tiene acceso.
//
//   Candidatos.montar(elemento, { api: "/api/gtm/candidatos", vacante: "ceo" })
//
// Lo que pide al servidor (tres rutas):
//   GET  {api}?vacante=ceo        → { meta, fichas: [...] }
//   POST {api}/{id}               → { estado } o { notas }   (se guarda solo)
//   POST {api}                    → { vacante, nombre, liga, titular, ciudad, porque }
// Y un par de archivos: este y candidatos.css. Todo lo demás es dato.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const liga = (u) => (/^https?:\/\/[^\s<>"']+$/i.test(String(u || "")) ? String(u) : "");
  const NIVEL = { 3: ["Se ve", "ve"], 2: ["Probable", "prob"], 1: ["Por comprobar", "comp"], 0: ["Bandera", "band"] };
  const ESTADOS = [["por_contactar", "Por contactar"], ["contactado", "Contactado"], ["en_platica", "En plática"], ["prueba", "Mandó la prueba"], ["descartado", "Descartado"]];
  const nombreEstado = (e) => (ESTADOS.find((x) => x[0] === e) || ESTADOS[0])[1];
  const NOTA_MAX = 200; // lo que cabe en la nota de una invitación de LinkedIn
  const fecha = (s) => { try { return new Date(s * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "short" }); } catch (e) { return ""; } };
  const quien = (correo) => String(correo || "").split("@")[0];

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (e) {}
    try { const t = document.createElement("textarea"); t.value = texto; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; } catch (e) { return false; }
  }

  function montar(el, o) {
    o = Object.assign({ api: "/api/gtm/candidatos", vacante: "ceo", claro: false, alCargar: null, toast: null }, o || {});
    const llave = "cand_" + o.vacante;
    let D = { meta: {}, fichas: [] }, filtro = "todos";
    let abiertas = new Set(); try { abiertas = new Set(JSON.parse(localStorage.getItem(llave) || "[]")); } catch (e) {}
    const recordar = () => { try { localStorage.setItem(llave, JSON.stringify([...abiertas])); } catch (e) {} };
    el.classList.add("cand"); if (o.claro) el.classList.add("cand-claro");
    el.innerHTML = `<p class="cand-vacio">Cargando las fichas…</p>`;

    let tAviso;
    function aviso(msg) {
      if (o.toast) return o.toast(msg);
      let a = el.querySelector(".cand-aviso"); if (!a) { a = document.createElement("div"); a.className = "cand-aviso"; a.setAttribute("role", "status"); el.appendChild(a); }
      a.textContent = msg; a.classList.add("ver"); clearTimeout(tAviso); tAviso = setTimeout(() => a.classList.remove("ver"), 2200);
    }
    const rasgosDe = () => (Array.isArray(D.meta.rasgos) && D.meta.rasgos.length ? D.meta.rasgos : [...new Set(D.fichas.flatMap((f) => Object.keys(f.rasgos || {})))]);
    const top = () => D.fichas.filter((f) => f.grupo === "top");
    const banca = () => D.fichas.filter((f) => f.grupo !== "top");
    const pasa = (f) => filtro === "todos" || f.estado === filtro;
    const cuenta = (f) => { const c = { 3: 0, 2: 0, 1: 0, 0: 0 }; Object.values(f.rasgos || {}).forEach((r) => (c[r[0]] = (c[r[0]] || 0) + 1)); return c; };

    /* ── la ficha como texto, para pegarla donde sea ──────────────────── */
    function textoFicha(f) {
      const L = [];
      L.push((f.grupo === "top" ? `#${f.orden} · ` : "") + f.nombre);
      if (f.titular) L.push(f.titular);
      const sub = [f.ciudad, f.grado ? `contacto de ${f.grado} grado` : "", f.comun && f.comun.n ? `${f.comun.n} en común` : ""].filter(Boolean).join(" · "); if (sub) L.push(sub);
      if (liga(f.liga)) L.push(f.liga);
      L.push(`Estado: ${nombreEstado(f.estado)}`);
      if (f.resumen) L.push("", f.resumen);
      if (f.proposito) L.push("", "POR QUÉ ESTO ES PARA ESTA PERSONA", f.proposito);
      if (f.trayectoria && f.trayectoria.length) { L.push("", "TRAYECTORIA"); f.trayectoria.forEach((t) => L.push(`· ${t.puesto}${t.empresa ? " · " + t.empresa : ""}${t.fechas ? " (" + t.fechas + ")" : ""}${t.nota ? ". " + t.nota : ""}`)); }
      if (f.rasgos) { L.push("", "RASGOS"); Object.entries(f.rasgos).forEach(([k, r]) => L.push(`· ${k}: ${NIVEL[r[0]][0].toLowerCase()}. ${r[1] || ""}`)); }
      if (f.banderas && f.banderas.length) { L.push("", "QUÉ REVISAR"); f.banderas.forEach((b) => L.push("· " + b)); }
      if (f.prensa && f.prensa.length) { L.push("", "PUBLICADO SOBRE SU TRABAJO"); f.prensa.forEach((x) => L.push(`· ${x.titulo || ""}${x.medio ? " (" + x.medio + ")" : ""}: ${x.liga}`)); }
      if (f.por_que_no) L.push("", "Por qué no quedó entre las fichas principales: " + f.por_que_no);
      if (f.preguntas && f.preguntas.length) { L.push("", "PREGUNTAS PARA LA PRIMERA LLAMADA"); f.preguntas.forEach((p, i) => L.push(`${i + 1}. ${p}`)); }
      if (f.nota_conexion) L.push("", "NOTA DE INVITACIÓN", f.nota_conexion);
      if (f.mensaje) L.push("", "MENSAJE", f.mensaje);
      if (f.notas) L.push("", "NOTAS DEL EQUIPO", f.notas);
      return L.join("\n");
    }

    /* ── piezas ───────────────────────────────────────────────────────── */
    function cabecera() {
      const m = D.meta || {};
      const cifras = (m.cifras || []).map((c) => `<div class="cand-cifra"><b>${esc(c[0])}</b><span>${esc(c[1])}</span></div>`).join("");
      const metodo = (m.metodo || []).map((x) => `<li>${esc(x)}</li>`).join("");
      return `<header class="cand-cab">
        <p class="cand-ceja">${esc(m.ceja || "Búsqueda de personas")}</p>
        <h2>${esc(m.titulo || "Candidatos")}</h2>
        ${m.bajada ? `<p class="cand-bajada">${esc(m.bajada)}</p>` : ""}
        ${cifras ? `<div class="cand-cifras">${cifras}</div>` : ""}
        ${metodo ? `<details class="cand-metodo"><summary>Cómo se hizo la búsqueda${m.fecha ? ` · ${esc(m.fecha)}` : ""}</summary><ul>${metodo}</ul></details>` : ""}
      </header>`;
    }

    function matriz() {
      const R = rasgosDe(), T = top(); if (!T.length || !R.length) return "";
      const fila = (f) => {
        const c = cuenta(f);
        return `<tr data-ir="${esc(f.id)}"><th scope="row"><i>${String(f.orden).padStart(2, "0")}</i><span><b>${esc(f.nombre)}</b><small>${esc([f.ciudad, f.comun && f.comun.n ? f.comun.n + " en común" : ""].filter(Boolean).join(" · "))}</small></span></th>${R.map((k) => { const r = (f.rasgos || {})[k] || [1, ""]; return `<td><span class="cand-punto ${NIVEL[r[0]][1]}" title="${esc(k + ": " + NIVEL[r[0]][0].toLowerCase() + ". " + (r[1] || ""))}"></span></td>`; }).join("")}<td class="cand-suma">${c[3]}<small>de ${R.length}</small></td></tr>`;
      };
      return `<section class="cand-sec">
        <h3>Los ${T.length} de un vistazo</h3>
        <div class="cand-tabla-caja"><table class="cand-matriz"><thead><tr><th></th>${R.map((k) => `<th><span>${esc(k)}</span></th>`).join("")}<th><span>Se ven</span></th></tr></thead><tbody>${T.map(fila).join("")}</tbody></table></div>
        <p class="cand-leyenda">${[3, 2, 1, 0].map((n) => `<span><i class="cand-punto ${NIVEL[n][1]}"></i>${NIVEL[n][0]}</span>`).join("")}</p>
        <p class="cand-chica">«Se ve» quiere decir que su perfil lo demuestra con hechos. «Por comprobar» no es malo: es lo que hay que preguntar. La honradez nunca se ve en un perfil; se comprueba con quien le confió dinero.</p>
      </section>`;
    }

    function filtros() {
      const n = (e) => D.fichas.filter((f) => e === "todos" || f.estado === e).length;
      return `<div class="cand-filtros" role="tablist">${[["todos", "Todos"]].concat(ESTADOS).map((e) => `<button type="button" data-filtro="${e[0]}" class="${filtro === e[0] ? "on" : ""}">${e[1]} <i>${n(e[0])}</i></button>`).join("")}</div>`;
    }

    const chips = (f) => [
      f.ciudad ? `<span>${esc(f.ciudad)}</span>` : "",
      f.grado ? `<span>Contacto de ${esc(f.grado)} grado</span>` : "",
      f.comun && f.comun.n ? `<span title="${esc((f.comun.nombres || []).join(", "))}">${f.comun.n} en común</span>` : "",
      f.escuela ? `<span>${esc(f.escuela)}</span>` : "",
    ].join("");

    function seguimiento(f) {
      return `<div class="cand-seguir">
        <div class="cand-estados" role="radiogroup" aria-label="Estado de ${esc(f.nombre)}">${ESTADOS.map((e) => `<button type="button" role="radio" aria-checked="${f.estado === e[0]}" data-estado="${e[0]}" class="${f.estado === e[0] ? "on" : ""}">${e[1]}</button>`).join("")}</div>
        <textarea class="cand-notas" data-notas rows="2" maxlength="4000" placeholder="Notas del equipo: qué dijo, qué sigue, quién lo presenta…">${esc(f.notas || "")}</textarea>
        <p class="cand-guardado" data-guardado>${f.updated_por ? `Último cambio: ${esc(quien(f.updated_por))} · ${fecha(f.updated_at)}` : "Se guarda solo."}</p>
      </div>`;
    }

    const tieneDetalle = (f) => !!((f.trayectoria || []).length || Object.keys(f.rasgos || {}).length || (f.banderas || []).length || f.mensaje || f.nota_conexion || (f.prensa || []).length);

    // El interior de una ficha: lo que se ve al abrirla. Sirve igual arriba y en la banca.
    function dentro(f) {
      const R = rasgosDe(), com = f.comun || {};
      const tray = (f.trayectoria || []).map((t) => `<li><b>${esc(t.puesto)}</b>${t.empresa ? `<span>${esc(t.empresa)}</span>` : ""}${t.fechas ? `<em>${esc(t.fechas)}</em>` : ""}${t.nota ? `<p>${esc(t.nota)}</p>` : ""}</li>`).join("");
      const hayRasgos = Object.keys(f.rasgos || {}).length > 0;
      const rasgos = hayRasgos ? R.map((k) => { const r = (f.rasgos || {})[k] || [1, ""]; return `<li><i class="cand-punto ${NIVEL[r[0]][1]}"></i><div><b>${esc(k)} <small>${NIVEL[r[0]][0]}</small></b><p>${esc(r[1] || "")}</p></div></li>`; }).join("") : "";
      const prensa = (f.prensa || []).filter((x) => liga(x.liga)).map((x) => `<li><a href="${esc(x.liga)}" target="_blank" rel="noopener noreferrer">${esc(x.titulo || x.liga)} ↗</a>${x.medio ? ` <small>${esc(x.medio)}</small>` : ""}</li>`).join("");
      return `<div class="cand-dos">
            <section>${tray ? `<h4>Trayectoria</h4><ol class="cand-tray">${tray}</ol>` : ""}${(f.senales || []).length ? `<h4>Señales</h4><ul class="cand-lista">${f.senales.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${prensa ? `<h4>Lo que se ha publicado de su trabajo</h4><ul class="cand-lista cand-prensa">${prensa}</ul>` : ""}</section>
            <section>${rasgos ? `<h4>Los ${R.length} rasgos, uno por uno</h4><ul class="cand-rasgos">${rasgos}</ul>` : ""}</section>
          </div>
          ${(f.banderas || []).length ? `<section class="cand-banderas"><h4>Qué revisar antes de ilusionarse</h4><ul class="cand-lista">${f.banderas.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></section>` : ""}
          ${com.n ? `<section><h4>Quién puede hacer la presentación</h4><p class="cand-texto">${com.n === 1 ? "Un contacto" : com.n + " contactos"} en común${(com.nombres || []).length ? `: ${esc(com.nombres.join(", "))}${com.n > com.nombres.length ? ` y ${com.n - com.nombres.length} más` : ""}` : ""}.${com.nota ? " " + esc(com.nota) : ""} Pide ahí la presentación y, de paso, la referencia.</p></section>` : ""}
          ${f.nota_conexion || f.mensaje || (f.preguntas || []).length ? `<section class="cand-contacto">
            <h4>Primer contacto</h4>
            ${f.nota_conexion ? `<div class="cand-msj"><div class="cand-msj-cab"><b>Nota de invitación</b><small>${f.nota_conexion.length} de ${NOTA_MAX} caracteres</small><button type="button" class="cand-btn" data-copiar="nota">Copiar</button></div><p>${esc(f.nota_conexion)}</p></div>` : ""}
            ${f.mensaje ? `<div class="cand-msj"><div class="cand-msj-cab"><b>Mensaje cuando acepte</b><button type="button" class="cand-btn" data-copiar="mensaje">Copiar</button></div><p>${esc(f.mensaje)}</p></div>` : ""}
            ${(f.preguntas || []).length ? `<h4>Tres preguntas para la primera llamada</h4><ol class="cand-preguntas">${f.preguntas.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
          </section>` : ""}`;
    }

    function fichaTop(f) {
      const R = rasgosDe(), c = cuenta(f), abierta = abiertas.has(f.id), url = liga(f.liga);
      return `<article class="cand-ficha${f.estado === "descartado" ? " fuera" : ""}" id="cand-${esc(f.id)}" data-id="${esc(f.id)}">
        <div class="cand-frente">
          <span class="cand-lugar">${String(f.orden).padStart(2, "0")}</span>
          <div class="cand-quien">
            <h3>${esc(f.nombre)}</h3>
            <p class="cand-titular">${esc(f.titular || "")}</p>
            <div class="cand-chips">${f.nuevo ? `<span class="cand-nuevo">${esc(f.nuevo)}</span>` : ""}${chips(f)}<span class="cand-estado e-${esc(f.estado)}">${nombreEstado(f.estado)}</span></div>
          </div>
          <div class="cand-acciones">
            ${url ? `<a class="cand-btn lleno" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir LinkedIn ↗</a>` : ""}
            ${url ? `<button type="button" class="cand-btn" data-copiar="liga">Copiar liga</button>` : ""}
            <button type="button" class="cand-btn" data-copiar="ficha">Copiar ficha</button>
          </div>
        </div>
        ${f.resumen ? `<p class="cand-resumen">${esc(f.resumen)}</p>` : ""}
        ${f.proposito ? `<div class="cand-proposito"><small>Por qué esto le estaba destinado</small><p>${esc(f.proposito)}</p></div>` : ""}
        <div class="cand-tira">${R.map((k) => { const r = (f.rasgos || {})[k] || [1, ""]; return `<span title="${esc(r[1] || "")}"><i class="cand-punto ${NIVEL[r[0]][1]}"></i>${esc(k)}</span>`; }).join("")}</div>
        <button type="button" class="cand-abrir" data-abrir aria-expanded="${abierta}">${abierta ? "Cerrar la ficha" : `Ver la ficha completa · ${c[3]} rasgos se ven, ${c[1] + c[0]} por revisar`}</button>
        <div class="cand-dentro"${abierta ? "" : " hidden"}>
          ${abierta ? dentro(f) : ""}
        </div>
        ${seguimiento(f)}
      </article>`;
    }

    function fichaBanca(f) {
      const url = liga(f.liga);
      return `<article class="cand-ficha chica${f.estado === "descartado" ? " fuera" : ""}${abiertas.has(f.id) && tieneDetalle(f) ? " ancha" : ""}" id="cand-${esc(f.id)}" data-id="${esc(f.id)}">
        <div class="cand-frente">
          <div class="cand-quien">
            <h3>${esc(f.nombre)}</h3>
            <p class="cand-titular">${esc(f.titular || "")}</p>
            <div class="cand-chips">${chips(f)}<span class="cand-estado e-${esc(f.estado)}">${nombreEstado(f.estado)}</span></div>
          </div>
          <div class="cand-acciones">
            ${url ? `<a class="cand-btn lleno" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a>` : ""}
            <button type="button" class="cand-btn" data-copiar="ficha">Copiar</button>
          </div>
        </div>
        ${f.resumen ? `<p class="cand-resumen">${esc(f.resumen)}</p>` : ""}
        ${f.por_que_no ? `<p class="cand-porque"><b>Por qué no quedó entre las principales:</b> ${esc(f.por_que_no)}</p>` : ""}
        ${f.agregado_por ? `<p class="cand-chica">Ficha agregada por ${esc(quien(f.agregado_por))}.</p>` : ""}
        ${tieneDetalle(f) ? `<button type="button" class="cand-abrir" data-abrir aria-expanded="${abiertas.has(f.id)}">${abiertas.has(f.id) ? "Cerrar la ficha" : "Ver la ficha completa"}</button><div class="cand-dentro"${abiertas.has(f.id) ? "" : " hidden"}>${abiertas.has(f.id) ? `${f.proposito ? `<div class="cand-proposito"><small>Por qué esto le estaba destinado</small><p>${esc(f.proposito)}</p></div>` : ""}${dentro(f)}` : ""}</div>` : ""}
        ${seguimiento(f)}
      </article>`;
    }

    const formulario = () => `<form class="cand-agregar" data-agregar>
        <h4>Agregar a alguien que encontraste</h4>
        <div class="cand-campos">
          <input name="nombre" placeholder="Nombre" maxlength="90" required>
          <input name="liga" placeholder="Liga de su perfil (https://…)" maxlength="300" inputmode="url">
          <input name="titular" placeholder="A qué se dedica" maxlength="200">
          <input name="ciudad" placeholder="Ciudad" maxlength="80">
        </div>
        <textarea name="porque" rows="2" maxlength="1200" placeholder="Por qué crees que es la persona"></textarea>
        <button class="cand-btn lleno" type="submit">Agregar a la banca</button>
      </form>`;

    function pintar() {
      const T = top().filter(pasa), B = banca().filter(pasa);
      if (!D.fichas.length && !Object.keys(D.meta || {}).length) {
        el.innerHTML = `<section class="cand-sec"><p class="cand-ceja">Búsqueda de personas</p><h2>Todavía no hay fichas</h2><p class="cand-bajada">Cuando salgamos a buscar a alguien para un puesto, sus fichas van a vivir aquí. Mientras, puedes agregar a quien tú encuentres.</p></section>${formulario()}`;
        return enlazar();
      }
      el.innerHTML = cabecera() + matriz() +
        `<section class="cand-sec"><div class="cand-barra">${filtros()}<div class="cand-barra-der"><button type="button" class="cand-btn" data-todas>${top().every((f) => abiertas.has(f.id)) ? "Cerrar todas" : "Abrir todas"}</button><button type="button" class="cand-btn" data-copiar-todas>Copiar las fichas</button></div></div>
          ${T.length ? `<div class="cand-pila">${T.map(fichaTop).join("")}</div>` : top().length ? `<p class="cand-vacio">Ninguna ficha principal está en «${esc(nombreEstado(filtro))}».</p>` : ""}
        </section>` +
        (banca().length ? `<section class="cand-sec"><h3>La banca</h3><p class="cand-chica">Gente que vale una llamada, y la razón por la que no quedó arriba.</p>${B.length ? `<div class="cand-rejilla">${B.map(fichaBanca).join("")}</div>` : `<p class="cand-vacio">Nadie de la banca está en «${esc(nombreEstado(filtro))}».</p>`}</section>` : "") +
        `<section class="cand-sec">${formulario()}</section>`;
      enlazar();
    }

    /* ── guardar ──────────────────────────────────────────────────────── */
    async function guardar(id, cambios, caja) {
      const f = D.fichas.find((x) => x.id === id); if (!f) return false;
      const marca = caja && caja.querySelector("[data-guardado]"); if (marca) marca.textContent = "Guardando…";
      try {
        const r = await fetch(o.api + "/" + encodeURIComponent(id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || "error");
        Object.assign(f, { estado: j.estado, notas: j.notas, updated_at: j.updated_at, updated_por: j.updated_por });
        if (marca) marca.textContent = `Guardado · ${quien(j.updated_por)} · ${fecha(j.updated_at)}`;
        return true;
      } catch (e) { if (marca) marca.textContent = "No se guardó. Revisa tu conexión."; aviso("No se pudo guardar."); return false; }
    }

    function enlazar() {
      el.querySelectorAll("[data-filtro]").forEach((b) => (b.onclick = () => { filtro = b.dataset.filtro; pintar(); }));
      el.querySelectorAll("[data-ir]").forEach((tr) => (tr.onclick = () => { const a = el.querySelector("#cand-" + CSS.escape(tr.dataset.ir)); if (!a) { filtro = "todos"; pintar(); return el.querySelector("#cand-" + CSS.escape(tr.dataset.ir))?.scrollIntoView({ behavior: "smooth", block: "start" }); } a.scrollIntoView({ behavior: "smooth", block: "start" }); }));
      const todas = el.querySelector("[data-todas]");
      if (todas) todas.onclick = () => { const T = top(); if (T.every((f) => abiertas.has(f.id))) D.fichas.forEach((f) => abiertas.delete(f.id)); else T.forEach((f) => abiertas.add(f.id)); recordar(); pintar(); };
      const ct = el.querySelector("[data-copiar-todas]");
      if (ct) ct.onclick = async () => aviso((await copiar(D.fichas.filter(pasa).map(textoFicha).join("\n\n────────────\n\n"))) ? "Fichas copiadas." : "No se pudo copiar.");
      el.querySelectorAll(".cand-ficha").forEach((caja) => {
        const id = caja.dataset.id, f = D.fichas.find((x) => x.id === id); if (!f) return;
        const abrir = caja.querySelector("[data-abrir]");
        if (abrir) abrir.onclick = () => { if (abiertas.has(id)) abiertas.delete(id); else abiertas.add(id); recordar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
        caja.querySelectorAll("[data-copiar]").forEach((b) => (b.onclick = async () => {
          const que = b.dataset.copiar, texto = que === "liga" ? f.liga : que === "nota" ? f.nota_conexion : que === "mensaje" ? f.mensaje : textoFicha(f);
          aviso((await copiar(texto)) ? ({ liga: "Liga copiada.", nota: "Nota copiada.", mensaje: "Mensaje copiado.", ficha: "Ficha copiada." }[que]) : "No se pudo copiar.");
        }));
        caja.querySelectorAll("[data-estado]").forEach((b) => (b.onclick = async () => {
          if (f.estado === b.dataset.estado) return;
          const antes = f.estado; f.estado = b.dataset.estado;
          caja.querySelectorAll("[data-estado]").forEach((x) => { const on = x.dataset.estado === f.estado; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
          const pill = caja.querySelector(".cand-estado"); if (pill) { pill.textContent = nombreEstado(f.estado); pill.className = "cand-estado e-" + f.estado; }
          caja.classList.toggle("fuera", f.estado === "descartado");
          if (!(await guardar(id, { estado: f.estado }, caja))) { f.estado = antes; pintar(); return; }
          el.querySelectorAll("[data-filtro]").forEach((x) => { const e = x.dataset.filtro; x.querySelector("i").textContent = D.fichas.filter((y) => e === "todos" || y.estado === e).length; });
          if (o.alCargar) o.alCargar(D);
        }));
        const notas = caja.querySelector("[data-notas]");
        if (notas) {
          let t, ultimo = f.notas || "";
          const mandar = () => { clearTimeout(t); if (notas.value === ultimo) return; ultimo = notas.value; guardar(id, { notas: notas.value }, caja); };
          notas.oninput = () => { clearTimeout(t); t = setTimeout(mandar, 900); const m = caja.querySelector("[data-guardado]"); if (m) m.textContent = "Escribiendo…"; };
          notas.onblur = mandar;
        }
      });
      const form = el.querySelector("[data-agregar]");
      if (form) form.onsubmit = async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form).entries()); d.vacante = o.vacante;
        const boton = form.querySelector("button[type=submit]"); boton.disabled = true;
        try {
          const r = await fetch(o.api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
          const j = await r.json();
          if (!r.ok) { aviso({ falta_nombre: "Falta el nombre.", liga_invalida: "La liga debe empezar con https://", demasiados: "Ya hay demasiadas fichas." }[j.error] || "No se pudo agregar."); boton.disabled = false; return; }
          D.fichas.push(j.ficha); filtro = "todos"; pintar(); aviso("Agregado a la banca.");
          el.querySelector("#cand-" + CSS.escape(j.ficha.id))?.scrollIntoView({ behavior: "smooth", block: "center" });
          if (o.alCargar) o.alCargar(D);
        } catch (err) { aviso("No se pudo agregar. Revisa tu conexión."); boton.disabled = false; }
      };
    }

    async function cargar() {
      try {
        const r = await fetch(o.api + "?vacante=" + encodeURIComponent(o.vacante), { headers: { Accept: "application/json" } });
        if (!r.ok) { el.innerHTML = `<p class="cand-vacio">${r.status === 401 || r.status === 403 ? "Estas fichas son solo para el equipo." : "No se pudieron cargar las fichas."}</p>`; return; }
        D = await r.json(); D.fichas = D.fichas || []; D.meta = D.meta || {};
        pintar(); if (o.alCargar) o.alCargar(D);
      } catch (e) { el.innerHTML = `<p class="cand-vacio">No se pudieron cargar las fichas. Revisa tu conexión.</p>`; }
    }
    cargar();
    return { recargar: cargar, datos: () => D, texto: () => D.fichas.map(textoFicha).join("\n\n────────────\n\n") };
  }

  window.Candidatos = { montar, ESTADOS };
})();

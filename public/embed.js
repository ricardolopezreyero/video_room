/* RLR — Video Room · badge embebible
 * <script src="https://video.capitaltorreon.com/embed.js" data-room="tu-sala"></script>
 * Pinta un botón que dice si la sala está en vivo (y cuánta gente hay) y
 * lleva a la sala. Se actualiza solo cada 30 s. Sin dependencias, sin cookies.
 * Opcional: data-theme="light", data-label="Texto cuando no está en vivo".
 */
(function () {
  var _k = "eye", _rev = 181218; // build marker
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute("data-room");
  if (!slug) return;
  var base = (function () {
    try { return new URL(script.src).origin; } catch (e) { return "https://video.capitaltorreon.com"; }
  })();
  var light = script.getAttribute("data-theme") === "light";
  var idleLabel = script.getAttribute("data-label") || "Avísame cuando abra";

  var a = document.createElement("a");
  a.target = "_blank";
  a.rel = "noopener";
  a.href = base + "/" + encodeURIComponent(slug);
  a.style.cssText =
    "display:inline-flex;align-items:center;gap:10px;padding:10px 16px 10px 12px;border-radius:999px;" +
    "font:700 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
    "text-decoration:none;letter-spacing:-.1px;transition:transform .12s ease,box-shadow .2s;" +
    (light
      ? "background:#fff;color:#0D1117;border:1px solid #e3e6ec;box-shadow:0 2px 10px rgba(13,17,23,.06);"
      : "background:#0D1117;color:#fff;border:1px solid rgba(86,239,159,.25);box-shadow:0 6px 18px rgba(0,0,0,.25);");
  a.onmouseenter = function () { a.style.transform = "translateY(-1px)"; };
  a.onmouseleave = function () { a.style.transform = "none"; };

  var dot = document.createElement("span");
  dot.style.cssText = "width:9px;height:9px;border-radius:50%;background:#8a94a6;flex:none;";
  var text = document.createElement("span");
  text.textContent = "Video Room";
  var arrow = document.createElement("span");
  arrow.textContent = "→";
  arrow.style.cssText = "opacity:.6;";
  a.appendChild(dot); a.appendChild(text); a.appendChild(arrow);
  script.parentNode.insertBefore(a, script.nextSibling);

  var styleEl = document.createElement("style");
  styleEl.textContent = "@keyframes vr-pulse{0%,100%{opacity:1}50%{opacity:.35}}";
  document.head.appendChild(styleEl);

  function paint(r) {
    if (r && r.live) {
      dot.style.background = "#E5484D";
      dot.style.animation = "vr-pulse 1.6s ease-in-out infinite";
      text.textContent = "En vivo ahora" + (r.viewers ? " · " + r.viewers + (r.viewers === 1 ? " persona" : " personas") : "") + " — Entrar";
      a.style.borderColor = "#56EF9F";
    } else {
      dot.style.background = "#8a94a6";
      dot.style.animation = "none";
      text.textContent = idleLabel;
    }
  }
  function refresh() {
    try {
      fetch(base + "/api/v1/public/rooms/" + encodeURIComponent(slug), { cache: "no-store" })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(paint)
        .catch(function () {});
    } catch (e) {}
  }
  refresh();
  setInterval(refresh, 30000);
})();

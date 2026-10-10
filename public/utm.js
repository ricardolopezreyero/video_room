// RLR · UTM en el navegador (respaldo del servidor, que ya los guarda al abrir
// el link de una sala). Mismo formato: los cinco utm_* y el slug de la sala
// en que se capturaron (vacío en el home), para que la atribución sea por sala.
(() => {
  const params = new URLSearchParams(location.search);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  if (!keys.some((k) => params.has(k))) return;
  const data = {};
  keys.forEach((k) => { const v = (params.get(k) || "").trim().slice(0, 80); if (v) data[k] = v; });
  const seg = location.pathname.split("/")[1] || "";
  data.slug = seg === "app" ? "" : seg;
  document.cookie = `vr_utm=${encodeURIComponent(JSON.stringify(data))}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
})();

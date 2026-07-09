// RLR
(() => {
  const params = new URLSearchParams(location.search);
  const keys = ["utm_source", "utm_medium", "utm_campaign"];
  if (!keys.some((k) => params.has(k))) return;
  const data = {};
  keys.forEach((k) => { if (params.has(k)) data[k] = params.get(k); });
  document.cookie = `vr_utm=${encodeURIComponent(JSON.stringify(data))}; path=/; max-age=${60 * 60 * 24 * 30}`;
})();

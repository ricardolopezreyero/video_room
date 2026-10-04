#!/usr/bin/env bash
# RLR · Mide lo que tarda cada ruta en empezar a responder (TTFB) y en terminar,
# promedio de 3 peticiones, y enseña las cabeceras de caché que llegan.
#
#   bash herramientas/velocidad.sh                        → producción
#   bash herramientas/velocidad.sh http://localhost:8793  → servidor local
#
# Lo que mide es el servidor (sin navegador): lo que el service worker y las
# copias de /api ahorran encima de esto se ve en el panel Network del navegador.
BASE="${1:-https://video.capitaltorreon.com}"
RES=()
if [[ "$BASE" == https://video.capitaltorreon.com ]]; then
  # El DNS local a veces guarda un "no existe" viejo para el subdominio;
  # resolver directo con el servidor de nombres de Cloudflare lo evita.
  IP=$(dig @josephine.ns.cloudflare.com +short video.capitaltorreon.com A | head -1)
  [[ -n "$IP" ]] && RES=(--resolve "video.capitaltorreon.com:443:$IP")
fi

printf "%-36s %9s %9s %7s %8s\n" ruta ttfb total código bytes
for p in / /app/monedero /app/estadisticas /ricardo /style.css /veloz.js /room.js \
         /fonts/plus-jakarta-sans.woff2 /api/rooms/ricardo/status /api/rooms/ricardo/offer /api/phrase; do
  for i in 1 2 3; do
    curl -s "${RES[@]}" -o /dev/null -w "%{time_starttransfer} %{time_total} %{http_code} %{size_download}\n" "$BASE$p"
  done | awk -v p="$p" '{t+=$1; T+=$2; c=$3; b=$4} END {printf "%-36s %7.0f ms %7.0f ms %7s %8s\n", p, t/NR*1000, T/NR*1000, c, b}'
done

echo
echo "Cabeceras de caché:"
for p in / /app/monedero /ricardo /style.css /sw.js /fonts/plus-jakarta-sans.woff2; do
  printf "%-36s %s\n" "$p" "$(curl -s "${RES[@]}" -I "$BASE$p" | grep -i '^cache-control' | tr -d '\r' | sed 's/^[Cc]ache-[Cc]ontrol: //')"
done

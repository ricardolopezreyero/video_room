# Video Room

Transmite. Comparte tu link. Cobra. Stack: Cloudflare Workers + Hono + D1 + Durable Objects + Assets. Video vía Cloudflare Realtime (WebRTC SFU). Pagos vía Stripe.

Producción: https://videoroom.superleads.mx

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # rellena con valores de prueba
npx wrangler d1 execute video-room-db --local --file=migrations/0001_init.sql
npx wrangler dev --port 8787
```

## Secretos (nunca en el repo)

Los secretos viven en **Cloudflare Workers secrets** (`wrangler secret put NOMBRE`), no en el código ni en GitHub. Ya configurados en producción:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SESSION_SECRET`

Pendientes de configurar en cuanto se tengan las credenciales reales:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — crear un OAuth Client (tipo "Web application") en Google Cloud Console, con redirect URI `https://videoroom.superleads.mx/auth/google/callback`.
- `CALLS_APP_ID` / `CALLS_APP_TOKEN` — crear una app en el dashboard de Cloudflare (Realtime / Calls SFU) y pegar aquí el App ID + App Secret que se generan (solo se muestran una vez).

Para configurarlos:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put CALLS_APP_ID
npx wrangler secret put CALLS_APP_TOKEN
```

## Despliegue automático (GitHub Actions)

`.github/workflows/deploy.yml` hace `wrangler deploy` en cada push a `main`. Necesita estos **GitHub Actions secrets** (Settings → Secrets and variables → Actions), NUNCA en el código:

- `CLOUDFLARE_API_TOKEN` — token con permisos: Workers Scripts (Edit), Workers Routes (Edit), D1 (Edit), Account Settings (Read).
- `CLOUDFLARE_ACCOUNT_ID` — `93695b987a7460c681c06ca4df901ef4`

## Webhook de Stripe

En el dashboard de Stripe, registrar el endpoint:
`https://videoroom.superleads.mx/webhook/stripe` escuchando el evento `checkout.session.completed`.

## Qué falta para producto completo (ver PARTE E del prompt maestro)

- Comentarios en vivo, likes agregados, doble tap ❤️ agregado por WebSocket (hoy es solo visual local).
- Imagen OG dinámica por sala (frame en vivo cada 60s) — hoy usa una tarjeta estática de respaldo.
- Retiros reales vía Stripe Connect/transfer (hoy solo se registra la solicitud en el ledger).
- Renovación automática de pase a los 55 min + modo solo-audio de gracia.
- Facturación manual por correo.

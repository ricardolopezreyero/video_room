# Video Room

### Transmite. Comparte tu link. Cobra.

**Producción:** [videoroom.superleads.mx](https://videoroom.superleads.mx)

Video Room es la sala de video en vivo donde cada persona que entra te paga. Sin seguidores mínimos, sin esperar a fin de mes, sin monedas raras — dinero real, pesos mexicanos, desde tu primer espectador.

---

## Para el creador

- **Cobras desde el minuto uno.** Creas tu sala con un tap (login con Google), compartes tu link y ya estás transmitiendo. $20 pesos la hora por espectador — **$10 son tuyos, al instante**, sin esperar a fin de mes.
- **Propinas en vivo, 90/10.** Tu audiencia te manda dinero cuando quiere, con un mensaje, y aparece en pantalla como una banda elegante para todos. De cada $10 en propinas, **$9 son tuyos**.
- **Tus números, claros.** Panel de estadísticas con lo que ganaste hoy, esta semana o en total, cuántas personas entraron, cuántas propinas recibiste y **quiénes son tus mayores donadores** — para que sepas exactamente quién te apoya y cómo va tu negocio.
- **Tu link es tuyo para siempre.** Nadie más se mete entre tú y tu audiencia — no hay algoritmo, no hay directorio público, no hay feed. Cuando no transmites, tu gente puede activar "avísame cuando abra".
- **Retiras a tu banco.** Balance de creador separado de tu saldo, retiro desde $200.
- **Tu historial nunca se borra.** Cada recarga, entrada, propina y retiro queda guardado para siempre — es tu dinero, tu comprobante, tu tranquilidad.

## Para quien entra a ver

- Entras con tu cuenta de Google en un tap, pagas $20 por una hora en la sala del creador que quieres ver — sin publicidad, sin grabaciones, sin algoritmo de por medio.
- Puedes mandar dinero al creador cuando quieras, pedir la palabra para hablar en vivo, o simplemente ver y disfrutar.
- Nada se graba. Lo que pasa en el Room, se queda en el Room.

---

## Cómo se ve

| | |
|---|---|
| 🔴 **Transmitir** | Cámara o pantalla, listo en 30 segundos |
| 💵 **Cobrar** | $20/hora automático + propinas 90/10 |
| 📊 **Medir** | Estadísticas y top de donadores en tiempo real |
| 🏦 **Retirar** | A tu cuenta bancaria, desde $200 |

---

## Para desarrolladores

**Stack:** Cloudflare Workers + Hono · D1 (base de datos) · Durable Objects (estado de sala en vivo) · Workers Assets (frontend) · Cloudflare Realtime (video WebRTC) · Stripe (pagos).

```bash
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 execute video-room-db --local --file=migrations/0001_init.sql
npx wrangler dev --port 8787
```

**Secretos:** viven solo como `wrangler secret put NOMBRE` (Cloudflare) y GitHub Actions secrets para el deploy automático — nunca en el código. Ver `.dev.vars.example` para la lista completa de variables que necesita el proyecto.

**Deploy:** `npx wrangler deploy`, o automático vía GitHub Actions en cada push a `main` (`.github/workflows/deploy.yml`).

**Pendientes conocidos:** comentarios/likes agregados en vivo por WebSocket, imagen OG dinámica por sala (hoy usa tarjeta estática), retiros reales vía Stripe Connect (hoy se registra la solicitud en el ledger), renovación automática de pase a los 55 min.

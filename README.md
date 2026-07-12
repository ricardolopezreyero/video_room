# Video Room

### Prende tu cámara. Comparte un link. Ve entrar el dinero.

**En vivo:** [videoroom.superleads.mx](https://videoroom.superleads.mx)

Video Room es la sala de video en vivo que convierte tu tiempo en dinero real, al instante — sin seguidores mínimos, sin algoritmos que decidan quién te ve, sin esperar a fin de mes para cobrar. Prendes tu cámara, mandas tu link, y cada persona que entra te paga. Así de directo.

Está construida con una sola obsesión: que monetices **más, y más rápido**, que en cualquier otra plataforma que hayas probado.

---

## Por qué un creador lo va a amar

**💸 Cobras desde tu primer espectador — y retiras desde $10 pesos.**
No hay umbral de "necesitas 1,000 seguidores" ni "$100 mínimo para retirar" ni "espera 30 días". Investigamos el límite técnico real que impone Stripe para pagar a un banco mexicano — $10 MXN — y ese es literalmente el mínimo que pedimos. ¿Por qué? Porque sabemos que lo primero que va a hacer cualquier creador nuevo es probar que esto de verdad paga, con lo que tenga a la mano, antes de confiarle un peso más. Cuando retiras, el dinero llega directo a tu cuenta bancaria vía Stripe — no son "monedas", no son "créditos", es tu dinero.

**🎉 Retirar se siente como ganar, no como llenar un formulario.**
Tu balance baja animado, una ráfaga de billetes flota en pantalla, el celular vibra, y si es tu primer retiro de la vida, te lo decimos — es un momento que se recuerda, no un trámite bancario. Y siempre ves cuánto llevas retirado en total: un número que solo crece, y que da ganas de hacerlo crecer más.

**💰 Dos formas de ganar, cada hora que transmites.** Entrar a tu sala cuesta $20 MXN la hora — **$10 son tuyos al instante**, apenas alguien cruza la puerta. Y en cualquier momento tu audiencia puede mandarte una propina con un mensaje, que aparece en pantalla como una banda elegante para todos — de cada $10 en propinas, **$9 son tuyos**.

**👀 Tu audiencia se siente cerca, de verdad.** Sabes cuánta gente hay contigo en este momento. Cuando alguien manda un corazón, todos lo ven flotar en la pantalla — así el chat de texto se queda libre para preguntas de verdad, en vez de llenarse de "jaja" y "+1" como en cualquier videollamada genérica. Puedes fijar el comentario de alguien mientras lo respondes en voz, para que sepa que de verdad lo escuchaste. Y cuando tú hablas en el chat, tu mensaje se resalta al instante — todos saben que es el creador quien está hablando.

**🔒 Total control de tu sala.** Si alguien se porta mal, lo bloqueas desde tu panel de estadísticas y ya no puede volver a entrar, comentar ni ver tu transmisión — ni aunque ya haya pagado. Una misma cuenta no puede compartir su acceso viendo desde dos pantallas a la vez: en cuanto abre una segunda, la primera se apaga sola. Y nada de lo que pasa en tu sala se graba — video, audio y comentarios se esfuman en cuanto cierras, así que tu audiencia comenta con total confianza.

**📊 Tus números, siempre a la vista.** Un panel de estadísticas te dice cuánto ganaste hoy, esta semana o desde siempre, cuánta gente entró, cuántas propinas recibiste, y quiénes son tus mayores donadores — con nombre y foto. Una página de transacciones muestra cada movimiento de tu dinero, con exportación a CSV con un clic, para que tengas la tranquilidad de que nada se pierde ni se esconde.

**🔗 Tu link es tuyo, para siempre.** No hay feed, no hay algoritmo, no hay directorio público decidiendo quién te descubre. Cuando no estás en vivo, tu audiencia puede activar "avísame cuando abras" y les llega un correo y una notificación en el segundo exacto en que prendes cámara.

**🛡️ Funciona, siempre.** Si tu transmisión se cae sin que la cierres a propósito (se te fue la señal, cerraste la pestaña sin querer), el sistema la cierra solo después de un rato — nadie vuelve a pagar por entrar a una sala fantasma. Y si algo alguna vez sale mal detrás de cámaras, nos enteramos al instante, no cuando alguien se queja.

## Para quien entra a ver

- Entras con tu cuenta de Google en un tap. $20 MXN por una hora en la sala del creador que quieras ver — sin publicidad, sin que un algoritmo decida qué te muestra.
- Mandas dinero al creador cuando quieras, con un mensaje que aparece en pantalla. Doble-tap en el video para mandar un corazón — así de simple.
- Comentas con total confianza: nada de lo que pasa en la sala se graba. Cuando cierra, se esfuma.
- Sabes cuánta gente más está viendo contigo — nunca estás solo en un Room.

---

## Cómo se ve, de un vistazo

| | |
|---|---|
| 🔴 **Transmitir** | Cámara o pantalla, en vivo en 30 segundos |
| 💵 **Cobrar** | $20/hora automático + propinas 90/10, sin fricción |
| 🏦 **Retirar** | A tu banco de verdad, desde $10 pesos, con celebración incluida |
| 📊 **Medir** | Ganancias, top de donadores y transacciones exportables en tiempo real |
| 🛡️ **Controlar** | Bloqueas a quien quieras, un solo dispositivo activo por cuenta, cero grabaciones |

---

## Para desarrolladores

**Stack:** Cloudflare Workers + Hono · D1 (base de datos) · Durable Objects (estado de sala en vivo, WebSockets) · Workers Assets (frontend) · Cloudflare Realtime (video WebRTC) · Stripe + Stripe Connect (pagos y retiros reales) · Resend (correo) · Cron Triggers (limpieza automática) · Vitest (pruebas sobre el runtime real de Workers).

```bash
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply video-room-db --local
npx wrangler dev --port 8787
```

**Pruebas:** `npm test` — corre sobre Miniflare con las migraciones aplicadas de verdad, cubriendo lo más sensible: idempotencia del ledger, atomicidad de retiros, bloqueo de espectadores y la limpieza automática de sesiones.

**Secretos:** viven solo como `wrangler secret put NOMBRE` (Cloudflare) y GitHub Actions secrets para el deploy automático — nunca en el código. Ver `.dev.vars.example` para la lista completa de variables.

**Deploy:** automático vía GitHub Actions en cada push a `main` (`.github/workflows/deploy.yml`), con typecheck y pruebas corriendo antes de subir — o manual con `npx wrangler deploy`.

**Roadmap:** retiros para creadores en Brasil (hoy Stripe Connect solo cubre México en este proyecto — Brasil es el único otro país de LATAM que Stripe soporta, pero pagarle bien a un creador ahí requiere conversión de moneda en tiempo real, que todavía no existe aquí).

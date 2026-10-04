# Video Room

### Prende tu cámara. Comparte un link. Ve entrar el dinero.

**En vivo:** [video.capitaltorreon.com](https://video.capitaltorreon.com)

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

## Login

Este servicio entra con el login único de CapitalTorreon: **[login.capitaltorreon.com](https://login.capitaltorreon.com)**. Todo funciona sin entrar; entrar solo agrega (guardar, recuperar, ser reconocido). El botón se monta solo con dos líneas (`<div data-login-ct>` + `login.js`) y el servidor verifica el pase con `verificar.js`; nunca se agrega un origen en Google Cloud ni se pone un botón de Google propio. El porqué y las reglas, en [El camino del login](https://github.com/ricardolopezreyero/login-capitaltorreon/blob/main/docs/El_Camino_del_Login_v1_2026-10-04_1135.md).

## Velocidad: del clic a la página siguiente

El sistema es chico y cerrado, así que desde cada pantalla se sabe a dónde es
probable que vaya la persona. Todo lo que sigue vive en `public/veloz.js`,
`public/sw.js` y la ruta de la sala en `src/index.ts`:

- **La página siguiente ya está aquí.** Un service worker guarda las páginas
  de la app, estilos, scripts y fuentes en el disco del teléfono y las sirve
  al instante (y las renueva por detrás). En Chrome, además, la pantalla más
  probable se deja pintada por adelantado (Speculation Rules) y las demás se
  prerenderizan al pasar el mouse o bajar el dedo.
- **Los datos también.** Cada pantalla declara qué pide a `/api` al abrir;
  esos datos se traen antes del clic y se guardan como copia de un solo uso.
  Al abrir, la página pinta con la copia (0 ms) y, si la copia tenía edad,
  la verifica por detrás: el evento `vr:fresco` repinta solo el bloque que
  cambió.
- **La sala, sin viajes.** El link que se comparte traía ~10 consultas en
  serie y luego tres llamadas más antes de ser usable. Ahora son dos rondas
  en paralelo y los datos de arranque van incrustados en el HTML
  (`window.__VR_INICIO`); las reliquias pendientes se otorgan después de
  responder.
- **El clic se siente al presionar.** La navegación arranca en `pointerdown`
  (con el mouse) o al soltar sin haber arrastrado (con el dedo); el botón se
  hunde y la página se atenúa en el mismo cuadro, y el cambio de página es
  una transición corta (View Transitions) en vez de un parpadeo.
- **Aprende de cada persona.** Las rutas que toma suman a su propia tabla de
  probabilidades (en su navegador) y las siguientes visitas precargan primero
  lo que ella de verdad usa.
- **Fuentes propias.** Plus Jakarta Sans se sirve desde `public/fonts/` (un
  solo archivo variable): sin los dos dominios de Google Fonts ni el brinco
  del texto.

Para medir: `bash herramientas/velocidad.sh` (producción) o con la URL del
servidor local. Mide el servidor; lo que el service worker y las copias
ahorran encima se ve en el panel Network del navegador.

## Recibos de dinero: el sello entre las dos partes

Cada vez que se mueve dinero entre quien ve y quien transmite (entrada,
propina, propina de despedida, mensaje destacado, membresía) salen **dos
correos en el mismo segundo**, uno a cada parte, con:

- el mismo **folio** (`VR-XXXX-XXXX-XXXX`, derivado del id del movimiento, así
  que con él se encuentra la fila exacta en la base);
- la **fecha y hora exacta** con segundos, en hora de Ciudad de México;
- el **momento de la transmisión** ("Minuto 12:34 de la transmisión", o "5
  minutos después de que terminó");
- los **montos exactos en MXN** con centavos: lo que se pagó, lo que recibe el
  creador y la comisión; el saldo que le queda a quien pagó y el balance de
  creador después;
- un botón: volver a la sala (quien ve) o ver transacciones (quien transmite).

Viven en `src/lib/recibos.ts` (`recibosDe` arma el par, `enviarRecibos` lo
manda en un solo lote a Resend después de responder; si falla, avisa al
administrador con el folio). Recarga y retiro llevan también folio y hora
exacta. Las pruebas nunca mandan correo: `sendEmail` ignora dominios
reservados (`.local`, `.test`, `example.com`) y llaves que no son de Resend.

## Motor de video: la máxima calidad que caben el aparato y el internet

Vive en `public/motor-video.js` (y en `room.js`, que lo usa). El objetivo no
es ahorrar internet: es usar el que hay, con margen para que nunca se trabe.

- **Captura y simulcast.** Se pide a la cámara lo máximo que dé (hasta 4K a
  60 fps). El codificador manda **tres capas** de la misma señal (completa,
  mitad, cuarto); el SFU de Cloudflare reenvía a cada espectador la que pidió,
  y cambiar de capa no reconecta ni parpadea. Antes la media y la baja se
  redibujaban 60 veces por segundo en dos canvas ocultos en el teléfono del
  creador.
- **La escalera.** Todas las combinaciones resolución × fps que la cámara
  puede dar, de mejor a peor, con los kb/s que cada peldaño necesita (bits por
  píxel generosos). La regla del producto: ante apuros, primero se sacrifican
  cuadros por segundo y luego resolución; al recuperarse, al revés.
- **El motor del creador** mide cada 2 s el ancho de banda disponible, la
  pérdida y si el codificador se limita por CPU, y mueve el peldaño: baja
  rápido, sube con calma (3 lecturas buenas, 6 s entre cambios). El CPU pone
  techo por 60 s cuando no puede; `MediaCapabilities` pone el techo del aparato
  desde el inicio. La cámara captura justo lo del peldaño (`applyConstraints`),
  y el codificador recibe tope de bits y fps por capa.
- **El códec.** H.264 va primero siempre que el aparato lo codifique: es el
  único que decodifican por hardware prácticamente todos los celulares
  (iPhone incluido), y el SFU no transcodifica, así que lo que manda el creador
  es lo que todos reciben. VP9 y VP8 como respaldo; AV1 y H.265 no (muchos
  teléfonos del público los decodifican por software y se calientan).
- **Audio.** Opus a 48 kHz, estéreo si la fuente lo da, FEC en banda, sin DTX,
  hasta 128 kb/s; el motor lo escalona (128 → 32 kb/s) según lo que sobra,
  nunca menos de 32.
- **El espectador** mide lo que le llega (pérdida, rtt, congelamientos, cuadros
  tirados, tiempo de decodificación) y pide la capa que su red Y su aparato
  aguantan (`MediaCapabilities.decodingInfo`). Con red temblorosa pone un
  colchón de 250–500 ms (estabilidad a cambio de ese retraso) y lo quita al
  calmarse. Muestra "1080p30" junto al conteo de la sala.
- **Los cortes.** Si la conexión del creador se cae, vuelve a publicar sola en
  cuanto hay red; el Durable Object avisa `republished` y cada espectador se
  reengancha solo. Mientras, el público ve quién falta y cuánto llevamos
  esperando (franja sobre el video; en la portada, con "Entrar" apagado para no
  cobrar una hora sin creador); el chat sigue vivo. Si el creador no vuelve en
  **5 minutos**, la transmisión se cierra sola con el flujo normal (resumen,
  propina de despedida). Si la que se cae es la del espectador, se vuelve a
  suscribir sola con pausas crecientes; su pase sigue vigente.

Decisiones de producto (4-oct-2026): nada se graba; en vivo real con
reconexión, no un buffer de 5 minutos (eso sería un retraso de 5 minutos); 8K
no existe hoy en navegadores ni cámaras de teléfono, el motor apunta al máximo
real del aparato.

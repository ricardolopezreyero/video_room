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

## Audio: captar todo, limpiar poquito, la voz al frente

`public/motor-audio.js`. Al micrófono se le pide todo (48 kHz, estéreo, 24
bits) y el trato depende del **modo** que elige el creador en el dock:
**Voz** (eco y ruido fuera, aislamiento de voz donde existe), **Música** (sin
los filtros de llamada, que aplastan instrumentos) y **Ambiente** (el sonido
del lugar se queda, sin eco). La cadena, en el aparato del creador (~10 ms):
corte de graves, menos "caja" en 160 Hz, presencia en 3 kHz, aire arriba de
9 kHz, puerta suave que baja −18 dB cuando nadie habla (nunca corta a cero),
compresor que empareja y limitador que impide distorsión. Si comparte
pantalla con audio, ese audio entra por debajo de la voz y baja solo cuando
habla (ducking): primero la voz, luego los instrumentos. Se publican dos
versiones ya procesadas, `audio` (Opus hasta 128 kb/s, estéreo, FEC) y
`audio_lo` (48 kb/s) que el SFU entrega a quien pide la capa baja de video.
Con un solo micrófono no se puede separar voz de instrumentos; lo que sí: que
la voz quede al frente por ecualización y compresión, y que lo que viene por
otra fuente baje cuando la persona habla.

## Textos alrededor del cobro

Regla: a menor duda, mayor conexión. Portada con lo que le llega al creador y
el aviso de los recibos; hoja de propinas que dice a quién, cuánto le llega y
que lo ve con tu nombre; membresía con dos toques claros en vez del diálogo
del navegador; montos siempre exactos ($37.50, no $38); si falta saldo, el
monedero dice cuánto falta, marca el monto que alcanza y regresa solo a la
sala al terminar de recargar (`?volver=&falta=`). El FAQ ya no dice "$20 fijos".

## Modo llamada: dos salas, dos vías

Botón «📞 Llamada» en el dock del creador. Pegas el link de la sala de la otra
persona y esa sala abre dentro de la tuya (`/<su-sala>?modo=llamada`: solo su
video, sin chat ni dock) mientras tu cámara queda chiquita en una esquina.
Entras a su sala como cualquier persona (pagas su hora con tu saldo) y ella
entra a la tuya: dos salas, dos vías, con el mismo cobro de siempre. Para la
tele: AirPlay (iPhone → Apple TV) o «Duplicar pantalla» (Android → Roku); lo
que se refleja es exactamente esa pantalla. Roku y Apple TV no tienen
navegador ni reciben WebRTC: por eso el camino es reflejar, no una app.

## El recibo como objeto (PDF)

`GET /recibo/<pass_|tip_|mem_…>` genera en el Worker (pdf-lib + Plus Jakarta
Sans) un PDF para guardar: el creador al frente (foto y nombre), **el segundo
exacto en grande**, las dos fotos unidas, los montos exactos, folio y la firma
chiquita de Video Room abajo ("un servicio de CapitalTorreon.com"). Lo abre
quien tenga la liga firmada del correo (`?t=`, sin login) o cualquiera de las
dos partes con su sesión; `?descargar=1` lo baja como archivo. Los dos correos
del recibo llevan la liga, y Transacciones tiene una columna "Recibo".

## Efectos de un clic para el creador

- **Color** (botón 🎨): Normal, Más color, Menos color, Blanco y negro, Sepia.
  Un shader de WebGL en la GPU filtra la cámara y eso es lo que se publica y
  lo que el creador ve; con Normal la cámara va directa y el bucle se pausa.
  Compartiendo pantalla no se filtra (texto nítido). `MotorVideo.crearFiltro`.
- **Audio** (botón 🎧): Auto, Voz, Música, Concierto, Sala, Carro, Calle. Cada
  ajuste cambia lo que se le pide al micrófono y la cadena (graves, presencia,
  puerta, compresor, atenuación de entrada en Concierto). **Auto** mide cada
  segundo nivel, piso de ruido y reparto grave/medio/agudo de la señal cruda;
  decide cada 5 s y solo cambia tras dos lecturas iguales, avisando con un
  toast. `MotorAudio.MODOS`, `ORDEN_MODOS`.
- Ambos viven en una hoja de opciones con tarjetas grandes (`hojaDeOpciones`
  en room.js): un clic y se pone, sin retraso.

## Modo tele (📺)

Botón «Tele» en el dock, para quien ve y para quien transmite. Abre una hoja
con los pasos de **tu** sistema (iPhone: Centro de control → Duplicar
pantalla → Apple TV o Roku con AirPlay; Android: ajustes rápidos →
Transmitir / Smart View → Roku, Fire TV, Android TV) y un botón «Modo tele»
que deja la pantalla solo con el video: pantalla completa donde el navegador
lo permite, orientación horizontal donde se puede, teléfono sin dormirse
(Wake Lock, con un video mudo de 1 px como respaldo donde no existe) y una
pista para girar el teléfono si está vertical. Si el navegador ofrece mandar
el video directo (AirPlay / Transmitir), se intenta primero y, si no acepta
señal en vivo, queda el camino de duplicar. `?modo=tv` entra solo al empezar
a ver (para una tele con navegador). Roku y Apple TV no tienen navegador ni
reciben WebRTC: por eso el camino es duplicar la pantalla, no una app.

Robustez por navegador que quedó cuidada: el espectador se des-silencia al
llegar el video (iPhone exigía `muted` para arrancar); la cámara del creador
se vuelve a pedir sola si el sistema la apagó al mandar la app al fondo; si
Android suelta el contexto WebGL, el filtro de color se apaga solo y la
cámara sale directa; `playsinline` + `x-webkit-airplay` en el video.

## Login: el de la casa

Video Room entra por `login.capitaltorreon.com` (un solo Google para todos los
servicios de CapitalTorreon). `/login` manda allá y la casa vuelve a la misma
página con el pase; `public/puente-login.js` (va antes de `login.js`) cambia
el pase por la sesión de Video Room en `POST /auth/ct` (verificación ES256 con
la llave pública de la casa, `src/lib/verificar-ct.ts`), crea la cuenta y su
sala si es la primera vez, y mantiene las dos sesiones iguales: si la casa
cierra (`#salio=1`), aquí también (`POST /auth/salir`); `/auth/logout` cierra
en los dos lados. La sesión son dos cookies: `vr_session` (HttpOnly) y `vr_ok`
(visible, solo dice "hay sesión"). Quien ya entró y abre el home va directo a
su monedero (servidor y puente); `/?ver=1` deja ver el home. El widget fijo
de la casa es la única identidad en pantalla (la ficha propia se retiró).

## Cuentas de cortesía

`src/lib/cortesia.ts`: la casa, la familia y los socios que ayudan a arrancar.
Sus salas son gratis para quien entre y ellas entran gratis a cualquier sala
(pase de $0, sin recibo porque no se mueve dinero; el creador ve «entró
(cortesía)»). Pueden ganar propinas y membresías de otros. Todo lo demás, para
todas las demás cuentas, sigue igual. Agregar una cuenta: una línea y deploy.
Además, quien toca «Entrar» sin sesión y vuelve del login entra solo si la
entrada no cuesta (cortesía o miembro).

## El chat en vivo: una herramienta, no una cajita

El chat de una transmisión mueve muchísimo texto en poco tiempo y luego se
borra todo. Está hecho para eso (`public/chat.js` + el Durable Object):

- **Historial con secuencia.** Cada fila (comentario, dinero, aviso) lleva un
  `seq` y vive en el storage del DO (`c:<seq>`, tope 6,000) mientras dura la
  transmisión. Quien entra tarde o se reconecta recibe lo último al conectar
  (`chat_inicio`), puede subir por páginas (`GET /api/rooms/:slug/chat?antes=`)
  y, si se perdió algo en medio, se rellena solo (`?desde=`). Al terminar la
  sesión se borra todo: nada se graba.
- **Lo nuevo no te mueve.** Si estás leyendo arriba, lo nuevo entra abajo sin
  tocar tu scroll; aparece «↓ 12 nuevos» (dorado si te mencionaron, con halo
  si habló quien transmite) y una raya «Nuevos» marca dónde te quedaste.
  Pegado abajo, todo fluye en vivo. El DOM nunca pasa de ~350 filas: lo demás
  queda en memoria y se vuelve a pintar al subir, sin brincos (se mide la fila
  que estabas leyendo y se corrige justo eso; `overflow-anchor: none`).
- **Buscar en todo lo dicho** (lupa o `/`): sin acentos ni mayúsculas, todas
  las palabras, filtro por quién (todo / quien transmite / dinero / yo),
  contador «3 de 12», flechas, la palabra subrayada. Primero lo que hay en
  memoria (instantáneo) y luego el servidor completa lo más viejo.
- **Filtros de un toque:** Todo · ? Preguntas (con conteo) · 💵 Dinero (con el
  total) · 🎙 Quien transmite · @ Mí (lo tuyo y donde te mencionan).
- **El dinero dentro del chat:** propinas y mensajes destacados entran como
  filas doradas con el monto: la línea de tiempo del dinero, buscable.
- **Menciones:** tocar un nombre (o `r`) deja «@Nombre » en la caja; la persona
  mencionada ve su fila con borde dorado y la encuentra con el filtro @.
- **Marcas de minuto** cada 5 min de transmisión; al pasar el mouse, el
  segundo exacto de cada fila (el mismo «minuto del video» de los recibos).
- **Ligas clicables** (solo http/https, `rel=noopener`), nunca `innerHTML`.
- **Doble toque:** el creador da like; el público manda un corazón.
- **Freno:** una persona, un comentario cada 700 ms (el creador sin freno);
  el servidor responde `despacio` y el texto vuelve a la caja.
- **Chat grande** (⤢ o `x`) para leer o moderar a gusto.
- **Teclas en computadora** (`?` las enseña; una pista bajo la caja las
  primeras 3 veces): `c` escribir · `/` buscar · `End` en vivo · `j`/`k` o
  `↑`/`↓` cursor entre mensajes · `r` responder · `f` cambiar filtro · `x`
  grande · `h` corazón · `d` dinero · `n` mano · `o` ocultar chat · `Esc`
  cierra/suelta · creador: `p` destacar, `l` like, `m` mic, `v` cámara ·
  `Ctrl/Cmd+C` con cursor copia «Nombre: texto». Dentro de una caja de texto
  las teclas son letras.

Probar en local: `window.__vr.chat()` y `__vr.estado().chat` (filas en
memoria, ventana pintada, `pegado`, `sinLeer`); `__vr.simular({type:"comment",
seq, ...})` mete filas sin servidor. Pruebas: `test/chat.spec.ts`.

## El link de la sala: estable para siempre

`video.capitaltorreon.com/<slug>`, pegado a la raíz, sin subdominios. Es el
activo del creador: lo imprime en un QR, lo pone en su puerta, monta un
negocio encima. Reglas (auditoría 10-oct-2026):

- **Una sala es su `room.id`, no su slug.** El slug es una etiqueta que
  apunta a la sala; cambiar de dueño (heredar, traspasar, vender) es cambiar
  `owner_id` y el link no se entera. Varios links por sala serán, el día que
  se cobren, más filas apuntando al mismo `room.id`.
- **Forma canónica.** `/Ricardo`, `/ricardo.`, `/ricardo)`, `/Ric%C3%A1rdo` y
  `/ricardo/` llegan con 301 a `/ricardo` conservando la query (los UTM).
  `canonicalizarSlug` en `src/lib/slugs.ts`.
- **Nada se recicla.** Al cambiar la URL, la anterior queda en `slug_aliases`
  y redirige (301) a la sala para siempre; nadie más puede tomarla (ni los
  números viejos: `nextAvailableSlug` avanza el contador y salta lo que
  alguien ya tuvo). La misma sala sí puede regresar a una URL suya. Máximo 5
  cambios por día.
- **Reservados** (`RESERVED_SLUGS`): toda ruta real, toda página que vivió en
  la raíz, todo archivo de `public/` con y sin extensión, y palabras que un
  día pueden ser rutas. Si se agrega una ruta o un archivo en la raíz,
  **se agrega aquí** o el link de alguien deja de servir su sala.
- **`/r/<slug>`** sigue redirigiendo (links de la primera época).

### UTM: de qué link vino cada entrada

Se capturan en el servidor al abrir el link (sin depender de JS; `utm.js` es
respaldo), los cinco: `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content` (dónde estaba el QR), `utm_term`. Viven 30 días en la cookie
`vr_utm` **junto con el slug de la sala**: la atribución es por sala (llegar a
`/ana` por un QR y luego entrar a `/juan` no le cuelga a Juan el QR de Ana).
Toda entrada los guarda en `passes` (pagada, de miembro, de cortesía, del
dueño) y Estadísticas los muestra como fuente · medio · campaña · contenido.
Ejemplo para imprimir: `video.capitaltorreon.com/ricardo?utm_source=qr&utm_medium=impreso&utm_campaign=consultoria&utm_content=puerta-oficina`.

### Código QR del creador (monedero → «Código QR»)

`public/qr.js` sobre `qr-lib.js` (Kazuhiko Arase, MIT). Cerrado por defecto;
se arma al abrirlo. Un toque dice dónde va (Instagram, Facebook, WhatsApp,
TikTok, YouTube, Correo, Puerta o local, Tarjeta, Cartel) y el link ya lleva
sus UTM; los campos UTM a mano viven bajo «UTM ▸» para no estorbar a quien no
los usa. Foto de Google al centro opcional (nivel H de corrección, círculo
blanco, borde verde; la foto se trae por `/api/wallet/avatar` para que el
canvas no quede «sucio» y se incrusta como data URL en el SVG). Baja PNG/JPG
(1024 px, fondo blanco), SVG, copia el link, la imagen (donde el navegador
deja) o el código SVG. Validado con jsQR: el QR con el centro tapado se
decodifica íntegro.

## Monetización: tres capas, una regla por capa

Revisión del 10-oct-2026 (`src/lib/pricing.ts` es la única fuente):

1. **La puerta** (entrada por hora y membresía mensual): la casa se queda
   **1 de cada 5 pesos**, sin mínimos escondidos. Es lo único que monetizamos.
   A $20, $16 son del creador (antes $10: el «mínimo $10» hacía que a $20 la
   casa se quedara la mitad).
2. **El gesto** (dinero que la gente manda adentro): **llega completo, 0 %**.
   Que el dinero circule adentro casi no cuesta y vale muchísimo en confianza.
   Montos rápidos $20 · $50 · $100 · $200 + «Otro» (de $10 a $5,000, tope
   $2,000 por transmisión y persona). El último monto que mandaste va primero
   y en grande («$50 · otra vez»). Un mensaje con el envío queda arriba del
   chat un minuto para todos, gratis. Escribir `$50 gracias` en el chat abre
   la hoja con todo puesto: un toque y se fue.
3. **La salida** (retiro al banco): sin comisión nuestra; mínimo $10 porque es
   el piso de Stripe. **Lo ganado también se gasta adentro** sin retirar
   (`gastable = recargado + ganado`; `debitarGastable` cobra primero de lo
   recargado y luego de lo ganado; lo recargado nunca se retira).

Lo que se quitó (~20 %): el **mensaje destacado de pago** (ahora cualquier
envío con mensaje se fija gratis), la **meta de propinas** (la barra que todos
veían llenarse: pedir no es nuestro estilo), el **modal de despedida** al
terminar (ahora una franja abajo con un botón; quien no quiera, lee que nada
quedó grabado y ya), tres montos de recarga (7 → 5: $50 · $100 · $200 · $500
· $1,000) y los porcentajes en las pantallas de la gente (solo quedan en el
monedero del creador y el FAQ, dichos como «1 de cada 5 pesos»).

Siguiente capa, no construida: mandar dinero a cualquier persona (no solo a
quien transmite) y pagar entre cuentas sin sala de por medio.

## Correos: cuáles hay, quién los apaga y el corte semanal

Catálogo en `src/lib/correos.ts` (`CATEGORIAS`). **Fijos**, sin interruptor:
recibos de dinero (entrada, envío, membresía, recarga, retiro: a las dos
partes, siempre) y lo de la cuenta (bienvenida, banco conectado). **Con
interruptor** (monedero → «Correos», todo prendido por defecto; se guarda en
`users.correos` como JSON con solo lo apagado): corte semanal, resumen al
terminar cada transmisión, alguien activó «Avísame», confirmación de avisos a
tu gente, salas que sigues (quien lo apaga sigue recibiendo la notificación
en la app; además cada aviso trae «dejar esta sala»). Cada correo que se puede
apagar lleva al pie «Elegir qué correos recibo». API: `GET/POST
/api/wallet/correos`. Al mandar, cada sitio consulta `quiere()` /
`quiereDeFila()`.

**Corte semanal** (`src/lib/corte-semanal.ts`): cron `33 21 * * 5` (viernes
3:33 pm de Ciudad de México). A cada creador con ganancias en los últimos 7
días: ganado (entradas + envíos + membresías) comparado con los 7 anteriores
(+%), entradas y personas (nuevas), envíos completos, en vivo (transmisiones,
horas, pico), «Avísame» nuevos, mejor día, quienes más han dejado, de dónde
vinieron (UTM) y disponible ahora. Se anota en `cortes_semanales` antes de
mandar (una vez por semana por persona); sin movimiento no hay correo. Vista
previa de la propia persona: monedero → «Ver cómo se vería mi corte semanal»
(`GET /api/wallet/corte?html=1`). Para probar el envío a mano:
`enviarCortesSemanales(env, hasta)`.

Revisión del 10-oct-2026: todos los textos de dinero dicen «4 de cada 5
pesos» en la puerta, «te llegó completo» en los envíos y «lo ganado también se
gasta adentro» en vez de «balance de creador».

## Links rotos: el rescatador (`src/lib/rescate.ts`)

Todo lo que no se encuentra pasa por `rescatar(c)` antes de rendirse (la ruta
de sala cuando no hay sala, y `app.notFound` para todo lo demás). El orden va
de lo seguro a lo adivinado:

| Qué llega | Ejemplo | Qué pasa |
|---|---|---|
| Ruido de bots y archivos | `/wp-login.php`, `/.env`, `/x.png` | 404 de texto, sin tocar la base |
| API | `/api/no-existe` | 404 JSON |
| Query pegada a la ruta | `/ana&utm_source=qr`, `/ana%3Futm_source=qr` | 301 a `/ana?utm_source=qr` |
| URL completa pegada | `/https://video…/ana` | 301 a `/ana` |
| Extensión o segmentos de sobra | `/ana.html`, `/ana/chat` | 301 a `/ana` |
| Prefijos | `/sala/ana`, `/live/ana`, `/@ana` | 301 a `/ana` |
| Ceros a la izquierda | `/007` | 301 a `/7` |
| Dirección anterior de la sala | `/numero-viejo` | 301 a la actual (un salto) |
| Página por nombre o sinónimo | `/wallet`, `/app/stats`, `/ayuda`, `/recibos`, `/app` | 302 a la página |
| Recibo con la liga cortada | `/recibo/roto` | 302 a Transacciones |
| Texto pegado al link | `/ana-te-espero` | 302 + aviso |
| Sin guiones | `/anacreadora` | 302 + aviso |
| El nombre de la persona | `/Ana Creadora` | 302 + aviso |
| Un dedazo o letras volteadas | `/ana-cradora` | 302 + aviso |
| Link cortado | `/ana-crea` | 302 + aviso |
| Dos salas posibles, o ninguna | `/pasteleria-sul` | página con las parecidas y una caja para escribir el nombre |

Reglas que no se rompen: **solo se adivina si hay UNA sala posible**; los
**números nunca se adivinan** (`/12` y `/13` son personas distintas); una sala
real siempre gana sobre un sinónimo; lo adivinado es 302 (nunca se graba para
siempre en el navegador) y la sala avisa «El link decía “…”. Te trajimos a la
sala de X» (cookie `vr_trajo`, 30 s): es dinero y nadie debe pagarle a quien
no buscaba. La forma canónica solo redirige si existe (antes `/ana.html`
mandaba para siempre a `/ana-html`).

Bitácora: lo adivinado y lo no resuelto queda en `enlaces_rotos` (path, veces,
a dónde se mandó). La casa la ve en `GET /api/admin/enlaces-rotos` y recibe un
correo los viernes si hubo links sin resolver esa semana; con eso se agrega un
sinónimo a `PAGINAS`/`RAIZ` o se corrige un QR impreso. Pruebas:
`test/rescate.spec.ts`.

## Materiales para compartir (`/app/materiales`)

Una página que se comporta como modal (la ✕ o Esc regresan a donde estabas;
si llegaste directo, al monedero o al inicio) con todo lo que alguien
necesita para publicar su sala o recomendar Video Room: **60 diseños** y
**47 textos**, personalizados al instante y descargables.

- **Tres archivos:** `public/materiales-catalogo.js` (ahí se editan las
  piezas y los textos), `public/materiales-motor.js` (el dibujo) y
  `public/materiales.js` (la página). Sin servidor: todo se pinta en un
  `<canvas>` del navegador con la tipografía de la casa, a tamaño real.
- **Formatos:** vertical 9:16 (TikTok, Reels, Shorts, Historias, Estados),
  cuadrado 1:1, retrato 4:5, portada de YouTube 16:9, banner de YouTube
  (contenido dentro de la zona segura), portada de Facebook, imagen de link,
  carta para imprimir, tarjeta de presentación y calcomanía (PNG transparente).
- **Arquetipos** (formas de acomodar): `hero`, `tipo`, `lista`, `precio`,
  `cita`, `bloque`, `anuncio`, `qrGrande`, `retrato`, `perfil`, `portada`,
  `banda`, `impreso`, `tarjeta`, `sticker`. Una pieza = arquetipo + paleta
  (`noche`, `vivo`, `oro`, `verde`, `claro`, `papel`) + contenido. El texto se
  ajusta solo (`texto()` baja el tamaño hasta caber; `*así*` = color de acento).
- **Personalizar:** nombre, tema y cuándo (campos), y palancas «Mi nombre y
  mi link», «Mi código QR», «Mi foto» (prendidas por defecto) y «Medir de
  dónde llegan». Estilo: Original / Noche / Claro / Verde. Las piezas marcadas
  `vr:true` hablan de Video Room: llevan el dominio, y si la persona está
  personalizada dicen «Te lo recomienda X» y su QR lleva
  `utm_campaign=de-<su-sala>` (queda registrado quién trajo a quién).
- **Por pieza:** descargar PNG o JPG, compartir (hoja nativa del teléfono, con
  el texto ya copiado), copiar imagen, copiar el texto sugerido. **Por vista:**
  un zip con todas las imágenes y un `.txt` con los textos (zip sin
  compresión hecho a mano, sin librerías).
- **Medición sin estorbar:** el QR de cada pieza lleva
  `utm_source=<red>&utm_medium=material&utm_content=<id>`; los links visibles
  en los textos usan el alias corto `?de=<red>` (lo entiende `lib/utm.ts` y
  `utm.js` como `utm_source`). En pantalla el link se ve limpio.
- **Se llega desde:** monedero («🎨 Materiales para compartir» junto al QR y
  en la barra), el inicio, FAQ, Manifiesto, Estadísticas y Transacciones;
  `/materiales`, `/kit`, `/app/portadas`… redirigen aquí (rescatador).
  `#tiktok`, `#youtube`, `#textos`… abren esa vista.
- **Para agregar una pieza:** una línea en `PIEZAS` (id, formato, arquetipo,
  paleta, redes, contenido, texto sugerido). Para probar en consola:
  `__mat.ponerFoto(url)`, `MaterialesMotor.aBlob(pieza, __mat.datos())`.

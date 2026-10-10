// RLR · Materiales para compartir: el catálogo. Aquí se editan las piezas
// (qué dice cada diseño) y los textos para copiar. El motor que las pinta
// vive en materiales.js.
//
// Marcadores en los textos: {nombre} {link} {tema} {cuando} {precio}.
//   *palabra*  = en el color de acento      \n = salto de línea forzado
// Cada pieza: id · n (nombre) · f (formato) · a (arquetipo) · p (paleta) ·
//   redes (dónde sirve; la primera es la principal) · c (contenido) ·
//   tx (texto sugerido para publicarla) · vr:true = habla de Video Room,
//   no de la sala de la persona.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;

  const FORMATOS = {
    V: { w: 1080, h: 1920, n: "Vertical 9:16", para: "TikTok, Reels, Shorts, Historias y Estados" },
    C: { w: 1080, h: 1080, n: "Cuadrado 1:1", para: "Publicaciones de Instagram y Facebook, grupos de WhatsApp" },
    R: { w: 1080, h: 1350, n: "Retrato 4:5", para: "Publicaciones de Instagram y Facebook (ocupan más pantalla)" },
    P: { w: 1280, h: 720, n: "Portada 16:9", para: "Portadas de YouTube y de transmisiones" },
    BY: { w: 2560, h: 1440, n: "Banner de YouTube", para: "El arte de tu canal (lo importante va al centro)" },
    BF: { w: 1640, h: 624, n: "Portada de Facebook", para: "La portada de tu perfil o página" },
    BL: { w: 1200, h: 630, n: "Imagen de link", para: "Para acompañar tu link en Facebook, X o un blog" },
    IC: { w: 2550, h: 3300, n: "Carta para imprimir", para: "Tu puerta, tu mostrador, tu consultorio" },
    IT: { w: 1050, h: 600, n: "Tarjeta de presentación", para: "Imprenta: 9 × 5 cm" },
    IS: { w: 1200, h: 1200, n: "Calcomanía", para: "Redonda, con fondo transparente" },
  };

  const REDES = [
    { id: "tiktok", n: "TikTok y Reels", corto: "TikTok" },
    { id: "instagram", n: "Instagram", corto: "Instagram" },
    { id: "facebook", n: "Facebook", corto: "Facebook" },
    { id: "youtube", n: "YouTube", corto: "YouTube" },
    { id: "whatsapp", n: "WhatsApp", corto: "WhatsApp" },
    { id: "imprimir", n: "Para imprimir", corto: "impreso" },
  ];

  const VERT = ["tiktok", "instagram", "facebook", "whatsapp", "youtube"];
  const CUAD = ["instagram", "facebook", "whatsapp", "tiktok"];
  const RETR = ["instagram", "facebook"];
  const PASOS = ["Toca el link o escanea el QR", "Ingresa con Google en un toque", "Entra y platicamos en vivo"];

  const PIEZAS = [
    // ── Vertical 9:16 · tu sala ──────────────────────────────────────────
    { id: "V01", n: "Estoy en vivo", f: "V", a: "hero", p: "vivo", redes: VERT, tx: "vivo", c: { k: "EN VIVO", vivo: true, t: "Estoy en vivo *ahora*", s: "Entra a mi sala. Nada se graba." } },
    { id: "V02", n: "Próximo en vivo", f: "V", a: "anuncio", p: "noche", redes: VERT, tx: "anuncio", c: { k: "PRÓXIMO EN VIVO" } },
    { id: "V03", n: "Escanea y entra", f: "V", a: "qrGrande", p: "claro", redes: VERT, tx: "qr", c: { k: "EN VIVO CONMIGO", t: "Escanea y entra a mi sala" } },
    { id: "V04", n: "Mi sala privada", f: "V", a: "retrato", p: "noche", redes: VERT, tx: "sala", c: { t: "Mi sala privada de video", s: "Entras, platicamos en vivo y nada se graba." } },
    { id: "V05", n: "No se graba", f: "V", a: "cita", p: "verde", redes: VERT, tx: "nograba", c: { t: "Lo que platiquemos aquí *no se graba*." } },
    { id: "V06", n: "Mi hora", f: "V", a: "precio", p: "oro", redes: VERT, tx: "precio", c: { k: "EN VIVO, UNO A UNO", n: "{precio}", t: "una hora conmigo, en vivo", s: "Sales y vuelves cuando quieras durante tu hora." } },
    { id: "V07", n: "Tres pasos", f: "V", a: "lista", p: "noche", redes: VERT, tx: "pasos", c: { k: "ASÍ DE FÁCIL", t: "Entra a mi sala en 3 pasos", b: PASOS } },
    { id: "V08", n: "Pregúntame", f: "V", a: "tipo", p: "verde", redes: VERT, tx: "pregunta", c: { t: "PREGÚN\nTAME\n*EN VIVO*" } },
    { id: "V09", n: "Avísame", f: "V", a: "bloque", p: "noche", redes: VERT, tx: "avisame", c: { k: "QUE NO SE TE PASE", t: "Activa «Avísame» en mi sala", s: "Te llega un correo en el momento en que entre en vivo." } },
    { id: "V10", n: "Gracias", f: "V", a: "hero", p: "oro", redes: VERT, tx: "gracias", c: { k: "GRACIAS", t: "Gracias por entrar *hoy*", s: "Nos vemos en la próxima. Activa «Avísame» para enterarte." } },
    { id: "V11", n: "Te espero", f: "V", a: "tipo", p: "noche", redes: VERT, tx: "anuncio", c: { t: "TE ESPERO\nEN MI SALA\n*{cuando}*" } },
    { id: "V12", n: "Membresía", f: "V", a: "lista", p: "oro", redes: VERT, tx: "membresia", c: { k: "MEMBRESÍA", t: "Entra todo el mes, las veces que quieras", b: ["Un solo pago, 30 días", "Sin pagar cada hora", "Me apoyas directo a mí"] } },
    { id: "V13", n: "Llega completo", f: "V", a: "hero", p: "noche", redes: VERT, tx: "completo", c: { k: "SIN COMISIÓN", t: "Lo que me mandes *me llega completo*", s: "Cada peso que mandas adentro de la sala es para mí." } },
    // ── Vertical 9:16 · Video Room ───────────────────────────────────────
    { id: "V14", n: "Comparte. Transmite. Cobra.", f: "V", a: "tipo", p: "noche", vr: true, redes: VERT, tx: "vr_tagline", c: { t: "COMPARTE\nTU LINK.\nTRANSMITE.\n*COBRA.*" } },
    { id: "V15", n: "Te paga", f: "V", a: "hero", p: "verde", vr: true, redes: VERT, tx: "vr_paga", c: { k: "VIDEO ROOM", t: "Tu sala de video donde cada persona que entra *te paga*" } },
    { id: "V16", n: "4 de cada 5", f: "V", a: "precio", p: "noche", vr: true, redes: VERT, tx: "vr_45", c: { k: "TÚ PONES EL PRECIO", n: "4 de 5", t: "pesos de cada entrada son tuyos", s: "Y lo que te mandan adentro te llega completo." } },
    { id: "V17", n: "Nunca se graba", f: "V", a: "cita", p: "noche", vr: true, redes: VERT, tx: "vr_nograba", c: { t: "Nada se graba. *Nunca.*", firma: "Video Room" } },
    { id: "V18", n: "Cobra por tu tiempo", f: "V", a: "lista", p: "claro", vr: true, redes: VERT, tx: "vr_tiempo", c: { k: "SI ENSEÑAS, ASESORAS O TOCAS", t: "Cobra por tu tiempo en vivo", b: ["Tú pones el precio de tu hora", "Lo que te mandan llega completo", "Retiras a tu banco cuando quieras"] } },
    { id: "V19", n: "30 segundos", f: "V", a: "bloque", p: "verde", vr: true, redes: VERT, tx: "vr_30", c: { k: "GRATIS", t: "Crea tu sala en 30 segundos", s: "Sin seguidores mínimos. Sin requisitos. Sin esperar a fin de mes." } },
    { id: "V20", n: "Sin algoritmo", f: "V", a: "hero", p: "noche", vr: true, redes: VERT, tx: "vr_algoritmo", c: { k: "SIN PUBLICIDAD", t: "Tu público *te paga a ti*, no a un algoritmo" } },

    // ── Cuadrado 1:1 ─────────────────────────────────────────────────────
    { id: "C01", n: "Estoy en vivo", f: "C", a: "hero", p: "vivo", redes: CUAD, tx: "vivo", c: { k: "EN VIVO", vivo: true, t: "Estoy en vivo *ahora*", s: "Entra a mi sala. Nada se graba." } },
    { id: "C02", n: "Próximo en vivo", f: "C", a: "anuncio", p: "noche", redes: CUAD, tx: "anuncio", c: { k: "PRÓXIMO EN VIVO" } },
    { id: "C03", n: "Escanea y entra", f: "C", a: "qrGrande", p: "claro", redes: CUAD, tx: "qr", c: { t: "Escanea y entra a mi sala" } },
    { id: "C04", n: "Mi sala privada", f: "C", a: "retrato", p: "noche", redes: CUAD, tx: "sala", c: { t: "Mi sala privada de video", s: "En vivo. Nada se graba." } },
    { id: "C05", n: "Mi hora", f: "C", a: "precio", p: "oro", redes: CUAD, tx: "precio", c: { k: "EN VIVO, UNO A UNO", n: "{precio}", t: "una hora conmigo, en vivo" } },
    { id: "C06", n: "No se graba", f: "C", a: "cita", p: "verde", redes: CUAD, tx: "nograba", c: { t: "Lo que platiquemos aquí *no se graba*." } },
    { id: "C07", n: "Tres pasos", f: "C", a: "lista", p: "noche", redes: CUAD, tx: "pasos", c: { t: "Entra a mi sala en 3 pasos", b: PASOS } },
    { id: "C08", n: "Pregúntame", f: "C", a: "tipo", p: "verde", redes: CUAD, tx: "pregunta", c: { t: "PREGÚNTAME\n*EN VIVO*" } },
    { id: "C09", n: "Gracias", f: "C", a: "hero", p: "oro", redes: CUAD, tx: "gracias", c: { k: "GRACIAS", t: "Gracias por entrar *hoy*", s: "Nos vemos en la próxima." } },
    { id: "C10", n: "Avísame", f: "C", a: "bloque", p: "noche", redes: CUAD, tx: "avisame", c: { t: "Activa «Avísame» en mi sala", s: "Y te llega un correo cuando entre en vivo." } },
    { id: "C11", n: "Comparte. Transmite. Cobra.", f: "C", a: "tipo", p: "noche", vr: true, redes: CUAD, tx: "vr_tagline", c: { t: "COMPARTE TU LINK.\nTRANSMITE.\n*COBRA.*" } },
    { id: "C12", n: "Te paga", f: "C", a: "hero", p: "verde", vr: true, redes: CUAD, tx: "vr_paga", c: { k: "VIDEO ROOM", t: "Tu sala de video donde cada persona que entra *te paga*" } },
    { id: "C13", n: "4 de cada 5", f: "C", a: "precio", p: "noche", vr: true, redes: CUAD, tx: "vr_45", c: { n: "4 de 5", t: "pesos de cada entrada son tuyos", s: "Lo que te mandan adentro llega completo." } },
    { id: "C14", n: "Nunca se graba", f: "C", a: "cita", p: "noche", vr: true, redes: CUAD, tx: "vr_nograba", c: { t: "Nada se graba. *Nunca.*", firma: "Video Room" } },
    { id: "C15", n: "Cobra por tu tiempo", f: "C", a: "lista", p: "claro", vr: true, redes: CUAD, tx: "vr_tiempo", c: { t: "Cobra por tu tiempo en vivo", b: ["Tú pones el precio de tu hora", "Lo que te mandan llega completo", "Retiras a tu banco cuando quieras"] } },
    { id: "C16", n: "30 segundos", f: "C", a: "bloque", p: "verde", vr: true, redes: CUAD, tx: "vr_30", c: { k: "GRATIS", t: "Crea tu sala en 30 segundos", s: "Sin seguidores mínimos. Sin requisitos." } },
    { id: "X01", n: "Foto de perfil «en vivo»", f: "C", a: "perfil", p: "vivo", redes: ["instagram", "tiktok", "facebook", "whatsapp", "youtube"], tx: "vivo", c: { k: "EN VIVO" }, pide: "foto" },

    // ── Retrato 4:5 ──────────────────────────────────────────────────────
    { id: "R01", n: "Mi sala privada", f: "R", a: "retrato", p: "noche", redes: RETR, tx: "sala", c: { t: "Mi sala privada de video", s: "Entras, platicamos en vivo y nada se graba." } },
    { id: "R02", n: "Próximo en vivo", f: "R", a: "anuncio", p: "oro", redes: RETR, tx: "anuncio", c: { k: "PRÓXIMO EN VIVO" } },
    { id: "R03", n: "Estoy en vivo", f: "R", a: "hero", p: "vivo", redes: RETR, tx: "vivo", c: { k: "EN VIVO", vivo: true, t: "Estoy en vivo *ahora*", s: "Entra a mi sala. Nada se graba." } },
    { id: "R04", n: "Tres pasos", f: "R", a: "lista", p: "claro", redes: RETR, tx: "pasos", c: { k: "ASÍ DE FÁCIL", t: "Entra a mi sala en 3 pasos", b: PASOS } },
    { id: "R05", n: "Comparte. Transmite. Cobra.", f: "R", a: "tipo", p: "verde", vr: true, redes: RETR, tx: "vr_tagline", c: { t: "COMPARTE\nTU LINK.\nTRANSMITE.\n*COBRA.*" } },
    { id: "R07", n: "No se graba", f: "R", a: "cita", p: "oro", redes: RETR, tx: "nograba", c: { t: "Lo que platiquemos aquí *no se graba*." } },
    { id: "R06", n: "Sin algoritmo", f: "R", a: "hero", p: "noche", vr: true, redes: RETR, tx: "vr_algoritmo", c: { k: "SIN PUBLICIDAD", t: "Tu público *te paga a ti*, no a un algoritmo" } },

    // ── Portadas de YouTube 16:9 ─────────────────────────────────────────
    { id: "P01", n: "En vivo hoy", f: "P", a: "portada", p: "vivo", redes: ["youtube", "facebook"], tx: "yt_vivo", c: { k: "EN VIVO", vivo: true, t: "EN VIVO\n*HOY*" } },
    { id: "P02", n: "Preguntas y respuestas", f: "P", a: "portada", p: "noche", redes: ["youtube", "facebook"], tx: "yt_preguntas", c: { k: "EN VIVO", vivo: true, t: "PREGUNTAS\nY *RESPUESTAS*" } },
    { id: "P03", n: "Clase en vivo", f: "P", a: "portada", p: "oro", redes: ["youtube", "facebook"], tx: "yt_clase", c: { k: "EN VIVO", vivo: true, t: "CLASE\n*EN VIVO*" }, lado: "izq" },
    { id: "P04", n: "Consulta en vivo", f: "P", a: "portada", p: "verde", redes: ["youtube", "facebook"], tx: "yt_consulta", c: { k: "UNO A UNO", t: "CONSULTA\nEN VIVO" } },
    { id: "P05", n: "Tu tema", f: "P", a: "portada", p: "noche", redes: ["youtube", "facebook"], tx: "yt_vivo", c: { k: "EN VIVO", vivo: true, t: "{tema}" }, lado: "izq" },
    { id: "P06", n: "Solo hoy", f: "P", a: "portada", p: "claro", redes: ["youtube", "facebook"], tx: "yt_vivo", c: { k: "NADA SE GRABA", t: "SOLO *HOY*\nSOLO EN VIVO" } },
    { id: "P07", n: "Cobra por tu tiempo", f: "P", a: "portada", p: "noche", vr: true, redes: ["youtube", "facebook"], tx: "vr_tiempo", c: { k: "VIDEO ROOM", t: "COBRA POR\nTU TIEMPO\n*EN VIVO*" } },
    { id: "P08", n: "Nada se graba", f: "P", a: "portada", p: "verde", vr: true, redes: ["youtube", "facebook"], tx: "vr_nograba", c: { k: "VIDEO ROOM", t: "NADA\nSE GRABA" }, lado: "izq" },

    // ── Banners ──────────────────────────────────────────────────────────
    { id: "B01", n: "Banner de tu canal", f: "BY", a: "banda", p: "noche", redes: ["youtube"], tx: "bio", c: { t: "En vivo en mi sala privada", s: "Nada se graba" } },
    { id: "B02", n: "Portada de tu perfil", f: "BF", a: "banda", p: "noche", redes: ["facebook"], tx: "bio", c: { t: "En vivo en mi sala privada", s: "Nada se graba" } },
    { id: "B03", n: "Imagen para tu link", f: "BL", a: "banda", p: "verde", redes: ["facebook", "whatsapp", "instagram"], tx: "sala", c: { t: "Entra a mi sala en vivo", s: "Nada se graba" } },
    { id: "B04", n: "Banner de Video Room", f: "BY", a: "banda", p: "verde", vr: true, redes: ["youtube"], tx: "vr_tagline", c: { t: "Comparte tu link. Transmite. Cobra.", s: "Tu sala de video en vivo" } },

    // ── Para imprimir ────────────────────────────────────────────────────
    { id: "I01", n: "Cartel con tu QR", f: "IC", a: "impreso", p: "papel", redes: ["imprimir"], tx: "qr", c: { k: "EN VIVO CONMIGO", t: "Escanea y entra a mi sala", s: "Apunta la cámara de tu teléfono al código." } },
    { id: "I02", n: "Letrero de mostrador", f: "IC", a: "impreso", p: "papel", redes: ["imprimir"], tx: "pregunta", c: { k: "¿TIENES UNA DUDA?", t: "Entra en vivo conmigo", s: "Escanea el código y platicamos por video. Nada se graba." } },
    { id: "I03", n: "Tarjeta de presentación", f: "IT", a: "tarjeta", p: "noche", redes: ["imprimir"], tx: "bio", c: { s: "En vivo, en mi sala privada de video" } },
    { id: "I04", n: "Calcomanía", f: "IS", a: "sticker", p: "papel", redes: ["imprimir"], tx: "qr", c: { t: "ESCANEA Y ENTRA EN VIVO" } },
  ];

  // ── Textos sugeridos para publicar cada pieza (clave tx) ────────────────
  const CAPTIONS = {
    vivo: "🔴 Estoy en vivo ahora mismo en mi sala privada. Entra, platicamos y nada se graba.\n\n👉 {link}",
    anuncio: "📅 {cuando}: nos vemos en vivo en mi sala{temaDe}. Entra con un toque; nada se graba.\n\nActiva «Avísame» y te llega un correo cuando abra 👉 {link}",
    qr: "Escanea el código o toca el link y entras a mi sala de video en vivo. Nada se graba.\n\n👉 {link}",
    sala: "Esta es mi sala privada de video. Cuando estoy en vivo, entras, platicamos y nada se graba.\n\n👉 {link}",
    nograba: "Lo que platiquemos en mi sala no se graba. Ni un segundo. Por eso se puede hablar en confianza.\n\n👉 {link}",
    precio: "Una hora conmigo en vivo: {precio}. Entras, sales y vuelves cuando quieras durante tu hora. Nada se graba.\n\n👉 {link}",
    pasos: "Entrar a mi sala es así de fácil:\n1. Toca el link\n2. Ingresa con Google en un toque\n3. Entra y platicamos en vivo\n\n👉 {link}",
    pregunta: "¿Tienes una duda? Pregúntamela en vivo, de frente, en mi sala. Nada se graba.\n\n👉 {link}",
    avisame: "Para que no se te pase: entra a mi sala y activa «Avísame». Te llega un correo en el momento en que entre en vivo.\n\n👉 {link}",
    gracias: "Gracias a quienes entraron hoy 🙌 Nada quedó grabado, como siempre. Si quieres enterarte del próximo, activa «Avísame».\n\n👉 {link}",
    membresia: "Si quieres entrar todo el mes las veces que quieras, en mi sala hay membresía: un solo pago y entras siempre.\n\n👉 {link}",
    completo: "Dato: lo que me mandes dentro de mi sala me llega completo, sin comisión. Gracias por apoyar directo.\n\n👉 {link}",
    bio: "🔴 En vivo en mi sala privada · nada se graba\n👉 {linkLimpio}",
    yt_vivo: "{temaO} · EN VIVO en mi sala privada 👉 {link}",
    yt_preguntas: "Preguntas y respuestas EN VIVO: entra a mi sala y pregúntame de frente 👉 {link}",
    yt_clase: "Clase EN VIVO{temaDe}: entra a mi sala, nada se graba 👉 {link}",
    yt_consulta: "Consulta EN VIVO, uno a uno, en mi sala privada 👉 {link}",
    vr_tagline: "Comparte tu link. Transmite. Cobra. 🔴\n\nVideo Room es una sala de video en vivo donde cada persona que entra te paga. Sin seguidores mínimos.\n\n👉 {link}",
    vr_paga: "Encontré una sala de video en vivo donde cada persona que entra te paga a ti, al instante. Se llama Video Room.\n\n👉 {link}",
    vr_45: "En Video Room tú pones el precio de tu hora y 4 de cada 5 pesos son tuyos. Lo que te mandan adentro te llega completo.\n\n👉 {link}",
    vr_nograba: "Video en vivo donde nada se graba. Nunca. Así se puede hablar en confianza.\n\n👉 {link}",
    vr_tiempo: "Si enseñas, asesoras o tocas: cobra por tu tiempo en vivo. Tú pones el precio, te pagan al entrar y retiras a tu banco cuando quieras.\n\n👉 {link}",
    vr_30: "Crear tu sala de video con cobro toma 30 segundos y es gratis. Sin seguidores mínimos, sin requisitos.\n\n👉 {link}",
    vr_algoritmo: "Sin publicidad y sin algoritmo de por medio: en Video Room tu público te paga a ti.\n\n👉 {link}",
  };

  // ── Textos para copiar, por red ─────────────────────────────────────────
  const TEXTOS = [
    { red: "todas", grupo: "Para tu biografía", items: [
      { t: "Bio corta", x: "🔴 En vivo en mi sala privada\nNada se graba\n👇 Entra aquí" },
      { t: "Bio con precio", x: "🔴 En vivo, uno a uno · {precio} la hora\nNada se graba\n👇 Mi sala" },
      { t: "Bio de servicio", x: "{temaO}\nConsulta en vivo por video · nada se graba\n👇 Entra a mi sala" },
      { t: "El link para tu bio", x: "{linkLimpio}" },
      { t: "Una línea", x: "Estoy a un link: {linkLimpio}" },
    ] },
    { red: "tiktok", grupo: "TikTok y Reels · descripción del video", items: [
      { t: "Voy a estar en vivo", x: "{cuando} voy a estar en vivo en mi sala privada{temaDe}. Entras con un toque y nada se graba. Link en mi perfil 🔴 #envivo #videoroom" },
      { t: "Estoy en vivo", x: "Estoy en vivo AHORITA en mi sala privada 🔴 Link en mi perfil. Nada se graba. #envivo #videoroom" },
      { t: "Qué es mi sala", x: "Les enseño mi sala privada de video: entran, platicamos en vivo y nada se graba. El link está en mi perfil 👆 #videoroom" },
      { t: "Pregúntame", x: "¿Tienes una duda? Pregúntamela en vivo, de frente. Link en mi perfil 🔴 #preguntasyrespuestas #envivo" },
      { t: "Gracias", x: "Gracias a quienes entraron hoy 🙌 Nada quedó grabado. Activen «Avísame» en mi sala para el próximo. #envivo" },
      { t: "Cómo cobro por mi tiempo", x: "Así cobro por mi tiempo en vivo: comparto mi link, entran y me pagan al entrar. Sin seguidores mínimos. #videoroom #emprender" },
    ] },
    { red: "tiktok", grupo: "TikTok y Reels · guiones para grabar (15 a 30 segundos)", items: [
      { t: "Guion 1 · «Estoy a un link»", x: "TOMA 1 (a cámara, 3 s): «¿Quieres platicar conmigo en vivo?»\nTOMA 2 (pantalla de tu sala, 5 s): «Esta es mi sala privada de video.»\nTOMA 3 (a cámara, 5 s): «Entras con un toque, platicamos, y nada se graba.»\nTOMA 4 (señalas arriba, 3 s): «El link está en mi perfil.»\nTEXTO EN PANTALLA: {linkLimpio}" },
      { t: "Guion 2 · «Nada se graba»", x: "TOMA 1 (a cámara, 3 s): «Lo que te voy a decir en vivo no lo vas a encontrar grabado.»\nTOMA 2 (5 s): «En mi sala nada se graba. Ni un segundo.»\nTOMA 3 (5 s): «Por eso ahí sí contesto lo que aquí no puedo.»\nTOMA 4 (3 s): «{cuando}. Link en mi perfil.»\nTEXTO EN PANTALLA: Nada se graba · {linkLimpio}" },
      { t: "Guion 3 · «Tres pasos»", x: "TOMA 1 (3 s): «Entrar a mi sala toma diez segundos.»\nTOMA 2 (pantalla, 4 s): «Uno: tocas el link.»\nTOMA 3 (pantalla, 4 s): «Dos: ingresas con Google.»\nTOMA 4 (pantalla, 4 s): «Tres: ya estás adentro, en vivo conmigo.»\nTEXTO EN PANTALLA: {linkLimpio}" },
      { t: "Guion 4 · «Pregúntame»", x: "TOMA 1 (3 s): «Me preguntan esto todos los días…» (di la pregunta)\nTOMA 2 (5 s): «La respuesta corta no existe. Depende de tu caso.»\nTOMA 3 (5 s): «Por eso abrí una sala en vivo: entras y lo vemos con tu caso.»\nTOMA 4 (3 s): «Link en mi perfil. Nada se graba.»" },
      { t: "Guion 5 · para recomendar Video Room", x: "TOMA 1 (3 s): «Si sabes algo que la gente te pregunta, puedes cobrar por tu tiempo en vivo.»\nTOMA 2 (pantalla, 5 s): «En Video Room creas tu sala en 30 segundos y te dan un link.»\nTOMA 3 (5 s): «Cada persona que entra te paga al entrar. 4 de cada 5 pesos son tuyos.»\nTOMA 4 (3 s): «Y lo que te mandan adentro te llega completo.»\nTEXTO EN PANTALLA: video.capitaltorreon.com" },
    ] },
    { red: "instagram", grupo: "Instagram · pie de foto", items: [
      { t: "Anuncio", x: "📅 {cuando}: en vivo en mi sala privada{temaDe}.\n\nEntras con un toque, platicamos de frente y nada se graba.\n\n🔗 Link en mi perfil\n\n#envivo #videoroom" },
      { t: "Mi sala", x: "Esta es mi sala privada de video 🔴\n\nCuando estoy en vivo, entras, platicamos y nada se graba. Sin algoritmo de por medio.\n\n🔗 Link en mi perfil" },
      { t: "Historia con sticker de link", x: "🔴 EN VIVO AHORA\nToca aquí y entra 👇\n{link}" },
      { t: "Gracias", x: "Gracias a quienes entraron hoy 🙌\n\nNada quedó grabado, como siempre. Si quieres enterarte del próximo, entra a mi sala y activa «Avísame».\n\n🔗 Link en mi perfil" },
      { t: "Para recomendar Video Room", x: "Si enseñas, asesoras o tocas, puedes cobrar por tu tiempo en vivo.\n\nVideo Room te da una sala con tu link: quien entra, te paga al entrar. 4 de cada 5 pesos son tuyos y lo que te mandan adentro llega completo.\n\nvideo.capitaltorreon.com" },
    ] },
    { red: "facebook", grupo: "Facebook · publicación", items: [
      { t: "Anuncio", x: "📅 {cuando} voy a estar en vivo en mi sala privada{temaDe}.\n\nEs por video, de frente, y nada se graba. Para entrar solo tocas el link e ingresas con Google.\n\n👉 {link}" },
      { t: "Estoy en vivo", x: "🔴 Estoy en vivo ahora mismo. Entra a mi sala y platicamos; nada se graba.\n\n👉 {link}" },
      { t: "Qué es y cómo entrar", x: "Me han preguntado cómo funciona mi sala:\n\n• Es una sala de video privada, en vivo.\n• Tocas el link e ingresas con Google en un toque.\n• Tu hora empieza cuando entras; puedes salir y volver.\n• Nada se graba.\n\n👉 {link}" },
      { t: "En un grupo de Facebook", x: "Hola a todos. Abrí una sala de video en vivo{temaDe} para platicar de frente y contestar dudas. Nada se graba. Si a alguien le sirve, aquí está el link:\n\n👉 {link}" },
    ] },
    { red: "youtube", grupo: "YouTube · títulos, descripción y comentario fijado", items: [
      { t: "Título 1", x: "🔴 EN VIVO: {temaO}" },
      { t: "Título 2", x: "Preguntas y respuestas EN VIVO | {nombreO}" },
      { t: "Título 3", x: "Te contesto en vivo (y nada se graba)" },
      { t: "Título 4", x: "{temaO}: lo que no puedo decir en un video" },
      { t: "Descripción", x: "Estoy en vivo en mi sala privada de video. Ahí platicamos de frente y nada se graba.\n\n🔴 Entra aquí: {link}\n\nCómo entrar:\n1. Toca el link\n2. Ingresa con Google en un toque\n3. Listo: estás en vivo conmigo\n\nActiva «Avísame» en la sala y te llega un correo cuando vuelva a abrir." },
      { t: "Comentario fijado", x: "🔴 Mi sala en vivo (nada se graba): {link}" },
      { t: "Publicación en la pestaña Comunidad", x: "📅 {cuando}: en vivo en mi sala privada{temaDe}. Nada se graba.\n👉 {link}" },
    ] },
    { red: "whatsapp", grupo: "WhatsApp · para tus grupos", items: [
      { t: "Invitación", x: "Hola 👋 {cuando} voy a estar en vivo en mi sala de video{temaDe}. Es de frente y nada se graba.\n\nPara entrar solo toquen el link:\n{link}" },
      { t: "Ya casi empiezo", x: "⏰ En unos minutos empiezo en vivo. Los espero aquí:\n{link}" },
      { t: "Ya estoy en vivo", x: "🔴 Ya estoy en vivo. Entren cuando quieran:\n{link}" },
      { t: "Recordatorio", x: "Recordatorio: {cuando} nos vemos en vivo. Si entran a la sala y activan «Avísame», les llega un correo cuando abra.\n{link}" },
      { t: "Gracias", x: "Gracias a quienes entraron hoy 🙌 Nada quedó grabado. Les aviso del próximo." },
      { t: "Para quien pregunta qué es", x: "Es una sala de video en vivo. Tocas el link, ingresas con Google y ya estás adentro. Tu hora empieza cuando entras y puedes salir y volver. Nada se graba.\n{link}" },
    ] },
    { red: "whatsapp", grupo: "WhatsApp · estados y respuestas rápidas", items: [
      { t: "Estado", x: "🔴 En vivo ahora. Entra 👉 {link}" },
      { t: "Estado de anuncio", x: "📅 {cuando} · en vivo en mi sala 👉 {link}" },
      { t: "Respuesta: «¿cómo entro?»", x: "Tocas este link, ingresas con Google en un toque y ya estás adentro: {link}" },
      { t: "Respuesta: «¿se graba?»", x: "No, nada se graba. Ni el video ni el chat: todo se borra al cerrar la sala." },
      { t: "Respuesta: «¿cuánto cuesta?»", x: "La entrada es de {precio} la hora. Tu hora empieza cuando entras y puedes salir y volver sin pagar otra vez." },
      { t: "Respuesta: «no pude entrar»", x: "Prueba otra vez con este link (copiado tal cual): {link}\nSi te pide ingresar, es con tu cuenta de Google, un toque." },
    ] },
    { red: "todas", grupo: "Etiquetas", items: [
      { t: "Generales", x: "#envivo #videoroom #enlinea #platicamos #nadasegraba" },
      { t: "Para quien enseña o asesora", x: "#clasesenlinea #asesoria #consultoria #preguntasyrespuestas #aprende" },
      { t: "Para quien toca o crea", x: "#musicaenvivo #sesionenvivo #detrasdecamaras #creadores" },
    ] },
  ];

  window.MaterialesCatalogo = { FORMATOS, REDES, PIEZAS, CAPTIONS, TEXTOS };
})();

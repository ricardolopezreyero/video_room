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

  // Países para los horarios. c = como se escribe en el diseño; h24 = en ese
  // país la hora se escribe en 24 horas («21:00»); en los demás, «9:00 pm».
  // El primero de la lista es el horario base por omisión.
  const ZONAS = [
    { id: "mx", n: "México (Centro · CDMX, Monterrey, Guadalajara)", c: "México", tz: "America/Mexico_City", b: "🇲🇽" },
    { id: "mx-cun", n: "México (Quintana Roo · Cancún)", c: "Cancún", tz: "America/Cancun", b: "🇲🇽" },
    { id: "mx-pac", n: "México (Pacífico · Sonora, Sinaloa, BCS)", c: "México Pacífico", tz: "America/Mazatlan", b: "🇲🇽" },
    { id: "mx-tij", n: "México (Noroeste · Tijuana)", c: "Tijuana", tz: "America/Tijuana", b: "🇲🇽" },
    { id: "us-e", n: "Estados Unidos (Este · Nueva York, Miami)", c: "EE. UU. Este", tz: "America/New_York", b: "🇺🇸" },
    { id: "us-c", n: "Estados Unidos (Centro · Texas, Chicago)", c: "EE. UU. Centro", tz: "America/Chicago", b: "🇺🇸" },
    { id: "us-m", n: "Estados Unidos (Montaña · Denver)", c: "EE. UU. Montaña", tz: "America/Denver", b: "🇺🇸" },
    { id: "us-p", n: "Estados Unidos (Pacífico · Los Ángeles)", c: "EE. UU. Pacífico", tz: "America/Los_Angeles", b: "🇺🇸" },
    { id: "ca-e", n: "Canadá (Este · Toronto)", c: "Canadá Este", tz: "America/Toronto", b: "🇨🇦" },
    { id: "gt", n: "Guatemala", c: "Guatemala", tz: "America/Guatemala", b: "🇬🇹" },
    { id: "sv", n: "El Salvador", c: "El Salvador", tz: "America/El_Salvador", b: "🇸🇻" },
    { id: "hn", n: "Honduras", c: "Honduras", tz: "America/Tegucigalpa", b: "🇭🇳" },
    { id: "ni", n: "Nicaragua", c: "Nicaragua", tz: "America/Managua", b: "🇳🇮" },
    { id: "cr", n: "Costa Rica", c: "Costa Rica", tz: "America/Costa_Rica", b: "🇨🇷" },
    { id: "pa", n: "Panamá", c: "Panamá", tz: "America/Panama", b: "🇵🇦" },
    { id: "cu", n: "Cuba", c: "Cuba", tz: "America/Havana", b: "🇨🇺" },
    { id: "do", n: "República Dominicana", c: "Rep. Dominicana", tz: "America/Santo_Domingo", b: "🇩🇴" },
    { id: "pr", n: "Puerto Rico", c: "Puerto Rico", tz: "America/Puerto_Rico", b: "🇵🇷" },
    { id: "co", n: "Colombia", c: "Colombia", tz: "America/Bogota", b: "🇨🇴" },
    { id: "ve", n: "Venezuela", c: "Venezuela", tz: "America/Caracas", b: "🇻🇪" },
    { id: "ec", n: "Ecuador", c: "Ecuador", tz: "America/Guayaquil", b: "🇪🇨" },
    { id: "pe", n: "Perú", c: "Perú", tz: "America/Lima", b: "🇵🇪" },
    { id: "bo", n: "Bolivia", c: "Bolivia", tz: "America/La_Paz", b: "🇧🇴" },
    { id: "cl", n: "Chile", c: "Chile", tz: "America/Santiago", b: "🇨🇱", h24: true },
    { id: "ar", n: "Argentina", c: "Argentina", tz: "America/Argentina/Buenos_Aires", b: "🇦🇷", h24: true },
    { id: "uy", n: "Uruguay", c: "Uruguay", tz: "America/Montevideo", b: "🇺🇾", h24: true },
    { id: "py", n: "Paraguay", c: "Paraguay", tz: "America/Asuncion", b: "🇵🇾", h24: true },
    { id: "br", n: "Brasil (Brasilia · São Paulo)", c: "Brasil", tz: "America/Sao_Paulo", b: "🇧🇷", h24: true },
    { id: "es", n: "España (península)", c: "España", tz: "Europe/Madrid", b: "🇪🇸", h24: true },
    { id: "es-can", n: "España (Canarias)", c: "Canarias", tz: "Atlantic/Canary", b: "🇪🇸", h24: true },
    { id: "uk", n: "Reino Unido", c: "Reino Unido", tz: "Europe/London", b: "🇬🇧" },
    { id: "eu", n: "Europa central (Francia, Alemania, Italia)", c: "Europa central", tz: "Europe/Paris", b: "🇪🇺", h24: true },
  ];
  // Husos del navegador que no están tal cual en la lista → a cuál corresponden.
  const ZONA_DE_TZ = { "America/Monterrey": "mx", "America/Merida": "mx", "America/Chihuahua": "mx", "America/Bahia_Banderas": "mx", "America/Hermosillo": "mx-pac", "America/Buenos_Aires": "ar", "America/Argentina/Cordoba": "ar", "America/Argentina/Mendoza": "ar", "America/Detroit": "us-e", "America/Phoenix": "us-m", "Europe/Berlin": "eu", "Europe/Rome": "eu", "Europe/Amsterdam": "eu", "Europe/Brussels": "eu" };

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
    { id: "V21", n: "Horarios por país", f: "V", a: "horarios", p: "noche", redes: VERT, tx: "horarios", c: { k: "HORARIOS", t: "En vivo en mi sala" }, pide: "fecha" },
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
    { id: "C17", n: "Horarios por país", f: "C", a: "horarios", p: "noche", redes: CUAD, tx: "horarios", c: { k: "HORARIOS", t: "En vivo en mi sala" }, pide: "fecha" },
    { id: "X01", n: "Foto de perfil «en vivo»", f: "C", a: "perfil", p: "vivo", redes: ["instagram", "tiktok", "facebook", "whatsapp", "youtube"], tx: "vivo", c: { k: "EN VIVO" }, pide: "foto" },

    // ── Retrato 4:5 ──────────────────────────────────────────────────────
    { id: "R01", n: "Mi sala privada", f: "R", a: "retrato", p: "noche", redes: RETR, tx: "sala", c: { t: "Mi sala privada de video", s: "Entras, platicamos en vivo y nada se graba." } },
    { id: "R02", n: "Próximo en vivo", f: "R", a: "anuncio", p: "oro", redes: RETR, tx: "anuncio", c: { k: "PRÓXIMO EN VIVO" } },
    { id: "R03", n: "Estoy en vivo", f: "R", a: "hero", p: "vivo", redes: RETR, tx: "vivo", c: { k: "EN VIVO", vivo: true, t: "Estoy en vivo *ahora*", s: "Entra a mi sala. Nada se graba." } },
    { id: "R04", n: "Tres pasos", f: "R", a: "lista", p: "claro", redes: RETR, tx: "pasos", c: { k: "ASÍ DE FÁCIL", t: "Entra a mi sala en 3 pasos", b: PASOS } },
    { id: "R05", n: "Comparte. Transmite. Cobra.", f: "R", a: "tipo", p: "verde", vr: true, redes: RETR, tx: "vr_tagline", c: { t: "COMPARTE\nTU LINK.\nTRANSMITE.\n*COBRA.*" } },
    { id: "R08", n: "Horarios por país", f: "R", a: "horarios", p: "claro", redes: RETR, tx: "horarios", c: { k: "HORARIOS", t: "En vivo en mi sala" }, pide: "fecha" },
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
    // ── CAMPAÑA «Aquí todos ganan» ────────────────────────────────────────
    // Quince publicaciones, una por día, sobre el valor de Video Room para las
    // dos partes: quien transmite cobra por su tiempo; quien entra se lleva
    // conocimiento o un momento en vivo que no vuelve a existir. Todas en
    // vertical (también salen en video). `camp` las junta arriba de la galería
    // y `dia` es el orden sugerido.
    { id: "K01", dia: 1, camp: "ganan", n: "Aquí todos ganan", f: "V", a: "tipo", p: "noche", vr: true, redes: VERT, tx: "ca01", c: { t: "AQUÍ\nTODOS\n*GANAN.*" } },
    { id: "K02", dia: 2, camp: "ganan", n: "Tu tiempo ya vale", f: "V", a: "hero", p: "verde", vr: true, redes: VERT, tx: "ca02", c: { k: "VIDEO ROOM", t: "Tu tiempo ya vale. Ahora *te lo pagan*", s: "Una sala de video en vivo donde cada persona que entra te paga." } },
    { id: "K03", dia: 3, camp: "ganan", n: "Una sala, dos ganancias", f: "V", a: "lista", p: "claro", vr: true, redes: VERT, tx: "ca03", c: { k: "UNA SALA, DOS GANANCIAS", t: "Uno cobra. El otro se lleva lo que vino a buscar", b: ["Quien transmite cobra por su hora", "Quien entra recibe respuesta a su caso", "O vive un momento que no se repite"] } },
    { id: "K04", dia: 4, camp: "ganan", n: "Lo que sabes", f: "V", a: "cita", p: "noche", vr: true, redes: VERT, tx: "ca04", c: { t: "Lo que sabes le resuelve el mes a alguien. *Y a ti también.*", firma: "Video Room" } },
    { id: "K05", dia: 5, camp: "ganan", n: "Más que cien videos", f: "V", a: "hero", p: "noche", vr: true, redes: VERT, tx: "ca05", c: { k: "PARA QUIEN ENTRA", t: "Una hora con quien ya lo resolvió vale más que *cien videos*", s: "Preguntas tu caso y te contestan a ti." } },
    { id: "K06", dia: 6, camp: "ganan", n: "No va a existir otra vez", f: "V", a: "cita", p: "oro", vr: true, redes: VERT, tx: "ca06", c: { t: "Hay en vivos que no van a existir otra vez. *Este es uno.*", firma: "Video Room" } },
    { id: "K07", dia: 7, camp: "ganan", n: "Haz la cuenta", f: "V", a: "precio", p: "noche", vr: true, redes: VERT, tx: "ca07", c: { k: "HAZ LA CUENTA", n: "$800", t: "para ti, con diez personas a $100", s: "Una hora de tu tiempo. Tú pones el precio." } },
    { id: "K08", dia: 8, camp: "ganan", n: "No necesitas seguidores", f: "V", a: "bloque", p: "verde", vr: true, redes: VERT, tx: "ca08", c: { k: "SIN REQUISITOS", t: "No necesitas seguidores. Necesitas saber algo", s: "O cantar, o enseñar, o acompañar. Con eso alcanza." } },
    { id: "K09", dia: 9, camp: "ganan", n: "Ya pueden cobrar", f: "V", a: "lista", p: "noche", vr: true, redes: VERT, tx: "ca09", c: { k: "YA PUEDEN COBRAR POR SU TIEMPO", t: "El contador. La maestra. El músico.", b: ["Quien resuelve dudas de impuestos", "Quien da la clase de zumba", "Quien canta los viernes"] } },
    { id: "K10", dia: 10, camp: "ganan", n: "Tu sala es el negocio", f: "V", a: "hero", p: "vivo", vr: true, redes: VERT, tx: "ca10", c: { k: "PARA QUIEN YA TRANSMITE", t: "Tu en vivo gratis es el anuncio. *Tu sala es el negocio*", s: "Al terminar, invita a los que quieran seguir." } },
    { id: "K11", dia: 11, camp: "ganan", n: "Tu caso, no el de todos", f: "V", a: "bloque", p: "claro", vr: true, redes: VERT, tx: "ca11", c: { k: "PARA QUIEN ENTRA", t: "Pregunta tu caso. No el de todos", s: "En una sala chica sí te alcanzan a contestar. Y nada se graba." } },
    { id: "K12", dia: 12, camp: "ganan", n: "Estuviste o no estuviste", f: "V", a: "tipo", p: "vivo", vr: true, redes: VERT, tx: "ca12", c: { t: "ESTUVISTE\nO NO\n*ESTUVISTE.*" } },
    { id: "K13", dia: 13, camp: "ganan", n: "Un ingreso que no tenías", f: "V", a: "hero", p: "oro", vr: true, redes: VERT, tx: "ca13", c: { k: "TU CALIDAD DE VIDA", t: "Una hora a la semana. Un ingreso que *no tenías*", s: "Con lo que ya sabes hacer, desde tu teléfono." } },
    { id: "K14", dia: 14, camp: "ganan", n: "No existía. Ya existe.", f: "V", a: "cita", p: "verde", vr: true, redes: VERT, tx: "ca14", c: { t: "No existía una puerta para cobrar tu en vivo. *Ya existe.*", firma: "Video Room" } },
    { id: "K15", dia: 15, camp: "ganan", n: "Abre tu sala", f: "V", a: "bloque", p: "noche", vr: true, redes: VERT, tx: "ca15", c: { k: "GRATIS", t: "Abre tu sala en 30 segundos", s: "O entra a la de alguien que admiras. Aquí todos ganan." } },
  ];

  // ── Textos sugeridos para publicar cada pieza (clave tx) ────────────────
  const CAPTIONS = {
    // Campaña «Aquí todos ganan»: el texto de cada día.
    ca01: "Aquí todos ganan. 🔴\n\nQuien transmite cobra por su tiempo. Quien entra se lleva lo que vino a buscar: una respuesta, una clase o un momento en vivo que no se repite.\n\nEso es Video Room 👉 {link}",
    ca02: "Tu tiempo ya valía. Lo que no había era una forma sencilla de que te lo pagaran.\n\nVideo Room es una sala de video en vivo: compartes tu link, la gente entra y cada entrada te paga a ti.\n\n👉 {link}",
    ca03: "Una sala, dos ganancias.\n\n· Quien transmite cobra por su hora.\n· Quien entra recibe respuesta a su caso, o vive algo que no va a pasar otra vez.\n\nNadie pierde su tiempo 👉 {link}",
    ca04: "Eso que tú ya sabes hacer le resuelve el mes a alguien. Y cobrarlo te lo resuelve a ti.\n\nPon tu sala en Video Room y cobra por tu tiempo en vivo.\n\n👉 {link}",
    ca05: "Puedes ver cien videos sobre tu problema. O puedes pasar una hora con alguien que ya lo resolvió y preguntarle tu caso.\n\nPara eso es Video Room.\n\n👉 {link}",
    ca06: "Hay en vivos que no van a existir otra vez: nada se graba, no hay repetición y no hay resumen.\n\nO estás, o te lo cuentan.\n\n👉 {link}",
    ca07: "Haz la cuenta: diez personas a $100 la entrada son $1,000. De cada 5 pesos, 4 son tuyos: $800 por una hora de tu tiempo. Y lo que te manden adentro te llega completo.\n\nTú pones el precio 👉 {link}",
    ca08: "No necesitas miles de seguidores. Necesitas saber algo que a otra persona le sirve: enseñar, cantar, asesorar, acompañar.\n\nCon eso alcanza para abrir tu sala.\n\n👉 {link}",
    ca09: "El contador que resuelve dudas. La maestra de zumba. El músico de los viernes.\n\nLos tres ya pueden cobrar por su tiempo en vivo, con su propio link.\n\n👉 {link}",
    ca10: "Si ya haces en vivos gratis, ya tienes lo más difícil: gente que te ve.\n\nTu en vivo es el anuncio. Al terminar, invita a los que quieran seguir a tu sala. Ahí es donde cobras.\n\n👉 {link}",
    ca11: "En un en vivo con mil personas nadie contesta tu pregunta.\n\nEn una sala chica sí: preguntas tu caso, no el de todos. Y nada se graba, así que se puede hablar en confianza.\n\n👉 {link}",
    ca12: "Estuviste o no estuviste.\n\nEn Video Room nada se graba. Lo que pasa en la sala pasa una vez, con quienes entraron.\n\n👉 {link}",
    ca13: "Una hora a la semana, con lo que ya sabes hacer, desde tu teléfono.\n\nNo cambia tu vida de un día para otro. Sí te da un ingreso que no tenías, y es tuyo.\n\n👉 {link}",
    ca14: "Había redes para que te vieran. No había una puerta para cobrar tu tiempo en vivo, con tu precio y tu link.\n\nYa existe 👉 {link}",
    ca15: "Abrir tu sala toma 30 segundos y es gratis. Entrar a la de alguien que admiras, también es un toque.\n\nDe un lado o del otro, aquí todos ganan 👉 {link}",
    vivo: "🔴 Estoy en vivo ahora mismo en mi sala privada. Entra, platicamos y nada se graba.\n\n👉 {link}",
    anuncio: "📅 {cuando}: nos vemos en vivo en mi sala{temaDe}. Entra con un toque; nada se graba.{horariosLinea}\n\nActiva «Avísame» y te llega un correo cuando abra 👉 {link}",
    horarios: "🕗 ¿A qué hora en tu país?\n\n{horariosLista}\n\nNos vemos en vivo en mi sala{temaDe}. Nada se graba.\n\n👉 {link}",
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
    { red: "todas", camp: "ganan", grupo: "Campaña «Aquí todos ganan»", items: [
      { t: "Video Room · El manifiesto", x: "Aquí todos ganan.\n\nQuien sabe algo, lo comparte en vivo y cobra por su tiempo.\nQuien necesita algo, entra, pregunta su caso y se lleva la respuesta.\nY hay momentos que solo existen una vez: nada se graba.\n\nNo es otra red. Es una sala con puerta: tú pones el precio, tú compartes el link, y de cada 5 pesos de la entrada 4 son tuyos.\n\nSe llama Video Room 👉 {link}" },
      { t: "Video Room · Para quien transmite", x: "Si enseñas, asesoras, cantas o entrenas, tu tiempo en vivo ya vale.\n\n· Abres tu sala en 30 segundos, gratis\n· Tú pones el precio de la entrada\n· De cada 5 pesos, 4 son tuyos\n· Lo que te mandan adentro te llega completo\n· Retiras a tu banco\n\nNo necesitas seguidores mínimos ni esperar a fin de mes 👉 {link}" },
      { t: "Video Room · Para quien entra", x: "¿Por qué pagar por entrar a una sala?\n\n· Porque ahí sí contestan tu pregunta, no la de todos\n· Porque estás con la persona, en vivo, no con un video grabado\n· Porque nada se graba y puedes hablar en confianza\n· Porque hay momentos que no se repiten\n\nEntras con un toque y sales cuando quieras 👉 {link}" },
      { t: "Video Room · Guion de 30 segundos", x: "(A cámara, de pie, sin música)\n\nTe voy a decir algo que nadie te había dicho: tu tiempo en vivo se puede cobrar.\n\nYo abrí una sala en Video Room. Comparto mi link, la gente entra y cada entrada me paga a mí. De cada 5 pesos, 4 son míos.\n\nY quien entra no pierde: pregunta su caso y se lleva su respuesta. Nada se graba.\n\nAquí todos ganan. El link está en mi perfil.\n\n{link}" },
      { t: "Video Room · Calendario de 15 días", x: "Una publicación al día, en este orden:\n\n1. Aquí todos ganan\n2. Tu tiempo ya vale\n3. Una sala, dos ganancias\n4. Lo que sabes\n5. Más que cien videos\n6. No va a existir otra vez\n7. Haz la cuenta\n8. No necesitas seguidores\n9. Ya pueden cobrar\n10. Tu sala es el negocio\n11. Tu caso, no el de todos\n12. Estuviste o no estuviste\n13. Un ingreso que no tenías\n14. No existía. Ya existe.\n15. Abre tu sala\n\nDías 1 a 3: la idea. Días 4 a 9: para quien transmite. Días 5, 6, 11 y 12: para quien entra. Días 13 a 15: el cierre y la invitación." },
    ] },
    { red: "todas", grupo: "Para tu biografía", items: [
      { t: "Bio corta", x: "🔴 En vivo en mi sala privada\nNada se graba\n👇 Entra aquí" },
      { t: "Bio con precio", x: "🔴 En vivo, uno a uno · {precio} la hora\nNada se graba\n👇 Mi sala" },
      { t: "Bio de servicio", x: "{temaO}\nConsulta en vivo por video · nada se graba\n👇 Entra a mi sala" },
      { t: "El link para tu bio", x: "{linkLimpio}" },
      { t: "Una línea", x: "Estoy a un link: {linkLimpio}" },
    ] },
    { red: "tiktok", grupo: "TikTok y Reels · descripción del video", items: [
      { t: "Voy a estar en vivo", x: "{cuando} voy a estar en vivo en mi sala privada{temaDe}. Entras con un toque y nada se graba.{horariosLinea}\n\nLink en mi perfil 🔴 #envivo #videoroom" },
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
      { t: "Anuncio", x: "📅 {cuando}: en vivo en mi sala privada{temaDe}.{horariosLinea}\n\nEntras con un toque, platicamos de frente y nada se graba.\n\n🔗 Link en mi perfil\n\n#envivo #videoroom" },
      { t: "Mi sala", x: "Esta es mi sala privada de video 🔴\n\nCuando estoy en vivo, entras, platicamos y nada se graba. Sin algoritmo de por medio.\n\n🔗 Link en mi perfil" },
      { t: "Historia con sticker de link", x: "🔴 EN VIVO AHORA\nToca aquí y entra 👇\n{link}" },
      { t: "Gracias", x: "Gracias a quienes entraron hoy 🙌\n\nNada quedó grabado, como siempre. Si quieres enterarte del próximo, entra a mi sala y activa «Avísame».\n\n🔗 Link en mi perfil" },
      { t: "Para recomendar Video Room", x: "Si enseñas, asesoras o tocas, puedes cobrar por tu tiempo en vivo.\n\nVideo Room te da una sala con tu link: quien entra, te paga al entrar. 4 de cada 5 pesos son tuyos y lo que te mandan adentro llega completo.\n\nvideo.capitaltorreon.com" },
    ] },
    { red: "facebook", grupo: "Facebook · publicación", items: [
      { t: "Anuncio", x: "📅 {cuando} voy a estar en vivo en mi sala privada{temaDe}.{horariosLinea}\n\nEs por video, de frente, y nada se graba. Para entrar solo tocas el link e ingresas con Google.\n\n👉 {link}" },
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
      { t: "Publicación en la pestaña Comunidad", x: "📅 {cuando}: en vivo en mi sala privada{temaDe}. Nada se graba.{horariosLinea}\n👉 {link}" },
    ] },
    { red: "whatsapp", grupo: "WhatsApp · para tus grupos", items: [
      { t: "Invitación", x: "Hola 👋 {cuando} voy a estar en vivo en mi sala de video{temaDe}. Es de frente y nada se graba.{horariosLinea}\n\nPara entrar solo toquen el link:\n{link}" },
      { t: "Ya casi empiezo", x: "⏰ En unos minutos empiezo en vivo. Los espero aquí:\n{link}" },
      { t: "Ya estoy en vivo", x: "🔴 Ya estoy en vivo. Entren cuando quieran:\n{link}" },
      { t: "Horarios por país", x: "🕗 Horarios del en vivo{temaDe}:\n\n{horariosLista}\n\nLos espero aquí:\n{link}" },
      { t: "Recordatorio", x: "Recordatorio: {cuando} nos vemos en vivo.{horariosLinea} Si entran a la sala y activan «Avísame», les llega un correo cuando abra.\n{link}" },
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

  // Las campañas: grupos de piezas con una sola idea, que la galería enseña arriba de todo.
  const CAMPANAS = {
    ganan: { n: "Aquí todos ganan", ceja: "Campaña · 15 días", idea: "Quien transmite cobra por su tiempo. Quien entra se lleva conocimiento, o un momento en vivo que no va a existir otra vez.", uso: "Una publicación al día, en este orden. Todas salen también en video, con música." },
  };
  window.MaterialesCatalogo = { FORMATOS, REDES, PIEZAS, CAPTIONS, TEXTOS, ZONAS, ZONA_DE_TZ, CAMPANAS };
})();

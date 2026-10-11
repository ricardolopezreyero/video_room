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
    // ── CAMPAÑA «Tu oficio ya se cobra» ───────────────────────────────────
    // Quince publicaciones, una por oficio: a cada quien se le dice qué haría
    // en su sala. Sin género en el letrero: se nombra lo que la persona hace.
    { id: "O01", dia: 1, camp: "oficios", n: "Tu oficio ya se cobra", f: "V", a: "tipo", p: "noche", vr: true, redes: VERT, tx: "co01", c: { t: "TU OFICIO\nYA SE COBRA\n*EN VIVO.*" } },
    { id: "O02", dia: 2, camp: "oficios", n: "Impuestos", f: "V", a: "hero", p: "verde", vr: true, redes: VERT, tx: "co02", c: { k: "SI LLEVAS IMPUESTOS", t: "Resuelve dudas de impuestos *en vivo*", s: "Diez personas con su duda. Una hora. Tu precio." } },
    { id: "O03", dia: 3, camp: "oficios", n: "Asesoría legal", f: "V", a: "hero", p: "noche", vr: true, redes: VERT, tx: "co03", c: { k: "SI DAS ASESORÍA LEGAL", t: "La primera consulta, *en una sala privada*", s: "Cada quien cuenta su caso. Nada se graba." } },
    { id: "O04", dia: 4, camp: "oficios", n: "Pensiones", f: "V", a: "bloque", p: "claro", vr: true, redes: VERT, tx: "co04", c: { k: "SI ASESORAS PENSIONES", t: "Explícale su pensión a quien está por retirarse", s: "Una sesión a la semana. Preguntas reales, respuestas en vivo." } },
    { id: "O05", dia: 5, camp: "oficios", n: "Migración", f: "V", a: "hero", p: "oro", vr: true, redes: VERT, tx: "co05", c: { k: "SI ASESORAS MIGRACIÓN", t: "Miles tienen la misma duda. *Contéstala en vivo*", s: "Entran desde donde estén." } },
    { id: "O06", dia: 6, camp: "oficios", n: "Nutrición", f: "V", a: "lista", p: "claro", vr: true, redes: VERT, tx: "co06", c: { k: "SI TE DEDICAS A LA NUTRICIÓN", t: "Una sesión de grupo rinde por diez citas sueltas", b: ["Las dudas de todos en una hora", "Sin consultorio ni traslados", "Cada entrada te paga a ti"] } },
    { id: "O07", dia: 7, camp: "oficios", n: "Tarot", f: "V", a: "cita", p: "noche", vr: true, redes: VERT, tx: "co07", c: { t: "Tu lectura de tarot, en una sala donde *nada se graba*.", firma: "Video Room" } },
    { id: "O08", dia: 8, camp: "oficios", n: "Astrología", f: "V", a: "hero", p: "vivo", vr: true, redes: VERT, tx: "co08", c: { k: "SI LEES LAS ESTRELLAS", t: "Tu lectura de la semana, *en vivo y con preguntas*", s: "Tu público ya paga por pregunta. Aquí te llega completo." } },
    { id: "O09", dia: 9, camp: "oficios", n: "Música", f: "V", a: "hero", p: "noche", vr: true, redes: VERT, tx: "co09", c: { k: "SI CANTAS", t: "Un concierto íntimo cada viernes, *con peticiones*", s: "Treinta personas que sí vinieron a oírte." } },
    { id: "O10", dia: 10, camp: "oficios", n: "Comedia", f: "V", a: "bloque", p: "verde", vr: true, redes: VERT, tx: "co10", c: { k: "SI HACES REÍR", t: "Prueba tu material nuevo con público que pagó por estar", s: "Sin bar, sin micrófono prestado y sin que quede grabado." } },
    { id: "O11", dia: 11, camp: "oficios", n: "Zumba", f: "V", a: "hero", p: "verde", vr: true, redes: VERT, tx: "co11", c: { k: "SI DAS ZUMBA", t: "Tu clase de siempre, *sin rentar salón*", s: "Con membresía: pagan una vez y entran todo el mes." } },
    { id: "O12", dia: 12, camp: "oficios", n: "Yoga", f: "V", a: "lista", p: "noche", vr: true, redes: VERT, tx: "co12", c: { k: "SI ENSEÑAS YOGA", t: "Tu grupo de las 7, cada quien desde su casa", b: ["Tú pones el precio de la clase", "Membresía mensual para quien va diario", "Nadie más ve la clase: es tu sala"] } },
    { id: "O13", dia: 13, camp: "oficios", n: "Inglés", f: "V", a: "bloque", p: "claro", vr: true, redes: VERT, tx: "co13", c: { k: "SI ENSEÑAS INGLÉS", t: "Clases de conversación con cupo chico", s: "Hablan todos. Tú cobras por la hora." } },
    { id: "O14", dia: 14, camp: "oficios", n: "Guitarra", f: "V", a: "hero", p: "oro", vr: true, redes: VERT, tx: "co14", c: { k: "SI ENSEÑAS GUITARRA", t: "Una clase, diez alumnos, *una hora*", s: "Cada quien desde su casa, con su guitarra." } },
    { id: "O15", dia: 15, camp: "oficios", n: "Cualquier oficio", f: "V", a: "bloque", p: "noche", vr: true, redes: VERT, tx: "co15", c: { k: "CUALQUIER OFICIO", t: "Si alguien te pregunta «¿y eso cómo se hace?», ya tienes sala", s: "Ábrela gratis en 30 segundos." } },

    // ── CAMPAÑA «Cuéntalo en vivo» ────────────────────────────────────────
    // Doce publicaciones sobre un uso nuevo: contar una historia en vivo. Las
    // ocho primeras son de Video Room; las cuatro últimas son de quien cuenta
    // (llevan su nombre, su link y su fecha) para anunciar su propia historia.
    { id: "H01", dia: 1, camp: "historias", n: "Todos tenemos una historia", f: "V", a: "tipo", p: "noche", vr: true, redes: VERT, tx: "ch01", c: { t: "TODOS\nTENEMOS\n*UNA HISTORIA.*" } },
    { id: "H02", dia: 2, camp: "historias", n: "Cuéntala en vivo", f: "V", a: "hero", p: "verde", vr: true, redes: VERT, tx: "ch02", c: { k: "VIDEO ROOM", t: "Cuenta tu historia *en vivo*. Quien quiera oírla, entra", s: "Sin editar, sin guion perfecto y sin que se quede grabada." } },
    { id: "H03", dia: 3, camp: "historias", n: "No se repite igual", f: "V", a: "cita", p: "noche", vr: true, redes: VERT, tx: "ch03", c: { t: "Una historia contada en vivo no se repite igual. *Por eso vale.*", firma: "Video Room" } },
    { id: "H04", dia: 4, camp: "historias", n: "Qué puedes contar", f: "V", a: "lista", p: "claro", vr: true, redes: VERT, tx: "ch04", c: { k: "QUÉ PUEDES CONTAR", t: "Tu historia ya tiene público", b: ["Cómo empezaste desde cero", "Lo que aprendiste al perderlo todo", "El viaje que te cambió", "Los cuentos de tu abuela"] } },
    { id: "H05", dia: 5, camp: "historias", n: "Ensaya con público", f: "V", a: "bloque", p: "oro", vr: true, redes: VERT, tx: "ch05", c: { k: "ENSAYA CON PÚBLICO DE VERDAD", t: "Practica tu historia antes de subirte al escenario", s: "Una sala chica te dice dónde se ríen y dónde se pierden." } },
    { id: "H06", dia: 6, camp: "historias", n: "Desde donde pasó", f: "V", a: "hero", p: "vivo", vr: true, redes: VERT, tx: "ch06", c: { k: "DESDE EL LUGAR", t: "Cuéntala desde *donde ocurrió*", s: "Tu taller, tu pueblo, la cancha, la cocina de tu casa." } },
    { id: "H07", dia: 7, camp: "historias", n: "Noche de cuentos", f: "V", a: "bloque", p: "noche", vr: true, redes: VERT, tx: "ch07", c: { k: "NOCHE DE CUENTOS", t: "Cuentos para dormir, contados en vivo", s: "Las familias entran desde su casa. Tú cuentas." } },
    { id: "H08", dia: 8, camp: "historias", n: "Historias de terror", f: "V", a: "tipo", p: "vivo", vr: true, redes: VERT, tx: "ch08", c: { t: "HISTORIAS\nDE TERROR\n*A MEDIANOCHE.*" } },
    { id: "H09", dia: 9, camp: "historias", n: "Te cuento mi historia", f: "V", a: "tipo", p: "noche", redes: VERT, tx: "ch09", c: { t: "TE CUENTO\nMI HISTORIA\n*{cuando}*" } },
    { id: "H10", dia: 10, camp: "historias", n: "No la he contado", f: "V", a: "hero", p: "verde", redes: VERT, tx: "ch10", c: { k: "EN VIVO, UNA SOLA VEZ", t: "Tengo una historia que *no he contado*", s: "La cuento en vivo en mi sala. Nada se graba." } },
    { id: "H11", dia: 11, camp: "historias", n: "Noche de historias", f: "V", a: "anuncio", p: "noche", redes: VERT, tx: "ch11", c: { k: "NOCHE DE HISTORIAS" } },
    { id: "H12", dia: 12, camp: "historias", n: "Te lo cuento en vivo", f: "V", a: "cita", p: "verde", redes: VERT, tx: "ch12", c: { t: "Esto no lo vas a encontrar en ningún video. *Te lo cuento en vivo.*" } },
  ];

  // ── Textos sugeridos para publicar cada pieza (clave tx) ────────────────
  const CAPTIONS = {
    // Campaña «Tu oficio ya se cobra»: un texto por oficio.
    co01: "Tu oficio ya se cobra en vivo. 🔴\n\nSi alguien te pregunta cómo se hace lo que tú haces, eso ya es una sala: compartes tu link, entran y cada entrada te paga.\n\n👉 {link}",
    co02: "Si llevas impuestos, ya sabes cuántas veces te hacen la misma pregunta.\n\nAbre una sala una hora a la semana: diez personas, cada una con su duda, y tú pones el precio.\n\n👉 {link}",
    co03: "Si das asesoría legal: la primera consulta puede ser en una sala privada de video. Cada persona cuenta su caso y nada se graba.\n\nTú decides cuánto vale tu hora 👉 {link}",
    co04: "Quien está por retirarse tiene mil dudas sobre su pensión, y casi nadie se las explica con calma.\n\nUna sesión en vivo a la semana, con preguntas reales 👉 {link}",
    co05: "En migración, miles de personas tienen la misma duda al mismo tiempo.\n\nContéstala en vivo, en una sala donde entran desde cualquier país y nada se graba 👉 {link}",
    co06: "Si te dedicas a la nutrición: una sesión de grupo resuelve en una hora las dudas que se repiten en cada cita. Sin consultorio y sin traslados.\n\n👉 {link}",
    co07: "Una lectura de tarot pide confianza. En Video Room la sala es privada y nada se graba: lo que se dice ahí, ahí se queda.\n\n👉 {link}",
    co08: "Si lees las estrellas: tu lectura de la semana, en vivo y con preguntas. Lo que tu público te manda adentro te llega completo.\n\n👉 {link}",
    co09: "Si cantas: un concierto íntimo cada viernes, con peticiones. Treinta personas que sí vinieron a oírte valen más que mil que pasaban por ahí.\n\n👉 {link}",
    co10: "Si haces comedia: prueba tu material nuevo con público que pagó por estar. Sin bar, sin micrófono prestado y sin que el chiste quede grabado.\n\n👉 {link}",
    co11: "Si das zumba: tu clase de siempre, sin rentar salón. Con membresía, tu grupo paga una vez y entra todo el mes.\n\n👉 {link}",
    co12: "Si enseñas yoga: tu grupo de las 7, cada quien desde su casa. Tú pones el precio de la clase y nadie más la ve: es tu sala.\n\n👉 {link}",
    co13: "Si enseñas inglés: clases de conversación con cupo chico, para que hablen todos. Tú cobras por la hora.\n\n👉 {link}",
    co14: "Si enseñas guitarra: una clase, diez alumnos, una hora. Cada quien desde su casa y con su guitarra.\n\n👉 {link}",
    co15: "No importa cuál sea tu oficio. Si alguna vez te preguntaron «¿y eso cómo se hace?», ya tienes de qué hacer una sala.\n\nÁbrela gratis en 30 segundos 👉 {link}",
    // Campaña «Cuéntalo en vivo»: las ocho de Video Room y las cuatro de quien cuenta.
    ch01: "Todos tenemos una historia. Casi nadie tiene dónde contarla.\n\nAhora sí: una sala en vivo, quien quiera oírla entra, y nada se graba.\n\n👉 {link}",
    ch02: "Cuenta tu historia en vivo. Sin editar, sin guion perfecto y sin que se quede en internet para siempre.\n\nLa anuncias en tus redes y entra quien quiera oírla 👉 {link}",
    ch03: "Una historia contada en vivo nunca sale igual dos veces. Por eso vale estar.\n\n👉 {link}",
    ch04: "¿Qué puedes contar?\n\n· Cómo empezaste desde cero\n· Lo que aprendiste al perderlo todo\n· El viaje que te cambió\n· Los cuentos de tu abuela\n\nTu historia ya tiene público 👉 {link}",
    ch05: "Antes de la conferencia, del pódcast o del escenario: practica tu historia con público de verdad.\n\nUna sala chica te dice dónde se ríen y dónde se pierden 👉 {link}",
    ch06: "Hay historias que se cuentan mejor desde donde pasaron: tu taller, tu pueblo, la cancha, la cocina de tu casa.\n\nLlévate la sala contigo 👉 {link}",
    ch07: "Noche de cuentos: cuentos para dormir, contados en vivo. Las familias entran desde su casa.\n\n👉 {link}",
    ch08: "Historias de terror a medianoche, en vivo y con la luz apagada. No se graban: o estás, o te las cuentan mal.\n\n👉 {link}",
    ch09: "📖 {cuando}: te cuento mi historia{temaDe}. En vivo, en mi sala, una sola vez. Nada se graba.{horariosLinea}\n\nActiva «Avísame» y te llega un correo cuando abra 👉 {link}",
    ch10: "Tengo una historia que no he contado. La voy a contar en vivo{temaDe}, y solo ahí: nada se graba.\n\n{cuando} 👉 {link}",
    ch11: "🌙 Noche de historias{temaDe}. {cuando}, en vivo en mi sala.{horariosLinea}\n\nEntra con un toque 👉 {link}",
    ch12: "Esto no lo vas a encontrar en ningún video. Te lo cuento en vivo{temaDe}, en mi sala.\n\n{cuando} 👉 {link}",
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
    { red: "todas", camp: "oficios", grupo: "Campaña «Tu oficio ya se cobra»", items: [
      { t: "Video Room · Mensaje para invitar a alguien con oficio", x: "Hola. Vi lo que haces y creo que te puede servir esto.\n\nVideo Room es una sala de video en vivo con puerta de cobro: compartes tu link, la gente entra y cada entrada te paga a ti. Tú pones el precio. De cada 5 pesos, 4 son tuyos, y lo que te manden adentro te llega completo.\n\nAbrir tu sala toma 30 segundos y es gratis: {link}\n\nSi quieres, te ayudo a montar tu primera sesión." },
      { t: "Video Room · A quién le sirve", x: "Video Room le sirve a quien sabe algo que otra persona necesita:\n\n· Impuestos, pensiones, migración, asesoría legal\n· Nutrición, entrenamiento, yoga, zumba\n· Tarot, astrología\n· Música, comedia\n· Inglés, guitarra, regularización\n\nSi tu oficio no está en la lista, también: basta con que alguien te haya preguntado cómo lo haces.\n\n👉 {link}" },
    ] },
    { red: "todas", camp: "historias", grupo: "Campaña «Cuéntalo en vivo»", items: [
      { t: "Cómo armar tu historia en cinco partes", x: "1. El gancho: una frase que haga querer oír el resto.\n2. Cómo era todo antes.\n3. El día que cambió.\n4. Lo que hiciste, con lo que salió mal incluido.\n5. Lo que hoy sabes y antes no.\n\nCalcula 25 minutos de historia y 15 de preguntas." },
      { t: "Diez historias que ya puedes contar", x: "1. Cómo empezaste tu negocio desde cero\n2. La vez que lo perdiste todo\n3. El viaje que te cambió\n4. Cómo llegaste a otro país\n5. La historia de tu familia\n6. Los cuentos que te contaba tu abuela\n7. Lo que nadie te dijo de tu oficio\n8. Tu peor día de trabajo\n9. La leyenda de tu pueblo\n10. Cómo saliste de una deuda" },
      { t: "Guion para anunciar tu historia (30 segundos)", x: "(A cámara, sin música)\n\nTengo una historia que no he contado completa. {temaO}.\n\nNo la voy a subir a ningún lado. La voy a contar una sola vez, en vivo, en mi sala, y nada se graba.\n\n{cuando}. El link está en mi perfil.\n\n{link}" },
    ] },
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

  // Las campañas: grupos de piezas con una sola idea. Salen en este orden.
  const CAMPANAS = {
    ganan: { n: "Aquí todos ganan", ceja: "Campaña · 15 días", idea: "Quien transmite cobra por su tiempo. Quien entra se lleva conocimiento, o un momento en vivo que no va a existir otra vez.", uso: "Una publicación al día, en este orden. Todas salen también en video, con música." },
    oficios: { n: "Tu oficio ya se cobra", ceja: "Campaña · 15 oficios", idea: "A cada oficio se le dice qué haría en su sala: impuestos, asesoría legal, pensiones, migración, nutrición, tarot, astrología, música, comedia, zumba, yoga, inglés y guitarra.", uso: "Publica la de tu oficio, o mándasela a quien le sirva. Cada una trae su texto." },
    historias: { n: "Cuéntalo en vivo", ceja: "Campaña · un uso nuevo", idea: "Contar una historia en vivo: tu vida, un cuento, lo que te pasó. La anuncias en tus redes y entra quien quiera oírla. Nada se graba.", uso: "Las ocho primeras explican la idea. Las cuatro últimas son tuyas: llevan tu nombre, tu link y tu fecha para anunciar tu historia." },
  };

  // Casos de uso: lo que hoy se puede hacer y antes no. Es la carpeta del curioso.
  // Cada caso dice qué es, cómo se hace en tres pasos, cuánto se suele cobrar
  // y con qué diseño (`pieza`) se anuncia.
  const CASOS = [
    { grupo: "Historias", items: [
      { id: "historia", n: "Cuenta tu historia", que: "Tu vida, tu negocio o ese día que lo cambió todo, narrado en vivo para quien quiera oírlo.", pasos: ["Elige una sola historia y ponle título", "Anúnciala en tres redes con fecha y hora", "Cuéntala en tu sala y deja 15 minutos para preguntas"], cobro: "Entrada de $50 a $100", pieza: "H09" },
      { id: "ensayo-historia", n: "Practica tu historia narrada", que: "Antes de la conferencia, del pódcast o del escenario, pruébala con un público chico que sí reacciona.", pasos: ["Invita a diez personas con una entrada barata", "Cuéntala completa, sin detenerte", "Al final pregunta qué parte recordaron"], cobro: "Entrada de $20 a $50", pieza: "H10" },
      { id: "lugar", n: "Cuéntala en vivo desde un lugar", que: "Transmite desde donde pasó: tu taller, tu pueblo, la cancha, el mercado. El lugar hace la mitad del trabajo.", pasos: ["Elige el lugar y prueba tu señal un día antes", "Anuncia qué van a ver y desde dónde", "Camina, enseña y cuenta"], cobro: "Entrada de $50 a $100", pieza: "H11" },
      { id: "cuentos", n: "Noche de cuentos", que: "Cuentos para dormir, contados en vivo. Las familias entran desde su casa a la misma hora cada semana.", pasos: ["Fija un día y una hora que se repitan", "Elige dos cuentos de diez minutos", "Ofrece membresía para quien entra cada semana"], cobro: "Entrada de $30 o membresía mensual", pieza: "H11" },
      { id: "terror", n: "Historias de terror a medianoche", que: "Leyendas, casos y relatos con la luz apagada. No se graban: o estás, o te las cuentan mal.", pasos: ["Anuncia el tema de la noche", "Abre la sala quince minutos antes", "Deja que el público cuente la suya al final"], cobro: "Entrada de $40 a $80", pieza: "V11" },
    ] },
    { grupo: "Lo que sabes", items: [
      { id: "casos", n: "Resuelve casos en vivo", que: "Impuestos, pensiones, migración, asesoría legal: cada persona pregunta su caso y tú contestas.", pasos: ["Anuncia el tema de la semana", "Pide que lleguen con su pregunta lista", "Contesta por turnos y cierra con un resumen"], cobro: "Entrada de $100 a $300", pieza: "V08" },
      { id: "lecturas", n: "Lecturas con preguntas", que: "Tarot o astrología en una sala privada, donde lo que se dice no se queda grabado.", pasos: ["Abre a la misma hora cada semana", "Atiende por orden de llegada", "Lo que te manden adentro te llega completo"], cobro: "Entrada de $50 más lo que te manden", pieza: "V06" },
      { id: "oficio", n: "Enseña cómo lo haces", que: "Cocina, carpintería, costura, reparación: muestras tu oficio paso a paso y contestas dudas.", pasos: ["Elige una sola cosa para enseñar", "Ten todo listo antes de abrir", "Trabaja despacio y explica cada paso"], cobro: "Entrada de $50 a $150", pieza: "V04" },
      { id: "pregunta", n: "Pregúntame lo que quieras", que: "Una hora abierta con alguien que tiene un oficio o una vida fuera de lo común.", pasos: ["Di en una frase quién eres y por qué preguntarte", "Junta preguntas desde tus redes", "Contesta las mejores en vivo"], cobro: "Entrada de $30 a $80", pieza: "V08" },
    ] },
    { grupo: "Lo que haces", items: [
      { id: "clase", n: "Da tu clase sin rentar salón", que: "Zumba, yoga, baile o ejercicio: tu grupo entra desde su casa a la hora de siempre.", pasos: ["Conserva tu horario de siempre", "Ofrece la membresía mensual", "Manda tu link al grupo de WhatsApp"], cobro: "Membresía mensual o entrada por clase", pieza: "V12" },
      { id: "concierto", n: "Concierto íntimo con peticiones", que: "Treinta personas que sí vinieron a oírte, pidiendo canciones y mandándote lo que quieran.", pasos: ["Anuncia el día y un tema", "Canta las tuyas y abre peticiones", "Da las gracias por nombre a quien manda"], cobro: "Entrada de $50 más lo que te manden", pieza: "V02" },
      { id: "ensayo", n: "Ensayo abierto", que: "Música o comedia: pruebas material nuevo con público que pagó por estar, antes de llevarlo al escenario.", pasos: ["Avisa que es material nuevo", "Prueba, repite y pregunta", "Apunta qué funcionó"], cobro: "Entrada de $30 a $60", pieza: "V11" },
      { id: "recorrido", n: "Recorrido en vivo", que: "Un museo, un mercado, un barrio, una ruta: guías a quien no puede estar ahí.", pasos: ["Traza la ruta y prueba tu señal", "Anuncia qué van a ver", "Contesta preguntas mientras caminas"], cobro: "Entrada de $50 a $120", pieza: "V02" },
    ] },
    { grupo: "Tu comunidad", items: [
      { id: "club", n: "Club de lectura o tertulia", que: "Un grupo fijo que se junta cada semana a platicar de un libro, una serie o un tema.", pasos: ["Elige el libro o el tema del mes", "Fija un día que se repita", "Cobra membresía para que el grupo sea el mismo"], cobro: "Membresía mensual", pieza: "V12" },
      { id: "reunion", n: "Reunión privada de tu comunidad", que: "Tu generación, tu club, tus clientes: un lugar donde solo entra quien es parte.", pasos: ["Manda el link solo a tu grupo", "Pon una entrada simbólica o membresía", "Úsala para lo que no cabe en un chat"], cobro: "Entrada simbólica o membresía", pieza: "V04" },
    ] },
  ];

  window.MaterialesCatalogo = { FORMATOS, REDES, PIEZAS, CAPTIONS, TEXTOS, ZONAS, ZONA_DE_TZ, CAMPANAS, CASOS };
})();

// RLR · Proyecciones de Video Room (/proyecciones): los próximos 15 años.
//
// Página interna, hermana del Go-to-market: mismo acceso, mismo armazón. Aquí
// viven los supuestos del modelo; la cuenta y el dibujo los hace
// public/proyecciones.js, que no lleva contenido (el modelo solo se le manda a
// quien tiene acceso). Arriba la gráfica de ingresos y gastos, abajo la tabla
// con las mismas columnas, y todo corre de izquierda a derecha.
//
// EL MODELO, en una frase: el año 1 sigue la escalera de puntos de control del
// plan; del año 2 al 15 la puerta crece cada año un poco menos que el anterior.
// El ingreso de la casa es un porcentaje de la puerta; los gastos son parte
// fijos (un piso) y parte proporcionales al tamaño.
import type { User } from "./db";
import { escapeHtml } from "./email";

export const MODELO = {
  /** Mes 1 de la proyección. Fijo, para que la curva no se recorra cada mes. */
  inicio: "2026-10",
  anios: 15,
  /** Puerta de cada mes del año 1, siguiendo los puntos de control del plan. */
  anio1: [15000, 150000, 340000, 750000, 1500000, 3000000, 3500000, 4000000, 4500000, 5000000, 5200000, 5400000],
  /** Cuánto se multiplica la puerta de diciembre a diciembre, del año 2 al 15. */
  crecimiento: [2.2, 1.8, 1.5, 1.35, 1.25, 1.2, 1.15, 1.12, 1.1, 1.08, 1.08, 1.08, 1.08, 1.08],
  /** Tres maneras de mirar el mismo futuro: qué tanto del año 1 se logra y qué tanto del crecimiento. */
  escenarios: {
    prudente: { nombre: "Prudente", nota: "El año 1 llega a 40 % del plan y después se crece la mitad de lo esperado.", anio1: 0.4, crecer: 0.5 },
    base: { nombre: "El plan", nota: "El año 1 cumple los puntos de control y el crecimiento baja poco a poco.", anio1: 1, crecer: 1 },
    ambicioso: { nombre: "Ambicioso", nota: "El año 1 llega a 130 % del plan y se crece 40 % más rápido.", anio1: 1.3, crecer: 1.4 },
  },
  /** Supuestos que se pueden mover en la página. [clave, etiqueta, valor, unidad, paso, explicación] */
  supuestos: [
    ["comision", "Comisión de la casa sobre la puerta", 20, "%", 1, "Lo que la casa cobra de entradas y membresías."],
    ["tarjeta1", "Costo de cobro con tarjeta, año 1", 6, "%", 0.5, "Sobre la puerta. Estimación con tarifa pública."],
    ["tarjeta3", "Costo de cobro con tarjeta, del año 3 en adelante", 4, "%", 0.5, "Baja con recargas grandes, transferencia y volumen."],
    ["video", "Video e infraestructura", 2, "%", 0.5, "Sobre la puerta: transmitir cuesta por minuto y por persona."],
    ["equipo", "Equipo", 25, "%", 1, "Del ingreso de la casa, cuando ya rebasa el piso."],
    ["equipoPiso", "Equipo: piso al mes", 96000, "$", 5000, "Dirección, líder de creadores y editor, aunque no haya ingreso."],
    ["marketing", "Marketing", 8, "%", 1, "Del ingreso de la casa."],
    ["marketingPiso", "Marketing: piso al mes", 11000, "$", 1000, "Anuncios de prueba y herramientas."],
    ["soporte", "Soporte, legal y contabilidad", 5, "%", 1, "Del ingreso de la casa."],
    ["soportePiso", "Soporte, legal y contabilidad: piso al mes", 10000, "$", 1000, "Contador, abogado y atención."],
    ["porCreador", "Puerta por creador al mes", 3850, "$", 50, "Para estimar cuántos creadores cobran."],
    ["porPersona", "Gasto por persona al mes", 110, "$", 5, "Para estimar cuántas personas pagan."],
  ] as [string, string, number, string, number, string][],
};

export function paginaProyecciones(o: { user: User; real: unknown; v: string }): string {
  const datos = JSON.stringify({ modelo: MODELO, real: o.real }).replace(/</g, "\\u003c");
  const v = `?v=${encodeURIComponent(o.v)}`;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Proyecciones — Video Room</title>
<link rel="preload" href="/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/og-default.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css${v}"></head>
<body class="app-shell gtm-cuerpo">
<div class="gtm-hoja proy-hoja">
  <header class="gtm-cab">
    <div><p class="gtm-ceja">Video Room · plan interno del equipo</p><h1>Proyecciones</h1><p class="muted">Los próximos ${MODELO.anios} años, mes por mes: la curva de ingresos y la curva de gastos.</p></div>
    <a class="gtm-salir" href="/gtm" title="Volver al Go-to-market" aria-label="Volver al Go-to-market">✕</a>
  </header>
  <nav class="gtm-tabs proy-nav">
    <a href="/gtm">← Go-to-market</a>
    <a href="/gtm#indicadores">Indicadores</a>
    <a href="/gtm#checklist">Checklist</a>
    <span class="on">Proyecciones</span>
  </nav>
  <main>
    <section class="gtm-sec">
      <div class="proy-barra">
        <div class="gtm-chips" id="proy-escenarios"></div>
        <div class="gtm-chips" id="proy-vistas"></div>
      </div>
      <p class="muted" id="proy-nota-escenario"></p>
      <div class="proy-resumen" id="proy-resumen"></div>
    </section>
    <section class="gtm-sec proy-sec-lienzo">
      <div class="proy-leyenda" id="proy-leyenda"></div>
      <div class="proy-scroll" id="proy-scroll" tabindex="0" aria-label="Gráfica y tabla de la proyección. Desliza de izquierda a derecha.">
        <div class="proy-lienzo" id="proy-lienzo"></div>
      </div>
      <div class="proy-mando"><button type="button" class="btn-ghost small" id="proy-inicio">⇤ Hoy</button><input type="range" id="proy-deslizador" min="0" max="1000" value="0" aria-label="Recorrer los años"><button type="button" class="btn-ghost small" id="proy-fin">Año ${MODELO.anios} ⇥</button></div>
      <p class="gtm-nota">Desliza la gráfica o la tabla hacia la derecha para recorrer los ${MODELO.anios} años. Las columnas de arriba y de abajo son las mismas.</p>
    </section>
    <section class="gtm-sec">
      <h3>Los supuestos</h3>
      <p>Una proyección a ${MODELO.anios} años no es un pronóstico: es la consecuencia de estos supuestos. Muévelos y todo se recalcula. Los cambios se guardan en este navegador.</p>
      <div class="gtm-calc-in proy-supuestos" id="proy-supuestos"></div>
      <p><button type="button" class="gtm-liga" id="proy-restaurar">Volver a los supuestos del plan</button></p>
      <p class="gtm-nota"><b>Cómo se arma.</b> El año 1 sigue los puntos de control del Go-to-market. Del año 2 al ${MODELO.anios} la puerta crece cada año menos que el anterior: ${MODELO.crecimiento.slice(0, 6).map((x) => "×" + x).join(", ")} y así hasta ×${MODELO.crecimiento[MODELO.crecimiento.length - 1]}. El ingreso es la comisión de la casa sobre la puerta. Los gastos tienen un piso y una parte que crece con el tamaño. La utilidad es antes de impuestos. Todo en pesos de hoy, sin inflación.</p>
    </section>
  </main>
  <p class="muted gtm-pie">Plan interno. Sesión de ${escapeHtml(o.user.name)} · ${escapeHtml(o.user.email)} · <a href="/gtm" style="color:var(--green)">Volver al Go-to-market</a></p>
</div>
<script>window.__PROY = ${datos};</script>
<script src="/proyecciones.js${v}" defer></script>
</body></html>`;
}

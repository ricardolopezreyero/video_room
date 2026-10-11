// RLR · Proyecciones de Video Room (/gtm → Proyecciones): los próximos 18 años.
//
// Es una pestaña del Go-to-market: mismo acceso, misma página. Aquí viven los
// supuestos del modelo y el texto; la cuenta y el dibujo los hace
// public/proyecciones.js, que no lleva contenido (el modelo solo se le manda a
// quien tiene acceso). Arriba la gráfica de ingresos y gastos, abajo la tabla
// con las mismas columnas, y todo corre de izquierda a derecha.
//
// EL MODELO, en una frase: el año 1 sigue la escalera de puntos de control del
// plan; del año 2 al 18 cada año se abre un lugar nuevo (ciudades, países,
// continentes) y la puerta crece un poco menos que el año anterior. El ingreso
// de la casa es un porcentaje de la puerta; los gastos son parte fijos (un
// piso) y parte proporcionales al tamaño.

/** Los cuatro tramos de la ruta. [clave, nombre, de qué se trata] */
export const TRAMOS: [string, string, string][] = [
  ["ciudades", "Ciudades", "México primero: de unas cuantas ciudades a todas."],
  ["paises", "Países", "El mundo que habla español y el primer idioma nuevo."],
  ["continentes", "Continentes", "Un continente a la vez, con la misma receta."],
  ["fondo", "A fondo", "Ya no se abren lugares: crece lo que deja cada uno."],
];

/** Una etapa por año. [tramo, a dónde se abre, qué pasa, cuánto se multiplica la puerta de un cierre de año al siguiente] */
export const ETAPAS: [string, string, string, number | null][] = [
  ["ciudades", "México", "El plan del Go-to-market: de los primeros diez creadores al millón al mes. Entran los primeros creadores de Colombia, Argentina, Perú y Chile.", null],
  ["ciudades", "Todo México", "De las ciudades grandes a todas, con un embajador por ciudad. La membresía ya sostiene a la casa.", 3],
  ["paises", "América Latina en español", "Colombia, Argentina, Perú y Chile dejan de ser prueba: equipo, moneda y retiros locales. Se suman Ecuador, Centroamérica y el Caribe.", 2.2],
  ["paises", "España y los hispanos de Estados Unidos", "Con esto, todo el mundo que habla español.", 1.8],
  ["paises", "Brasil", "El primer idioma nuevo: portugués. La tarea 523 del plan ya deja la sala lista.", 1.6],
  ["continentes", "Estados Unidos y Canadá", "En inglés. Se entra por los creadores bilingües que ya están adentro.", 1.45],
  ["continentes", "Reino Unido, Irlanda, Australia y Nueva Zelanda", "El resto del inglés. Primer pie en Europa y en Oceanía.", 1.35],
  ["continentes", "Europa: Francia, Alemania, Italia y Portugal", "Idiomas nuevos, misma receta.", 1.3],
  ["continentes", "Europa completa", "El norte y el este. Europa ya pesa como un continente entero.", 1.25],
  ["continentes", "India y Filipinas", "Asia entra por el inglés: público enorme y entradas de precio bajo.", 1.22],
  ["continentes", "Sudeste de Asia", "Indonesia, Vietnam, Tailandia y Malasia.", 1.2],
  ["continentes", "Japón y Corea", "Dos mercados grandes de video en vivo, con equipo que hable el idioma.", 1.18],
  ["continentes", "Medio Oriente y norte de África", "En árabe y en turco.", 1.16],
  ["continentes", "África", "Nigeria, Kenia, Sudáfrica y Ghana. Con este, los cinco continentes.", 1.14],
  ["fondo", "Los cinco continentes, ciudad por ciudad", "Ya no se abren países: se llenan las ciudades de cada uno.", 1.12],
  ["fondo", "Más oficios", "Entra quien hoy no usa una sala: salud, escuelas y empresas.", 1.1],
  ["fondo", "Más por creador", "Membresías, temporadas y giras en vivo: crece lo que deja cada sala.", 1.09],
  ["fondo", "La casa madura", "Presencia en todos los continentes. El crecimiento ya depende de servir mejor.", 1.08],
];

export const MODELO = {
  /** Mes 1 de la proyección. Fijo, para que la curva no se recorra cada mes. */
  inicio: "2026-10",
  anios: ETAPAS.length,
  /** Puerta de cada mes del año 1, siguiendo los puntos de control del plan. */
  anio1: [15000, 150000, 340000, 750000, 1500000, 3000000, 3500000, 4000000, 4500000, 5000000, 5200000, 5400000],
  /** Cuánto se multiplica la puerta de un cierre de año al siguiente, del año 2 al 18. Sale de las etapas. */
  crecimiento: ETAPAS.slice(1).map((e) => e[3] as number),
  tramos: TRAMOS,
  etapas: ETAPAS.map(([tramo, lugar, que]) => ({ tramo, lugar, que })),
  /** Tres maneras de mirar el mismo futuro: qué tanto del año 1 se logra y qué tanto rinde cada etapa. */
  escenarios: {
    prudente: { nombre: "Prudente", nota: "El año 1 llega a 40 % del plan y cada etapa rinde la mitad. Alcanza para el mundo que habla español.", anio1: 0.4, crecer: 0.5 },
    base: { nombre: "El plan", nota: "El año 1 cumple los puntos de control y cada año se abre una etapa. Es la ruta completa: ciudades, países y continentes.", anio1: 1, crecer: 1 },
    ambicioso: { nombre: "Ambicioso", nota: "El año 1 llega a 130 % del plan y cada etapa rinde 20 % más.", anio1: 1.3, crecer: 1.2 },
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
    ["expansion", "Abrir lugares nuevos, del año 2 en adelante", 6, "%", 1, "Del ingreso de la casa: equipo local, traducción, cobros y retiros de cada país y lo legal."],
    ["soporte", "Soporte, legal y contabilidad", 5, "%", 1, "Del ingreso de la casa."],
    ["soportePiso", "Soporte, legal y contabilidad: piso al mes", 10000, "$", 1000, "Contador, abogado y atención."],
    ["porCreador", "Puerta por creador al mes", 3850, "$", 50, "Para estimar cuántos creadores cobran. Se deja fijo los 18 años."],
    ["porPersona", "Gasto por persona al mes", 110, "$", 5, "Para estimar cuántas personas pagan. Se deja fijo los 18 años."],
    ["dolar", "Pesos por dólar", 18.5, "$", 0.5, "Solo sirve para comparar contra otras plataformas. No mueve la cuenta."],
  ] as [string, string, number, string, number, string][],
  /** Contra quién se compara el tamaño. Cifras de la propia empresa, agosto de 2025. */
  referencia: { nombre: "Patreon", edad: 12, dolaresAlAnio: 2e9, creadores: 300000 },
};

const sup = (k: string) => MODELO.supuestos.find((s) => s[0] === k)![2];
/** De cada 100 pesos que recibe la casa, cuántos se van en cada renglón cuando ya hay tamaño. */
export function repartoDeCien(): { renglones: [string, number, string][]; gastos: number; queda: number } {
  const c = sup("comision");
  const renglones: [string, number, string][] = [
    ["Equipo", sup("equipo"), `Dirección, creadores, producto y operación. Nunca menos de $${sup("equipoPiso").toLocaleString("es-MX")} al mes.`],
    ["Cobro con tarjeta", Math.round((sup("tarjeta3") / c) * 100), `${sup("tarjeta3")} % de la puerta desde el año 3. El año 1 es ${sup("tarjeta1")} %.`],
    ["Video e infraestructura", Math.round((sup("video") / c) * 100), `${sup("video")} % de la puerta: transmitir cuesta por minuto y por persona.`],
    ["Marketing", sup("marketing"), "Contenido, anuncios y eventos faro."],
    ["Abrir lugares nuevos", sup("expansion"), "Equipo local, traducción, cobros y retiros de cada país y lo legal. Empieza en el año 2."],
    ["Soporte, legal y contabilidad", sup("soporte"), "Atención, contador y abogado."],
  ];
  const gastos = renglones.reduce((n, r) => n + r[1], 0);
  return { renglones, gastos, queda: 100 - gastos };
}

const [Y0, M0] = MODELO.inicio.split("-").map(Number);
/** «2028–29»: los dos años de calendario que toca el año n de la cuenta. */
export function calendarioDe(n: number): string {
  const a = Y0 + Math.floor((M0 - 1 + (n - 1) * 12) / 12), b = Y0 + Math.floor((M0 - 1 + n * 12 - 1) / 12);
  return a === b ? String(a) : `${a}–${String(b).slice(2)}`;
}

/** El cuerpo de la pestaña. Los huecos (ids proy-*) los llena public/proyecciones.js. */
export function seccionProyecciones(): string {
  const N = MODELO.anios, R = repartoDeCien(), ref = MODELO.referencia;
  const ruta = TRAMOS.map(([clave, nombre, de]) => {
    const suyas = ETAPAS.map((e, i) => ({ e, n: i + 1 })).filter((x) => x.e[0] === clave);
    const a = suyas[0].n, b = suyas[suyas.length - 1].n;
    return `<div class="proy-tramo t-${clave}">
      <p class="proy-tramo-cab"><b>${nombre}</b><span>${a === b ? `Año ${a}` : `Años ${a} a ${b}`}</span></p>
      <p class="proy-tramo-de">${de}</p>
      <ol>${suyas.map(({ e, n }) => `<li><span>Año ${n} · ${calendarioDe(n)}</span><b>${e[1]}</b><small>${e[2]}</small>${e[3] ? `<i title="La puerta de fin de año, contra la del año anterior">×${e[3]}</i>` : `<i>el plan</i>`}</li>`).join("")}</ol>
    </div>`;
  }).join("");
  return `
<section class="gtm-sec">
  <p class="gtm-ceja gtm-ceja-oro">Proyecciones · de ${Y0} a ${Y0 + N}</p>
  <h2>Los próximos ${N} años: lo que entra y lo que se gasta</h2>
  <p>Primero más ciudades, luego más países, luego más continentes. Cada año se abre un lugar nuevo.</p>
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
  <div class="proy-mando"><button type="button" class="btn-ghost small" id="proy-inicio">⇤ Hoy</button><input type="range" id="proy-deslizador" min="0" max="1000" value="0" aria-label="Recorrer los años"><button type="button" class="btn-ghost small" id="proy-fin">Año ${N} ⇥</button></div>
  <p class="gtm-nota">Desliza la gráfica o la tabla hacia la derecha para recorrer los ${N} años. Las columnas de arriba y de abajo son las mismas.</p>
</section>

<section class="gtm-sec">
  <p class="gtm-ceja">La ruta</p>
  <h3>Ciudades, países, continentes</h3>
  <p>Una etapa por año. El número de la derecha es cuánto se multiplica la puerta contra el año anterior: cada etapa suma, y cada una rinde un poco menos que la que abrió antes.</p>
  <div class="proy-ruta">${ruta}</div>
</section>

<section class="gtm-sec gtm-tesis">
  <p class="gtm-ceja">Lo que sostiene la curva</p>
  <h2>Por qué no deja de crecer.</h2>
  <p>Una curva así no se sostiene sola. Se sostiene porque alguien la dirige y porque cada etapa se abre con el mismo método.</p>
  <div class="proy-sosten">
    <div><b>Hay quien dirige</b><p>Una persona al frente, con un solo trabajo: que la siguiente etapa esté lista antes de que la anterior se llene.</p></div>
    <div><b>El mismo método en cada lugar</b><p>Creador ancla, embajador líder, páginas y cobros del país. Lo que abre Colombia en el año 1 abre Japón en el año 12.</p></div>
    <div><b>Un tablero que avisa</b><p>Indicadores en vivo y puntos de control. Cada mes se sabe si la etapa va a tiempo.</p></div>
    <div><b>Una etapa a la vez</b><p>No se abre el siguiente lugar hasta que el anterior se paga solo.</p></div>
  </div>
  <p><button type="button" class="gtm-liga" data-ir-tab="candidatos">Ver a quién buscamos para dirigir</button> · <button type="button" class="gtm-liga" data-ir-tab="indicadores">Ver los indicadores en vivo</button> · <button type="button" class="gtm-liga" data-ir-tab="checklist">Ver los puntos de control</button></p>
</section>

<section class="gtm-sec">
  <p class="gtm-ceja">Los gastos</p>
  <h3>En qué se va el dinero</h3>
  <p>Cuando la casa ya tiene tamaño, de cada 100 pesos que recibe se gastan ${R.gastos} y quedan ${R.queda} antes de impuestos. Al principio se gasta más de lo que entra, porque el equipo tiene un piso.</p>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <thead><tr><th>Renglón</th><th>De cada $100 de la casa</th><th>De dónde sale</th></tr></thead>
    <tbody>
      ${R.renglones.map((r) => `<tr><td>${r[0]}</td><td>$${r[1]}</td><td>${r[2]}</td></tr>`).join("")}
      <tr><td><b>Queda</b></td><td><b>$${R.queda}</b></td><td>Antes de impuestos.</td></tr>
    </tbody>
  </table></div>
</section>

<section class="gtm-sec">
  <p class="gtm-ceja">Para leerlo bien</p>
  <h3>Los supuestos, a la vista</h3>
  <ul class="gtm-pasos-lista">
    <li><b>El año 1 es el plan.</b> Son los puntos de control del Checklist, mes por mes. No hay una meta nueva.</li>
    <li><b>Del año 2 al ${N}</b> la puerta crece cada año menos que el anterior: ${MODELO.crecimiento.slice(0, 5).map((x) => "×" + x).join(", ")} y así hasta ×${MODELO.crecimiento[MODELO.crecimiento.length - 1]}. Si una etapa se retrasa un año, todo lo que sigue se recorre un año.</li>
    <li><b>El ingreso</b> es la comisión de la casa sobre la puerta: entradas y membresías. Lo que se manda adentro llega completo al creador y aquí no cuenta.</li>
    <li><b>Lo que deja cada creador y cada persona se queda fijo</b> los ${N} años. En países con más ingreso sería más alto; aquí no se cuenta.</li>
    <li><b>Para comparar.</b> ${ref.nombre} lleva ${ref.edad} años y dice que sus creadores reciben unos 2,000 millones de dólares al año, con más de 300,000 creadores (<a href="https://www.tubefilter.com/2025/08/07/patreon-kajabi-10-billion-creator-economy-payouts-funding-since-launch/" target="_blank" rel="noopener">agosto de 2025</a>). <span id="proy-comparar"></span></li>
    <li><b>Lo que no está:</b> impuestos, inflación, cambios en el dólar, dinero de inversionistas y la comisión de las tiendas de aplicaciones. Todo va en pesos de hoy y el plan supone cobrar en la web.</li>
    <li><b>Es un mapa, no una promesa.</b> Cada octubre se cambia lo supuesto por lo real y se vuelve a correr.</li>
  </ul>
  <p>Mueve cualquier supuesto y todo se recalcula. Los cambios se guardan en este navegador.</p>
  <div class="gtm-calc-in proy-supuestos" id="proy-supuestos"></div>
  <p><button type="button" class="gtm-liga" id="proy-restaurar">Volver a los supuestos del plan</button></p>
</section>`;
}

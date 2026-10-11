import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser } from "./helpers";
import { MODELO, ETAPAS, TRAMOS, repartoDeCien, calendarioDe, seccionProyecciones } from "../src/lib/proyecciones";
import { PUNTOS } from "../src/lib/gtm-puntos";

const conCorreo = async (email: string) => { const id = await createUser(); await env.DB.prepare("UPDATE users SET email = ?, name = ? WHERE id = ?").bind(email, email.split("@")[0], id).run(); return id; };
const pedir = async (path: string, uid?: string) => app.request(path, { headers: uid ? { Cookie: await cookieFor(uid) } : {} }, env);

describe("proyecciones", () => {
  it("es una pestaña del plan: las ligas viejas llevan ahí y el candado es el del plan", async () => {
    for (const liga of ["/proyecciones", "/proyeccion", "/gtm/proyecciones"]) {
      const r = await pedir(liga);
      expect(r.status).toBe(302);
      expect(r.headers.get("Location")).toBe("/gtm#proyecciones");
    }
    const sin = await pedir("/gtm");
    expect(sin.status).toBe(401);
    expect(await sin.text()).not.toContain("__PROY");
    const ajena = await pedir("/gtm", await createUser());
    expect(ajena.status).toBe(403);
    const html = await ajena.text();
    expect(html).not.toContain("crecimiento");
    expect(html).not.toContain("tab-proyecciones");
  });

  it("el equipo la ve dentro del Go-to-market, con el modelo y lo real de la aplicación", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx");
    const r = await pedir("/gtm", ricardo);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    const html = await r.text();
    expect(html).toContain('data-tab="proyecciones"');
    expect(html).toContain('id="tab-proyecciones"');
    expect(html).toContain("window.__PROY");
    expect(html).toContain('"anio1":[');
    expect(html).toContain('"real":[');
    expect(html).toContain("/proyecciones.js");
    expect(html).toContain("Los próximos 18 años");
    // Ya no manda a otra página: todo vive en el mismo tablero.
    expect(html).not.toContain('href="/proyecciones"');
    // Candidatos va antes que Proyecciones, que es la última pestaña.
    expect(html.indexOf('data-tab="candidatos"')).toBeLessThan(html.indexOf('data-tab="proyecciones"'));
  });

  it("el modelo es coherente con el plan: 18 años, el año 1 sigue los puntos de control y cada etapa rinde menos", () => {
    expect(MODELO.anios).toBe(18);
    expect(ETAPAS.length).toBe(18);
    expect(MODELO.etapas.length).toBe(18);
    expect(MODELO.anio1.length).toBe(12);
    expect(MODELO.crecimiento.length).toBe(MODELO.anios - 1);
    expect([...MODELO.anio1].sort((a, b) => a - b)).toEqual(MODELO.anio1); // la puerta nunca baja en el año 1
    expect([...MODELO.crecimiento].sort((a, b) => b - a)).toEqual(MODELO.crecimiento); // cada año crece igual o menos
    expect(Math.min(...MODELO.crecimiento)).toBeGreaterThan(1); // y nunca deja de crecer
    // Los puntos de control con fecha en meses caen sobre la curva del año 1.
    const enMes = (mes: number) => MODELO.anio1[mes - 1];
    expect(enMes(3)).toBe(PUNTOS.find((p) => p.id === "pc08")!.metas.puerta);
    expect(enMes(6)).toBe(PUNTOS.find((p) => p.id === "pc11")!.metas.puerta);
    expect(enMes(10)).toBe(PUNTOS.find((p) => p.id === "pc13")!.metas.puerta);
    const claves = MODELO.supuestos.map((s) => s[0]);
    for (const k of ["comision", "tarjeta1", "tarjeta3", "video", "equipo", "equipoPiso", "marketing", "marketingPiso", "expansion", "soporte", "soportePiso", "porCreador", "porPersona", "dolar"]) expect(claves).toContain(k);
    expect(new Set(claves).size).toBe(claves.length);
    expect(Object.keys(MODELO.escenarios)).toEqual(["prudente", "base", "ambicioso"]);
  });

  it("la ruta va en orden: ciudades, países, continentes y a fondo, sin huecos", () => {
    expect(TRAMOS.map((t) => t[0])).toEqual(["ciudades", "paises", "continentes", "fondo"]);
    // Cada etapa cae en un tramo que existe y los tramos nunca se regresan.
    const orden = ETAPAS.map((e) => TRAMOS.findIndex((t) => t[0] === e[0]));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    for (const t of TRAMOS) expect(ETAPAS.some((e) => e[0] === t[0])).toBe(true);
    // El año 1 es el plan (sin multiplicador); los demás traen el suyo.
    expect(ETAPAS[0][3]).toBeNull();
    expect(ETAPAS.slice(1).every((e) => typeof e[3] === "number")).toBe(true);
    expect(ETAPAS.every((e) => e[1].length > 2 && e[2].length > 10)).toBe(true);
    // El calendario: la cuenta arranca en octubre de 2026 y cada año toca dos.
    expect(calendarioDe(1)).toBe("2026–27");
    expect(calendarioDe(18)).toBe("2043–44");
  });

  it("los gastos suman menos de cien y la página dice lo mismo que el modelo", () => {
    const r = repartoDeCien();
    expect(r.gastos).toBe(r.renglones.reduce((n, x) => n + x[1], 0));
    expect(r.gastos + r.queda).toBe(100);
    expect(r.queda).toBeGreaterThan(15);
    expect(r.queda).toBeLessThan(40);
    const html = seccionProyecciones();
    expect(html).toContain(`se gastan ${r.gastos} y quedan ${r.queda}`);
    for (const e of ETAPAS) expect(html).toContain(e[1]);
    for (const id of ["proy-escenarios", "proy-vistas", "proy-resumen", "proy-scroll", "proy-lienzo", "proy-deslizador", "proy-supuestos", "proy-restaurar", "proy-comparar"]) expect(html).toContain(`id="${id}"`);
  });
});

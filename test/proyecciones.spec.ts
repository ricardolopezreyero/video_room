import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser } from "./helpers";
import { MODELO } from "../src/lib/proyecciones";
import { PUNTOS } from "../src/lib/gtm-puntos";

const conCorreo = async (email: string) => { const id = await createUser(); await env.DB.prepare("UPDATE users SET email = ?, name = ? WHERE id = ?").bind(email, email.split("@")[0], id).run(); return id; };
const pedir = async (path: string, uid?: string) => app.request(path, { headers: uid ? { Cookie: await cookieFor(uid) } : {} }, env);

describe("proyecciones", () => {
  it("es del equipo: sin sesión 401, cuenta ajena 403 y sin el modelo", async () => {
    const sin = await pedir("/proyecciones");
    expect(sin.status).toBe(401);
    expect(await sin.text()).not.toContain("__PROY");
    const r = await pedir("/proyecciones", await createUser());
    expect(r.status).toBe(403);
    expect(await r.text()).not.toContain("crecimiento");
  });

  it("el equipo ve la página con el modelo, lo real de la aplicación y el camino de regreso al plan", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx");
    const r = await pedir("/proyecciones", ricardo);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    const html = await r.text();
    expect(html).toContain("window.__PROY");
    expect(html).toContain('"anio1":[');
    expect(html).toContain('"real":[');
    expect(html).toContain('href="/gtm"');
    expect(html).toContain("/proyecciones.js");
    // Y del plan se llega aquí.
    expect(await (await pedir("/gtm", ricardo)).text()).toContain('href="/proyecciones"');
    expect((await pedir("/proyeccion")).headers.get("Location")).toBe("/proyecciones");
  });

  it("el modelo es coherente con el plan: 15 años, el año 1 sigue los puntos de control y el crecimiento baja", () => {
    expect(MODELO.anios).toBe(15);
    expect(MODELO.anio1.length).toBe(12);
    expect(MODELO.crecimiento.length).toBe(MODELO.anios - 1);
    expect([...MODELO.anio1].sort((a, b) => a - b)).toEqual(MODELO.anio1); // la puerta nunca baja en el año 1
    expect([...MODELO.crecimiento].sort((a, b) => b - a)).toEqual(MODELO.crecimiento); // cada año crece igual o menos
    expect(Math.min(...MODELO.crecimiento)).toBeGreaterThan(1);
    // Los puntos de control con fecha en meses caen sobre la curva del año 1.
    const enMes = (mes: number) => MODELO.anio1[mes - 1];
    expect(enMes(3)).toBe(PUNTOS.find((p) => p.id === "pc08")!.metas.puerta);
    expect(enMes(6)).toBe(PUNTOS.find((p) => p.id === "pc11")!.metas.puerta);
    expect(enMes(10)).toBe(PUNTOS.find((p) => p.id === "pc13")!.metas.puerta);
    const claves = MODELO.supuestos.map((s) => s[0]);
    for (const k of ["comision", "tarjeta1", "tarjeta3", "video", "equipo", "equipoPiso", "marketing", "marketingPiso", "soporte", "soportePiso", "porCreador", "porPersona"]) expect(claves).toContain(k);
    expect(Object.keys(MODELO.escenarios)).toEqual(["prudente", "base", "ambicioso"]);
  });
});

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser } from "./helpers";
import { TAREAS } from "../src/lib/gtm-tareas";

const conCorreo = async (email: string) => { const id = await createUser(); await env.DB.prepare("UPDATE users SET email = ?, name = ? WHERE id = ?").bind(email, email.split("@")[0], id).run(); return id; };
const pedir = async (path: string, uid?: string, body?: unknown) => app.request(path, { method: body ? "POST" : "GET", headers: Object.assign({ "Content-Type": "application/json" }, uid ? { Cookie: await cookieFor(uid) } : {}), body: body ? JSON.stringify(body) : undefined }, env);

describe("go-to-market", () => {
  it("el checklist tiene más de 200 tareas, sin ids repetidos y con etiquetas válidas", () => {
    expect(TAREAS.length).toBeGreaterThanOrEqual(200);
    expect(new Set(TAREAS.map((t) => t[0])).size).toBe(TAREAS.length);
    for (const t of TAREAS) {
      expect([1, 2, 3, 4, 5]).toContain(t[1]);
      expect(["MKT", "CON", "VEN", "ALI", "PRO", "ADM", "DAT"]).toContain(t[2]);
      expect(["P", "IA", "A"]).toContain(t[3]);
      expect([1, 2, 3, 4]).toContain(t[4]);
      expect(["u", "d", "s", "m"]).toContain(t[5]);
      expect(t[6].length).toBeGreaterThan(8);
      expect(t[7].length).toBeGreaterThan(30);
    }
  });

  it("solo el equipo ve el plan: sin sesión 401, cuenta ajena 403 y sin contenido", async () => {
    const sin = await pedir("/gtm");
    expect(sin.status).toBe(401);
    expect(await sin.text()).not.toContain("El after");
    const ajeno = await createUser();
    const r = await pedir("/gtm", ajeno);
    expect(r.status).toBe(403);
    const html = await r.text();
    expect(html).not.toContain("__GTM");
    expect(html).toContain("no está en la lista");
    expect((await pedir("/api/gtm", ajeno)).status).toBe(403);
    expect((await pedir("/api/gtm/tarea", ajeno, { id: "101", hecha: true })).status).toBe(403);
  });

  it("el equipo ve la página, palomea, y el estado es compartido", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx"), yudiel = await conCorreo("yudiel@superleads.mx");
    const pag = await pedir("/gtm", ricardo);
    expect(pag.status).toBe(200);
    const html = await pag.text();
    expect(html).toContain("window.__GTM");
    expect(html).toContain("La sala es el negocio");
    expect(pag.headers.get("x-robots-tag")).toBe("noindex");
    expect(pag.headers.get("cache-control")).toContain("no-store");

    expect((await pedir("/api/gtm/tarea", ricardo, { id: "no-existe", hecha: true })).status).toBe(400);
    const ok = await pedir("/api/gtm/tarea", ricardo, { id: "101", hecha: true });
    expect((await ok.json()) as { ok: boolean }).toMatchObject({ ok: true, id: "101", hecha: true, por: "ricardo@superleads.mx" });
    // otra persona del equipo lo ve
    const estado = (await (await pedir("/api/gtm", yudiel)).json()) as { hechas: Record<string, { por: string }>; real: { salas: number }; equipo: { email: string; fijo: boolean }[] };
    expect(estado.hechas["101"].por).toBe("ricardo@superleads.mx");
    expect(typeof estado.real.salas).toBe("number");
    expect(estado.equipo.some((p) => p.email === "yudiel@superleads.mx" && p.fijo)).toBe(true);
    // y lo puede despalomear
    await pedir("/api/gtm/tarea", yudiel, { id: "101", hecha: false });
    const despues = (await (await pedir("/api/gtm", ricardo)).json()) as { hechas: Record<string, unknown> };
    expect(despues.hechas["101"]).toBeUndefined();
  });

  it("solo quien administra da acceso; la persona agregada entra y la quitada ya no", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx"), yudiel = await conCorreo("yudiel@superleads.mx"), nueva = await conCorreo("intensa@ejemplo.mx");
    expect((await pedir("/gtm", nueva)).status).toBe(403);
    expect((await pedir("/api/gtm/equipo", yudiel, { email: "intensa@ejemplo.mx" })).status).toBe(403);
    expect((await pedir("/api/gtm/equipo", ricardo, { email: "no-es-correo" })).status).toBe(400);
    const r = await pedir("/api/gtm/equipo", ricardo, { email: " Intensa@Ejemplo.mx " });
    expect(((await r.json()) as { equipo: { email: string; fijo: boolean }[] }).equipo.some((p) => p.email === "intensa@ejemplo.mx" && !p.fijo)).toBe(true);
    expect((await pedir("/gtm", nueva)).status).toBe(200);
    expect((await pedir("/api/gtm/tarea", nueva, { id: "202", hecha: true })).status).toBe(200);
    await pedir("/api/gtm/equipo", ricardo, { email: "intensa@ejemplo.mx", quitar: true });
    expect((await pedir("/gtm", nueva)).status).toBe(403);
  });
});

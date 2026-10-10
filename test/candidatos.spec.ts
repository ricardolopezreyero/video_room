import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser } from "./helpers";

const conCorreo = async (email: string) => { const id = await createUser(); await env.DB.prepare("UPDATE users SET email = ?, name = ? WHERE id = ?").bind(email, email.split("@")[0], id).run(); return id; };
const pedir = async (path: string, uid?: string, body?: unknown) => app.request(path, { method: body ? "POST" : "GET", headers: Object.assign({ "Content-Type": "application/json" }, uid ? { Cookie: await cookieFor(uid) } : {}), body: body ? JSON.stringify(body) : undefined }, env);
const sembrar = (id: string, grupo: string, orden: number, datos: unknown) => env.DB.prepare("INSERT INTO candidatos (id, vacante, grupo, orden, datos) VALUES (?, 'ceo', ?, ?, ?)").bind(id, grupo, orden, JSON.stringify(datos)).run();

describe("candidatos", () => {
  it("las fichas son solo del equipo: sin sesión 401 y cuenta ajena 403, en las tres rutas", async () => {
    await sembrar("ceo-prueba-privada", "top", 1, { nombre: "Persona Privada", liga: "https://example.com/in/privada" });
    expect((await pedir("/api/gtm/candidatos")).status).toBe(401);
    const ajeno = await createUser();
    const r = await pedir("/api/gtm/candidatos", ajeno);
    expect(r.status).toBe(403);
    expect(await r.text()).not.toContain("Persona Privada");
    expect((await pedir("/api/gtm/candidatos", ajeno, { nombre: "Alguien Más" })).status).toBe(403);
    expect((await pedir("/api/gtm/candidatos/ceo-prueba-privada", ajeno, { estado: "descartado" })).status).toBe(403);
    expect((await pedir("/api/gtm/candidatos/ceo-prueba-privada", undefined, { estado: "descartado" })).status).toBe(401);
    // La página cerrada de /gtm tampoco las trae.
    expect(await (await pedir("/gtm", ajeno)).text()).not.toContain("Persona Privada");
  });

  it("el equipo recibe la búsqueda aparte de las fichas, y las principales van primero y en orden", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx");
    await sembrar("ceo-meta", "meta", 0, { titulo: "Quién debería dirigir", rasgos: ["Ambición", "Método"] });
    await sembrar("ceo-banca-uno", "banca", 6, { nombre: "Reserva Uno", por_que_no: "Todavía no." });
    await sembrar("ceo-dos", "top", 2, { nombre: "Segunda Persona", rasgos: { Ambición: [3, "se ve"], Método: [1, "falta"] } });
    await sembrar("ceo-uno", "top", 1, { nombre: "Primera Persona" });
    const j = await (await pedir("/api/gtm/candidatos", ricardo)).json<{ meta: { titulo: string }; fichas: { id: string; grupo: string; estado: string; nombre: string }[] }>();
    expect(j.meta.titulo).toBe("Quién debería dirigir");
    expect(j.fichas.some((f) => f.id === "ceo-meta")).toBe(false);
    const ids = j.fichas.map((f) => f.id);
    expect(ids.indexOf("ceo-uno")).toBeLessThan(ids.indexOf("ceo-dos"));
    expect(ids.indexOf("ceo-dos")).toBeLessThan(ids.indexOf("ceo-banca-uno"));
    expect(j.fichas.find((f) => f.id === "ceo-uno")).toMatchObject({ grupo: "top", estado: "por_contactar", nombre: "Primera Persona" });
    // Otra vacante no mezcla fichas.
    expect((await (await pedir("/api/gtm/candidatos?vacante=otra", ricardo)).json<{ fichas: unknown[] }>()).fichas.length).toBe(0);
  });

  it("estado y notas se guardan con quién y cuándo, y los ve todo el equipo", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx"), yudiel = await conCorreo("yudiel@superleads.mx");
    await sembrar("ceo-mover", "top", 3, { nombre: "Persona Que Se Mueve" });
    await sembrar("ceo-meta-2", "meta", 0, {});
    expect((await pedir("/api/gtm/candidatos/ceo-mover", ricardo, { estado: "contratado_ya" })).status).toBe(400);
    expect((await pedir("/api/gtm/candidatos/no-existe", ricardo, { estado: "contactado" })).status).toBe(404);
    expect((await pedir("/api/gtm/candidatos/ceo-meta-2", ricardo, { estado: "contactado" })).status).toBe(404);
    const r = await pedir("/api/gtm/candidatos/ceo-mover", ricardo, { estado: "contactado" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, estado: "contactado", notas: "", updated_por: "ricardo@superleads.mx" });
    // Las notas no pisan el estado, y al revés.
    await pedir("/api/gtm/candidatos/ceo-mover", yudiel, { notas: "Le escribí el lunes. " + "x".repeat(5000) });
    const j = await (await pedir("/api/gtm/candidatos", ricardo)).json<{ fichas: { id: string; estado: string; notas: string; updated_por: string }[] }>();
    const f = j.fichas.find((x) => x.id === "ceo-mover")!;
    expect(f.estado).toBe("contactado");
    expect(f.notas.startsWith("Le escribí el lunes.")).toBe(true);
    expect(f.notas.length).toBe(4000);
    expect(f.updated_por).toBe("yudiel@superleads.mx");
  });

  it("el equipo puede agregar a alguien: entra a la banca, y la liga solo puede ser http(s)", async () => {
    const victor = await conCorreo("victor@superleads.mx");
    expect(await (await pedir("/api/gtm/candidatos", victor, { nombre: "Al" })).json()).toMatchObject({ error: "falta_nombre" });
    expect(await (await pedir("/api/gtm/candidatos", victor, { nombre: "Persona Rara", liga: "javascript:alert(1)" })).json()).toMatchObject({ error: "liga_invalida" });
    expect((await pedir("/api/gtm/candidatos", victor, { nombre: "Persona Rara", liga: 'https://x.test/"onmouseover="x' })).status).toBe(400);
    const r = await pedir("/api/gtm/candidatos", victor, { nombre: "  Persona Encontrada ", liga: "https://example.com/in/encontrada", titular: "Abre ciudades", ciudad: "Torreón", porque: "Vendió uno por uno." });
    expect(r.status).toBe(200);
    const { ficha } = await r.json<{ ficha: { id: string; grupo: string; nombre: string; agregado_por: string; resumen: string } }>();
    expect(ficha).toMatchObject({ grupo: "banca", nombre: "Persona Encontrada", agregado_por: "victor@superleads.mx", resumen: "Vendió uno por uno." });
    expect(ficha.id.startsWith("cand_")).toBe(true);
    const j = await (await pedir("/api/gtm/candidatos", victor)).json<{ fichas: { id: string; liga: string }[] }>();
    expect(j.fichas.find((f) => f.id === ficha.id)?.liga).toBe("https://example.com/in/encontrada");
  });

  it("/candidatos lleva a la pestaña del plan y la página del equipo trae la pestaña sin fichas en el HTML", async () => {
    const r = await pedir("/candidatos");
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("/gtm#candidatos");
    const ricardo = await conCorreo("ricardo@superleads.mx");
    await sembrar("ceo-no-en-html", "top", 1, { nombre: "Persona Que No Va En El HTML" });
    const html = await (await pedir("/gtm", ricardo)).text();
    expect(html).toContain('data-tab="candidatos"');
    expect(html).toContain("/candidatos.js");
    expect(html).not.toContain("Persona Que No Va En El HTML");
  });
});

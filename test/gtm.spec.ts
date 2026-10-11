import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom, createLiveSession } from "./helpers";
import { TAREAS } from "../src/lib/gtm-tareas";
import { PUNTOS, puntoAlcanzado } from "../src/lib/gtm-puntos";
import { BLOQUES } from "../src/lib/gtm-tareas";
import { puedePalomear } from "../src/lib/gtm";

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
    // Ver sí; palomear no: su correo no es de la casa.
    const no = await pedir("/api/gtm/tarea", nueva, { id: "202", hecha: true });
    expect(no.status).toBe(403);
    expect(await no.json()).toMatchObject({ error: "solo_correos_de_la_casa" });
    await pedir("/api/gtm/equipo", ricardo, { email: "intensa@ejemplo.mx", quitar: true });
    expect((await pedir("/gtm", nueva)).status).toBe(403);
  });

  it("los puntos de control cuelgan de tareas reales, van en orden y sus metas nunca bajan", () => {
    expect(PUNTOS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PUNTOS.map((p) => p.id)).size).toBe(PUNTOS.length);
    const orden = TAREAS.map((t) => t[0]);
    let pos = -1;
    for (const p of PUNTOS) {
      const t = TAREAS.find((x) => x[0] === p.despues);
      expect(t, `la tarea ${p.despues} de ${p.id}`).toBeTruthy();
      expect(t![1]).toBe(p.fase); // el punto vive en el mismo paso que su tarea
      expect(orden.indexOf(p.despues)).toBeGreaterThan(pos); // y aparecen en orden a lo largo del checklist
      pos = orden.indexOf(p.despues);
      expect(TAREAS.some((x) => x[0] === p.id)).toBe(false); // nunca choca con el id de una tarea
      for (const id of p.empujan) expect(orden, `tarea ${id} que empuja ${p.id}`).toContain(id);
      expect(p.titulo.length).toBeGreaterThan(8);
      expect(p.detalle.length).toBeGreaterThan(40);
      expect(p.si_no.length).toBeGreaterThan(30);
    }
    // Cada paso tiene al menos un punto, y cada meta crece o se queda igual.
    for (const f of [1, 2, 3, 4, 5]) expect(PUNTOS.some((p) => p.fase === f)).toBe(true);
    for (const k of ["creadores", "pagan", "puerta", "casa"] as const) {
      const serie = PUNTOS.map((p) => p.metas[k]).filter((v): v is number => v != null);
      expect([...serie].sort((a, b) => a - b)).toEqual(serie);
    }
    // La casa se queda con 20 % de la puerta en todas las metas.
    for (const p of PUNTOS) if (p.metas.puerta && p.metas.casa) expect(p.metas.casa).toBe(p.metas.puerta * 0.2);
    // El último punto con puerta es el millón.
    expect(PUNTOS.filter((p) => p.metas.casa).pop()!.metas.casa).toBe(1000000);
  });

  it("un punto de control no se palomea a mano: se cumple solo cuando los números reales llegan", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx");
    const html = await (await pedir("/gtm", ricardo)).text();
    expect(html).toContain('"puntos":[');
    expect(html).toContain("puntos de control");
    // A mano no se puede.
    expect((await pedir("/api/gtm/tarea", ricardo, { id: "pc01", hecha: true })).status).toBe(400);
    const antes = (await (await pedir("/api/gtm", ricardo)).json()) as { hechas: Record<string, unknown>; real: { creadores_mes: number; pagan_mes: number; puerta_mes_cents: number; casa_mes_cents: number; casa_3m_min_cents: number } };
    expect(antes.hechas.pc01).toBeUndefined();
    expect(puntoAlcanzado(PUNTOS[0], antes.real)).toBe(false);

    // Una sala real cobra cinco entradas de $60 a cinco personas distintas: $300 de puerta, $60 para la casa.
    const creador = await createUser();
    const sala = await createRoom(creador), sesion = await createLiveSession(sala.id);
    for (let i = 0; i < 5; i++) {
      const u = await createUser();
      await env.DB.prepare("INSERT INTO passes (id, session_id, user_id, expires_at, device_id, amount_cents, creator_cents) VALUES (?, ?, ?, unixepoch() + 3600, 'd', 6000, 4800)").bind(`pase_pc_${i}`, sesion, u).run();
    }
    await env.DB.prepare("INSERT INTO ledger (id, user_id, amount_cents, type, ref_id, idem_key) VALUES ('ldg_pc_1', ?, 24000, 'ganancia_entrada', 'x', 'idem_pc_1')").bind(creador).run();

    const j = (await (await pedir("/api/gtm", ricardo)).json()) as { hechas: Record<string, { por: string; at: number }>; real: { creadores_mes: number; pagan_mes: number; puerta_mes_cents: number; casa_mes_cents: number } };
    expect(j.real).toMatchObject({ creadores_mes: 1, pagan_mes: 5, puerta_mes_cents: 30000, casa_mes_cents: 6000 });
    expect(j.hechas.pc01.por).toBe("sistema");
    expect(j.hechas.pc02).toBeUndefined(); // el siguiente pide 20 personas y $1,500
    // La fecha queda guardada aunque los números del mes cambien después.
    await env.DB.prepare("DELETE FROM passes WHERE id LIKE 'pase_pc_%'").run();
    const luego = (await (await pedir("/api/gtm", ricardo)).json()) as { hechas: Record<string, { at: number }>; real: { puerta_mes_cents: number } };
    expect(luego.real.puerta_mes_cents).toBe(0);
    expect(luego.hechas.pc01.at).toBe(j.hechas.pc01.at);
    // Y nadie lo puede despalomear.
    expect((await pedir("/api/gtm/tarea", ricardo, { id: "pc01", hecha: false })).status).toBe(400);
  });

  it("palomear es de la casa: solo @superleads.mx y @ingenieriadigital.mx, y queda el correo y la hora", async () => {
    expect(puedePalomear("Ricardo@SuperLeads.mx")).toBe(true);
    expect(puedePalomear("contacto@ingenieriadigital.mx")).toBe(true);
    for (const c of ["reyero.ricardo@gmail.com", "x@superleads.mx.evil.com", "x@notsuperleads.mx", "superleads.mx", "", null]) expect(puedePalomear(c)).toBe(false);

    const ricardo = await conCorreo("ricardo@superleads.mx"), inge = await conCorreo("contacto@ingenieriadigital.mx"), gmail = await conCorreo("reyero.ricardo@gmail.com");
    await env.DB.prepare("INSERT OR IGNORE INTO gtm_equipo (email, agregado_por) VALUES ('contacto@ingenieriadigital.mx', 'ricardo@superleads.mx')").run();
    // El correo personal del fundador ve el plan, pero no palomea.
    expect((await pedir("/gtm", gmail)).status).toBe(200);
    expect((await pedir("/api/gtm/tarea", gmail, { id: "105", hecha: true })).status).toBe(403);
    expect(await (await pedir("/gtm", gmail)).text()).toContain("puede ver el plan, no palomear");

    const antes = Math.floor(Date.now() / 1000);
    const r = (await (await pedir("/api/gtm/tarea", inge, { id: "105", hecha: true })).json()) as { por: string; at: number };
    expect(r.por).toBe("contacto@ingenieriadigital.mx");
    expect(r.at).toBeGreaterThanOrEqual(antes);
    await pedir("/api/gtm/tarea", ricardo, { id: "106", hecha: true });
    await pedir("/api/gtm/tarea", ricardo, { id: "106", hecha: false });
    const j = (await (await pedir("/api/gtm", gmail)).json()) as { hechas: Record<string, { por: string; at: number }>; bitacora: { tarea: string; hecha: boolean; por: string; at: number }[] };
    expect(j.hechas["105"]).toMatchObject({ por: "contacto@ingenieriadigital.mx", at: r.at });
    expect(j.hechas["106"]).toBeUndefined();
    // La bitácora guarda todo, lo más nuevo primero: quién, qué y cuándo, también lo desmarcado.
    expect(j.bitacora.slice(0, 3).map((e) => `${e.tarea}:${e.hecha}:${e.por}`)).toEqual(["106:false:ricardo@superleads.mx", "106:true:ricardo@superleads.mx", "105:true:contacto@ingenieriadigital.mx"]);
  });

  it("el checklist va en bloques: cada bloque empieza en una tarea real y ninguna queda fuera de orden de paso", () => {
    expect(BLOQUES.length).toBeGreaterThanOrEqual(25);
    const ids = TAREAS.map((t) => t[0]);
    for (const [primera, titulo] of BLOQUES) { expect(ids).toContain(primera); expect(titulo.length).toBeGreaterThan(5); }
    expect(new Set(BLOQUES.map((b) => b[0])).size).toBe(BLOQUES.length);
    // Los pasos van corridos: 1, luego 2… y la primera tarea de cada paso abre bloque.
    const fases = TAREAS.map((t) => t[1]);
    expect([...fases].sort((a, b) => a - b)).toEqual(fases);
    for (const f of [1, 2, 3, 4, 5]) expect(BLOQUES.some((b) => b[0] === TAREAS.find((t) => t[1] === f)![0])).toBe(true);
    // Cada punto de control cierra un bloque: la tarea siguiente abre otro (o se acaba el paso).
    for (const p of PUNTOS) { const sig = TAREAS[ids.indexOf(p.despues) + 1]; expect(!sig || sig[1] !== p.fase || BLOQUES.some((b) => b[0] === sig[0]), `${p.id} tras ${p.despues}`).toBe(true); }
  });
});

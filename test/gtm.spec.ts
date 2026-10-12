import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom, createLiveSession } from "./helpers";
import { TAREAS } from "../src/lib/gtm-tareas";
import { edicionesGtm, tareasDelBloque, BLOQUES_GTM, BLOQUE_DE } from "../src/lib/gtm-ediciones";
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

  it("los indicadores salen en vivo de lo que pasa en la aplicación, mes por mes", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx");
    type Ind = { mes: string; dia: number; dias_mes: number; meses: { mes: string; creadores: number; pagan: number; puerta_cents: number; casa_cents: number; entradas: number; sesiones: number; sesiones_pagadas: number; salas_nuevas: number; registros: number; envios_cents: number; recargas_cents: number }[]; embudo: { registros: number; salas: number; transmitieron: number; cobraron: number; primer_peso_n: number; espectador_a_creador: number }; fuentes: { fuente: string; total: number; cobran: number }[]; top: { slug: string; puerta_cents: number; entradas: number }[] };
    const pedirInd = async () => ((await (await pedir("/api/gtm?fresco=1", ricardo)).json()) as { indicadores: Ind }).indicadores;
    const a = await pedirInd();
    expect(a.meses.length).toBe(6);
    expect(a.meses[5].mes).toBe(a.mes);
    expect(a.dia).toBeGreaterThanOrEqual(1);
    expect(a.dias_mes).toBeGreaterThanOrEqual(28);
    const base = a.meses[5];

    // Pasa algo en la aplicación: una creadora que llegó por TikTok abre sala, transmite y cobra tres entradas de $60.
    const creadora = await createUser();
    await env.DB.prepare("UPDATE users SET signup_utm_source = 'tiktok' WHERE id = ?").bind(creadora).run();
    const sala = await createRoom(creadora, "sala-ind"), sesion = await createLiveSession(sala.id);
    const publico = [await createUser(), await createUser()];
    for (const [i, u] of [publico[0], publico[1], publico[0]].entries()) await env.DB.prepare("INSERT INTO passes (id, session_id, user_id, expires_at, device_id, amount_cents, creator_cents) VALUES (?, ?, ?, unixepoch() + 3600, 'd', 6000, 4800)").bind(`pase_ind_${i}`, sesion, u).run();
    await env.DB.prepare("INSERT INTO ledger (id, user_id, amount_cents, type, ref_id, idem_key) VALUES ('ldg_ind_1', ?, 14400, 'ganancia_entrada', 'x', 'idem_ind_1'), ('ldg_ind_2', ?, 20000, 'recarga', 'x', 'idem_ind_2')").bind(creadora, publico[0]).run();
    await env.DB.prepare("INSERT INTO tips (id, session_id, from_user, to_user, amount_cents) VALUES ('tip_ind_1', ?, ?, ?, 5000)").bind(sesion, publico[1], creadora).run();

    const b = await pedirInd(), mes = b.meses[5];
    expect(mes.creadores - base.creadores).toBe(1);
    expect(mes.pagan - base.pagan).toBe(2); // dos personas distintas, aunque una pagó dos veces
    expect(mes.entradas - base.entradas).toBe(3);
    expect(mes.puerta_cents - base.puerta_cents).toBe(18000);
    expect(mes.casa_cents - base.casa_cents).toBe(3600);
    expect(mes.sesiones - base.sesiones).toBe(1);
    expect(mes.sesiones_pagadas - base.sesiones_pagadas).toBe(1);
    expect(mes.salas_nuevas - base.salas_nuevas).toBe(1);
    expect(mes.envios_cents - base.envios_cents).toBe(5000);
    expect(mes.recargas_cents - base.recargas_cents).toBe(20000);
    expect(b.embudo.cobraron - a.embudo.cobraron).toBe(1);
    expect(b.embudo.transmitieron - a.embudo.transmitieron).toBe(1);
    expect(b.embudo.primer_peso_n - a.embudo.primer_peso_n).toBe(1);
    expect(b.fuentes.find((f) => f.fuente === "tiktok")).toMatchObject({ total: 1, cobran: 1 });
    expect(b.top.find((t) => t.slug === "sala-ind")).toMatchObject({ puerta_cents: 18000, entradas: 3 });
    // La página los trae desde el primer momento y la pestaña existe.
    const html = await (await pedir("/gtm", ricardo)).text();
    expect(html).toContain('data-tab="indicadores"');
    expect(html).toContain('"indicadores":{');
    // Y sin acceso no salen.
    expect((await pedir("/api/gtm?fresco=1", await createUser())).status).toBe(403);
  });

  it("quien dirige edita una tarea sin tocar el plan: queda encima, con correo y hora, y se puede regresar", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx"), gmail = await conCorreo("reyero.ricardo@gmail.com");
    const plan = TAREAS.find((t) => t[0] === "107")!;
    const cuerpo = { titulo: "Decidir la recarga mínima: $100", detalle: "Quitar la de $50 y resaltar $200. Hecho cuando la recarga promedio pasa de $150.", area: plan[2], quien: "P", esfuerzo: 1, ritmo: plan[5] };
    // Es administrativo: mismo candado que las palomitas.
    expect((await pedir("/api/gtm/tarea/107/editar", gmail, cuerpo)).status).toBe(403);
    expect((await pedir("/api/gtm/tarea/107/editar", undefined, cuerpo)).status).toBe(401);
    expect((await pedir("/api/gtm/tarea/no-existe/editar", ricardo, cuerpo)).status).toBe(400);
    expect((await pedir("/api/gtm/tarea/107/editar", ricardo, { ...cuerpo, titulo: "x" })).status).toBe(400);
    expect((await pedir("/api/gtm/tarea/107/editar", ricardo, { ...cuerpo, area: "XXX" })).status).toBe(400);
    expect((await pedir("/api/gtm/tarea/107/borrar", ricardo, {})).status).toBe(400);

    const r = await pedir("/api/gtm/tarea/107/editar", ricardo, cuerpo);
    expect(r.status).toBe(200);
    const j = (await (await pedir("/api/gtm", gmail)).json()) as { ediciones: Record<string, { titulo?: string; detalle?: string; quien?: string; esfuerzo?: number; area?: string; editada_por?: string; editada_at?: number }>; bitacora: { tarea: string; accion: string; por: string; nota: string }[] };
    // Solo se guarda lo que cambió: el área quedó igual al plan y no viaja.
    expect(j.ediciones["107"]).toMatchObject({ titulo: cuerpo.titulo, detalle: cuerpo.detalle, quien: "P", esfuerzo: 1, editada_por: "ricardo@superleads.mx" });
    expect(j.ediciones["107"].area).toBeUndefined();
    expect(j.ediciones["107"].editada_at).toBeGreaterThan(0);
    expect(j.bitacora[0]).toMatchObject({ tarea: "107", accion: "editada", por: "ricardo@superleads.mx" });
    expect(j.bitacora[0].nota).toContain("titulo");
    // El plan escrito no cambió.
    expect(TAREAS.find((t) => t[0] === "107")![6]).toBe(plan[6]);
    // Y se regresa al texto del plan.
    expect((await pedir("/api/gtm/tarea/107/original", ricardo, {})).status).toBe(200);
    const d = (await (await pedir("/api/gtm", ricardo)).json()) as { ediciones: Record<string, unknown>; bitacora: { accion: string }[] };
    expect(d.ediciones["107"]).toBeUndefined();
    expect(d.bitacora[0].accion).toBe("original");
  });

  it("archivar apaga la tarea sin borrarla: no se palomea, queda quién y cuándo, y se regresa", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx"), inge = await conCorreo("contacto@ingenieriadigital.mx");
    await env.DB.prepare("INSERT OR IGNORE INTO gtm_equipo (email, agregado_por) VALUES ('contacto@ingenieriadigital.mx', 'ricardo@superleads.mx')").run();
    await pedir("/api/gtm/tarea", ricardo, { id: "110", hecha: true });
    const a = await pedir("/api/gtm/tarea/110/archivar", inge, { archivada: true, motivo: "La marca ya está registrada" });
    expect(a.status).toBe(200);
    const j = (await (await pedir("/api/gtm", ricardo)).json()) as { hechas: Record<string, unknown>; ediciones: Record<string, { archivada?: boolean; archivada_por?: string; archivada_at?: number; motivo?: string }>; bitacora: { tarea: string; accion: string; por: string; nota: string }[] };
    expect(j.ediciones["110"]).toMatchObject({ archivada: true, archivada_por: "contacto@ingenieriadigital.mx", motivo: "La marca ya está registrada" });
    expect(j.ediciones["110"].archivada_at).toBeGreaterThan(0);
    expect(j.bitacora[0]).toMatchObject({ tarea: "110", accion: "archivada", por: "contacto@ingenieriadigital.mx", nota: "La marca ya está registrada" });
    // Lo que ya estaba hecho se queda hecho; lo que cambia es que ya no se puede palomear ni despalomear.
    expect(j.hechas["110"]).toBeDefined();
    expect((await pedir("/api/gtm/tarea", ricardo, { id: "110", hecha: false })).status).toBe(409);
    // Regresarla la prende otra vez.
    expect((await pedir("/api/gtm/tarea/110/archivar", ricardo, { archivada: false })).status).toBe(200);
    const d = (await (await pedir("/api/gtm", ricardo)).json()) as { ediciones: Record<string, unknown>; bitacora: { accion: string; por: string }[] };
    expect(d.ediciones["110"]).toBeUndefined();
    expect(d.bitacora[0]).toMatchObject({ accion: "restaurada", por: "ricardo@superleads.mx" });
    expect((await pedir("/api/gtm/tarea", ricardo, { id: "110", hecha: false })).status).toBe(200);
  });

  it("mover cambia el lugar o el bloque de una tarea, el resto del bloque conserva su orden y se puede regresar", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx");
    const b1 = BLOQUES_GTM[0], b2 = BLOQUES_GTM[1];
    const antes = tareasDelBloque(b1.llave, {});
    expect(antes[0]).toBe(b1.llave);
    expect(antes.length).toBeGreaterThanOrEqual(2);
    const [primera, segunda] = antes;
    expect((await pedir("/api/gtm/tarea/" + segunda + "/mover", ricardo, { bloque: "no-existe" })).status).toBe(400);
    expect((await pedir("/api/gtm/tarea/" + segunda + "/mover", ricardo, { bloque: b1.llave, antes_de: "999" })).status).toBe(400);
    // La segunda sube al primer lugar de su bloque.
    expect((await pedir("/api/gtm/tarea/" + segunda + "/mover", ricardo, { bloque: b1.llave, antes_de: primera })).status).toBe(200);
    let ed = await edicionesGtm(env);
    expect(tareasDelBloque(b1.llave, ed)).toEqual([segunda, primera, ...antes.slice(2)]);
    // Luego se va al final de otro bloque: sale del primero y entra al segundo.
    const destino = tareasDelBloque(b2.llave, ed);
    expect((await pedir("/api/gtm/tarea/" + segunda + "/mover", ricardo, { bloque: b2.llave })).status).toBe(200);
    ed = await edicionesGtm(env);
    expect(tareasDelBloque(b1.llave, ed)).toEqual([primera, ...antes.slice(2)]);
    expect(tareasDelBloque(b2.llave, ed)).toEqual([...destino, segunda]);
    expect(ed[segunda]).toMatchObject({ bloque: b2.llave, movida_por: "ricardo@superleads.mx" });
    const j = (await (await pedir("/api/gtm", ricardo)).json()) as { bitacora: { tarea: string; accion: string; nota: string }[] };
    expect(j.bitacora[0]).toMatchObject({ tarea: segunda, accion: "movida" });
    expect(j.bitacora[0].nota).toContain(b2.titulo);
    // Ninguna tarea se pierde ni se repite al mover.
    const todas = BLOQUES_GTM.flatMap((b) => tareasDelBloque(b.llave, ed));
    expect(todas.length).toBe(TAREAS.length);
    expect(new Set(todas).size).toBe(TAREAS.length);
    // Y regresa a su lugar del plan.
    expect((await pedir("/api/gtm/tarea/" + segunda + "/mover", ricardo, { original: true })).status).toBe(200);
    ed = await edicionesGtm(env);
    expect(ed[segunda]?.bloque).toBeUndefined();
    expect(tareasDelBloque(b2.llave, ed)).toEqual(destino);
    // Vuelve a su lugar exacto, no al final del bloque, y no queda rastro de orden escrito.
    expect(tareasDelBloque(b1.llave, ed)).toEqual(antes);
    expect(Object.values(ed).some((e) => e.bloque === b1.llave)).toBe(false);
    // También dentro de un bloque: sube un lugar, regresa, y el bloque queda como el plan.
    const tercera = antes[2] ?? segunda;
    await pedir("/api/gtm/tarea/" + tercera + "/mover", ricardo, { bloque: b1.llave, antes_de: primera });
    expect(tareasDelBloque(b1.llave, await edicionesGtm(env))[0]).toBe(tercera);
    await pedir("/api/gtm/tarea/" + tercera + "/mover", ricardo, { original: true });
    expect(tareasDelBloque(b1.llave, await edicionesGtm(env))).toEqual(antes);
  });

  it("la página trae buscador, filtros por tipo y lo que hace falta para editar, archivar y mover", async () => {
    const ricardo = await conCorreo("ricardo@superleads.mx");
    await pedir("/api/gtm/tarea/106/archivar", ricardo, { archivada: true });
    const html = await (await pedir("/gtm", ricardo)).text();
    expect(html).toContain('id="gtm-tipos"');
    expect(html).toContain('id="gtm-filtros"');
    expect(html).toContain('"bloquesOrden":[');
    expect(html).toContain('"bloqueDe":{');
    expect(html).toContain('"ediciones":{');
    expect(html).toMatch(/"106":\{[^}]*"archivada":true/);
    expect(html).toContain("Quien dirige manda sobre la lista");
    // Los bloques cubren todas las tareas, en el orden del plan.
    expect(BLOQUES_GTM.length).toBe(BLOQUES.length);
    for (const t of TAREAS) expect(BLOQUES_GTM.some((b) => b.llave === BLOQUE_DE[t[0]])).toBe(true);
    await pedir("/api/gtm/tarea/106/archivar", ricardo, { archivada: false });
  });
});

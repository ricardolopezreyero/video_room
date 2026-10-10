import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom, createLiveSession } from "./helpers";
import { quiereDeFila, estadoPara, CATEGORIAS } from "../src/lib/correos";
import { calcularCorte, enviarCortesSemanales, etiquetaSemana } from "../src/lib/corte-semanal";
import { corteSemanalEmail } from "../src/lib/email";
import type { Room, User } from "../src/lib/db";

const post = async (path: string, uid: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { Cookie: await cookieFor(uid), "Content-Type": "application/json" }, body: JSON.stringify(body) }, env);

describe("correos: interruptores", () => {
  it("todo empieza prendido; los fijos no se apagan; apagar y prender se guarda", async () => {
    const uid = await createUser();
    const r0 = (await (await app.request("/api/wallet/correos", { headers: { Cookie: await cookieFor(uid) } }, env)).json()) as { correos: { clave: string; prendido: boolean; fijo: boolean }[] };
    expect(r0.correos.length).toBe(CATEGORIAS.length);
    expect(r0.correos.every((c) => c.prendido)).toBe(true);
    const off = (await (await post("/api/wallet/correos", uid, { clave: "resumen_transmision", prendido: false })).json()) as { correos: { clave: string; prendido: boolean }[] };
    expect(off.correos.find((c) => c.clave === "resumen_transmision")!.prendido).toBe(false);
    expect(off.correos.find((c) => c.clave === "corte_semanal")!.prendido).toBe(true);
    const fila = await env.DB.prepare("SELECT correos FROM users WHERE id = ?").bind(uid).first<{ correos: string }>();
    expect(quiereDeFila(fila!.correos, "resumen_transmision")).toBe(false);
    expect(quiereDeFila(fila!.correos, "recibos")).toBe(true);
    expect((await post("/api/wallet/correos", uid, { clave: "recibos", prendido: false })).status).toBe(400);
    const on = (await (await post("/api/wallet/correos", uid, { clave: "resumen_transmision", prendido: true })).json()) as { correos: { clave: string; prendido: boolean }[] };
    expect(on.correos.every((c) => c.prendido)).toBe(true);
    expect(estadoPara(null).every((c) => c.prendido)).toBe(true);
  });
});

describe("corte semanal", () => {
  it("suma los últimos 7 días, compara con la semana anterior y arma el correo", async () => {
    const owner = await createUser({ creatorBalanceCents: 0 });
    const room = await createRoom(owner);
    const sessionId = await createLiveSession(room.id);
    const v1 = await createUser({ balanceCents: 50000 });
    const v2 = await createUser({ balanceCents: 50000 });
    expect((await post(`/api/rooms/${room.slug}/pass`, v1, { device_id: "web" })).status).toBe(200);
    expect((await post(`/api/rooms/${room.slug}/pass`, v2, { device_id: "web" })).status).toBe(200);
    expect((await post(`/api/rooms/${room.slug}/tip`, v1, { amount_cents: 10000, message: "crack" })).status).toBe(200);
    // cerrar la sesión para que cuente como transmisión
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("UPDATE sessions SET status = 'ended', ended_at = ?, started_at = ? WHERE id = ?").bind(now, now - 3600, sessionId).run();
    const user = (await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(owner).first<User>())!;
    const r = (await env.DB.prepare("SELECT * FROM rooms WHERE id = ?").bind(room.id).first<Room>())!;
    const corte = await calcularCorte(env, user, r, now + 60);
    expect(corte.ganado_cents).toBe(1600 + 1600 + 10000);
    expect(corte.entradas).toBe(2);
    expect(corte.personas).toBe(2);
    expect(corte.envios).toBe(1);
    expect(corte.envios_cents).toBe(10000);
    expect(corte.ganado_antes_cents).toBe(0);
    expect(corte.disponible_cents).toBe(13200);
    const mail = corteSemanalEmail({ appUrl: "https://video.capitaltorreon.com", name: "Ana", avatarUrl: null, roomTitle: r.title, corte, ajustesUrl: "https://video.capitaltorreon.com/app/monedero#correos" });
    expect(mail.subject).toContain("$132");
    expect(mail.html).toContain("Elegir qué correos recibo");
    expect(mail.html).toContain("completos");
    // la vista previa de la propia persona
    const prev = await app.request("/api/wallet/corte", { headers: { Cookie: await cookieFor(owner) } }, env);
    expect(((await prev.json()) as { corte: { ganado_cents: number } }).corte.ganado_cents).toBe(13200);
    // el envío: una vez por semana, y solo a quien lo quiere
    const r1 = await enviarCortesSemanales(env, now + 60);
    expect(r1.enviados + r1.omitidos).toBeGreaterThanOrEqual(1);
    const anotado = await env.DB.prepare("SELECT earned_cents FROM cortes_semanales WHERE user_id = ? AND semana = ?").bind(owner, etiquetaSemana(now + 60)).first<{ earned_cents: number }>();
    expect(anotado?.earned_cents).toBe(13200);
    const r2 = await enviarCortesSemanales(env, now + 60);
    expect(r2.enviados).toBe(0);
    // apagado: ni se anota
    const otro = await createUser();
    const sala2 = await createRoom(otro);
    const s2 = await createLiveSession(sala2.id);
    await post(`/api/rooms/${sala2.slug}/pass`, v2, { device_id: "web" });
    await env.DB.prepare("UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?").bind(now, s2).run();
    await post("/api/wallet/correos", otro, { clave: "corte_semanal", prendido: false });
    await enviarCortesSemanales(env, now + 120);
    const no = await env.DB.prepare("SELECT 1 FROM cortes_semanales WHERE user_id = ?").bind(otro).first();
    expect(no).toBeNull();
  });
});

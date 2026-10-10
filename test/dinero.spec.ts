import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom, createLiveSession } from "./helpers";
import { entrySplit, membershipSplit, tipSplit } from "../src/lib/pricing";

const post = async (path: string, uid: string, body: unknown = {}) =>
  app.request(path, { method: "POST", headers: { Cookie: await cookieFor(uid), "Content-Type": "application/json" }, body: JSON.stringify(body) }, env);
const saldos = (uid: string) => env.DB.prepare("SELECT balance_cents, creator_balance_cents FROM users WHERE id = ?").bind(uid).first<{ balance_cents: number; creator_balance_cents: number }>();

describe("monetización suave: tres capas", () => {
  it("la puerta: 1 de cada 5 pesos para la casa, sin mínimos escondidos", () => {
    expect(entrySplit(2000)).toEqual({ platform: 400, creator: 1600 });
    expect(entrySplit(50000)).toEqual({ platform: 10000, creator: 40000 });
    expect(membershipSplit(9900)).toEqual({ platform: 1980, creator: 7920 });
    expect(tipSplit(5000)).toEqual({ platform: 0, creator: 5000 });
  });

  it("el gesto: lo que mandas llega completo", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await createLiveSession(room.id);
    const viewer = await createUser({ balanceCents: 10000 });
    const r = await post(`/api/rooms/${room.slug}/tip`, viewer, { amount_cents: 5000, message: "gracias por la rola" });
    expect(r.status).toBe(200);
    expect((await r.json()) as { creator_cut_cents: number }).toMatchObject({ ok: true, creator_cut_cents: 5000 });
    expect(await saldos(owner)).toMatchObject({ creator_balance_cents: 5000 });
    expect(await saldos(viewer)).toMatchObject({ balance_cents: 5000 });
    // montos: entre $10 y $5,000, en pesos cerrados
    expect((await post(`/api/rooms/${room.slug}/tip`, viewer, { amount_cents: 500 })).status).toBe(400);
    expect((await post(`/api/rooms/${room.slug}/tip`, viewer, { amount_cents: 1050 })).status).toBe(400);
    // el creador no se manda dinero a sí mismo
    expect((await post(`/api/rooms/${room.slug}/tip`, owner, { amount_cents: 2000 })).status).toBe(400);
    // el destacado de pago ya no existe
    expect((await post(`/api/rooms/${room.slug}/highlight`, viewer, { amount_cents: 5000, text: "x" })).status).toBe(404);
  });

  it("lo ganado se gasta adentro sin retirar: primero lo recargado, luego lo ganado", async () => {
    const creadora = await createUser({ balanceCents: 1000, creatorBalanceCents: 5000 });
    const otro = await createUser();
    const sala = await createRoom(otro);
    await createLiveSession(sala.id);
    // entrada de $20 con $10 recargados + $50 ganados
    const r = await post(`/api/rooms/${sala.slug}/pass`, creadora, { device_id: "web" });
    expect(r.status).toBe(200);
    expect((await r.json()) as { charged: boolean }).toMatchObject({ ok: true, charged: true });
    expect(await saldos(creadora)).toEqual({ balance_cents: 0, creator_balance_cents: 4000 });
    expect(await saldos(otro)).toMatchObject({ creator_balance_cents: 1600 });
    // y cuando no alcanza ni sumando, dice cuánto hay
    const pobre = await createUser({ balanceCents: 500, creatorBalanceCents: 500 });
    const r2 = await post(`/api/rooms/${sala.slug}/pass`, pobre, { device_id: "web" });
    expect(r2.status).toBe(402);
    expect((await r2.json()) as { gastable_cents: number }).toMatchObject({ error: "saldo_insuficiente", gastable_cents: 1000 });
  });

  it("la meta de propinas ya no se guarda y la oferta no la anuncia", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const r = await post(`/api/rooms/${room.slug}/settings`, owner, { price_cents: 5000, tip_goal_cents: 50000 });
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toMatchObject({ ok: true, price_cents: 5000, split: { platform: 1000, creator: 4000 } });
    expect(j.tip_goal_cents).toBeUndefined();
    const offer = (await (await app.request(`/api/rooms/${room.slug}/offer`, {}, env)).json()) as Record<string, unknown>;
    expect(offer.tip_goal_cents).toBeUndefined();
    expect(offer.highlight_options_cents).toBeUndefined();
    expect(offer.tip_options_cents).toEqual([2000, 5000, 10000, 20000]);
  });
});

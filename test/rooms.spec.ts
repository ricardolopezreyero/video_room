import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom, createLiveSession } from "./helpers";

describe("POST /api/rooms/:slug/pass", () => {
  it("rechaza sin saldo suficiente", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await createLiveSession(room.id);
    const viewer = await createUser({ balanceCents: 500 });

    const res = await app.request(
      `/api/rooms/${room.slug}/pass`,
      { method: "POST", headers: { Cookie: await cookieFor(viewer), "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "web" }) },
      env
    );
    expect(res.status).toBe(402);
    expect((await res.json()) as { error: string }).toEqual({ error: "saldo_insuficiente" });
  });

  it("el dueño entra gratis a su propia sala", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await createLiveSession(room.id);

    const res = await app.request(
      `/api/rooms/${room.slug}/pass`,
      { method: "POST", headers: { Cookie: await cookieFor(owner), "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "web" }) },
      env
    );
    const body = (await res.json()) as { ok: boolean; charged: boolean };
    expect(body.ok).toBe(true);
    expect(body.charged).toBe(false);
  });

  it("no vuelve a cobrar si ya tiene un pase vigente", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await createLiveSession(room.id);
    const viewer = await createUser({ balanceCents: 10000 });
    const cookie = await cookieFor(viewer);
    const body = JSON.stringify({ device_id: "web" });

    const first = await app.request(`/api/rooms/${room.slug}/pass`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body }, env);
    const firstBody = (await first.json()) as { charged: boolean };
    expect(firstBody.charged).toBe(true);

    const second = await app.request(`/api/rooms/${room.slug}/pass`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body }, env);
    const secondBody = (await second.json()) as { charged: boolean };
    expect(secondBody.charged).toBe(false);

    const user = await env.DB.prepare("SELECT balance_cents FROM users WHERE id = ?").bind(viewer).first<{ balance_cents: number }>();
    expect(user?.balance_cents).toBe(8000); // solo se cobró una vez
  });

  it("rechaza si la sala no está transmitiendo", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const viewer = await createUser({ balanceCents: 10000 });

    const res = await app.request(
      `/api/rooms/${room.slug}/pass`,
      { method: "POST", headers: { Cookie: await cookieFor(viewer), "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "web" }) },
      env
    );
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: "sala_cerrada" });
  });
});

describe("POST /api/rooms/:slug/tip", () => {
  it("rechaza sin saldo suficiente", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await createLiveSession(room.id);
    const viewer = await createUser({ balanceCents: 500 });

    const res = await app.request(
      `/api/rooms/${room.slug}/tip`,
      { method: "POST", headers: { Cookie: await cookieFor(viewer), "Content-Type": "application/json" }, body: JSON.stringify({ amount_cents: 2000 }) },
      env
    );
    expect(res.status).toBe(402);
  });

  it("respeta el tope de propinas por sesión", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await createLiveSession(room.id);
    const viewer = await createUser({ balanceCents: 1000000 });
    const cookie = await cookieFor(viewer);

    const first = await app.request(
      `/api/rooms/${room.slug}/tip`,
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ amount_cents: 200000 }) },
      env
    );
    expect((await first.json()) as { ok: boolean }).toEqual(expect.objectContaining({ ok: true }));

    const second = await app.request(
      `/api/rooms/${room.slug}/tip`,
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ amount_cents: 1000 }) },
      env
    );
    expect(second.status).toBe(400);
    expect((await second.json()) as { error: string }).toEqual({ error: "limite_propinas_alcanzado" });
  });
});

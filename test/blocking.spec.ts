import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom, createLiveSession } from "./helpers";

describe("bloqueo de espectadores", () => {
  it("solo el dueño puede bloquear", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const intruder = await createUser();
    const victim = await createUser();

    const res = await app.request(
      `/api/rooms/${room.slug}/block`,
      { method: "POST", headers: { Cookie: await cookieFor(intruder), "Content-Type": "application/json" }, body: JSON.stringify({ user_id: victim }) },
      env
    );
    expect(res.status).toBe(403);
  });

  it("un espectador bloqueado no puede comprar pase ni comentar, y se desbloquea con /unblock", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await createLiveSession(room.id);
    const viewer = await createUser({ balanceCents: 10000 });
    const ownerCookie = await cookieFor(owner);
    const viewerCookie = await cookieFor(viewer);

    await app.request(
      `/api/rooms/${room.slug}/block`,
      { method: "POST", headers: { Cookie: ownerCookie, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: viewer }) },
      env
    );

    const passRes = await app.request(
      `/api/rooms/${room.slug}/pass`,
      { method: "POST", headers: { Cookie: viewerCookie, "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "web" }) },
      env
    );
    expect(passRes.status).toBe(403);
    expect((await passRes.json()) as { error: string }).toEqual({ error: "bloqueado" });

    // Se desbloquea y ya puede entrar normalmente.
    await app.request(
      `/api/rooms/${room.slug}/unblock`,
      { method: "POST", headers: { Cookie: ownerCookie, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: viewer }) },
      env
    );
    const passAfterUnblock = await app.request(
      `/api/rooms/${room.slug}/pass`,
      { method: "POST", headers: { Cookie: viewerCookie, "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "web" }) },
      env
    );
    expect((await passAfterUnblock.json()) as { ok: boolean }).toEqual(expect.objectContaining({ ok: true }));
  });
});

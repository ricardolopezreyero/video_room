import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom, createLiveSession } from "./helpers";

async function comentar(slug: string, uid: string, text: string) {
  return app.request(`/api/rooms/${slug}/comment`, { method: "POST", headers: { Cookie: await cookieFor(uid), "Content-Type": "application/json" }, body: JSON.stringify({ text }) }, env);
}
async function pase(sessionId: string, uid: string) {
  await env.DB.prepare("INSERT INTO passes (id, session_id, user_id, expires_at, device_id) VALUES (?, ?, ?, ?, 'web')").bind(`pass_${uid}`, sessionId, uid, Math.floor(Date.now() / 1000) + 3600).run();
}

describe("el chat en vivo", () => {
  it("guarda el historial con secuencia, lo pagina hacia atrás y rellena huecos", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await createLiveSession(room.id);
    for (let i = 1; i <= 5; i++) {
      const r = await comentar(room.slug, owner, `mensaje ${i}`);
      expect((await r.json()) as { seq: number }).toMatchObject({ ok: true, seq: i });
    }
    const pagina = await app.request(`/api/rooms/${room.slug}/chat?n=2`, { headers: { Cookie: await cookieFor(owner) } }, env);
    const d = (await pagina.json()) as { mensajes: { seq: number; body: string }[]; hayMas: boolean; seq: number };
    expect(d.mensajes.map((m) => m.seq)).toEqual([4, 5]);
    expect(d.hayMas).toBe(true);
    expect(d.seq).toBe(5);
    const antes = await app.request(`/api/rooms/${room.slug}/chat?antes=4&n=2`, { headers: { Cookie: await cookieFor(owner) } }, env);
    expect(((await antes.json()) as { mensajes: { seq: number }[] }).mensajes.map((m) => m.seq)).toEqual([2, 3]);
    const desde = await app.request(`/api/rooms/${room.slug}/chat?desde=3`, { headers: { Cookie: await cookieFor(owner) } }, env);
    expect(((await desde.json()) as { mensajes: { seq: number }[] }).mensajes.map((m) => m.seq)).toEqual([4, 5]);
    const entre = await app.request(`/api/rooms/${room.slug}/chat?antes=5&desde=2`, { headers: { Cookie: await cookieFor(owner) } }, env);
    expect(((await entre.json()) as { mensajes: { seq: number }[] }).mensajes.map((m) => m.seq)).toEqual([2, 3, 4]);
  });

  it("busca sin acentos ni mayúsculas, exige todas las palabras y filtra por quién", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const sessionId = await createLiveSession(room.id);
    const viewer = await createUser();
    await pase(sessionId, viewer);
    await comentar(room.slug, owner, "La canción que sigue es de Juan Gabriel");
    await comentar(room.slug, viewer, "¿cuál CANCIÓN sigue?");
    const buscar = async (q: string, de = "") => {
      const r = await app.request(`/api/rooms/${room.slug}/chat/buscar?q=${encodeURIComponent(q)}&de=${de}`, { headers: { Cookie: await cookieFor(viewer) } }, env);
      return (await r.json()) as { lista: { body: string }[]; total: number; palabras: string[] };
    };
    expect((await buscar("cancion sigue")).total).toBe(2);
    expect((await buscar("cancion juan")).total).toBe(1);
    expect((await buscar("cancion", "creador")).lista[0].body).toContain("Juan Gabriel");
    expect((await buscar("cancion", "yo")).lista[0].body).toContain("¿cuál");
    expect((await buscar("nada de esto")).total).toBe(0);
  });

  it("frena a quien manda dos comentarios seguidos (no al creador) y pide sesión", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const sessionId = await createLiveSession(room.id);
    const viewer = await createUser();
    await pase(sessionId, viewer);
    expect((await comentar(room.slug, viewer, "uno")).status).toBe(200);
    const r2 = await comentar(room.slug, viewer, "dos");
    expect(r2.status).toBe(429);
    expect((await r2.json()) as { error: string }).toMatchObject({ error: "despacio" });
    expect((await comentar(room.slug, owner, "a")).status).toBe(200);
    expect((await comentar(room.slug, owner, "b")).status).toBe(200);
    // El frenado no quedó en la base ni en el historial.
    const d = (await (await app.request(`/api/rooms/${room.slug}/chat`, { headers: { Cookie: await cookieFor(viewer) } }, env)).json()) as { mensajes: { body: string }[] };
    expect(d.mensajes.map((m) => m.body)).toEqual(["uno", "a", "b"]);
    expect((await app.request(`/api/rooms/${room.slug}/chat`, {}, env)).status).toBe(401);
  });
});

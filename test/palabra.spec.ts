import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom, createLiveSession } from "./helpers";

type Invitado = { user_id: string; sfuSessionId: string | null; video: boolean };
const DO = (roomId: string) => (env as unknown as { ROOM_DO: DurableObjectNamespace }).ROOM_DO.get((env as unknown as { ROOM_DO: DurableObjectNamespace }).ROOM_DO.idFromName(roomId));
const post = (path: string, cookie: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }, env);
const invitadosDe = async (roomId: string) => ((await (await DO(roomId).fetch("https://do/invitados")).json()) as { invitados: Invitado[] }).invitados;

describe("la palabra", () => {
  it("solo el creador la da o la quita, y no a alguien bloqueado", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await DO(room.id).fetch("https://do/start", { method: "POST", body: JSON.stringify({ sessionId: await createLiveSession(room.id) }) });
    const viewer = await createUser();
    const otro = await createUser();

    expect((await post(`/api/rooms/${room.slug}/palabra`, await cookieFor(otro), { user_id: viewer, dar: true })).status).toBe(403);
    const ok = await post(`/api/rooms/${room.slug}/palabra`, await cookieFor(owner), { user_id: viewer, dar: true });
    expect(ok.status).toBe(200);
    expect((await invitadosDe(room.id)).map((i) => i.user_id)).toEqual([viewer]);

    await post(`/api/rooms/${room.slug}/block`, await cookieFor(owner), { user_id: otro });
    expect((await post(`/api/rooms/${room.slug}/palabra`, await cookieFor(owner), { user_id: otro, dar: true })).status).toBe(400);

    await post(`/api/rooms/${room.slug}/palabra`, await cookieFor(owner), { user_id: viewer, dar: false });
    expect(await invitadosDe(room.id)).toEqual([]);
  });

  it("publicar exige pase vigente y palabra, en ese orden", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await DO(room.id).fetch("https://do/start", { method: "POST", body: JSON.stringify({ sessionId: await createLiveSession(room.id) }) });
    const sinPase = await createUser({ balanceCents: 10000 });
    const conPase = await createUser({ balanceCents: 10000 });
    const conPalabra = await createUser({ balanceCents: 10000 });
    for (const u of [conPase, conPalabra]) expect((await post(`/api/rooms/${room.slug}/pass`, await cookieFor(u), { device_id: "web" })).status).toBe(200);
    await post(`/api/rooms/${room.slug}/palabra`, await cookieFor(owner), { user_id: conPalabra, dar: true });

    const cuerpo = { sdp: "v=0", tracks: [{ mid: "0", trackName: "audio" }], video: false };
    expect((await post(`/api/rooms/${room.slug}/invitado/publish`, await cookieFor(sinPase), cuerpo)).status).toBe(402);
    const sinPalabra = await post(`/api/rooms/${room.slug}/invitado/publish`, await cookieFor(conPase), cuerpo);
    expect(sinPalabra.status).toBe(403);
    expect(((await sinPalabra.json()) as { error: string }).error).toBe("sin_palabra");
    // Con pase y palabra pasa las dos puertas: lo que sigue ya es el SFU.
    expect((await post(`/api/rooms/${room.slug}/invitado/publish`, await cookieFor(conPalabra), { sdp: "", tracks: [] })).status).toBe(400);
    // Suscribirse a quien todavía no publica: no está al aire.
    expect((await post(`/api/rooms/${room.slug}/invitado/subscribe`, await cookieFor(conPase), { user_id: conPalabra })).status).toBe(404);
  });

  it("el DO: al aire solo quien publicó, tope de cuatro, y la expulsión se la quita", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await DO(room.id).fetch("https://do/start", { method: "POST", body: JSON.stringify({ sessionId: await createLiveSession(room.id) }) });
    const cookie = await cookieFor(owner);
    const gente = [];
    for (let i = 0; i < 5; i++) gente.push(await createUser());
    for (let i = 0; i < 4; i++) expect((await post(`/api/rooms/${room.slug}/palabra`, cookie, { user_id: gente[i], dar: true })).status).toBe(200);
    expect((await post(`/api/rooms/${room.slug}/palabra`, cookie, { user_id: gente[4], dar: true })).status).toBe(409);

    const publica = (uid: string) => DO(room.id).fetch("https://do/invitado-publica", { method: "POST", body: JSON.stringify({ user_id: uid, sfuSessionId: "sfu_" + uid, tracks: [{ mid: "0", trackName: "audio" }], video: true }) });
    expect((await publica(gente[4])).status).toBe(403);
    expect((await publica(gente[0])).status).toBe(200);
    const lista = await invitadosDe(room.id);
    expect(lista.find((i) => i.user_id === gente[0])).toMatchObject({ sfuSessionId: "sfu_" + gente[0], video: true });
    expect(lista.find((i) => i.user_id === gente[1])?.sfuSessionId).toBeNull();

    await post(`/api/rooms/${room.slug}/kick`, cookie, { user_id: gente[0] });
    expect((await invitadosDe(room.id)).map((i) => i.user_id)).not.toContain(gente[0]);
    // Quien la deja por su cuenta
    await post(`/api/rooms/${room.slug}/invitado/salir`, await cookieFor(gente[1]), {});
    expect((await invitadosDe(room.id)).map((i) => i.user_id)).toEqual([gente[2], gente[3]]);
    // Al terminar la transmisión no queda nadie al aire
    await DO(room.id).fetch("https://do/stop", { method: "POST" });
    expect(await invitadosDe(room.id)).toEqual([]);
  });
});

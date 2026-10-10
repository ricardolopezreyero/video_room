import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom, createLiveSession } from "./helpers";

const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers, redirect: "manual" }, env);
async function renombrar(slug: string, uid: string, nuevo: string) {
  return app.request(`/api/rooms/${slug}/rename`, { method: "POST", headers: { Cookie: await cookieFor(uid), "Content-Type": "application/json" }, body: JSON.stringify({ new_slug: nuevo }) }, env);
}

describe("los links de sala", () => {
  it("mayúsculas, acentos, puntuación pegada y codificación llevan a la misma sala (301 a la forma canónica)", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, "ana-creadora");
    for (const raw of ["Ana-Creadora", "ana-creadora.", "ana-creadora)", "%C3%81na-Cre%C3%A1dora", "(ana-creadora", "ana-creadora%2C"]) {
      const r = await get(`/${raw}?utm_source=qr&utm_content=puerta`);
      expect(r.status, raw).toBe(301);
      expect(r.headers.get("location"), raw).toBe(`/ana-creadora?utm_source=qr&utm_content=puerta`);
    }
    expect((await get(`/${room.slug}`)).status).toBe(200);
    expect((await get(`/no-existe-esta-sala`)).status).toBe(404);
    // una palabra reservada ya no da 404: va a la página que le corresponde
    expect((await get(`/recibo`)).headers.get("location")).toBe("/app/transacciones");
  });

  it("al cambiar de URL, la anterior sigue llevando a la sala para siempre y nadie más puede tomarla", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, "numero-viejo");
    const r1 = await renombrar(room.slug, owner, "Mi Consultorio");
    expect((await r1.json()) as { slug: string }).toMatchObject({ ok: true, slug: "mi-consultorio", anterior: "numero-viejo" });
    const viejo = await get(`/numero-viejo?utm_source=qr`);
    expect(viejo.status).toBe(301);
    expect(viejo.headers.get("location")).toBe("/mi-consultorio?utm_source=qr");
    // mal escrita Y vieja: llega en un solo salto a la dirección actual
    expect((await get(`/Numero-Viejo.`)).headers.get("location")).toBe("/mi-consultorio");
    // otro no puede quedarse con la URL vieja…
    const otro = await createUser();
    const otra = await createRoom(otro, "otra-sala");
    expect((await (await renombrar(otra.slug, otro, "numero-viejo")).json()) as { error: string }).toMatchObject({ error: "slug_ocupado" });
    // …pero la misma sala sí puede regresar a ella
    expect((await (await renombrar("mi-consultorio", owner, "numero-viejo")).json()) as { slug: string }).toMatchObject({ ok: true, slug: "numero-viejo" });
    expect((await get(`/mi-consultorio`)).headers.get("location")).toBe("/numero-viejo");
    // y los nombres reservados y numéricos no se pueden tomar
    expect((await (await renombrar("numero-viejo", owner, "recibo")).json()) as { error: string }).toMatchObject({ error: "slug_reservado" });
    expect((await (await renombrar("numero-viejo", owner, "chat")).json()) as { error: string }).toMatchObject({ error: "slug_reservado" });
    expect((await (await renombrar("numero-viejo", owner, "77")).json()) as { error: string }).toMatchObject({ error: "slug_numerico_reservado" });
  });

  it("los números asignados nunca se reciclan", async () => {
    const a = await createUser();
    const r = await app.request("/api/rooms", { method: "POST", headers: { Cookie: await cookieFor(a) } }, env);
    const { slug } = (await r.json()) as { slug: string };
    expect(/^\d+$/.test(slug)).toBe(true);
    await renombrar(slug, a, "ya-con-nombre");
    const b = await createUser();
    const r2 = await app.request("/api/rooms", { method: "POST", headers: { Cookie: await cookieFor(b) } }, env);
    expect(((await r2.json()) as { slug: string }).slug).not.toBe(slug);
    expect((await get(`/${slug}`)).headers.get("location")).toBe("/ya-con-nombre");
  });

  it("los UTM se atan a la sala donde se capturaron y se guardan en toda entrada, también las gratis", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, "sala-a");
    const sessionId = await createLiveSession(room.id);
    const viewer = await createUser({ balanceCents: 10000 });
    // Abrir el link con UTM deja la cookie atada a sala-a
    const visita = await get(`/sala-a?utm_source=qr&utm_medium=impreso&utm_campaign=verano&utm_content=puerta-tienda&utm_term=x`, { Cookie: await cookieFor(viewer) });
    const setCookie = visita.headers.get("set-cookie") || "";
    const utmCookie = setCookie.split(",").map((s) => s.trim()).find((s) => s.startsWith("vr_utm="))!.split(";")[0];
    expect(utmCookie).toContain("sala-a");
    const cookies = `${await cookieFor(viewer)}; ${utmCookie}`;
    const pass = await app.request(`/api/rooms/sala-a/pass`, { method: "POST", headers: { Cookie: cookies, "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "web" }) }, env);
    expect(pass.status).toBe(200);
    const fila = await env.DB.prepare("SELECT utm_source, utm_medium, utm_campaign, utm_content, utm_term FROM passes WHERE session_id = ? AND user_id = ?").bind(sessionId, viewer).first();
    expect(fila).toMatchObject({ utm_source: "qr", utm_medium: "impreso", utm_campaign: "verano", utm_content: "puerta-tienda", utm_term: "x" });
    // En otra sala, esos UTM no cuentan (la entrada del dueño es gratis y también se anota)
    const room2 = await createRoom(viewer, "sala-b");
    const sessionB = await createLiveSession(room2.id);
    await app.request(`/api/rooms/sala-b/pass`, { method: "POST", headers: { Cookie: cookies, "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "web" }) }, env);
    const filaB = await env.DB.prepare("SELECT utm_source FROM passes WHERE session_id = ? AND user_id = ?").bind(sessionB, viewer).first<{ utm_source: string | null }>();
    expect(filaB).not.toBeNull();
    expect(filaB!.utm_source).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser } from "./helpers";

const jpg = (n: number) => { const u = new Uint8Array(n); u.set([0xff, 0xd8, 0xff, 0xe0]); return u; };
const pedir = async (metodo: string, uid?: string, cuerpo?: Uint8Array) => app.request("/api/wallet/foto", { method: metodo, headers: Object.assign({ "Content-Type": "image/jpeg" }, uid ? { Cookie: await cookieFor(uid) } : {}), body: cuerpo }, env);

describe("la foto para los diseños", () => {
  it("cada quien guarda, ve, cambia y quita solo la suya", async () => {
    expect((await pedir("GET")).status).toBe(401);
    expect((await pedir("PUT", undefined, jpg(500))).status).toBe(401);
    const ana = await createUser(), beto = await createUser();
    expect((await pedir("GET", ana)).status).toBe(204);
    expect((await pedir("PUT", ana, jpg(5000))).status).toBe(200);
    const r = await pedir("GET", ana);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toContain("private");
    expect((await r.arrayBuffer()).byteLength).toBe(5000);
    // La de Ana no le sale a Beto.
    expect((await pedir("GET", beto)).status).toBe(204);
    // Cambiarla la sustituye; quitarla la borra.
    await pedir("PUT", ana, jpg(900));
    expect((await (await pedir("GET", ana)).arrayBuffer()).byteLength).toBe(900);
    expect((await pedir("DELETE", ana)).status).toBe(200);
    expect((await pedir("GET", ana)).status).toBe(204);
  });

  it("solo acepta un JPEG de verdad y de tamaño razonable", async () => {
    const ana = await createUser();
    const noJpg = new Uint8Array(800); noJpg.set([0x3c, 0x73, 0x76, 0x67]); // «<svg»
    expect((await pedir("PUT", ana, noJpg)).status).toBe(415);
    expect((await pedir("PUT", ana, jpg(50))).status).toBe(413);
    expect((await pedir("PUT", ana, jpg(701 * 1024))).status).toBe(413);
    expect((await pedir("GET", ana)).status).toBe(204);
  });

  it("la puerta de mantenimiento de la música está cerrada sin el pase de la bodega", async () => {
    const r = await app.request("/api/interno/musica/vivo", { method: "POST", headers: { "x-pase": "a".repeat(48) } }, env);
    expect(r.status).toBe(403);
    expect((await app.request("/api/interno/musica/vivo", { method: "POST" }, env)).status).toBe(403);
  });
});

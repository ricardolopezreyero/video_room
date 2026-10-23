import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { cartaUno, cartaDos, cartaTres, programarCartas } from "../src/lib/cartas";
import { createUser, createRoom } from "./helpers";

const o = { appUrl: "https://video.capitaltorreon.com", name: "Mariana López", avatarUrl: null, roomUrl: "https://video.capitaltorreon.com/1027" };
const DB = (env as unknown as { DB: D1Database }).DB;
const cartas = async (id: string) => (await DB.prepare("SELECT cartas FROM users WHERE id = ?").bind(id).first<{ cartas: number | null }>())?.cartas;

describe("las tres cartas de bienvenida", () => {
  it("cada carta trae su tema, su firma y capturas reales servidas desde /correos", () => {
    const [a, b, c] = [cartaUno(o), cartaDos(o), cartaTres(o)];
    expect(a.subject).toBe("Mariana, tu sala ya existe");
    expect(b.subject).toBe("Venimos a dar");
    expect(c.subject).toBe("Aprende a recibir");
    for (const m of [a, b, c]) {
      expect(m.html).toContain("Ricardo López Reyero");
      expect(m.html).toMatch(/https:\/\/video\.capitaltorreon\.com\/correos\/carta-\d-[a-z]+\.jpg/);
      expect(m.html).toContain("sala de ejemplo");
      expect(m.text).toContain("Fundador de Video Room");
    }
    expect(a.html).toContain("video.capitaltorreon.com/1027");
    expect((b.html.match(/correos\/carta-2-/g) || []).length).toBe(4);
    expect(b.html).toContain("/app/materiales");
    expect(c.html).toContain("/app/monedero");
  });

  it("programa la 2 a las 24 h y la 3 a las 48 h, una sola vez, y respeta el interruptor", async () => {
    const ahora = 2_000_000_000;
    const toca = await createUser(); await createRoom(toca);
    const temprano = await createUser();
    const apagado = await createUser();
    const viejo = await createUser();
    await DB.prepare("UPDATE users SET cartas = 1, created_at = ? WHERE id = ?").bind(ahora - 86400 + 600, toca).run();
    await DB.prepare("UPDATE users SET cartas = 1, created_at = ? WHERE id = ?").bind(ahora - 3600, temprano).run();
    await DB.prepare("UPDATE users SET cartas = 2, created_at = ?, correos = ? WHERE id = ?").bind(ahora - 2 * 86400, JSON.stringify({ cartas: false }), apagado).run();
    await DB.prepare("UPDATE users SET cartas = NULL, created_at = ? WHERE id = ?").bind(ahora - 9 * 86400, viejo).run();

    const r = await programarCartas(env as never, ahora);
    expect(r.apagadas).toBe(1);
    expect(await cartas(toca)).toBe(2);
    expect(await cartas(temprano)).toBe(1);
    expect(await cartas(apagado)).toBe(3);
    expect(await cartas(viejo)).toBeNull();

    // La siguiente media hora no repite nada.
    await programarCartas(env as never, ahora + 1800);
    expect(await cartas(toca)).toBe(2);
    // A las 48 h le toca la tercera.
    await programarCartas(env as never, ahora + 86400);
    expect(await cartas(toca)).toBe(3);
  });
});

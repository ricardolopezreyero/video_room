import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser, createRoom } from "./helpers";
import { limpiarRuta, distancia, paginaPorPalabra, parecidos, esRuido } from "../src/lib/rescate";

const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers, redirect: "manual" }, env);
const a = async (path: string) => { const r = await get(path); return `${r.status} ${r.headers.get("location") ?? ""}`.trim(); };

describe("rescate: piezas", () => {
  it("limpia la ruta: query pegada, URL pegada, extensión", () => {
    expect(limpiarRuta("/ana&utm_source=qr&utm_content=puerta", "")).toMatchObject({ segmentos: ["ana"], search: "?utm_source=qr&utm_content=puerta" });
    expect(limpiarRuta("/ana%3Futm_source=qr", "?x=1")).toMatchObject({ segmentos: ["ana"], search: "?x=1&utm_source=qr" });
    expect(limpiarRuta("/https:/video.capitaltorreon.com/ana", "").segmentos).toEqual(["ana"]);
    expect(limpiarRuta("/ana.html", "").segmentos).toEqual(["ana"]);
    expect(limpiarRuta("/ana#chat", "").segmentos).toEqual(["ana"]);
  });
  it("distancia: dedazos y letras volteadas", () => {
    expect(distancia("ricrdo", "ricardo")).toBe(1);
    expect(distancia("riacrdo", "ricardo")).toBe(1);
    expect(distancia("ricardo", "ricardo")).toBe(0);
    expect(distancia("juan", "ricardo", 2)).toBe(3);
  });
  it("páginas por palabra o sinónimo", () => {
    expect(paginaPorPalabra("wallet")).toBe("/app/monedero");
    expect(paginaPorPalabra("Estadísticas")).toBe("/app/estadisticas");
    expect(paginaPorPalabra("correos")).toBe("/app/monedero#correos");
    expect(paginaPorPalabra("estadistcas", { cercana: true })).toBe("/app/estadisticas");
    expect(paginaPorPalabra("zzzz", { cercana: true })).toBeNull();
  });
  it("parecidos: sin guiones, por nombre, dedazo; los números no se adivinan", () => {
    const c = [
      { slug: "ana-creadora", title: "Ana Creadora", destino: "ana-creadora" },
      { slug: "7", title: "Juan López", destino: "7" },
      { slug: "8", title: "Otra Persona", destino: "8" },
    ];
    expect(parecidos("anacreadora", c)[0]).toMatchObject({ destino: "ana-creadora", d: 0 });
    expect(parecidos("ana-cradora", c)[0]).toMatchObject({ destino: "ana-creadora", d: 1 });
    expect(parecidos("juan-lopez", c)[0]).toMatchObject({ destino: "7", d: 0 });
    expect(parecidos("ana-cre", c)[0]).toMatchObject({ destino: "ana-creadora", cortado: true });
    expect(parecidos("ana", c)[0]).toMatchObject({ destino: "ana-creadora", cortado: false });
    expect(parecidos("zzzzzz", c)).toEqual([]);
  });
  it("ruido: bots y archivos", () => {
    expect(esRuido("/wp-login.php")).toBe(true);
    expect(esRuido("/.env")).toBe(true);
    expect(esRuido("/foo.png")).toBe(true);
    expect(esRuido("/ana.html")).toBe(false);
    expect(esRuido("/ana")).toBe(false);
  });
});

describe("rescate: de punta a punta", () => {
  it("lo determinista llega con 301 a la sala, conservando los UTM", async () => {
    const owner = await createUser();
    await createRoom(owner, "consultorio-luna");
    expect(await a("/consultorio-luna.html")).toBe("301 /consultorio-luna");
    expect(await a("/consultorio-luna/chat")).toBe("301 /consultorio-luna");
    expect(await a("/consultorio-luna/index.html?utm_source=qr")).toBe("301 /consultorio-luna?utm_source=qr");
    expect(await a("/sala/consultorio-luna")).toBe("301 /consultorio-luna");
    expect(await a("/live/Consultorio-Luna/")).toMatch(/^301 \/live\/Consultorio-Luna$|^301 \/consultorio-luna$/);
    expect(await a("/consultorio-luna&utm_source=qr&utm_content=puerta")).toBe("301 /consultorio-luna?utm_source=qr&utm_content=puerta");
    expect(await a("/consultorio-luna%3Futm_source=qr")).toBe("301 /consultorio-luna?utm_source=qr");
    expect(await a("/video.capitaltorreon.com/consultorio-luna")).toBe("301 /consultorio-luna");
    expect(await a("/@consultorio-luna")).toBe("301 /consultorio-luna");
  });

  it("ceros a la izquierda en salas numéricas; otros números no se adivinan", async () => {
    const u = await createUser();
    const r = await app.request("/api/rooms", { method: "POST", headers: { Cookie: await cookieFor(u) } }, env);
    const { slug } = (await r.json()) as { slug: string };
    expect(await a(`/00${slug}`)).toBe(`301 /${slug}`);
    expect((await get("/99999991")).status).toBe(404);
  });

  it("lo adivinado llega con 302 y avisa; queda en la bitácora", async () => {
    const owner = await createUser();
    await createRoom(owner, "taller-mecanico-rayo");
    for (const p of ["/taller-mecanico-rayo-te-espero-hoy", "/tallermecanicorayo", "/taller-mecanico-ryo", "/taller-mecanico-rayo-html", "/taller-mecan"]) {
      const r = await get(p);
      expect(`${r.status} ${r.headers.get("location")}`, p).toBe("302 /taller-mecanico-rayo");
      expect(r.headers.get("set-cookie") || "", p).toContain("vr_trajo=");
    }
    await new Promise((res) => setTimeout(res, 50));
    const fila = await env.DB.prepare("SELECT resuelto FROM enlaces_rotos WHERE path = ?").bind("tallermecanicorayo").first<{ resuelto: string }>();
    expect(fila?.resuelto).toBe("/taller-mecanico-rayo");
  });

  it("con dos salas posibles no adivina: enseña las dos", async () => {
    const u1 = await createUser(), u2 = await createUser();
    await createRoom(u1, "pasteleria-sol");
    await createRoom(u2, "pasteleria-sal");
    const r = await get("/pasteleria-sul");
    expect(r.status).toBe(404);
    const html = await r.text();
    expect(html).toContain("/pasteleria-sol");
    expect(html).toContain("/pasteleria-sal");
    expect(html).toContain("¿Buscabas esta sala?");
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("las páginas de la app se encuentran por su nombre o un sinónimo", async () => {
    expect(await a("/app")).toBe("302 /app/monedero");
    expect(await a("/app/wallet")).toBe("302 /app/monedero");
    expect(await a("/app/stats")).toBe("302 /app/estadisticas");
    expect(await a("/app/estadistcas")).toBe("302 /app/estadisticas");
    expect(await a("/app/monedero/algo/mas")).toBe("302 /app/monedero");
    expect(await a("/app/no-se-que-es")).toBe("302 /app/monedero");
    expect(await a("/wallet")).toBe("302 /app/monedero");
    expect(await a("/ayuda")).toBe("302 /app/faq");
    expect(await a("/recibos")).toBe("302 /app/transacciones");
    expect(await a("/recibo")).toBe("302 /app/transacciones");
    expect(await a("/recibo/roto")).toBe("302 /app/transacciones");
    expect(await a("/correos")).toBe("302 /app/monedero#correos");
    expect(await a("/inicio")).toBe("302 /");
    expect(await a("/entrar")).toBe("302 /login");
  });

  it("una sala con nombre de sinónimo gana sobre el sinónimo", async () => {
    const u = await createUser();
    await createRoom(u, "ayuda");
    expect((await get("/ayuda")).status).toBe(200);
  });

  it("ruido y API: 404 barato, sin página ni bitácora", async () => {
    const r = await get("/wp-login.php");
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toContain("text/plain");
    expect(r.headers.get("location")).toBeNull();
    const api = await get("/api/no-existe");
    expect(api.status).toBe(404);
    expect((await api.json()) as { error: string }).toEqual({ error: "not_found" });
    const n = await env.DB.prepare("SELECT COUNT(*) as n FROM enlaces_rotos WHERE path LIKE '%wp-login%'").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("lo que de plano no existe: página con caja de búsqueda, 404 y bitácora", async () => {
    const r = await get("/qwertyuiopasdf");
    expect(r.status).toBe(404);
    const html = await r.text();
    expect(html).toContain("No encontramos esa sala");
    expect(html).toContain("qwertyuiopasdf");
    expect(html).toContain('id="nf-q"');
    await new Promise((res) => setTimeout(res, 50));
    const fila = await env.DB.prepare("SELECT veces, resuelto FROM enlaces_rotos WHERE path = ?").bind("qwertyuiopasdf").first<{ veces: number; resuelto: string | null }>();
    expect(fila).toMatchObject({ veces: 1, resuelto: null });
  });
});

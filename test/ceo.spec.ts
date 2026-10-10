import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { cookieFor, createUser } from "./helpers";

const postular = (body: unknown) => app.request("/api/ceo/postular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env);
const BUENA = {
  nombre: "Laura Mendoza", correo: "Laura@Ejemplo.mx", whatsapp: "+52 871 000 0000", ciudad: "Torreón", sala: "video.capitaltorreon.com/laura", enlace: "https://ejemplo.mx",
  numero: "Llevé una operación de afiliación de comercios de 40 a 1,150 negocios activos en 11 meses, con un equipo de cuatro personas.",
  siete_dias: "Día 1: abro mi sala y cobro mi primera sesión. Día 2: leo el plan y marco las diez tareas que más mueven el marcador. Día 3 a 5: veinte invitaciones personales. Día 6: mido. Día 7: tres cambios con su número.",
  correcto: "Reporté un contracargo que nadie había visto y que bajaba mi bono del trimestre en 18 mil pesos. Lo dije el mismo día.",
};

describe("dirección: el perfil y la prueba", () => {
  it("el perfil es público, sin listar, y dice lo esencial", async () => {
    const r = await app.request("/ceo", {}, env);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    const html = await r.text();
    for (const frase of ["Buscamos a quien va a dirigir Video Room", "No es una marca. Es un servicio.", "Das la mala noticia primero", "Cuando te comprometes, te quedas", "Por supuesto que soy yo", "Esto no es para ti si"]) expect(html, frase).toContain(frase);
    for (const rasgo of ["Ambición", "Método", "Números", "Eficiencia", "Rapidez", "Honradez", "Lealtad", "Calle", "Raíces"]) expect(html, rasgo).toContain(rasgo);
    // sinónimos que llevan al perfil
    expect((await app.request("/vacante", { redirect: "manual" }, env)).headers.get("location")).toBe("/ceo");
    expect((await app.request("/direccion", { redirect: "manual" }, env)).headers.get("location")).toBe("/ceo");
  });

  it("la prueba exige sustancia, ignora robots y no acepta dos veces el mismo correo", async () => {
    expect((await (await postular({ ...BUENA, numero: "Vendí mucho." })).json()) as { error: string }).toEqual({ error: "numero_corto" });
    expect((await (await postular({ ...BUENA, correo: "no-es-correo" })).json()) as { error: string }).toEqual({ error: "correo_invalido" });
    expect((await (await postular({ ...BUENA, siete_dias: "Trabajar duro." })).json()) as { error: string }).toEqual({ error: "siete_dias_corto" });
    expect((await postular({ ...BUENA, empresa: "robot sa" })).status).toBe(400);
    const ok = await postular(BUENA);
    expect(ok.status).toBe(200);
    expect((await (await postular(BUENA)).json()) as { error: string }).toEqual({ error: "ya_recibida" });
    const fila = await env.DB.prepare("SELECT nombre, correo, sala FROM ceo_postulaciones WHERE correo = ?").bind("laura@ejemplo.mx").first();
    expect(fila).toMatchObject({ nombre: "Laura Mendoza", correo: "laura@ejemplo.mx", sala: "video.capitaltorreon.com/laura" });
  });

  it("las pruebas recibidas solo las ve el equipo", async () => {
    await postular({ ...BUENA, correo: "otra@ejemplo.mx", nombre: "Otra Persona" });
    const ajeno = await createUser();
    const r = await app.request("/api/gtm", { headers: { Cookie: await cookieFor(ajeno) } }, env);
    expect(r.status).toBe(403);
    const ricardo = await createUser();
    await env.DB.prepare("UPDATE users SET email = 'ricardo@superleads.mx' WHERE id = ?").bind(ricardo).run();
    const j = (await (await app.request("/api/gtm", { headers: { Cookie: await cookieFor(ricardo) } }, env)).json()) as { postulaciones: { nombre: string; numero: string }[] };
    expect(j.postulaciones.some((p) => p.nombre === "Otra Persona" && p.numero.includes("1,150"))).toBe(true);
    const pag = await (await app.request("/gtm", { headers: { Cookie: await cookieFor(ricardo) } }, env)).text();
    expect(pag).toContain("Quien dirige: cómo elegirlo");
    expect(pag).toContain("Bandera roja");
  });
});

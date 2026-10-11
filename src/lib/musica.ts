// RLR · La música de los videos de Materiales, hecha con ElevenLabs para Video
// Room (no prestada de otro proyecto). Seis fondos sin voz, uno por cada tipo
// de publicación: el aviso de que hoy hay en vivo no suena igual que una cita
// o que una clase.
//
// Cómo nace cada uno: la tarea programada pide a ElevenLabs el que falte
// (primero su compositor de música; si la llave no lo trae, su generador de
// efectos, que llega a 22 segundos) y guarda el original en R2
// (`musica/<id>.mp3`). De ahí se baja, se nivela con ffmpeg y se deja en
// public/musica/, que es lo que suena en la página. Ver el README.
import type { Env } from "../env";

const secreto = async (v: Env["ELEVENLABS_API_KEY"]): Promise<string> => (!v ? "" : typeof v === "string" ? v : await v.get().catch(() => ""));

const BASE = "Instrumental background music for a short vertical social video announcing a live, paid, private video room hosted by a creator. Modern, clean and premium. No vocals, no lyrics, no spoken words, no sound effects. It starts right away on the first beat, keeps a steady energy and resolves cleanly at the end.";
export const MUSICA: Record<string, { n: string; d: number; p: string }> = {
  vivo: { n: "En vivo", d: 20, p: `${BASE} Upbeat modern electronic pop at 112 bpm: bright plucked synths, warm bass and a punchy, tight beat. The excitement of going live tonight, confident and optimistic.` },
  noche: { n: "Noche", d: 20, p: `${BASE} Smooth deep house at 118 bpm for a late-night session: round sub bass, soft chords, crisp hi-hats and a gentle groove. Elegant, intimate and cool.` },
  aviso: { n: "Aviso", d: 20, p: `${BASE} Minimal and confident at 100 bpm: muted marimba pattern, finger snaps, light claps and a soft kick. Clear, friendly and trustworthy, like an important announcement.` },
  calma: { n: "Calma", d: 20, p: `${BASE} Warm lo-fi at 80 bpm: mellow electric piano chords, soft vinyl-free brushed drums and a gentle bass. Calm, close and reassuring, for a teacher, a coach or a reading.` },
  fiesta: { n: "Fiesta", d: 20, p: `${BASE} Light latin urban pop at 96 bpm: dembow-inspired drum pattern, bright plucks and a happy bass line. Fun, danceable and sunny, for music and dance classes.` },
  acustica: { n: "Acústica", d: 20, p: `${BASE} Warm acoustic at 104 bpm: strummed nylon and steel guitars, soft shaker and light kick. Honest, friendly and human, like a singer-songwriter inviting friends.` },
};
const INTENTOS = 3; // por fondo: cada intento puede costar créditos, así que no se insiste sola más de tres veces

export async function generarMusica(env: Env, id: string): Promise<{ ok: true; id: string; motor: string; bytes: number } | { error: string }> {
  const m = MUSICA[id]; if (!m) return { error: "no_existe" };
  if (!env.MEDIOS) return { error: "sin_r2" };
  const llave = await secreto(env.ELEVENLABS_API_KEY); if (!llave) return { error: "sin_llave" };
  const cab = { "xi-api-key": llave, "content-type": "application/json" };
  let mp3: ArrayBuffer | null = null, motor = "", falla = "";
  for (const cuerpo of [{ prompt: m.p, music_length_ms: m.d * 1000, force_instrumental: true }, { prompt: m.p, music_length_ms: m.d * 1000 }]) {
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", { method: "POST", headers: cab, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(150000) });
      if (r.ok) { mp3 = await r.arrayBuffer(); motor = "musica"; break; }
      falla = `música ${r.status}: ${(await r.text()).slice(0, 180)}`;
      if (r.status !== 400 && r.status !== 422) break; // si no es un problema del pedido, repetirlo no ayuda
    } catch (e) { falla = "música: " + (e as Error).message; break; }
  }
  if (!mp3) {
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", { method: "POST", headers: cab, body: JSON.stringify({ text: m.p, duration_seconds: Math.min(m.d, 22), prompt_influence: 0.4 }), signal: AbortSignal.timeout(150000) });
      if (r.ok) { mp3 = await r.arrayBuffer(); motor = "efectos"; } else falla += ` · efectos ${r.status}: ${(await r.text()).slice(0, 180)}`;
    } catch (e) { falla += " · efectos: " + (e as Error).message; }
  }
  if (!mp3) { console.error("elevenlabs música", id, falla); await env.MEDIOS.put(`musica/_falla_${id}.txt`, `${new Date().toISOString()} ${falla}`); return { error: falla.slice(0, 300) }; }
  await env.MEDIOS.put(`musica/${id}.mp3`, mp3, { httpMetadata: { contentType: "audio/mpeg" }, customMetadata: { motor, creada: new Date().toISOString() } });
  console.log("música creada", id, motor, mp3.byteLength);
  return { ok: true, id, motor, bytes: mp3.byteLength };
}

/** La que falte se crea sola. Con todo creado, esto es una sola lista en R2. */
export async function asegurarMusica(env: Env): Promise<number> {
  if (!env.MEDIOS || !env.ELEVENLABS_API_KEY) return 0;
  const hay = new Set((await env.MEDIOS.list({ prefix: "musica/" })).objects.map((o) => o.key));
  const faltan = Object.keys(MUSICA).filter((id) => !hay.has(`musica/${id}.mp3`)); if (!faltan.length) return 0;
  // Candado: una sola vuelta a la vez, para no pedir (y pagar) dos veces el mismo fondo.
  const candado = await env.MEDIOS.get("musica/_candado.txt");
  if (candado && Date.now() - Number(await candado.text()) < 12 * 60000) return 0;
  await env.MEDIOS.put("musica/_candado.txt", String(Date.now()));
  let intentos: Record<string, number> = {}; try { intentos = ((await (await env.MEDIOS.get("musica/_intentos.json"))?.json()) as Record<string, number>) || {}; } catch { /* primera vez */ }
  let hechas = 0;
  for (const id of faltan) {
    if ((intentos[id] || 0) >= INTENTOS) continue;
    intentos[id] = (intentos[id] || 0) + 1;
    await env.MEDIOS.put("musica/_intentos.json", JSON.stringify(intentos)); // se apunta antes de pedir: si la tarea se corta, el intento ya cuenta
    const r = await generarMusica(env, id); if ("ok" in r) hechas++;
  }
  await env.MEDIOS.delete("musica/_candado.txt");
  return hechas;
}

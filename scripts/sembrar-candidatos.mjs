// RLR · Sembrar fichas de candidatos en la base desde un archivo que NO está
// en el repositorio (privado/…json). El repositorio es público; las personas
// y lo que pensamos de ellas, no.
//
//   node scripts/sembrar-candidatos.mjs privado/candidatos-ceo.json --local
//   node scripts/sembrar-candidatos.mjs privado/candidatos-ceo.json --remote
//
// El archivo: { "vacante": "ceo", "meta": {…}, "fichas": [{ "id", "grupo", "orden", …ficha }] }
// Volver a sembrar actualiza el contenido de cada ficha y respeta el estado y
// las notas que el equipo ya escribió. Con --podar borra las fichas sembradas
// que ya no vengan en el archivo (nunca las que agregó el equipo a mano).
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const [archivo, ...resto] = process.argv.slice(2);
const destino = resto.includes("--remote") ? "--remote" : "--local";
if (!archivo) { console.error("Falta el archivo. Ejemplo: node scripts/sembrar-candidatos.mjs privado/candidatos-ceo.json --local"); process.exit(1); }
const j = JSON.parse(readFileSync(archivo, "utf8"));
const vacante = String(j.vacante || "ceo");
if (!/^[a-z0-9-]{2,40}$/.test(vacante)) throw new Error("vacante inválida");
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const NOTA_MAX = 200;

const filas = [];
if (j.meta) filas.push({ id: `${vacante}-meta`, grupo: "meta", orden: 0, datos: j.meta });
for (const f of j.fichas || []) {
  const { id, grupo, orden, ...datos } = f;
  if (!/^[a-z0-9-]{3,60}$/.test(id || "")) throw new Error("id inválido: " + id);
  if (!["top", "banca"].includes(grupo)) throw new Error("grupo inválido en " + id);
  if (datos.liga && !/^https?:\/\/[^\s<>"']+$/i.test(datos.liga)) throw new Error("liga inválida en " + id);
  if (datos.nota_conexion && datos.nota_conexion.length > NOTA_MAX) throw new Error(`la nota de ${id} mide ${datos.nota_conexion.length} (máximo ${NOTA_MAX})`);
  for (const [k, r] of Object.entries(datos.rasgos || {})) if (![0, 1, 2, 3].includes(r[0])) throw new Error(`nivel inválido en ${id} · ${k}`);
  filas.push({ id, grupo, orden: Number(orden) || 100, datos });
}
const sql = filas.map((f) =>
  `INSERT INTO candidatos (id, vacante, grupo, orden, datos) VALUES (${q(f.id)}, ${q(vacante)}, ${q(f.grupo)}, ${f.orden}, ${q(JSON.stringify(f.datos))}) ON CONFLICT(id) DO UPDATE SET vacante = excluded.vacante, grupo = excluded.grupo, orden = excluded.orden, datos = excluded.datos;`
);
if (resto.includes("--podar")) sql.push(`DELETE FROM candidatos WHERE vacante = ${q(vacante)} AND id NOT LIKE 'cand_%' AND id NOT IN (${filas.map((f) => q(f.id)).join(", ")});`);

const dir = mkdtempSync(join(tmpdir(), "cand-"));
const ruta = join(dir, "sembrar.sql");
writeFileSync(ruta, sql.join("\n") + "\n");
const r = spawnSync("npx", ["wrangler", "d1", "execute", "video-room-db", destino, "--file", ruta, "--yes"], { stdio: "inherit" });
rmSync(dir, { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`Sembradas ${filas.length} filas de «${vacante}» (${destino.slice(2)}).`);

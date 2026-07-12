import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Los archivos de setup corren fuera del aislamiento de storage por-archivo y
// pueden ejecutarse varias veces — applyD1Migrations() solo aplica lo que
// falte, así que llamarlo aquí es seguro.
await applyD1Migrations((env as unknown as { DB: D1Database }).DB, (env as unknown as { TEST_MIGRATIONS: never }).TEST_MIGRATIONS);

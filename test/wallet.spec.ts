import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/index";
import { creditLedger } from "../src/lib/db";
import { cookieFor, createUser, connectUser } from "./helpers";

describe("creditLedger", () => {
  it("no duplica el crédito si el idem_key ya existe", async () => {
    const uid = await createUser();
    const first = await creditLedger(env.DB, uid, 2000, "recarga", null, "idem-1", "balance_cents");
    const second = await creditLedger(env.DB, uid, 2000, "recarga", null, "idem-1", "balance_cents");
    expect(first).toBe(true);
    expect(second).toBe(false);

    const user = await env.DB.prepare("SELECT balance_cents FROM users WHERE id = ?").bind(uid).first<{ balance_cents: number }>();
    expect(user?.balance_cents).toBe(2000);
  });

  it("acredita al campo correcto según balanceField", async () => {
    const uid = await createUser();
    await creditLedger(env.DB, uid, 5000, "propina_recibida", null, "idem-2", "creator_balance_cents");
    const user = await env.DB.prepare("SELECT balance_cents, creator_balance_cents FROM users WHERE id = ?").bind(uid).first<{ balance_cents: number; creator_balance_cents: number }>();
    expect(user?.creator_balance_cents).toBe(5000);
    expect(user?.balance_cents).toBe(0);
  });
});

describe("POST /api/wallet/retiro", () => {
  it("rechaza sin sesión", async () => {
    const res = await app.request("/api/wallet/retiro", { method: "POST" }, env);
    expect(res.status).toBe(401);
  });

  it("rechaza sin cuenta bancaria conectada, aunque tenga saldo", async () => {
    const uid = await createUser({ creatorBalanceCents: 30000 });
    const res = await app.request(
      "/api/wallet/retiro",
      { method: "POST", headers: { Cookie: await cookieFor(uid) } },
      env
    );
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: "cuenta_no_conectada" });
  });

  it("rechaza bajo el mínimo real de Stripe para MXN ($10)", async () => {
    const uid = await createUser({ creatorBalanceCents: 500 });
    await connectUser(uid);
    const res = await app.request(
      "/api/wallet/retiro",
      { method: "POST", headers: { Cookie: await cookieFor(uid) } },
      env
    );
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string; minimo_cents: number }).toEqual({ error: "bajo_minimo", minimo_cents: 1000 });
  });

  it("acepta exactamente el mínimo de $10 (no lo rechaza por bajo_minimo)", async () => {
    const uid = await createUser({ creatorBalanceCents: 1000 });
    await connectUser(uid);
    const res = await app.request(
      "/api/wallet/retiro",
      { method: "POST", headers: { Cookie: await cookieFor(uid) } },
      env
    );
    // La cuenta de Stripe es falsa, así que igual falla — pero lo importante
    // aquí es que NO lo bloquea el mínimo (confirma que $10 exactos sí alcanza).
    expect((await res.json()) as { error: string }).not.toEqual(expect.objectContaining({ error: "bajo_minimo" }));
  });

  // connectUser() guarda una cuenta de Stripe Connect FALSA (no existe de
  // verdad en Stripe) — así estas dos pruebas ejercitan de verdad la llamada
  // a la API de Stripe (nada de mocks) y, como Stripe rechaza la cuenta
  // inexistente, terminan probando exactamente la red de seguridad que
  // más importa: qué pasa cuando la transferencia real falla.
  it("si la transferencia falla, reembolsa el balance y dice qué pasó", async () => {
    const uid = await createUser({ creatorBalanceCents: 30000 });
    await connectUser(uid);
    const res = await app.request(
      "/api/wallet/retiro",
      { method: "POST", headers: { Cookie: await cookieFor(uid) } },
      env
    );
    expect(res.status).toBe(502);
    expect((await res.json()) as { error: string }).toEqual({ error: "transferencia_fallida" });

    // El dinero nunca se pierde: el balance vuelve a su valor original.
    const user = await env.DB.prepare("SELECT creator_balance_cents FROM users WHERE id = ?").bind(uid).first<{ creator_balance_cents: number }>();
    expect(user?.creator_balance_cents).toBe(30000);

    const refund = await env.DB.prepare("SELECT amount_cents FROM ledger WHERE user_id = ? AND type = 'retiro_fallido_reembolso'").bind(uid).first<{ amount_cents: number }>();
    expect(refund?.amount_cents).toBe(30000);
  });

  it("dos solicitudes concurrentes con el mismo balance: solo una llega a intentar la transferencia", async () => {
    const uid = await createUser({ creatorBalanceCents: 30000 });
    await connectUser(uid);
    const cookie = await cookieFor(uid);
    const [r1, r2] = await Promise.all([
      app.request("/api/wallet/retiro", { method: "POST", headers: { Cookie: cookie } }, env),
      app.request("/api/wallet/retiro", { method: "POST", headers: { Cookie: cookie } }, env),
    ]);
    const bodies = (await Promise.all([r1.json(), r2.json()])) as { error?: string }[];
    // Una se queda fuera de inmediato por el update condicional (no_procesado);
    // la otra sí alcanza a intentar la transferencia (y falla porque la cuenta
    // es falsa) — nunca las dos llegan a intentarlo.
    const reachedTransfer = bodies.filter((b) => b.error === "transferencia_fallida");
    const blockedByRace = bodies.filter((b) => b.error === "no_procesado");
    expect(reachedTransfer.length).toBe(1);
    expect(blockedByRace.length).toBe(1);
  });
});

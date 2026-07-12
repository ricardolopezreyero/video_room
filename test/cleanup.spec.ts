import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { cleanupStaleLiveSessions } from "../src/index";
import { createUser, createRoom } from "./helpers";

async function createSessionAt(roomId: string, startedAt: number): Promise<string> {
  const id = `sess_${Math.random().toString(36).slice(2)}`;
  await env.DB.prepare("INSERT INTO sessions (id, room_id, status, started_at) VALUES (?, ?, 'live', ?)").bind(id, roomId, startedAt).run();
  return id;
}

describe("cleanupStaleLiveSessions", () => {
  it("cierra sesiones vivas de más de 8 horas y deja intactas las recientes", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const now = Math.floor(Date.now() / 1000);

    const staleId = await createSessionAt(room.id, now - 9 * 3600); // 9h — zombie
    const freshId = await createSessionAt(room.id, now - 60); // 1 min — real, en curso

    await cleanupStaleLiveSessions(env as never);

    const stale = await env.DB.prepare("SELECT status FROM sessions WHERE id = ?").bind(staleId).first<{ status: string }>();
    const fresh = await env.DB.prepare("SELECT status FROM sessions WHERE id = ?").bind(freshId).first<{ status: string }>();
    expect(stale?.status).toBe("ended");
    expect(fresh?.status).toBe("live");
  });
});

// RLR
import type { Context } from "hono";
import { getCookie } from "hono/cookie";

export const UTM_COOKIE = "vr_utm";

export interface Utm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export function readUtmCookie(c: Context): Utm {
  const raw = getCookie(c, UTM_COOKIE);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return {
      utm_source: typeof parsed.utm_source === "string" ? parsed.utm_source.slice(0, 80) : undefined,
      utm_medium: typeof parsed.utm_medium === "string" ? parsed.utm_medium.slice(0, 80) : undefined,
      utm_campaign: typeof parsed.utm_campaign === "string" ? parsed.utm_campaign.slice(0, 80) : undefined,
    };
  } catch {
    return {};
  }
}

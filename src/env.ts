export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ROOM_DO: DurableObjectNamespace;
  APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  CALLS_APP_ID: string;
  CALLS_APP_TOKEN: string;
  RESEND_API_KEY: string;
  /** Medios de la casa (R2): los originales de la música. */
  MEDIOS?: R2Bucket;
  /** De la bóveda (Secrets Store) llega como objeto con get(); en pruebas puede ser texto o faltar. */
  ELEVENLABS_API_KEY?: string | { get(): Promise<string> };
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
}

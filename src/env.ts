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
}

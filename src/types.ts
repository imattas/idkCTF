import type { Context } from "hono";

export interface EmailMessage {
  to: string;
  from: { email: string; name?: string };
  subject: string;
  text?: string;
  html?: string;
}
export interface EmailBinding {
  send(msg: EmailMessage): Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  ASSETS: Fetcher;
  FILES?: R2Bucket; // optional; falls back to D1 inline storage
  EMAIL?: EmailBinding; // optional Cloudflare Email Sending binding
  ACCOUNT_ID?: string;
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  team_id: number | null;
  is_captain: number;
  verified: number;
}

export type Variables = {
  user: SessionUser | null;
};

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

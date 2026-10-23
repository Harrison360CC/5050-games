import { createClient, type Session } from "@supabase/supabase-js";

// Publishable key: safe in the browser, RLS does the protecting.
export const SUPABASE_URL = "https://sagykwyjneapatmzpuyx.supabase.co";
export const SUPABASE_KEY = "sb_publishable_Fzu2uvsoPA-jHudwX8b86A_AaOEv4v1";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Provider = "google" | "discord";

export async function signInWith(provider: Provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onSession(cb: (s: Session | null) => void) {
  supabase.auth.getSession().then(({ data }) => cb(data.session));
  supabase.auth.onAuthStateChange((_e, s) => cb(s));
}

export interface Profile { id: string; handle: string; is_adult: boolean; banned: boolean; handle_locked: boolean }

export async function getProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id,handle,is_adult,banned,handle_locked").eq("id", user.id).single();
  return (data as Profile) ?? null;
}

/** Returns null on success, or a human message. */
export async function setHandle(handle: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "not signed in";
  if (!/^[A-Za-z0-9_]{3,20}$/.test(handle)) return "letters, numbers, underscores. 3 to 20.";
  const { error } = await supabase.from("profiles").update({ handle }).eq("id", user.id);
  if (!error) return null;
  if (error.code === "23505") return "taken. someone got there first.";
  if (error.code === "P0001") return "you already picked. that was the one.";
  return error.message;
}

export async function setAdult() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ is_adult: true }).eq("id", user.id);
}

/** Authenticated call to our own API (Pages Functions under /api). */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api" + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(session ? { authorization: `Bearer ${session.access_token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await r.json()) as any;
  if (!r.ok) throw new Error(j.error || j.reason || r.statusText);
  return j as T;
}

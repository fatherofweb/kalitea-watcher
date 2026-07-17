import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supa(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY nisu postavljeni');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const LS_KEY = 'mg.supabase';

export interface CloudConfig {
  url: string;
  anonKey: string;
}

/** Lê a configuração do Supabase: primeiro das variáveis de build, depois do que foi colado no app. */
export function getCloudConfig(): CloudConfig | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const cfg = JSON.parse(raw) as CloudConfig;
      if (cfg.url && cfg.anonKey) return cfg;
    }
  } catch {
    // armazenamento indisponível
  }
  return null;
}

export function isCloudFromEnv(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function saveCloudConfig(cfg: CloudConfig | null): void {
  try {
    if (cfg) localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(LS_KEY);
  } catch {
    // armazenamento indisponível
  }
  client = null;
  clientKey = '';
}

let client: SupabaseClient | null = null;
let clientKey = '';

export function getClient(): SupabaseClient | null {
  const cfg = getCloudConfig();
  if (!cfg) return null;
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (!client || clientKey !== key) {
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mg.auth' },
    });
    clientKey = key;
  }
  return client;
}

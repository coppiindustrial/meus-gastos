import { useSyncExternalStore } from 'react';
import { SYNCED_TABLES, getMeta, setMeta, tableOf, type SyncedTableName } from './db';
import { getClient } from './supabase';

export type SyncStatus = 'off' | 'signedout' | 'idle' | 'syncing' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSync: number | null;
  email: string | null;
  error: string | null;
}

function readLastSync(): number | null {
  try {
    const v = localStorage.getItem('mg.lastSync');
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

let state: SyncState = { status: 'off', lastSync: readLastSync(), email: null, error: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState);
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Agenda uma sincronização alguns segundos depois da última alteração. */
export function scheduleSync(delay = 2500): void {
  if (state.status === 'off' || state.status === 'signedout') return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void syncNow();
  }, delay);
}

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = doSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

interface RemoteRow {
  kind: string;
  id: string;
  updated_at: number;
  deleted: boolean;
  data: Record<string, unknown>;
  synced_at: string;
}

const PAGE = 500;

async function doSync(): Promise<void> {
  const sb = getClient();
  if (!sb) {
    setState({ status: 'off' });
    return;
  }
  const { data: auth } = await sb.auth.getSession();
  const user = auth.session?.user;
  if (!user) {
    setState({ status: 'signedout', email: null });
    return;
  }
  if (!navigator.onLine) {
    setState({ status: 'idle', email: user.email ?? null });
    return;
  }
  setState({ status: 'syncing', email: user.email ?? null, error: null });
  try {
    // 1) Traz o que mudou na nuvem desde a última vez.
    const cursorKey = `pullCursor:${user.id}`;
    let cursor = await getMeta<string>(cursorKey, '1970-01-01T00:00:00Z');
    for (;;) {
      const { data, error } = await sb
        .from('records')
        .select('kind,id,updated_at,deleted,data,synced_at')
        .gt('synced_at', cursor)
        .order('synced_at', { ascending: true })
        .limit(PAGE);
      if (error) throw error;
      const rows = (data ?? []) as RemoteRow[];
      for (const r of rows) {
        if (!(SYNCED_TABLES as readonly string[]).includes(r.kind)) continue;
        const table = tableOf(r.kind as SyncedTableName);
        const local = await table.get(r.id);
        const remoteUpdated = Number(r.updated_at);
        if (!local || local.dirty !== 1 || remoteUpdated >= (local.updatedAt ?? 0)) {
          await table.put({
            ...r.data,
            id: r.id,
            updatedAt: remoteUpdated,
            deleted: r.deleted ? 1 : 0,
            dirty: 0,
          });
        }
      }
      if (rows.length > 0) {
        cursor = rows[rows.length - 1].synced_at;
        await setMeta(cursorKey, cursor);
      }
      if (rows.length < PAGE) break;
    }

    // 2) Envia o que mudou no celular.
    for (const name of SYNCED_TABLES) {
      const table = tableOf(name);
      const dirty = await table.where('dirty').equals(1).toArray();
      for (let i = 0; i < dirty.length; i += 200) {
        const chunk = dirty.slice(i, i + 200);
        const payload = chunk.map((row) => {
          const { id, updatedAt, deleted, dirty: _d, ...rest } = row;
          return {
            user_id: user.id,
            kind: name,
            id,
            updated_at: updatedAt,
            deleted: deleted === 1,
            data: rest,
          };
        });
        const { error } = await sb.from('records').upsert(payload, { onConflict: 'user_id,kind,id' });
        if (error) throw error;
        for (const row of chunk) {
          const current = await table.get(row.id);
          if (current && current.updatedAt === row.updatedAt) {
            await table.update(row.id, { dirty: 0 });
          }
        }
      }
    }

    const now = Date.now();
    try {
      localStorage.setItem('mg.lastSync', String(now));
    } catch {
      // sem armazenamento
    }
    setState({ status: 'idle', lastSync: now, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
    setState({ status: 'error', error: message });
  }
}

let started = false;

/** Liga a sincronização automática (ao abrir o app, ao voltar para ele e ao reconectar). */
export async function initSync(): Promise<void> {
  const sb = getClient();
  if (!sb) {
    setState({ status: 'off', email: null });
    return;
  }
  const { data } = await sb.auth.getSession();
  setState({
    status: data.session ? 'idle' : 'signedout',
    email: data.session?.user.email ?? null,
  });
  if (!started) {
    started = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void syncNow();
    });
    window.addEventListener('online', () => void syncNow());
    setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow();
    }, 5 * 60 * 1000);
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') setState({ status: 'signedout', email: null });
    if (event === 'SIGNED_IN' && session) {
      setState({ status: 'idle', email: session.user.email ?? null });
      void syncNow();
    }
  });
  if (data.session) void syncNow();
}

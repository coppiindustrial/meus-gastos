import Dexie, { type Table } from 'dexie';
import type { Cartao, Categoria, Conta, Fatura, Grupo, Lancamento, Recorrencia, Regra, Saldo } from './types';

export interface MetaRow {
  key: string;
  value: unknown;
}

class AppDB extends Dexie {
  grupos!: Table<Grupo, string>;
  categorias!: Table<Categoria, string>;
  regras!: Table<Regra, string>;
  cartoes!: Table<Cartao, string>;
  faturas!: Table<Fatura, string>;
  lancamentos!: Table<Lancamento, string>;
  recorrencias!: Table<Recorrencia, string>;
  contas!: Table<Conta, string>;
  saldos!: Table<Saldo, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('meus-gastos');
    this.version(1).stores({
      grupos: 'id, tipo, dirty',
      categorias: 'id, grupoId, dirty',
      regras: 'id, prioridade, dirty',
      cartoes: 'id, dirty',
      faturas: 'id, cartaoId, competencia, hashArquivo, dirty',
      lancamentos: 'id, competencia, data, origem, categoriaId, faturaId, revisar, dirty',
      recorrencias: 'id, dirty',
      contas: 'id, dirty',
      saldos: 'id, contaId, data, dirty',
      meta: 'key',
    });
  }
}

export const db = new AppDB();

/** Tabelas que sincronizam com o Supabase (o nome vira o campo "kind" lá). */
export const SYNCED_TABLES = [
  'grupos',
  'categorias',
  'regras',
  'cartoes',
  'faturas',
  'lancamentos',
  'recorrencias',
  'contas',
  'saldos',
] as const;

export type SyncedTableName = (typeof SYNCED_TABLES)[number];

export function tableOf(name: SyncedTableName): Table<any, string> {
  return db[name] as Table<any, string>;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Pede ao navegador para não apagar os dados do app quando faltar espaço. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // sem suporte: segue normalmente
  }
}

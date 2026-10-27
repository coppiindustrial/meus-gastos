import { SYNCED_TABLES, tableOf } from './db';
import { todayISO } from './format';
import { scheduleSync } from './sync';

interface BackupFile {
  app: 'meus-gastos';
  version: 1;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/** Gera um arquivo com todos os seus dados. No iPhone abre a tela de compartilhar (salve em Arquivos/iCloud). */
export async function exportBackup(): Promise<void> {
  const tables: BackupFile['tables'] = {};
  for (const name of SYNCED_TABLES) {
    const rows = await tableOf(name).toArray();
    tables[name] = rows.map(({ dirty: _d, ...rest }) => rest);
  }
  const content: BackupFile = { app: 'meus-gastos', version: 1, exportedAt: new Date().toISOString(), tables };
  const fileName = `meus-gastos-backup-${todayISO()}.json`;
  const file = new File([JSON.stringify(content)], fileName, { type: 'application/json' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Backup Meus Gastos' });
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Lê um backup e junta com os dados atuais (o registro mais novo vence). Retorna quantos itens entraram. */
export async function importBackup(file: File): Promise<number> {
  const parsed = JSON.parse(await file.text()) as BackupFile;
  if (!parsed || parsed.app !== 'meus-gastos' || !parsed.tables) {
    throw new Error('Esse arquivo não é um backup do Meus Gastos.');
  }
  let count = 0;
  for (const name of SYNCED_TABLES) {
    const rows = parsed.tables[name] ?? [];
    const table = tableOf(name);
    for (const row of rows) {
      const id = row.id as string | undefined;
      if (!id) continue;
      const local = await table.get(id);
      const incomingUpdated = Number(row.updatedAt ?? 0);
      if (!local || incomingUpdated >= (local.updatedAt ?? 0)) {
        await table.put({ ...row, dirty: 1 });
        count += 1;
      }
    }
  }
  scheduleSync(500);
  return count;
}

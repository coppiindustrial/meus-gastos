import { useRef, useState } from 'react';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { BackButton, TopBar } from '../components/Layout';
import { exportBackup, importBackup } from '../lib/backup';
import { getClient, getCloudConfig, isCloudFromEnv, saveCloudConfig } from '../lib/supabase';
import { initSync, syncNow, useSyncState } from '../lib/sync';

/** Conta, sincronização e backup. */
export function Conta() {
  const sync = useSyncState();
  const { toast, confirm } = useDialogs();
  const [cfg, setCfg] = useState(getCloudConfig());
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Só em desenvolvimento: na versão publicada o endereço e a chave vêm do build.
  const saveConfig = async () => {
    const u = url.trim().replace(/\/+$/, '');
    if (!/^https:\/\/.+\.supabase\.co$/.test(u)) {
      setError('O endereço deve ser parecido com https://abcdefgh.supabase.co');
      return;
    }
    if (key.trim().length < 30) {
      setError('Cole a chave pública completa.');
      return;
    }
    if (/^sb_secret_/.test(key.trim()) || key.includes('service_role')) {
      setError('Essa é a chave secreta. Use a chave pública (publishable ou anon).');
      return;
    }
    saveCloudConfig({ url: u, anonKey: key.trim() });
    setCfg(getCloudConfig());
    setError(null);
    await initSync();
  };

  const signOut = async () => {
    const ok = await confirm({
      title: 'Sair da conta?',
      message: 'Seus dados continuam neste aparelho, mas o app só abre de novo depois de entrar.',
      confirmLabel: 'Sair',
    });
    if (!ok) return;
    await getClient()?.auth.signOut();
    await initSync();
  };

  const removeConfig = async () => {
    const ok = await confirm({ title: 'Desconectar da nuvem?', message: 'Seus dados continuam neste aparelho.', confirmLabel: 'Desconectar', danger: true });
    if (!ok) return;
    await getClient()?.auth.signOut();
    saveCloudConfig(null);
    setCfg(null);
    await initSync();
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const n = await importBackup(file);
      toast(`${n} registros importados`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <main className="screen no-tabs">
      <TopBar left={<BackButton to="/mais" />} title="Conta e backup" />

      {!cfg ? (
        <>
          <div className="notice">
            <span className="notice-icon">
              <Icon name="cloud" />
            </span>
            <span className="small" style={{ lineHeight: 1.5 }}>
              Sem nuvem configurada: os dados ficam só neste aparelho. Na versão publicada a conexão já vem pronta; aqui é só para testes.
            </span>
          </div>
          <label className="field">
            <span className="label">Project URL</span>
            <input className="input" value={url} placeholder="https://abcdefgh.supabase.co" autoCapitalize="off" autoCorrect="off" onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Chave pública</span>
            <textarea className="textarea" value={key} placeholder="sb_publishable_… ou eyJhbGciOi…" autoCapitalize="off" autoCorrect="off" onChange={(e) => setKey(e.target.value)} />
          </label>
          <span className="tiny muted" style={{ lineHeight: 1.5 }}>
            No painel do Supabase, em Project Settings → API Keys. Use a chave pública (“publishable” ou “anon public”). Nunca use a chave secreta (“secret” ou “service_role”).
          </span>
          {error && (
            <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>
              {error}
            </p>
          )}
          <button type="button" className="btn big primary block" onClick={saveConfig}>
            Conectar
          </button>
        </>
      ) : (
        <>
          <div className="notice">
            <span className="notice-icon">
              <Icon name={sync.status === 'error' ? 'cloud' : 'cloudCheck'} />
            </span>
            <div className="col">
              <span style={{ fontWeight: 800 }}>
                {sync.status === 'syncing' ? 'Sincronizando…' : sync.status === 'error' ? 'Problema na sincronização' : 'Tudo sincronizado'}
              </span>
              <span className="small muted">{sync.email}</span>
              {sync.lastSync && (
                <span className="tiny muted">
                  Última vez: {new Date(sync.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {sync.status === 'error' && (
                <span className="tiny" style={{ color: 'var(--danger)' }}>
                  {sync.error}
                </span>
              )}
            </div>
          </div>
          <button type="button" className="btn big block" onClick={() => void syncNow()} disabled={sync.status === 'syncing'}>
            <Icon name="refresh" /> Sincronizar agora
          </button>
          <span className="tiny muted" style={{ lineHeight: 1.5 }}>
            O app sincroniza sozinho ao abrir, ao voltar para ele e alguns segundos depois de cada alteração.
          </span>
        </>
      )}

      <div className="list-group">
        <button type="button" className="list-item" onClick={() => void exportBackup()}>
          <Icon name="download" />
          <span className="grow">Exportar backup</span>
        </button>
        <button type="button" className="list-item" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" />
          <span className="grow">Importar backup</span>
        </button>
        {cfg && (
          <button type="button" className="list-item danger" onClick={signOut}>
            <Icon name="logout" />
            <span className="grow">Sair da conta</span>
          </button>
        )}
        {cfg && !isCloudFromEnv() && (
          <button type="button" className="list-item danger" onClick={removeConfig}>
            <Icon name="x" />
            <span className="grow">Desconectar da nuvem</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
      <span className="tiny muted" style={{ textAlign: 'center' }}>
        Versão {__APP_VERSION__}
      </span>
    </main>
  );
}

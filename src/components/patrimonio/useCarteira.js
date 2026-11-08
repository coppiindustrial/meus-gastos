import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { listarCarteira } from '../../api/carteira.js';
import { taxasDiarias } from '../../api/taxas.js';
import { cdiMensal } from '../../api/cdi.js';
import { maisDias, mesAMes, montarCarteira } from '../../lib/carteira.js';
import { todayISO } from '../../lib/format.js';

// OS DADOS DA CARTEIRA (07/11/2026, a carteira do zero), que as telas Investimentos, Patrimônio e Indicadores dividem: o
// cadastro, os aportes e os resgates (migration 020), o CDI de cada dia (para a conta) e o CDI de cada mês (para comparar).
// `dados === undefined`: carregando; `null`: falta a migration 020.
// SEM O BANCO CENTRAL (a API dele já ficou horas fora): sem o CDI de cada dia, cada aporte fica no valor de partida; a tela
// avisa (`semTaxas`) e o app tenta de novo a cada minuto (ou no "Tentar agora", `tentarTaxas`).
export default function useCarteira() {
  const toast = useToast();
  const [dados, setDados] = useState(undefined);
  const [cdi, setCdi] = useState(null); // o CDI de cada dia: [['AAAA-MM-DD', fração]]
  const [cdiMes, setCdiMes] = useState(null); // o de cada mês: { 'AAAA-MM': fração }
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const hoje = todayISO();

  const carregar = useCallback(async () => {
    try { setDados(await listarCarteira()); } catch (err) { toast.error(err.message); setDados({ cadastro: [], aportes: [], resgates: [] }); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  // o CDI desde a partida mais antiga (a sexta antes de um aporte de sábado também conta), e no mínimo os DOIS ANOS de
  // antes de hoje: a prévia do "Lançar aporte" faz a conta com este CDI — sem aporte nenhum, ela não tinha CDI (e o
  // "Vale hoje, pela conta" sumia); com um aporte mais antigo que todos, faltavam os dias do começo.
  const desde = useMemo(() => {
    if (!dados) return null;
    const d = [maisDias(hoje, -731), ...(dados.aportes ?? []).map((a) => a.data)].sort()[0];
    return maisDias(d, -3);
  }, [dados, hoje]);
  useEffect(() => {
    if (!desde) return undefined;
    let vivo = true;
    taxasDiarias(desde).then((t) => { if (!vivo) return; if (t?.cdi?.length) setCdi(t.cdi); setFalhou(!t?.cdi?.length); });
    cdiMensal(desde.slice(0, 7)).then((c) => { if (vivo && c) setCdiMes(c); });
    return () => { vivo = false; };
  }, [desde, tentativa]);
  useEffect(() => {
    if (!falhou) return undefined;
    const id = setTimeout(() => setTentativa((n) => n + 1), 60000);
    return () => clearTimeout(id);
  }, [falhou, tentativa]);
  const tentarTaxas = useCallback(() => setTentativa((n) => n + 1), []);

  const base = useMemo(() => ({ cadastro: dados?.cadastro ?? [], aportes: dados?.aportes ?? [], resgates: dados?.resgates ?? [], cdi: cdi ?? [], hoje }), [dados, cdi, hoje]);
  const carteira = useMemo(() => montarCarteira(base), [base]);
  const meses = useMemo(() => mesAMes(base), [base]);

  return {
    carregar, dados, semMigration: dados === null, carregando: dados === undefined, hoje,
    cadastro: base.cadastro, aportes: base.aportes, resgates: base.resgates,
    carteira, meses, cdi, cdiMes, semTaxas: falhou && !cdi && base.aportes.length > 0, tentarTaxas,
  };
}

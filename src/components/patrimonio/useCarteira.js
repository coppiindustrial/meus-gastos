import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { gravarReaplicacao, listarCarteira } from '../../api/carteira.js';
import { taxasDiarias } from '../../api/taxas.js';
import { cdiMensal } from '../../api/cdi.js';
import { maisDias, mesAMes, montarCarteira, reaplicacoesDevidas } from '../../lib/carteira.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate, todayISO } from '../../lib/format.js';

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

  // o CDI desde a partida mais antiga, e no mínimo os DOIS ANOS de
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

  // A REAPLICAÇÃO NO VENCIMENTO (08/11/2026, migration 022): o investimento que reaplica sozinho ganha, no dia do
  // vencimento de cada aporte, o APORTE NOVO (o líquido do dia, o prazo do cadastro, "conferir") — gravado por qualquer
  // tela que leia a carteira, assim que o CDI chega. Recarrega e repete enquanto houver (o novo também pode já ter vencido).
  // O índice único do `reaplicado_de` impede o repetido; um erro de verdade avisa uma vez e para até recarregar a página.
  const reaplicando = useRef(false);
  const parou = useRef(false);
  useEffect(() => {
    if (!dados || !cdi?.length || reaplicando.current || parou.current) return;
    const devidas = reaplicacoesDevidas({ ...base, cal: carteira.cal });
    if (!devidas.length) return;
    reaplicando.current = true;
    (async () => {
      const feitas = [];
      try {
        for (const r of devidas) if (await gravarReaplicacao(r.dados)) feitas.push(r);
      } catch (err) {
        parou.current = true;
        toast.error(`Não reaplicou o vencimento sozinho: ${err.message}`);
      }
      reaplicando.current = false;
      if (feitas.length === 1) toast.success(`${feitas[0].inv.nome} venceu em ${formatDate(feitas[0].venc.data)} e foi reaplicado: ${formatBRL(feitas[0].venc.liquido)}, já sem o IR. Confira com o banco.`);
      else if (feitas.length > 1) toast.success(`${feitas.length} vencimentos reaplicados (já sem o IR). Confira com o banco os marcados "conferir".`);
      if (!parou.current) carregar();
    })();
  }, [dados, cdi, base, carteira, carregar, toast]);

  return {
    carregar, dados, semMigration: dados === null, carregando: dados === undefined, hoje,
    cadastro: base.cadastro, aportes: base.aportes, resgates: base.resgates,
    carteira, meses, cdi, cdiMes, semTaxas: falhou && !cdi && base.aportes.length > 0, tentarTaxas,
  };
}

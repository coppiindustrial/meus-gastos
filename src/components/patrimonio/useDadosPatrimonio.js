import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { listarContas, listarMovimentos, listarSaldos } from '../../api/patrimonio.js';
import { listarInvestimentos } from '../../api/investimentos.js';
import { cdiMensal } from '../../api/cdi.js';
import { rendimentoDasSeries, rendimentoDoPeriodo, seriesDoPatrimonio } from '../../lib/patrimonio.js';
import { carteira, pendentesDeValor } from '../../lib/investimentos.js';
import { estimarImposto } from '../../lib/impostoInvestimento.js';
import { competenciaAtual, todayISO } from '../../lib/format.js';
import { CORES_CONTA } from './TabelaInvestimentos.jsx';

// OS DADOS DO PATRIMÔNIO, que as duas telas dividem (06/11/2026, a separação pedida — o painel em /patrimonio e a tabela
// em /investimentos, como a Visão geral e os Lançamentos): os lugares (`contas`), as fotos antigas das contas, os
// movimentos, os investimentos e os valores; daí o mês a mês (`rendimentoDasSeries`), a carteira por lugar e o que pede
// o valor do mês. `investimentos === null`: falta a migration 014; `movimentos === null`: falta a 013. `sem015`: os
// investimentos não trazem `prazo_meses` (a migration 015, do prazo de cada aplicação).
export default function useDadosPatrimonio({ encerrados = false } = {}) {
  const toast = useToast();
  const [contas, setContas] = useState(null);
  const [saldos, setSaldos] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [dadosInv, setDadosInv] = useState(null);
  const [cdi, setCdi] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [c, s, m, i] = await Promise.all([listarContas(), listarSaldos(), listarMovimentos(), listarInvestimentos()]);
      setContas(c); setSaldos(s); setMovimentos(m); setDadosInv(i);
    } catch (err) { toast.error(err.message); setContas([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const hoje = competenciaAtual();
  const hojeISO = todayISO();
  const ano = hoje.slice(0, 4);
  const investimentos = useMemo(() => dadosInv?.investimentos ?? [], [dadosInv]);
  const valores = useMemo(() => dadosInv?.valores ?? [], [dadosInv]);
  const depositos = useMemo(() => dadosInv?.depositos ?? [], [dadosInv]);
  const movs = useMemo(() => movimentos ?? [], [movimentos]);
  const meses = useMemo(() => rendimentoDasSeries(seriesDoPatrimonio({ saldos, movimentos: movs, investimentos, valores }), hoje),
    [saldos, movs, investimentos, valores, hoje]);
  const primeiroMes = useMemo(() => [meses[0]?.competencia, ...depositos.map((d) => d.data.slice(0, 7)), ...investimentos.map((i) => i.aplicado_em?.slice(0, 7))]
    .filter(Boolean).sort()[0], [meses, depositos, investimentos]);
  useEffect(() => { if (primeiroMes) cdiMensal(primeiroMes).then(setCdi); }, [primeiroMes]);

  // O LÍQUIDO (06/11/2026, o mockup "Depósitos em cascata e o valor líquido"): cada título ganha o `imposto` (os depósitos
  // em cascata, o IR e o IOF de cada um, o líquido — `estimarImposto`, lib/impostoInvestimento.js) e cada lugar soma o seu.
  const grupos = useMemo(() => (contas ? carteira({ contas, investimentos, meses, hoje: hojeISO, ano, encerrados, valores, movimentos: movs })
    .map((g, i) => {
      const itens = g.itens.map((x) => ({
        ...x,
        imposto: estimarImposto({
          inv: x.inv, fotos: valores.filter((v) => v.investimento_id === x.inv.id), movimentos: movs,
          depositos: depositos.filter((d) => d.investimento_id === x.inv.id), cdi, hoje: hojeISO, vale: x.vale, aplicado: x.aplicado,
        }),
      }));
      const ir = itens.reduce((t, x) => t + (x.imposto?.ir ?? 0) + (x.imposto?.iof ?? 0), 0);
      // `incompleto`: algum título sem o IR estimado (sem as datas, ou fundo) — o líquido do lugar soma o bruto dele
      const incompleto = itens.some((x) => x.imposto && x.imposto.liquido === null && !x.imposto.isento);
      return { ...g, itens, ir, incompleto, liquido: g.soConta ? g.vale : itens.reduce((t, x) => t + (x.imposto?.liquido ?? x.vale), 0), cor: CORES_CONTA[i % CORES_CONTA.length] };
    }) : []), [contas, investimentos, meses, hojeISO, ano, encerrados, valores, movs, depositos, cdi]);
  const pendentes = useMemo(() => pendentesDeValor({ investimentos, valores, hoje: hojeISO }), [investimentos, valores, hojeISO]);
  const comMovimentos = movimentos !== null;
  const doAno = meses.filter((m) => m.competencia.startsWith(ano));
  const totalAno = comMovimentos ? rendimentoDoPeriodo(doAno) : { rendeu: null, pct: null, meses: 0 };
  const total = useMemo(() => ({
    aplicado: grupos.reduce((s, g) => s + g.aplicado, 0), vale: grupos.reduce((s, g) => s + g.vale, 0),
    rendeu: grupos.reduce((s, g) => s + g.rendeu, 0), pctAno: totalAno.pct,
    ir: grupos.reduce((s, g) => s + g.ir, 0), liquido: grupos.reduce((s, g) => s + g.liquido, 0), incompleto: grupos.some((g) => g.incompleto),
  }), [grupos, totalAno.pct]);

  return {
    carregar, contas, saldos, movimentos: movs, comMovimentos, investimentos, valores, depositos, comDepositos: !!dadosInv?.comDepositos, comInvestimentos: dadosInv !== null,
    sem015: investimentos.length > 0 && !('prazo_meses' in investimentos[0]),
    cdi, meses, grupos, pendentes, total, doAno, totalAno, hoje, hojeISO, ano,
  };
}

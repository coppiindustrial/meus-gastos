import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { listarContas, listarMovimentos, listarSaldos } from '../../api/patrimonio.js';
import { listarInvestimentos } from '../../api/investimentos.js';
import { cdiMensal } from '../../api/cdi.js';
import { taxasDiarias } from '../../api/taxas.js';
import { andaSozinho, estimarValores } from '../../lib/valorEstimado.js';
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
// O VALOR QUE ANDA SOZINHO (06/11/2026, o mockup "Valor pelo CDI"): as taxas de cada dia do Banco Central (`taxas`) fazem
// as FOTOS ESTIMADAS (`estimarValores`, lib/valorEstimado.js) dos que rendem por uma taxa pública; elas entram nas séries
// (o mês a mês, a carteira, o painel) junto com as reais, e cada título ganha o `estimado` (a última: a base, até quando).
// `valores` continua só com as REAIS (o histórico, o "Atualizar valores", o que pede conferência).
export default function useDadosPatrimonio({ encerrados = false } = {}) {
  const toast = useToast();
  const [contas, setContas] = useState(null);
  const [saldos, setSaldos] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [dadosInv, setDadosInv] = useState(null);
  const [cdi, setCdi] = useState(null);
  const [taxas, setTaxas] = useState(null);

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
  // as taxas de cada dia desde a foto mais antiga dos que andam sozinhos (o caminho entre as fotos) e o depósito mais antigo (o IR)
  const desdeDiario = useMemo(() => {
    const auto = new Set(investimentos.filter(andaSozinho).map((i) => i.id));
    return [...valores.filter((v) => auto.has(v.investimento_id)).map((v) => v.data), ...depositos.map((x) => x.data), ...investimentos.map((i) => i.aplicado_em)]
      .filter(Boolean).sort()[0] ?? null;
  }, [investimentos, valores, depositos]);
  // SEM O BANCO CENTRAL (06/11/2026: a API dele respondeu 502 por horas): as taxas que já vieram ficam; sem nenhuma, a tela
  // avisa (`semTaxas`) e tenta de novo sozinha a cada minuto — ou no "Tentar agora" (`tentarTaxas`).
  const [tentativa, setTentativa] = useState(0);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    if (!desdeDiario) return undefined;
    let vivo = true;
    taxasDiarias(desdeDiario).then((t) => { if (!vivo) return; if (t) setTaxas(t); setFalhou(!t); });
    return () => { vivo = false; };
  }, [desdeDiario, tentativa]);
  useEffect(() => {
    if (!falhou) return undefined;
    const id = setTimeout(() => setTentativa((n) => n + 1), 60000);
    return () => clearTimeout(id);
  }, [falhou, tentativa]);
  const tentarTaxas = useCallback(() => setTentativa((n) => n + 1), []);
  const estimados = useMemo(() => estimarValores({ investimentos, valores, movimentos: movs, taxas, hoje: hojeISO }), [investimentos, valores, movs, taxas, hojeISO]);
  const valoresSerie = useMemo(() => (estimados.length ? [...valores, ...estimados] : valores), [valores, estimados]);
  const meses = useMemo(() => rendimentoDasSeries(seriesDoPatrimonio({ saldos, movimentos: movs, investimentos, valores: valoresSerie }), hoje),
    [saldos, movs, investimentos, valoresSerie, hoje]);
  const primeiroMes = useMemo(() => [meses[0]?.competencia, ...depositos.map((d) => d.data.slice(0, 7)), ...investimentos.map((i) => i.aplicado_em?.slice(0, 7))]
    .filter(Boolean).sort()[0], [meses, depositos, investimentos]);
  useEffect(() => { if (primeiroMes) cdiMensal(primeiroMes).then(setCdi); }, [primeiroMes]);

  // O LÍQUIDO (06/11/2026, o mockup "Depósitos em cascata e o valor líquido"): cada título ganha o `imposto` (os depósitos
  // em cascata, o IR e o IOF de cada um, o líquido — `estimarImposto`, lib/impostoInvestimento.js) e cada lugar soma o seu.
  const grupos = useMemo(() => (contas ? carteira({ contas, investimentos, meses, hoje: hojeISO, ano, encerrados, valores, movimentos: movs, depositos })
    .map((g, i) => {
      const itens = g.itens.map((x) => {
        // o valor de hoje é estimado quando a foto mais nova do título é a estimada
        const est = estimados.find((e) => e.ultimo && e.investimento_id === x.inv.id);
        const estimado = est && est.data === x.data ? est : null;
        return {
          ...x, estimado,
          imposto: estimarImposto({
            inv: x.inv, fotos: valores.filter((v) => v.investimento_id === x.inv.id), movimentos: movs,
            depositos: depositos.filter((d) => d.investimento_id === x.inv.id), cdi, taxas, hoje: hojeISO, vale: x.vale, aplicado: x.aplicado,
          }),
        };
      });
      const ir = itens.reduce((t, x) => t + (x.imposto?.ir ?? 0) + (x.imposto?.iof ?? 0), 0);
      // `incompleto`: algum título sem o IR estimado (sem as datas, ou fundo) — o líquido do lugar soma o bruto dele
      const incompleto = itens.some((x) => x.imposto && x.imposto.liquido === null && !x.imposto.isento);
      return { ...g, itens, ir, incompleto, liquido: g.soConta ? g.vale : itens.reduce((t, x) => t + (x.imposto?.liquido ?? x.vale), 0), cor: CORES_CONTA[i % CORES_CONTA.length] };
    }) : []), [contas, investimentos, meses, hojeISO, ano, encerrados, valores, movs, depositos, cdi, taxas, estimados]);
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
    cdi, taxas, estimados, meses, grupos, pendentes, total, doAno, totalAno, hoje, hojeISO, ano,
    // sem as taxas e com algum que anda sozinho: os valores param na última foto
    semTaxas: falhou && !taxas && investimentos.some((i) => i.ativo !== false && andaSozinho(i)), tentarTaxas,
  };
}

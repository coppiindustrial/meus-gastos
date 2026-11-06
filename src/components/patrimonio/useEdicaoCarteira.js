import { useCallback, useMemo, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarMovimento, excluirConta, excluirMovimento, salvarConta, salvarMovimentos } from '../../api/patrimonio.js';
import {
  atualizarDeposito, atualizarInvestimento, atualizarValor, criarInvestimento, excluirDeposito, excluirInvestimento, excluirValor,
  excluirValorNaData, inserirDeposito, lancarMovimento, registrarValores,
} from '../../api/investimentos.js';
import { planoDoAporte, planoDoNovoAporte } from '../../lib/carteiraEditavel.js';
import { nomeTipoInvestimento, rendimentoForaDoNormal } from '../../lib/investimentos.js';
import { andaSozinho, rotuloPeloIndice, valoresComOMovimento } from '../../lib/valorEstimado.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';

// AS GRAVAÇÕES DA CARTEIRA EDITÁVEL (06/11/2026, a opção A do mockup "Carteira editável"): cada célula grava sozinha, como
// a grade dos Lançamentos. Uma gravação de cada vez (a FILA: duas células editadas em seguida não se atropelam), a tela
// relê os dados depois de cada uma, e cada uma guarda o seu DESFAZER (a pilha do Ctrl+Z: o contrário do que gravou — o
// valor de antes, ou apagar o que nasceu). `d`: o `useDadosPatrimonio`. Nada aqui loga valor.
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const amigavel = (err) => {
  const m = err?.message ?? '';
  if (/duplicate|unique/i.test(m)) return 'Já existe um valor nessa data para este investimento.';
  if (/vencimento/i.test(m) && /column|schema cache|does not exist/i.test(m)) return 'Falta aplicar a migration 018 (o vencimento de cada aporte): cole o arquivo no SQL Editor do Supabase.';
  return m || 'Não gravou.';
};

export default function useEdicaoCarteira(d) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const pilha = useRef([]); // [{ rotulo, desfazer }]
  const fila = useRef(Promise.resolve());
  const [gravando, setGravando] = useState(0);
  const [qtdDesfazer, setQtdDesfazer] = useState(0);
  const dRef = useRef(d);
  dRef.current = d;

  // `fazer` grava e devolve o desfazer (ou null). Resolve com { ok, valor } — `valor`: o que o `fazer` quis devolver (o id
  // do que nasceu), em `fazer.resultado`.
  const rodar = useCallback((rotulo, fazer) => {
    const p = fila.current.then(async () => {
      setGravando((n) => n + 1);
      const saida = { resultado: null };
      try {
        const desfazer = await fazer(saida);
        if (desfazer) { pilha.current.push({ rotulo, desfazer }); setQtdDesfazer(pilha.current.length); }
        await dRef.current.carregar();
        return { ok: true, valor: saida.resultado };
      } catch (err) {
        toast.error(amigavel(err));
        await dRef.current.carregar();
        return { ok: false };
      } finally {
        setGravando((n) => n - 1);
      }
    });
    fila.current = p.catch(() => {});
    return p;
  }, [toast]);

  const desfazer = useCallback(() => {
    const u = pilha.current.pop();
    setQtdDesfazer(pilha.current.length);
    if (!u) { toast.info('Nada para desfazer.'); return Promise.resolve({ ok: false }); }
    return rodar(null, async () => { await u.desfazer(); toast.success(`Desfeito: ${u.rotulo}.`); return null; });
  }, [rodar, toast]);

  // ------------------------------------------------------------ a instituição
  const renomearInstituicao = useCallback((conta, nome) => {
    if (nome === conta.nome) return Promise.resolve({ ok: true });
    return rodar(`o nome de ${conta.nome}`, async () => {
      await salvarConta({ ...conta, nome });
      return () => salvarConta({ ...conta });
    });
  }, [rodar]);

  const novaInstituicao = useCallback((nome) => rodar(`a instituição ${nome}`, async (saida) => {
    const c = await salvarConta({ nome, tipo: 'investimento', instituicao: '', ativa: true });
    saida.resultado = c.id;
    return () => excluirConta(c.id);
  }), [rodar]);

  // ------------------------------------------------------------ o investimento
  // `mudancas`: a diferença do pop-up (`diferencaInvestimento`). O desfazer volta cada campo ao que era.
  const mudarInvestimento = useCallback((inv, mudancas) => {
    const chaves = Object.keys(mudancas);
    if (!chaves.length) return Promise.resolve({ ok: true });
    const antes = Object.fromEntries(chaves.map((k) => [k, inv[k] ?? null]));
    return rodar(`${inv.nome}`, async () => {
      await atualizarInvestimento(inv.id, mudancas);
      return () => atualizarInvestimento(inv.id, antes);
    });
  }, [rodar]);

  const novoInvestimento = useCallback((dados) => rodar(`o investimento ${dados.nome}`, async (saida) => {
    const novo = await criarInvestimento(dados);
    saida.resultado = novo.id;
    toast.success(`${novo.nome} cadastrado. O primeiro aporte vai na linha de baixo.`);
    return () => excluirInvestimento(novo.id);
  }), [rodar, toast]);

  // O VALOR DE HOJE (o que o banco mostra): a foto de hoje. Fora do normal para o tipo (o aporte ou o resgate esquecido —
  // `rendimentoForaDoNormal`, o mesmo do "Atualizar valores"), pergunta se foi um, e o lança junto.
  const valeHoje = useCallback(async (x, valor) => {
    const { valores, movimentos, hojeISO: hoje } = dRef.current;
    const doInv = valores.filter((v) => v.investimento_id === x.inv.id);
    const ant = doInv.filter((v) => v.data < hoje).reduce((m, v) => (!m || v.data > m.data ? v : m), null);
    const naData = doInv.find((v) => v.data === hoje) ?? null;
    const liq = movimentos.filter((m) => m.investimento_id === x.inv.id && m.data > (ant?.data ?? '0000-00-00') && m.data <= hoje)
      .reduce((s, m) => s + (m.tipo === 'resgate' ? -1 : 1) * Number(m.valor_centavos), 0);
    const fora = ant ? rendimentoForaDoNormal({ tipo: x.inv.tipo, antes: Number(ant.valor_centavos), novo: valor, liquido: liq, dias: Math.max(1, diasEntre(ant.data, hoje)) }) : null;
    let extra = null;
    if (fora) {
      const aplic = fora.tipo === 'aporte';
      const ok = await confirmar({
        titulo: aplic ? 'Foi um aporte?' : 'Foi um resgate?',
        texto: `De ${formatBRL(ant.valor_centavos)} (${formatDate(ant.data)}) para ${formatBRL(valor)} é ${aplic ? 'mais' : 'menos'} do que ${nomeTipoInvestimento(x.inv.tipo)} costuma ${aplic ? 'render' : 'oscilar'}.\n\nLançar ${aplic ? 'um aporte' : 'um resgate'} de ${formatBRL(fora.valor)} hoje, junto com o valor? (O valor dele se corrige depois, na linha do aporte.)`,
        confirmar: `Sim, ${aplic ? 'aporte' : 'resgate'} de ${formatBRL(fora.valor)}`, cancelar: 'Não, é só o valor',
      });
      if (ok) extra = fora;
    }
    return rodar(`o valor de ${x.inv.nome}`, async () => {
      const desfazeres = [];
      if (extra) {
        const mov = await lancarMovimento({ conta_id: x.inv.conta_id, investimento_id: x.inv.id, data: hoje, tipo: extra.tipo, valor_centavos: extra.valor, descricao: 'lançado ao atualizar o valor' });
        desfazeres.push(() => excluirMovimento(mov.id));
      }
      await registrarValores(hoje, [{ investimento_id: x.inv.id, valor_centavos: valor }]);
      desfazeres.push(() => (naData ? registrarValores(hoje, [{ investimento_id: x.inv.id, valor_centavos: Number(naData.valor_centavos) }]) : excluirValorNaData(x.inv.id, hoje)));
      return async () => { for (const u of desfazeres.reverse()) await u(); };
    });
  }, [confirmar, rodar]);

  // ------------------------------------------------------------ os aportes
  const mudarAporte = useCallback((l, campo, valor) => {
    const fotos = dRef.current.valores.filter((v) => v.investimento_id === l.x.inv.id);
    const plano = planoDoAporte({ lo: l.lo, inv: l.x.inv, campo, valor, fotos });
    const igual = Object.entries(plano.mudancas).every(([k, v]) => plano.antes[k] === v);
    if (igual) return Promise.resolve({ ok: true });
    return rodar(`o aporte de ${formatDate(l.lo.fonte.data)}`, async () => {
      if (plano.alvo === 'mov') {
        await atualizarMovimento(plano.id, plano.mudancas);
        if (plano.gemea) await atualizarValor(plano.gemea.id, plano.gemea.mudancas);
        return async () => {
          await atualizarMovimento(plano.id, plano.antes);
          if (plano.gemea) await atualizarValor(plano.gemea.id, plano.gemea.antes);
        };
      }
      if (plano.alvo === 'dep') {
        await atualizarDeposito(plano.id, plano.mudancas);
        return () => atualizarDeposito(plano.id, plano.antes);
      }
      await atualizarInvestimento(plano.id, plano.mudancas);
      return () => atualizarInvestimento(plano.id, plano.antes);
    });
  }, [rodar]);

  // O APORTE NOVO (a linha "+ aporte"). Com valores registrados depois da data, pergunta se eles já o incluem (a foto do
  // banco de depois inclui; a que nasceu junto com outro aporte, não) — "Somar" os cresce pela taxa até cada um.
  const novoAporte = useCallback(async (x, data, valor, vencimento = null) => {
    const { valores, depositos, taxas } = dRef.current;
    const plano = planoDoNovoAporte({ inv: x.inv, data, valores, depositos });
    if (plano.erro) { toast.error(plano.erro); return { ok: false }; }
    let somar = false;
    if (plano.depois.length) {
      if (andaSozinho(x.inv) && !taxas) { toast.error('Esperando o CDI do Banco Central para somar o rendimento: tente de novo em instantes.'); return { ok: false }; }
      const n = plano.depois.length;
      somar = await confirmar({
        titulo: n === 1 ? 'O valor de depois já tem este aporte?' : 'Os valores de depois já têm este aporte?',
        texto: `${n === 1 ? `O valor de ${formatDate(plano.depois[0].data)} (${formatBRL(plano.depois[0].valor_centavos)}) é` : `Os ${n} valores registrados depois de ${formatDate(data)} são`} de depois deste aporte.\n\n"Somar" ${n === 1 ? 'o faz incluir' : 'os faz incluir'} os ${formatBRL(valor)}${andaSozinho(x.inv) ? `, com o rendimento ${rotuloPeloIndice(x.inv)} até lá` : ''}. Se ${n === 1 ? 'ele veio' : 'eles vieram'} do banco depois do aporte, ${n === 1 ? 'já o tem' : 'já o têm'}.`,
        confirmar: 'Somar aos valores', cancelar: n === 1 ? 'Já tem' : 'Já têm',
      });
    }
    return rodar(`o aporte de ${formatBRL(valor)} em ${x.inv.nome}`, async () => {
      const desfazeres = [];
      const mov = await lancarMovimento({ conta_id: x.inv.conta_id, investimento_id: x.inv.id, data, tipo: 'aporte', valor_centavos: valor, vencimento });
      desfazeres.push(() => excluirMovimento(mov.id));
      // sem valor ainda: o aporte é também o valor dele nesse dia (o que o "Cadastrar e aplicar" faz)
      if (plano.foto) {
        await registrarValores(data, [{ investimento_id: x.inv.id, valor_centavos: valor }]);
        desfazeres.push(() => excluirValorNaData(x.inv.id, data));
      }
      if (somar) {
        const antigos = plano.depois.map((f) => ({ id: f.id, data: f.data, valor_centavos: Number(f.valor_centavos) }));
        for (const f of valoresComOMovimento({ mov: { data, tipo: 'aporte', valor_centavos: valor }, fotos: plano.depois, inv: x.inv, taxas })) {
          await atualizarValor(f.id, { data: f.data, valor_centavos: f.valor_centavos });
        }
        desfazeres.push(async () => { for (const f of antigos) await atualizarValor(f.id, { data: f.data, valor_centavos: f.valor_centavos }); });
      }
      return async () => { for (const u of desfazeres.reverse()) await u(); };
    });
  }, [confirmar, rodar, toast]);

  // EXCLUIR UM APORTE (o 🗑 da linha, ou Delete): o do app (e, se era o único valor, a foto que nasceu junto com ele) ou o
  // de antes do app. O que o cadastro tem sem data não se exclui (é o "valor aplicado" do cadastro).
  const excluirAporte = useCallback(async (l) => {
    const f = l.lo.fonte;
    if (!f || f.tipo === 'inicial') return { ok: false };
    const ok = await confirmar({
      titulo: 'Excluir o aporte?', perigo: true, confirmar: 'Excluir',
      texto: `O aporte de ${formatBRL(f.valor)} em ${formatDate(f.data)} sai de ${l.x.inv.nome}.\n\nCtrl+Z desfaz.`,
    });
    if (!ok) return { ok: false };
    const { movimentos, valores } = dRef.current;
    return rodar(`a exclusão do aporte de ${formatDate(f.data)}`, async () => {
      if (f.tipo === 'dep') {
        await excluirDeposito(f.id);
        return () => inserirDeposito({ investimento_id: l.x.inv.id, data: f.data, valor_centavos: f.valor, referencia: f.referencia, vencimento: f.vencimento });
      }
      const mov = movimentos.find((m) => m.id === f.id);
      const fotos = valores.filter((v) => v.investimento_id === l.x.inv.id);
      const gemea = fotos.length === 1 && fotos[0].data === f.data && Number(fotos[0].valor_centavos) === f.valor ? fotos[0] : null;
      await excluirMovimento(f.id);
      if (gemea) await excluirValor(gemea.id);
      return async () => {
        await salvarMovimentos([{ conta_id: mov.conta_id, investimento_id: mov.investimento_id, data: mov.data, tipo: mov.tipo, valor_centavos: Number(mov.valor_centavos), descricao: mov.descricao ?? '', ...(mov.vencimento ? { vencimento: mov.vencimento } : {}) }]);
        if (gemea) await registrarValores(gemea.data, [{ investimento_id: l.x.inv.id, valor_centavos: Number(gemea.valor_centavos) }]);
      };
    });
  }, [confirmar, rodar]);

  return useMemo(() => ({
    gravando: gravando > 0, podeDesfazer: qtdDesfazer > 0, desfazer,
    renomearInstituicao, novaInstituicao, mudarInvestimento, novoInvestimento, valeHoje, mudarAporte, novoAporte, excluirAporte,
  }), [gravando, qtdDesfazer, desfazer, renomearInstituicao, novaInstituicao, mudarInvestimento, novoInvestimento, valeHoje, mudarAporte, novoAporte, excluirAporte]);
}

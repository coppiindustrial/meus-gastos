// As contas da tela REVISAR PENDÊNCIAS (opção A do mockup, 30/10/2026), puras e testadas: os lançamentos importados
// sem categoria, um grupo por estabelecimento; a pessoa escolhe a categoria de cada grupo (e a palavra-chave da
// regra) e grava tudo de uma vez — `planoClassificar` diz exatamente o que vai acontecer.
import { regraPega } from './classificar.js';

export const nomeDe = (p) => (p.estabelecimento || p.descricao || '').trim();
export const fonteDe = (p) => p.cartao?.nome ?? 'Extrato';

// Um grupo por estabelecimento (sem diferenciar maiúscula): { chave, nome, itens (a mais nova primeiro), total }.
export function agrupar(pendencias) {
  const m = new Map();
  pendencias.forEach((p) => {
    const k = nomeDe(p).toLowerCase();
    if (!m.has(k)) m.set(k, { chave: k, nome: nomeDe(p), itens: [], total: 0 });
    const g = m.get(k);
    g.itens.push(p);
    g.total += p.valor_centavos;
  });
  m.forEach((g) => g.itens.sort((a, b) => b.data.localeCompare(a.data)));
  return [...m.values()];
}

export const ORDENS = [
  { value: 'compras', label: 'Mais compras' },
  { value: 'total', label: 'Maior total' },
  { value: 'data', label: 'Mais recente' },
  { value: 'nome', label: 'Nome' },
];
const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
export function ordenarGrupos(grupos, ordem = 'compras') {
  const f = {
    compras: (a, b) => b.itens.length - a.itens.length || porNome(a, b),
    total: (a, b) => b.total - a.total || porNome(a, b),
    data: (a, b) => b.itens[0].data.localeCompare(a.itens[0].data) || porNome(a, b),
    nome: porNome,
  }[ordem] ?? porNome;
  return [...grupos].sort(f);
}

// Quantas pendências a palavra-chave pega (pode ser mais que o grupo: "UBER" pega todos os Uber).
export const quantasPega = (palavra, pendencias) => (palavra.trim() ? pendencias.filter((p) => regraPega(palavra.trim(), nomeDe(p))).length : 0);

// O problema de uma escolha, ou null: a palavra precisa aparecer no nome do próprio estabelecimento.
export function problemaDaEscolha(grupo, escolha) {
  const palavra = (escolha?.palavra ?? '').trim();
  if (palavra && !regraPega(palavra, grupo.nome)) return 'a palavra-chave não aparece no nome';
  return null;
}

// O PLANO DE GRAVAR. `escolhas`: { chave: { categoriaId, palavra } } (só as com categoria contam). Cada grupo
// escolhido classifica as compras dele; com palavra-chave, cria a regra e ela pega também as pendências de
// estabelecimentos NÃO escolhidos (as de um escolhido ficam com a categoria que a pessoa deu a ele). Uma pendência
// é classificada uma vez só (a primeira regra que a pega, na ordem da tela).
// Devolve { passos: [{ chave, nome, categoriaId, regra (palavra ou null), ids }], lancamentos, regras, deOutros }.
export function planoClassificar(grupos, escolhas, pendencias) {
  const escolhidos = grupos.filter((g) => escolhas[g.chave]?.categoriaId);
  const doGrupo = new Map();
  escolhidos.forEach((g) => g.itens.forEach((p) => doGrupo.set(p.id, g.chave)));
  const usados = new Set(doGrupo.keys());
  let deOutros = 0;
  const passos = escolhidos.map((g) => {
    const { categoriaId, palavra = '' } = escolhas[g.chave];
    const regra = palavra.trim() || null;
    const ids = g.itens.map((p) => p.id);
    if (regra) {
      pendencias.forEach((p) => {
        if (usados.has(p.id) || !regraPega(regra, nomeDe(p))) return;
        usados.add(p.id);
        ids.push(p.id);
        deOutros += 1;
      });
    }
    return { chave: g.chave, nome: g.nome, categoriaId, regra, ids };
  });
  return {
    passos,
    lancamentos: passos.reduce((s, p) => s + p.ids.length, 0),
    regras: passos.filter((p) => p.regra).length,
    deOutros,
  };
}

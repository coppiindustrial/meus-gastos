// As contas da tela REGRAS DE CLASSIFICAÇÃO (30/10/2026, opção A do mockup "Regras · overhaul"), puras e testadas.
//
// O USO DE CADA REGRA sai dos lançamentos já gravados (o nome do estabelecimento), com a MESMA lógica da importação:
// a primeira regra, na ordem, que pega o nome decide. Daí os avisos:
//   · "escondida por #N": a regra pegaria nomes, mas uma ANTES dela sempre os pega primeiro (nunca chega a valer);
//   · "sem uso": não pega nenhum nome do histórico.
// O rascunho da tabela (como o cadastro das categorias): linhas { id, pos, novo, excluir, orig, palavra_chave,
// categoria_id, ignorar }, na ordem da tela; "Salvar alterações" grava só a diferença.
import { padraoDe } from './classificar.js';

// `regras`: na ordem (só as com palavra). `nomes`: [{ nome, n, ultima }] (um por nome distinto, com quantos
// lançamentos e a data do último). Devolve Map id → { pegou, ultima, pegaria, aviso: null | { tipo: 'escondida',
// por: id } | { tipo: 'sem-uso' } }.
export function usoDasRegras(regras, nomes) {
  const comp = regras.map((r) => ({ id: r.id, re: padraoDe(r.palavra_chave) }));
  const uso = new Map(regras.map((r) => [r.id, { pegou: 0, ultima: null, pegaria: 0, por: new Map() }]));
  nomes.forEach(({ nome, n = 1, ultima = null }) => {
    let vencedora = null;
    comp.forEach((c) => {
      if (!c.re.test(nome)) return;
      const u = uso.get(c.id);
      if (!vencedora) {
        vencedora = c.id;
        u.pegou += n;
        if (ultima && (!u.ultima || ultima > u.ultima)) u.ultima = ultima;
      } else {
        u.pegaria += n;
        u.por.set(vencedora, (u.por.get(vencedora) ?? 0) + n);
      }
    });
  });
  const out = new Map();
  uso.forEach((u, id) => {
    let aviso = null;
    if (!u.pegou && u.pegaria) aviso = { tipo: 'escondida', por: [...u.por.entries()].sort((a, b) => b[1] - a[1])[0][0] };
    else if (!u.pegou) aviso = { tipo: 'sem-uso' };
    out.set(id, { pegou: u.pegou, ultima: u.ultima, pegaria: u.pegaria, aviso });
  });
  return out;
}

// Os nomes distintos dos lançamentos (sem diferenciar maiúscula): [{ nome, n, ultima }].
export function nomesDistintos(lancamentos) {
  const m = new Map();
  lancamentos.forEach((l) => {
    const nome = (l.estabelecimento || l.descricao || '').trim();
    if (!nome) return;
    const k = nome.toLowerCase();
    const x = m.get(k);
    if (x) { x.n += 1; if (l.data > x.ultima) x.ultima = l.data; } else m.set(k, { nome, n: 1, ultima: l.data });
  });
  return [...m.values()];
}

// O TESTE: as regras (do rascunho, na ordem) que pegam este nome — a primeira decide.
export function quemPega(linhas, nome) {
  const t = nome.trim();
  if (!t) return [];
  return linhas.filter((l) => !l.excluir && l.palavra_chave.trim() && padraoDe(l.palavra_chave.trim()).test(t));
}

// A ORDEM: a prioridade só conta como alteração quando a pessoa mexeu na ordem (a do banco tem buracos e repetidos;
// comparar com a posição daria centenas de "alterações" ao só abrir — o mesmo cuidado do cadastro das categorias).
// Mexeu → cada linha que fica ganha prioridade = posição (1, 2, 3…) onde for diferente. Não mexeu → só as novas
// (que entram no fim da lista) ganham prioridade, depois da maior que já existe.
const sequencia = (ls) => ls.map((l) => l.id).join();
export function prioridades(linhas) {
  const ficam = linhas.filter((l) => !l.excluir);
  const antes = linhas.filter((l) => !l.novo && !l.excluir).sort((a, b) => a.pos - b.pos);
  const novas = ficam.filter((l) => l.novo);
  const mexeu = sequencia(ficam) !== sequencia([...antes, ...novas]);
  if (mexeu) return new Map(ficam.map((l, i) => [l.id, i + 1]));
  const maior = linhas.reduce((m, l) => Math.max(m, l.orig?.prioridade ?? 0), 0);
  return new Map([...antes.map((l) => [l.id, undefined]), ...novas.map((l, i) => [l.id, maior + i + 1])]);
}

// Só o que mudou numa regra (a nova devolve tudo). `prioridade` undefined = a ordem não mudou.
export function diferencaRegra(l, prioridade) {
  const campos = { palavra_chave: l.palavra_chave.trim(), categoria_id: l.ignorar ? null : (l.categoria_id || null), ignorar: !!l.ignorar, prioridade };
  if (l.novo) return campos;
  return Object.fromEntries(Object.entries(campos).filter(([k, v]) => v !== undefined && v !== (l.orig[k] ?? null)));
}

// O que vai ser gravado.
export function alteracoesRegras(linhas) {
  const p = prioridades(linhas);
  const conta = (l) => !(l.novo && (l.excluir || !l.palavra_chave.trim()));
  const ls = linhas.filter(conta);
  return {
    novas: ls.filter((l) => l.novo && !l.excluir),
    mudadas: ls.filter((l) => !l.novo && !l.excluir && Object.keys(diferencaRegra(l, p.get(l.id))).length),
    excluir: ls.filter((l) => !l.novo && l.excluir),
    prioridades: p,
  };
}
export const totalAlteracoesRegras = (a) => a.novas.length + a.mudadas.length + a.excluir.length;

// O primeiro problema que impede salvar ({ id, campo, motivo }) ou null.
export function validarRegras(linhas) {
  const ficam = linhas.filter((l) => !l.excluir && !(l.novo && !l.palavra_chave.trim()));
  const vistas = new Map();
  for (const l of ficam) {
    const p = l.palavra_chave.trim();
    if (!p) return { id: l.id, campo: 'palavra', motivo: 'uma regra está sem palavra-chave' };
    if (!l.ignorar && !l.categoria_id) return { id: l.id, campo: 'categoria', motivo: `a regra "${p}" está sem categoria` };
    const k = p.toLowerCase();
    if (vistas.has(k)) return { id: l.id, campo: 'palavra', motivo: `a palavra "${p}" aparece duas vezes` };
    vistas.set(k, l.id);
  }
  return null;
}

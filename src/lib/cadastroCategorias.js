// As contas do CADASTRO DAS CATEGORIAS em pop-up (`components/ModalCadastroCategorias.jsx`), puras e testadas.
//
// O pop-up guarda dois rascunhos: `grupos` (na ordem da tela) e `cats` (na ordem da tela; a de cada grupo é a
// ordem em que aparecem). Cada linha tem `orig` (como está no banco; null se é nova), `novo`, `excluir` e, nas
// categorias, `juntarEm` (o id da categoria que fica, quando esta vai ser juntada nela).

// Depois de um arrasto, a lista de linhas da tabela (`g:<id>` e `c:<id>`, os grupos como cabeçalho) vira de novo
// o rascunho das categorias: cada uma fica no grupo do cabeçalho mais próximo ACIMA dela (antes do primeiro,
// no primeiro grupo) e na ordem em que aparece.
export function reorganizar(ids, cats) {
  const porId = new Map(cats.map((c) => [c.id, c]));
  const primeiro = ids.find((x) => x.startsWith('g:'))?.slice(2) ?? null;
  let grupo = primeiro;
  const saida = [];
  ids.forEach((x) => {
    if (x.startsWith('g:')) { grupo = x.slice(2); return; }
    const c = porId.get(x.slice(2));
    if (c) saida.push(c.grupo_id === grupo ? c : { ...c, grupo_id: grupo });
  });
  // as que não estavam nas linhas (escondidas por um filtro) ficam como estavam, no fim
  cats.forEach((c) => { if (!ids.includes(`c:${c.id}`)) saida.push(c); });
  return saida;
}

// As categorias de um grupo que FICAM (sem as marcadas para excluir ou juntar), na ordem da tela.
export const ficamNoGrupo = (cats, grupoId) => cats.filter((c) => c.grupo_id === grupoId && !c.excluir && !c.juntarEm);

// A `ordem` de cada linha: a posição do grupo entre os que ficam; a da categoria, dentro do grupo dela. SÓ NAS
// LISTAS QUE A PESSOA MEXEU (a dos grupos, ou as categorias de um grupo): no banco a `ordem` não é 0, 1, 2… (muitas
// ficaram 0 e se ordenam pelo nome), e comparar com a posição na tela dava dezenas de "alterações" ao só abrir. Nas
// outras listas o mapa não tem a linha (`undefined`), e a diferença não leva `ordem`. `pos` = a posição ao abrir.
const sequencia = (linhas) => linhas.map((x) => x.id).join();
const aoAbrir = (linhas) => linhas.filter((x) => !x.novo).sort((a, b) => (a.pos ?? a.orig.ordem) - (b.pos ?? b.orig.ordem));
export function ordens(grupos, cats) {
  const ficam = grupos.filter((x) => !x.excluir);
  const g = new Map(sequencia(ficam) !== sequencia(aoAbrir(grupos)) ? ficam.map((x, i) => [x.id, i]) : []);
  const c = new Map();
  ficam.forEach(({ id: gid }) => {
    const doGrupo = ficamNoGrupo(cats, gid);
    if (sequencia(doGrupo) !== sequencia(aoAbrir(cats.filter((x) => x.orig?.grupo_id === gid)))) doGrupo.forEach((x, i) => c.set(x.id, i));
  });
  return { grupo: g, categoria: c };
}

const so = (campos, antes) => Object.fromEntries(Object.entries(campos).filter(([k, v]) => v !== undefined && antes[k] !== v));

// Só o que mudou num grupo (as linhas novas devolvem todos os campos).
export function diferencaGrupo(g, ordem) {
  const campos = { nome: g.nome.trim(), tipo: g.tipo, cor: g.cor, ordem };
  return g.novo ? campos : so(campos, g.orig);
}

// Só o que mudou numa categoria. `grupoReal`: o id do grupo no banco (o de um grupo novo só existe ao salvar).
export function diferencaCategoria(c, ordem, grupoReal = c.grupo_id) {
  const campos = { nome: c.nome.trim(), grupo_id: grupoReal, ativa: c.ativa, ordem };
  return c.novo ? campos : so(campos, c.orig);
}

// O que vai ser gravado: as linhas que mudaram, separadas por o que acontece com elas. Linha nova sem nome não conta
// (é a que a pessoa acrescentou e deixou em branco), nem a nova marcada para sair.
export function alteracoes(grupos, cats) {
  const o = ordens(grupos, cats);
  const conta = (x) => !(x.novo && (x.excluir || x.juntarEm || !x.nome.trim()));
  const gs = grupos.filter(conta);
  const cs = cats.filter(conta);
  return {
    gruposNovos: gs.filter((g) => g.novo && !g.excluir),
    gruposMudados: gs.filter((g) => !g.novo && !g.excluir && Object.keys(diferencaGrupo(g, o.grupo.get(g.id))).length),
    gruposExcluir: gs.filter((g) => !g.novo && g.excluir),
    catsNovas: cs.filter((c) => c.novo && !c.excluir && !c.juntarEm),
    catsMudadas: cs.filter((c) => !c.novo && !c.excluir && !c.juntarEm && Object.keys(diferencaCategoria(c, o.categoria.get(c.id))).length),
    catsJuntar: cs.filter((c) => !c.novo && c.juntarEm),
    catsExcluir: cs.filter((c) => !c.novo && c.excluir && !c.juntarEm),
    ordens: o,
  };
}

export const totalAlteracoes = (a) => a.gruposNovos.length + a.gruposMudados.length + a.gruposExcluir.length
  + a.catsNovas.length + a.catsMudadas.length + a.catsJuntar.length + a.catsExcluir.length;

// O primeiro problema que impede salvar ({ id, campo, motivo }) ou null: nome vazio ou repetido (o banco tem nome
// único por pessoa, nos grupos e nas categorias), grupo que sai com categoria dentro.
export function validar(grupos, cats) {
  const chave = (s) => s.trim().toLocaleLowerCase('pt-BR');
  const gFicam = grupos.filter((g) => !g.excluir && !(g.novo && !g.nome.trim() && !ficamNoGrupo(cats, g.id).length));
  const cFicam = cats.filter((c) => !c.excluir && !c.juntarEm && !(c.novo && !c.nome.trim()));
  for (const g of gFicam) {
    if (!g.nome.trim()) return { id: g.id, campo: 'nome', motivo: 'um grupo está sem nome' };
    if (gFicam.some((x) => x !== g && chave(x.nome) === chave(g.nome))) return { id: g.id, campo: 'nome', motivo: `o grupo "${g.nome.trim()}" aparece duas vezes` };
  }
  for (const c of cFicam) {
    if (!c.nome.trim()) return { id: c.id, campo: 'nome', motivo: 'uma categoria está sem nome' };
    if (cFicam.some((x) => x !== c && chave(x.nome) === chave(c.nome))) return { id: c.id, campo: 'nome', motivo: `a categoria "${c.nome.trim()}" aparece duas vezes` };
  }
  const sai = grupos.find((g) => g.excluir && ficamNoGrupo(cats, g.id).length);
  if (sai) return { id: sai.id, campo: 'excluir', motivo: `o grupo "${sai.nome}" ainda tem categorias` };
  return null;
}

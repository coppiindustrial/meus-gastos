# Meus Gastos

Sistema web pessoal de finanças (gastos, entradas, faturas de cartão e patrimônio) que substitui a planilha
`OneDrive\CONTAS\Gastos\Gastos total.xlsx`. Usuário único. **Tudo é preenchido no computador; o celular só
visualiza** (atalho na tela inicial). Código, comentários e UI **em português**.

- **Plano, modelo de dados e fases:** `PLANO.md` (fonte da verdade do escopo; atualizar o status ao concluir uma fase).
- **Visual e peças vêm do Gestor Coppi** (`Downloads\Projeto Gestor Integrado Coppi Industrial\Gestor-integrado-coppi\frontend`).
  Antes de criar componente, veja se o Gestor já tem (tabelas TanStack, filtros, gráficos, KPIs) e copie adaptando.
  As regras de UI de lá valem aqui: `docs/claude/frontend-ui.md` e `tema-escuro.md` daquele repositório.

## Stack

React 18 + Vite 5 + Tailwind 3 (JS, sem TypeScript) · `react-router-dom` 6 (`BrowserRouter` com `basename`) ·
`@supabase/supabase-js` (Auth + Postgres com RLS) · testes com `node:test` · deploy no GitHub Pages.
**Só online**: não há cópia local dos dados.

## Como rodar

```
npm install
npm run dev        # http://localhost:5182 (preview do Claude: .claude/launch.json "meus-gastos")
npm test           # node --test test/*.test.js
npm run build      # vite build + dist/404.html (o Pages devolve o app em qualquer rota)
npm run tema       # depois de escrever bg-[#hex] novo: vira token bg-hx-xxxxxx com versão escura (reinicie o Vite)
```

Supabase: projeto `abofajutoxukbvrfisem`. URL e chave **publishable** em `.env.local` (dev, fora do git) e em
`.github/workflows/deploy.yml` (produção). Push na `main` publica em https://coppiindustrial.github.io/meus-gastos/.

## Banco (Supabase)

- **Migrations em `supabase/migrations/NNN_nome.sql`, append-only**: nunca edite uma já aplicada. Aplicar = colar no
  SQL Editor do Supabase (o usuário faz; avise quando houver migration nova).
- Toda tabela: `id uuid`, `user_id default auth.uid()`, política RLS `(select auth.uid()) = user_id`, `grant` para
  `authenticated`, `revoke` de `anon`, gatilho de `atualizado_em`. Tabela nova entra no laço do fim da migration.
- **VIEW nova sempre com `with (security_invoker = on)`**, senão ela ignora o RLS.
- **Regra de ouro (do Gestor): a lógica de negócio mora nas VIEWs SQL** (totais por competência, parcelas); o front lê.
- Acesso a dados: `src/api/supabase.js` (`supabase`, `exigir`, `mensagemErro`) + um arquivo por tabela em `src/api/`.
- **O PostgREST devolve no máximo 1000 linhas por consulta**: para ler tudo, pagine (`buscarTudo` em `api/importacao.js`).
- `importado_de` (migration 002) marca o que veio de fora (`'planilha'` = histórico da fase 2). "Desfazer importação"
  apaga só o que tem a marca.

## Filtros, grade de lançamentos e categorias (mockups escolhidos em 27/10/2026)

- **Filtros = a faixa do Gestor** (`components/filtros/`): `FaixaProvider` + `Trilho` + `DivisorFaixa`, segmentos
  `SegUnico` (com `padrao`), `SegMulti` (agrupado, com busca), `SegMes` (o mês dentro do trilho, ‹ ›) e `BuscaFaixa`
  (31px, a altura do trilho). Filtro quieto = só texto; ativo = chip com ✕ que limpa só ele. Tela nova com filtro usa isso.
- **Lançamentos = planilha no jeito da grade do DRE do Gestor** (`components/planilha/GradeLancamentos.jsx`; contas
  puras e testadas em `lib/planilha.js`): célula ativa + faixa (Shift, arrastar, nº da linha, cabeçalho), digitar edita,
  Enter grava e desce, Ctrl+C/V de e para o Excel (colar abaixo do fim cria linhas), Ctrl+D e a alça preenchem,
  Ctrl+Z/Y desfazem (antes/depois de cada ação; excluir e desfazer devolve o MESMO id), botão direito = `MenuContexto`.
  Linha nova é RASCUNHO só na tela até ter data e valor; aí vira avulso (ou entrada, com "+" no valor) no mês da tela.
  Grava campo a campo (`atualizarCampos`), otimista, numa fila. Cartão/parcela/mês: "Abrir no formulário" (Shift+F2).
  ARRASTAR ROLA (02/11/2026): selecionando ou puxando a alça com o botão apertado, o cursor perto da borda VISÍVEL da
  caixa (ou fora dela) rola a grade — mais rápido quanto mais longe, e parado na borda segue rolando — e a faixa segue
  a célula sob o cursor (`elementFromPoint` preso à área útil; a caixa pode passar do fim da janela).
  No celular continua a lista (só leitura + formulário).
  AMPLIAR A TABELA (03/11/2026, opção A do mockup): o ⤢ no grupo do cabeçalho esconde os cartões do resumo e a grade
  ganha a altura até o fim da janela (`ateOFim`, medida de onde a caixa começa; refeita no resize); ⤡ volta.
  Lembrado em `lancamentos_ampliada`.
  PROCURAR EM TODOS OS MESES (04/11/2026, opções C + B + D do mockup): (C) a pílula do mês é o `SegPeriodo`
  (`filtros/Segmentos.jsx`): os meses e, depois de uma linha, últimos 3 / 12 meses (que TERMINAM no mês da tela),
  os anos com dado e "Todo o histórico" (`lib/periodo.js`, testada; não é lembrado — a tela abre no mês). Num
  período a grade lê `listarPeriodo` (paginado), agrupa por mês na ordem padrão (`ordenarLinhas` com `porMes`; a
  faixa presa com o mês, quantos, quanto e "Abrir o mês" — `grupos` de `gruposPorMes`, que não é linha da planilha:
  os `r` são os de `linhas`), os cartões de cima somam o período (`total` do `CartoesResumo`) e a linha nova entra
  em `mesDaLinhaNova`. Com uma coluna ordenada, a ordem vale para o período inteiro, sem grupos. (B) Com algo na
  busca, "Mais N em outros meses" (`outrosMeses` em `lib/buscaLancamentos.js`, a MESMA régua da busca da faixa,
  `casaTermo`, com os outros filtros): o chip leva ao mês com a linha acesa (`irPara` da grade). (D) A BUSCA RÁPIDA
  (Ctrl+K ou a lupa da barra, `components/busca/PaletaBusca.jsx` + `lib/useAtalhosGlobais.js`, COPIADOS do Gestor):
  lançamentos do histórico inteiro (descrição, loja, categoria, cartão, VALOR — "644,37"; régua `casaPalavras`),
  categorias e telas; abrir leva a `/lancamentos?mes=&id=` (a linha acesa; os filtros limpam), "Ver os N" a
  `?periodo=tudo&busca=`, a categoria a `?periodo=tudo&cat=` — a tela lê e tira do endereço. As duas buscas leem o
  ÍNDICE de `lib/useIndiceBusca.js` (todos os lançamentos, lidos uma vez por sessão e relidos depois de gravar,
  pelo `EVENTO_DADOS`). Os "Abertos recentemente" guardam no navegador só id e mês (nunca descrição nem valor).
  NA LINHA NOVA A CATEGORIA DECIDE O TIPO (30/10/2026): a lista mostra as de gasto e as de entrada, e escolher uma
  de renda faz dela uma entrada (o "+" do valor manda mais). ENTRADA: escolher a categoria preenche a descrição VAZIA
  com o nome dela (`descricaoDaEntrada`, também no formulário; o que foi escrito não muda). CONTA NO VALOR, como no
  Excel: "=846,43+192,39", "100+50", "+=1000+500" (entrada) — `calcularValor` em `lib/dinheiro.js` (sem `eval`,
  arredonda no fim; vale também no formulário). Grava-se o resultado, não a fórmula.
  ORDENAR (29/10/2026): o título da coluna SELECIONA (planilha); a SETA ao lado ORDENA (aparece no hover, fica à vista
  na ordenada; 3ª vez volta ao padrão, data mais nova em cima) — `ordenarLinhas`/`proximaOrdem` em `lib/planilha.js`,
  a escolha lembrada no navegador. A ordem vale ao carregar e ao clicar, e não se refaz sozinha (editar não pula a
  linha). ESC TIRA A SELEÇÃO, como no DRE (nada aceso, sem a soma); seta/Tab/Enter ou clique a trazem de volta.
  CTRL+CLIQUE SOMA FAIXAS (03/11/2026, como no Excel; também no nº da linha e no cabeçalho): as de antes ficam em
  `outras`; a barra soma todas sem repetir célula, Delete limpa todas, excluir / revisado / categoria valem para as
  linhas de todas, Ctrl+D preenche cada uma, Ctrl+C só com as mesmas colunas (`naSelecao`, `linhasDasFaixas`,
  `textoDasFaixas` em `lib/planilha.js`, testadas); sem alça. Seleção sem o Ctrl volta a ser uma só.
- **Categorias = planilha agrupada** (opção A): grupos recolhíveis, e por categoria o uso tirado da `resumo_mensal`
  (`lib/usoCategorias.js`: 12 meses, total no mês, média pelos meses com dado, último uso). O PERÍODO (06/11/2026, a
  pedido): o `SegPeriodoFiltro` da Visão geral, que ABRE NO ANO TODO (antes era o mês de hoje); com a lista das
  competências, `usoPorCategoria` dá o total, os lançamentos e a média do período ("Total · 2026").
  GERIR (29/10/2026, opção A do mockup "Categorias · gerir mais fácil"): o cabeçalho é o grupo do DRE (✎ Gerir
  categorias · ▾ Novo grupo / Exportar CSV) + "+ Nova categoria". O ✎ abre `components/ModalCadastroCategorias.jsx`,
  o cadastro no jeito do dos fixos: grupos como cabeçalho, categorias embaixo, cada célula um campo (nome, grupo,
  cor/tipo do grupo, ativa); a alça ⠿ arrasta (abaixo de outro cabeçalho = muda de grupo), ▲▼ ordenam os grupos
  (as colunas `ordem` já existiam). "Salvar alterações (N)" grava só a diferença (contas puras e testadas em
  `lib/cadastroCategorias.js`). MARCAR categorias → Mover para, Desativar e JUNTAR EM UMA (`juntarCategoria`:
  lançamentos, fixos e regras passam para a que fica, e ela sai — ao salvar, com confirmação). Categoria com
  lançamentos não se exclui (junta ou desativa); excluir leva as REGRAS dela (FK em cascata) e a confirmação diz.
  O pop-up ocupa a tela (até 1280px, a lista com 90vh menos o resto). A `ordem` do banco NÃO é 0, 1, 2… (muitas
  categorias com 0, ordenadas pelo nome): ela só conta como alteração na lista que a pessoa mexeu (`ordens` compara
  a sequência com a de quando abriu, `pos`) — antes, só abrir dava dezenas de "alterações". Os GRUPOS RECOLHEM
  (a seta no cabeçalho e "Recolher tudo / Expandir tudo", lembrados no navegador; buscando, tudo aberto; mover ou
  criar categoria num recolhido o abre), ANIMADOS com o `useLinhasAnimadas` (o da tela Categorias: as linhas do
  recolhido ficam montadas e escondidas — o arrasto vê todas). SALVAR NÃO FECHA: a tela recarrega e o rascunho
  recomeça do banco novo. O ARRASTO TERMINA MESMO SEM `dragend` (`useListaArrastavel`, 30/10/2026): a linha que
  muda de lugar às vezes perde o evento, e o `dragId` preso deixava a linha esmaecida; o fim vem também da janela.

## Importar (a tela, 28/10/2026)

- UM ITEM SÓ NO MENU, "Importar" (com o número do que falta — `useContadores`; desde 02/11/2026 é FILHO de
  Cadastros, e o grupo Análises/Patrimônio é o último da barra — `lib/navegacao.js`):
  `pages/Importar.jsx`. NADA DE IMPORTAR ABRE OUTRA TELA (29/10/2026): os três importadores são POP-UPS abertos dali —
  `ImportarFatura`, `ImportarExtrato` (era a tela /extrato; com a prévia, cresce para o painel dos ampliados, 1100px/90vh,
  rodapé preso) e `ImportarArquivos`. A TELA FATURAS SAIU: cada fatura está na aba Por mês (a célula que entrou tem
  o ↗ "Ver os lançamentos do mês") e sai pelo "Excluir" da linha dela no Histórico; as da PLANILHA (sem linha própria)
  saem pela lista "As faturas dela" do pop-up da planilha. `/faturas` e `/extrato` levam ao Importar, e "Revisar
  pendências" foi para Movimentação. O ↓ de importar é O MESMO botão cheio em toda célula (à vista no "Falta", no hover
  nas outras).
- ABA "POR MÊS": linha = mês do ano (filtro de ano), coluna = FONTE (cada cartão e o extrato); a célula diz QUANDO
  entrou ou o que falta (`mesesDoAno` em `lib/importacoes.js`, testada). Fonte DEVE o mês quando ele já pode ser
  importado: a fatura DESDE O 1º DIA DO MÊS DELA (04/11/2026, a pedido — virou o mês, as faturas que vencem nele já
  contam no menu, "Falta · vence dd/mm" com `aVencer`; antes era só a partir do vencimento); o extrato quando o mês acabou (o mês corrente é "em andamento" ou
  "até dd/mm", sem contar como pendência). Antes da primeira importação da fonte, "—" — que não cobra, mas tem o ↓ no
  hover (`antes`: excluir o extrato de um mês o deixa antes do primeiro que sobrou, e ele precisa poder voltar).
  O ANO da tela é o de hoje (troca sozinho em 1º de janeiro; a lista tem os anos com dado). EM JANEIRO o que falta
  inclui DEZEMBRO do ano anterior — no número do menu e no ▾ (`faltaAgora`, testada; o mês leva o ano no nome). A célula que falta abre o
  importador da fatura já com cartão e vencimento (`inicial`) ou o do extrato.
- ABA "HISTÓRICO" = tabela `importacoes` (migration 007, que também preenche o passado): toda importação chama
  `registrarImportacao` (fatura, extrato, planilha; sem a tabela, ignora em silêncio). "Excluir" a fatura (apaga a
  fatura) e "Excluir" QUALQUER extrato (30/10/2026; antes só o último), para importar o mês de novo: `desfazer` = ids
  criados + os fixos corrigidos como eram (de `gravarExtrato`); o extrato ANTIGO, sem `desfazer` (o que a 007
  preencheu), apaga o que `idsDoExtratoAntigo` acha — marca `extrato` + o minuto em que foi gravado.
- "IMPORTAR ARQUIVOS" (`components/ImportarArquivos.jsx`): vários CSVs de uma vez, reconhecidos pelo cabeçalho e pelo
  nome; as faturas entram dali (a repetida é pulada, ou substituída se pedir) e o extrato abre a prévia de sempre
  (o pop-up `ImportarExtrato` com o `arquivo`). Importou/desfez → `avisarMudanca()` refaz o número do menu.
- O DESENHO (29/10/2026, opção A do mockup "Importar · tabela, legenda e botão"): a GRADE DO DRE — cada célula em
  UMA linha (ponto de cor + data + número curto), o resto no cartão do hover; linha acende, célula ganha contorno;
  o importar é um ÍCONE ↓ no canto da célula (cheio onde falta, só no hover nas outras); Situação "2 de 3" com
  barrinha. LEGENDA EM CIMA, como a do DRE (marcas clicáveis destacam o tipo, "Legenda" explica). "Só o que falta" é
  o interruptor do DRE dentro do trilho (`components/Toggle.jsx`, cores `.alterna` no index.css). Cabeçalho = o
  grupo de ícones do DRE: ↓ importar arquivos · ▾ o que falta por mês (`MenuContexto` com `{ grupo }`).
- O HISTÓRICO DA PLANILHA NÃO TEM TELA (29/10/2026, opção A do mockup): a linha dela na aba Histórico abre o
  `components/ModalPlanilha.jsx` — o que é, os números, por origem e mês a mês (`lerDaPlanilha` +
  `resumirPlanilha`, testada), "Conferir com o arquivo…" (o `planilha.json`, fatura a fatura) e "Desfazer".
- ÁREA DE ARRASTAR (`components/AreaArrastar.jsx`, a da Importação do Gestor) nos três importadores — nunca um
  botão "Escolher arquivo".

- O "VER" EM TODA IMPORTAÇÃO (06/11/2026, o mockup "Indicadores e importações", opção A): a fatura e o extrato do
  Histórico abrem `components/ModalImportacao.jsx` (o da planilha segue o `ModalPlanilha`): os números (a fatura: compras,
  total, sem categoria, a maior categoria; o extrato: o que entrou, o que ainda está no app, os fixos corrigidos, o sem
  categoria), a lista do que entrou (`lancamentosDaImportacao` em `api/importacoes.js`: os da fatura pelo `fatura_id`; os
  do extrato pelo `desfazer`) e no pé: excluir, revisar pendências e abrir o mês nos Lançamentos. O "Excluir" fica ao lado.

## Revisar pendências (30/10/2026, opção A do mockup "Revisar pendências · a tabela")

- `pages/Pendencias.jsx`: os importados sem categoria, UMA LINHA POR ESTABELECIMENTO, com a categoria escolhida NA
  LINHA (`SeletorCategoria`) e a coluna Regra já com o nome ("pega N"; vazia = só estas compras). Escolher NÃO grava:
  "Classificar N" grava tudo (`planoClassificar` em `lib/pendencias.js`, testada: a regra pega também os
  estabelecimentos não escolhidos, nunca os escolhidos com outra categoria) e "Desfazer" volta a última vez
  (`desclassificar` + apaga as regras criadas). Marcar várias → "Categoria para as N". "Não classificar agora", a
  primeira opção da lista, tira a escolha (o valor '-' só existe na lista). Filtros: busca, cartão
  (ou Extrato), ordem (lembrada). Cabeçalho: ☰ Regras de classificação · ▾ Exportar CSV + "Classificar N".
  A REGRA VAZIA (04/11/2026, opção A do mockup "Pendências · regra vazia"): o ESTORNO (só valores negativos) começa SEM
  regra (`palavraDePartida`, testada — uma regra "Ajuste a crédito" mandaria todo ajuste futuro para a mesma
  categoria), com a marca "estorno" e o "+ criar regra" no campo tracejado; com palavra, o ✕ do campo a tira. O
  rodapé diz QUAIS regras nascem ("1 regra nova (UBER *TRIP)" ou "sem regra nova") antes de gravar.

## Cartões e Regras de classificação (30/10/2026, opção A dos mockups "· overhaul")

- CARTÕES (`pages/Cartoes.jsx`): UM BLOCO POR CARTÃO — última fatura (↗ os lançamentos do mês), próxima (vence em
  N dias; já entrou ou a importar, com o ↓ que abre o `ImportarFatura` com cartão e vencimento), parcelas que vêm (view
  `parcelas_futuras`), média por fatura (12 meses) e as 12 faturas em colunas (a última na cor `--serie-gastos`;
  hover = a coluna cheia, as outras a 40% e o `BalaoGrafico` com total, compras e a diferença para a média; clicar
  abre os lançamentos do mês). O bloco ganha borda e sombra no hover.
  O GRÁFICO DO BLOCO (03/11/2026, opção D do mockup "Cartões · gráfico das faturas"): 12 colunas com o número curto
  em cada uma (`numeroK`: "13,4k") e o mês embaixo; depois de uma linha tracejada, até 6 meses de PARCELAS JÁ
  COMPRADAS que vêm, hachuradas (`.barra-parcelas`; balão "Parcelas de …", sem clique) — `grafico` de
  `resumoDosCartoes` (testada). Coluna estreita (< 27px, medida): só os marcos (última, maior, 1ª parcela) e a inicial
  do mês.
  O HISTÓRICO DO CARTÃO (03/11/2026, mockup "Cartões · o ampliado do cartão"): o ⤢ do bloco (só no computador) abre
  `components/AmpliadoCartao.jsx`, o painel dos ampliados (1280px/90vh, tela cheia, CSV da aba), com a troca de cartão,
  o período (12 / 24 meses / todo o histórico / ANO — a pílula "Ano ▾" abre o `MenuContexto` dos anos com fatura e,
  escolhido, mostra o ano ("2026 ▾"):
  janeiro a dezembro, ou até a fatura mais nova e as parcelas do ano; `periodo` 'ano:AAAA' em `linhaDoTempo`) e quatro abas — LINHA DO TEMPO (todas as faturas do período, o número em
  cada coluna, a média tracejada, o ano embaixo, depois as parcelas hachuradas), ANO × ANO (dois anos lado a lado; a
  variação no mesmo período), POR CATEGORIA (lê os lançamentos do cartão: `listarDoCartao`; categorias e as lojas que
  mais pesaram) e TABELA (fatura a fatura, contra a média, e as parcelas que vêm). Contas em `lib/historicoCartao.js`
  (testada). Clicar num mês abre os Lançamentos dele.
  AJUSTES (03/11/2026, a pedido): LEGENDAS CLICÁVEIS e CARTÕES DE RESUMO com hover que acende o tipo no gráfico (o da
  linha do tempo: faturas, última, parcelas, média, maior; clique fixa) — `useDestaque` + `LegendaClicavel`
  (exportados; a legenda do bloco usa os mesmos). "Onde o cartão vai" tem a MÉDIA POR FATURA (o total ÷ as faturas do
  período) e o clique filtra as lojas. "Onde mais comprou" mostra todas, com busca e ordem, categoria, COMPRAS, ticket
  médio e a última; clicar abre as compras. COMPRA ≠ LINHA DA FATURA (`comprasDaLoja`, testada): as parcelas da mesma
  compra contam uma vez (pela COMPETÊNCIA menos as parcelas pagas — o Nubank anda a data por parcela, a XP repete a da
  compra; o valor com a folga do ARREDONDAMENTO, até 1 centavo por parcela: a 1ª da Brooksfield veio R$ 644,40 e as
  outras R$ 644,37, e a compra virava duas) e o IOF da compra internacional (linha do mesmo dia com 2,5–7% de outra) entra no valor dela. O "N
  lançamentos" das faturas continua contando linhas.
  Contas em `lib/cartoes.js` (testada). Cabeçalho do DRE: ✎ `ModalCadastroCartoes` (tabela de formulário, "Salvar
  alterações (N)"; cartão com lançamentos não se exclui; acrescenta pela última linha, "Adicionar cartão", a do
  cadastro dos fixos — 03/11/2026; o + do círculo tracejado é o `IconMais`, nunca o caractere "+", que não centra)
  · ▾ Exportar CSV / Importar; "+ Novo cartão" = o formulário de um (clicar no nome
  do bloco também o abre).
- REGRAS (`pages/Regras.jsx`): a TABELA DE FORMULÁRIO dos cadastros — a ordem é a alça ⠿ (a primeira que pega
  decide), palavra e categoria (ou "Ignorar") são campos, marcar várias muda a categoria ou exclui, "Salvar
  alterações (N)" grava a diferença. A prioridade só conta como alteração se a ORDEM mudou (aí renumera 1, 2, 3…; a
  nova no fim vai depois da maior) — `prioridades` em `lib/regras.js` (testada). PEGOU e AVISO ("escondida por #N",
  "sem uso") saem dos lançamentos com `estabelecimento`, pela ordem GRAVADA (`usoDasRegras`). ⌕ abre o TESTE de um
  nome (pela ordem da tela); filtros categoria / tipo / uso e "Agrupar" por categoria (sem arrastar). ORDENAR PELO
  CABEÇALHO: clicar no título ordena a vista (palavra, categoria, pegou — este do maior; 3ª vez volta; "#" = a ordem
  das regras), lembrado em `regras_ordem`; ordenada, a alça não arrasta. ▾ "Aplicar nas
  pendências agora" (as de ignorar ficam de fora) e Exportar CSV.
  A DE IGNORAR TIRA O QUE JÁ ENTROU (03/11/2026): a regra só decide as próximas importações, então a gravada como
  "Ignorar" que ainda pega lançamentos (a primeira que pega, pela ordem gravada — `ignoradosNoApp`, testada) ganha o
  aviso "N ainda no app · tirar", e salvar uma regra que virou (ou nasceu) "Ignorar" já pergunta. Os dois abrem o
  `components/ModalTirarIgnorados.jsx`: a lista (data, nome, de onde, valor), todos marcados MENOS o fixo do mês
  (`ehFixo`: o extrato o criou como o fixo; tirado, o mês volta a pedi-lo "a lançar"). "Tirar" = `tirarDoApp`
  (`api/regras.js`): apaga e REFAZ O TOTAL das faturas (`recalcularTotais` em `api/faturas.js` — o `total_centavos`
  guardado ficava com a compra; o "Ignorar sempre" das Pendências também passa por ele). Sem desfazer.

## Extrato da conta corrente

- `lib/lerExtrato.js`: CSV do extrato do Nubank (`Data,Valor,Identificador,Descrição`); a `contraparte` (quem recebeu
  ou enviou) sai da descrição sem CPF/banco. `lib/planoExtrato.js` dá o destino de cada linha (fora, já importada,
  fixo novo, corrige o fixo, avulso) — a prévia mostra exatamente o plano, e `api/extrato.js` grava.
- Decisões do usuário: entradas do extrato ficam de fora (lançadas à mão) — a não ser com "Trazer as entradas" na
  prévia (30/10/2026, lembrado em `extrato_entradas`): o crédito vira entrada (categoria da regra só se for de
  entrada), e o já lançado à mão (mesmo valor, até 3 dias — `entradasManuais`) fica de fora; pagamento de fatura e investimentos
  (RDB, dinheiro guardado) sempre de fora; transferência entre contas próprias por REGRA DE IGNORAR
  (`regras.ignorar`, migration 005 — também vale nas faturas); pagamento cuja categoria é a de uma recorrência
  vigente vira o fixo do mês com o valor real (se o fixo já foi lançado à mão, o valor é corrigido).
- O "SEM REGRA" DA PRÉVIA (02/11/2026): ESCOLHER NA LISTA JÁ VALE nesta importação (a categoria, ou "Ignorar sempre" =
  fica de fora) — antes, sem o clique em "Criar regra", a escolha se perdia e a linha caía em Revisar pendências.
  "Criar regra" a torna permanente; sem ela, vale só desta vez (o Pix de um amigo, uma compra única: o próximo Pix
  volta a perguntar). A primeira opção, "Nenhuma (não criar regra)", tira a escolha. "Ignorar sempre" também serve ao
  pagamento que já se lança à mão (a empregada no gasto fixo). Nas PENDÊNCIAS, "Ignorar sempre (tirar do app)" cria a
  regra de ignorar e APAGA os lançamentos que já entraram (com confirmação; o Desfazer não os devolve).
- **Classificar só pela contraparte**, nunca pela descrição inteira: a regra "4" → Outros da planilha pegava todo
  Pix pelos dígitos do CPF. `id_externo` (identificador do banco, índice único) impede importar duas vezes.

## Patrimônio (fase 6)

- `contas` + `saldos` (foto do saldo numa data, única por conta + data: registrar de novo na mesma data substitui).
- Patrimônio no mês = soma, por conta, da foto mais recente até o fim do mês (vale até a próxima); conta sem foto
  ainda não entra. Conta encerrada: registrar saldo 0 antes de desativar. Lógica em `lib/patrimonio.js` (testada).
- O RENDIMENTO (05/11/2026, fase 8.A do PLANO; o plano e as telas no artefato "Patrimônio e rentabilidade"):
  `movimentos_investimento` (migration 013: conta, data, aporte | resgate, valor, `origem` manual | extrato,
  `id_externo` único) e `contas.recebe_extrato` (UMA conta; marcar uma desmarca as outras — `salvarConta`). Rendeu =
  saldo − saldo anterior − (aportes − resgates) entre as duas fotos; o % = rendeu ÷ (saldo anterior + metade do líquido
  aportado); o do ano ENCADEIA os meses; aportado = a 1ª foto + os aportes − os resgates depois dela; o resto é o
  rendimento acumulado (`rendimentoPorMes`, `rendimentoDoPeriodo`, testadas em `test/rendimento.test.js`). Mês sem foto
  nova não tem rendimento (null). O EXTRATO DO NUBANK: as linhas que já ficavam de fora como 'investimento' (RDB,
  dinheiro guardado) viram APORTE (débito) e RESGATE (crédito) da conta que recebe o extrato (`movimentosDoExtrato`;
  o mesmo identificador não entra duas vezes; re-importar um extrato antigo só acrescenta os que faltam; o "Excluir" do
  histórico os apaga — `desfazer.movimentos`). O CDI do mês: a série 4391 do SGS do Banco Central (`api/cdi.js`, aberta
  ao navegador); só os meses FECHADOS se comparam (o corrente vem parcial). "Registrar o mês": a data (no começo do mês,
  o fim do anterior se não houver foto depois dele), e por conta saldo + aportes + resgates digitados (os do extrato já
  somados e mostrados), com o "Rendeu" ao vivo. Sem a migration, a tela mostra só os saldos e avisa.
- OS INVESTIMENTOS (05/11/2026, fase 8.B; o desenho aprovado "Investimentos no Patrimônio"; migration 014): cada título
  (CDB, LCI, Tesouro…) é cadastrado DENTRO de uma conta (`investimentos`: tipo, indexador + taxa, liquidez — diária,
  no vencimento, D+N, carência até —, vencimento, emissor, data da aplicação, "aplicado até hoje", observação, ativo),
  com o VALOR de cada data em `valores_investimento` (o cadastro pede o "vale hoje" = a primeira foto; "aplicação nova"
  também grava o aporte do mesmo valor) e o aporte / resgate no título (`movimentos_investimento.investimento_id`).
  APORTE MANUAL (o extrato não diz em qual CDB entrou; a leitura do extrato segue só para a conta sem títulos). Tudo é
  SÉRIE (`rendimentoDasSeries` + `seriesDoPatrimonio` em `lib/patrimonio.js`): a conta (`c:<id>`, as fotos de
  `saldos`) vale pelas fotos dela ATÉ a primeira foto de um título dela (`fim`; no mês da troca ainda dá o rendimento
  entre as fotos dela, mas não entra no total) e daí em diante é a SOMA DOS TÍTULOS (`i:<id>`); o movimento de um
  título conta na conta dele. No mês em que a série ABRE, a foto de antes é a primeira (o título cadastrado no dia 5
  rende até o dia 30). O aporte depois da última foto já entra no valor e no aplicado (não no rendimento). O aplicado
  parte do "aplicado até hoje" (senão da primeira foto). A CARTEIRA (`carteira`, `ordenarCarteira`, `linhaMesAMes` em
  `lib/investimentos.js`, testadas em `test/investimentos.test.js`). Resgatar tudo ("Resgatei tudo") grava o valor 0 e
  desativa: sai da lista e do registrar ("Mostrar os N encerrados" os traz).
  A TELA (opção A do mockup "Patrimônio · a tabela", com a B como segunda vista, a pedido): os quatro `CartaoKpi
  compacto` (patrimônio, rendeu no mês, no ano, liquidez diária — ou o aportado no ano, sem títulos), o
  `GraficoPatrimonio` (`components/patrimonio/`, o card do "Entradas × gastos": `GradeEsq` — que ganhou `rotulo` —,
  número em cada coluna, guia e 40% no hover, `LegendaSeries`; "Colunas" aportado + rendimento | "% do mês × CDI") e
  o `BlocoInvestimentos` (`TabelaInvestimentos.jsx`): CARTEIRA = a conta é o grupo que recolhe animado
  (`useLinhasAnimadas`), títulos com liquidez (pílula azul na diária), vencimento (âmbar até 12 meses, a barrinha do
  prazo), aplicado, vale hoje, rendeu, % do ano e a curva de 12 meses (balão no Rendeu e ao longo da curva), + aporte ·
  − resgate · ✎ no hover, a SETA do cabeçalho ordena dentro de cada conta (`patrimonio_ordem`); MÊS A MÊS = a
  Grupo × mês (cruz, R$ | %, o tom mais forte é o melhor mês da linha). Vista e recolhidas lembradas
  (`patrimonio_vista`, `patrimonio_recolhidas`); no canto só o ⇕ (06/11/2026: o ⬇ CSV foi para o ▾ da tela, com o mês a
  mês, e o ⤢ ampliado saiu — não acrescentava nada). Os pop-ups em `ModaisPatrimonio.jsx`:
  conta (com o histórico dela), investimento (o cadastro + histórico + excluir), aporte/resgate (a lista agrupada por
  conta, "Novo investimento" no pé, "fica com R$ X aplicados") e "Registrar o mês" POR TÍTULO (a conta sem títulos é
  uma linha; "+ aporte" na linha, por cima). Sem a 014, `listarInvestimentos` devolve null, a tabela mostra só as
  contas e avisa (a leitura dos movimentos cai para a sem `investimento_id`).
- O PATRIMÔNIO "DO ZERO" (06/11/2026, o mockup aprovado "Patrimônio do zero", e a SEPARAÇÃO pedida — o painel e a
  tabela, como a Visão geral e os Lançamentos; migration 015). TRÊS GESTOS, sempre com o mesmo nome: CADASTRAR,
  APLICAR / RESGATAR e ATUALIZAR VALORES ("aporte" e "registrar o mês" saíram da tela). A conta virou INSTITUIÇÃO (o banco ou
  a corretora; 06/11/2026: "lugar" saiu da tela — no código ainda é `conta`/`lugar`, `ModalLugar`); a conta corrente é o
  tipo `saldo` ("Saldo em conta"). A INSTITUIÇÃO NOVA nasce só no cadastro ("Nova instituição", no fim da tabela).
  · `/patrimonio` (`pages/Patrimonio.jsx`) = o PAINEL, só de ler: os 4 `CartaoKpi` (com o "desde out/26" no começo
    curto), o `GraficoPatrimonio` (do 2º mês em diante), "Onde está o dinheiro" (lugar | tipo | resgate) e "Próximos
    vencimentos" (com data e cada aplicação, reaplica / volta), e a faixa âmbar do que pede o valor do mês.
  · `/investimentos` (`pages/Investimentos.jsx`) = a TABELA (`BlocoInvestimentos`, Carteira | Mês a mês). O topo é o
    grupo do DRE: ✎ o cadastro · ⇅ aplicar ou resgatar · ▾ (o CSV da carteira e o do mês a mês, encerrados, COMEÇAR DO
    ZERO — `apagarPatrimonio`, apaga as instituições e tudo em cascata, com confirmação; só a pessoa clica) + o destaque "Atualizar
    valores", âmbar com o número dos que pedem o valor do fim do mês passado (`pendentesDeValor`; o mesmo número no
    menu, `useContadores` 'investimentos'); vazio, "Montar a carteira". A coluna RESGATE junta liquidez e vencimento
    (no "cada aplicação vence": "próxima 03/2027 · reaplica"). AS AÇÕES DA LINHA (06/11/2026, opção A do mockup "Ficha
    do investimento"): todas no MESMO quadrado (`BotaoLinha`, 30px, borda e o fundo `bg-white`, o mais escuro no tema
    escuro; o nome no tooltip) — no lugar, + investimento novo · ✎ o lugar (também no lugar vazio: o "Adicionar
    investimento" escrito saiu); no investimento, APLICAR e RESGATAR com as MOEDAS + e − (`IconAplicar`/`IconResgatar`
    em icons.jsx; as setas ↑ ↓ eram genéricas e o ↓ é o importar do app) · ✎ a FICHA. A SETA de abrir tem o QUADRADO no
    hover (`QUADRADO_SETA`, a do Gestor), separada do clique no nome. Os dados das duas telas:
    `components/patrimonio/useDadosPatrimonio.js`.
  · O CADASTRO EM TABELA (`ModalCadastroInvestimentos.jsx`, a dos fixos/cartões): agrupado por lugar, "Adicionar
    investimento" em cada um e "Novo lugar" no fim; nome, tipo, rende + taxa, prazo · resgate e "TEM HOJE" (só informa:
    o valor e quantos depósitos); ⋯ = emissor, observação, ativo. O tipo preenche o resto (`padraoDoTipo`); Enter desce na
    coluna; "Salvar alterações (N)" (`diferencaInvestimento`, `validarCadastro`; testadas em
    `test/cadastroInvestimentos.test.js`). SEM OS VALORES (06/11/2026, opção A do mockup "Ficha do investimento"): o
    cadastro diz o que o investimento É; o dinheiro entra como DEPÓSITO. Salvar investimentos novos abre o "COMO O
    DINHEIRO ENTROU?" (`ModalComoEntrou`): "É dinheiro novo" = o Aplicar (no investimento SEM VALOR, a aplicação grava
    também a primeira foto) e "Já estava aplicado" = o Colar os depósitos, que pede o VALOR APLICADO do banco (saiu do
    cadastro) e, sem valor ainda, faz da soma o valor de hoje (`planoDoColar`, testada). O cadastrado sem dinheiro fica
    na carteira com "sem valor" (fora do "Atualizar valores"). `criarInvestimento` sem `valor_centavos` grava só o título.
    O `prazo_meses`/`ao_vencer` não gravavam (faltavam no `CAMPOS` da api) — corrigido em 06/11/2026.
  · O PRAZO DE CADA APLICAÇÃO (liquidez `por_aplicacao` + `prazo_meses` + `ao_vencer` 'reaplica' | 'volta', a 015): o
    CDB em que cada aporte vence N meses depois dele. `aplicacoesComPrazo` (testada): as aplicações são os MESMOS depósitos
    do IR (06/11/2026) — a lista dos depósitos de antes do app (digitados ou colados) ou, sem ela, as aplicações pelo app
    até a primeira foto e o que sobra do cadastro (sem a "data da aplicação", sem vencimento) —, depois os aportes; o
    resgate sai das mais antigas; com 'reaplica' o vencimento que passou anda mais um prazo, sem virar resgate. VENCE UM
    DIA ANTES (`vence_dia_anterior`, a migration 017; o "vence um dia antes" embaixo do prazo no cadastro): o RDB do Nubank
    de 03/06 com 6 meses vence em 02/12 (sem marcar, no mesmo dia do mês); reaplicando, a nova começa no dia seguinte. O
    campo só vai ao banco quando marcado (ou já estava): sem a 017, o resto do cadastro salva igual. Um MESMO investimento
    com PRAZOS DIFERENTES em cada aporte (datas livres) ainda não tem desenho: pensar quando aparecer (06/11/2026).
  · ATUALIZAR VALORES (`ModalAtualizarValores`): o rendimento FORA DO NORMAL para o tipo (`rendimentoForaDoNormal`:
    pós-fixado 2,5%/mês, marcado a mercado 5%, fundo 10%) vira "Foi uma aplicação de R$ X?", que lança o movimento
    junto com o salvar; Enter num campo vazio repete o valor de antes. APLICAR (`ModalMovimento`): o novo investimento
    nasce ali (nome, lugar, tipo; o valor entra como a aplicação), "Resgatar tudo · R$ X" encerra. Os valores aceitam
    conta (`calcularValor`).
  · O IR EM CASCATA E O LÍQUIDO (06/11/2026, o mockup aprovado "Depósitos em cascata e o valor líquido", opção A;
    migration 016 `depositos_investimento`): o IR da renda fixa vai sobre o rendimento de CADA DEPÓSITO pela idade dele
    (22,5% · 20% · 17,5% · 15%, e o IOF nos 30 primeiros dias). `estimarImposto` (`lib/impostoInvestimento.js`, testada):
    os depósitos são a lista COLADA do banco ("Detalhes dos depósitos": a data e o valor numa `referencia` —
    `lerDepositos` lê "Feito em / 05 SET 2026 / R$ 4.165,28") ou, sem ela, o bloco do cadastro (com a "data da
    aplicação"), mais as aplicações feitas pelo app (exatas); o resgate sai dos mais antigos. O rendimento de cada um sai
    do CDI de cada mês (`fatorDeCrescimento`, × o % contratado) desde a data, AJUSTADO ao que o título vale e ao que foi
    aplicado. Conferido com o RDB real: IR ≈ R$ 1.150,38 contra R$ 1.149,32 do banco. Isentos (LCI, LCA, CRI/CRA,
    poupança, saldo) = líquido igual ao bruto; fundo = sem estimativa; SEM AS DATAS (o bloco do cadastro sem a data da
    aplicação) o IR NÃO se estima — "— faltam as datas", nunca "R$ 0". Na carteira, a coluna "Líquido ≈" (o balão: IR,
    IOF, a próxima queda) e o título com mais de um depósito ABRE nos depósitos (a seta antes do nome; `abertosInv`,
    lembrado em `patrimonio_depositos_abertos`): a data e a idade, a alíquota de hoje e quando cai, o depositado ≈, o
    líquido e o rendimento. O painel diz o líquido no cartão do Patrimônio. O CDI é lido desde o depósito mais antigo
    (`useDadosPatrimonio`).
  · OS DEPÓSITOS SEMPRE DENTRO (06/11/2026, a pedido, e o mockup aprovado "Depósitos de antes", opções A): todo
    investimento com dinheiro ABRE nos depósitos dele, mesmo com um só (`temDepositos`). A aplicação feita pelo app até a
    primeira foto (o "Cadastrar e aplicar" grava a foto e a aplicação no mesmo dia) JÁ É o depósito, com a data — ela
    ficava de fora e o título caía em "faltam as datas" (o bloco "sem data" agora só leva o que sobra sem elas). O DINHEIRO
    DE ANTES DO APP é DIGITADO (`ModalDepositos`: a tabela data · valor · IR hoje, Enter desce, "Adicionar depósito", ✕);
    "Colar do banco" é um ATALHO que preenche a mesma tabela (ao colar, ou "Preencher a tabela"). Em cima, o que os valores
    são: "o que foi depositado" (a `referencia` de cada um é a própria data — o principal é o valor) ou "o que vale hoje"
    (numa data, como a tela do banco; colar passa a ele). Embaixo, o valor aplicado (a soma, ou o do banco) e, no sem
    valor, o "vale hoje" (vazio: a estimativa pelo CDI). A conta é `planoDosDepositos` (testada); salvar substitui a
    lista (`salvarDepositos` aceita a referência de cada item). Abre pelo ícone das moedas no cabeçalho da ficha, pelo
    "Informar os depósitos" e pelo "Já estava aplicado" do "Como o dinheiro entrou?".
  · O PAINEL CONTA O QUE RENDEU ANTES DO APP (06/11/2026, a pedido): o cartão "Rendeu até hoje" é o `rendimentoAcum` (o que
    vale − o aplicado, também o que o título já tinha rendido ao entrar) — antes somava só o rendimento mês a mês desde a
    primeira foto (o RDB com R$ 6.031 de antes ficava de fora); o do app vai na linha de baixo, com o % do CDI. A variação do
    cartão Patrimônio só aparece no mês SEM dinheiro novo (o "▲398%" do mês em que o RDB entrou).
  · EDITAR o que já foi lançado (06/11/2026): o ✎ de cada linha do Histórico da ficha (`ModalEditarRegistro`) muda a data, o
    valor e — no movimento — o tipo e a observação (`atualizarMovimento`, `atualizarValor`); a aplicação feita junto com a
    primeira foto (o mesmo dia e o mesmo valor) leva a foto junto. Na carteira, as colunas Investimento e RESGATE têm
    largura FIXA: abrir os depósitos não empurra a tabela.
  · O MOVIMENTO COM A DATA ANTES DOS VALORES (06/11/2026, o RDB Planejado: a aplicação de 03/06 lançada depois do valor de
    11/10, que não a tinha — o app achava que o título valia só o de outubro e dividia esse total entre os dois depósitos).
    `movimentosForaDosValores` (lib/valorEstimado.js, testada) acha o movimento lançado DEPOIS de um valor (`criado_em` dele
    > `atualizado_em` do valor) e com a data ANTES dele; a ficha avisa e "Somar aos valores de depois" grava cada valor com
    ele (`valoresComOMovimento`: a aplicação crescida pela taxa de cada dia até a data do valor; o resgate, tirado) — "Já
    estava incluída" regrava o mesmo valor e o aviso some. No Aplicar / Resgatar com a data antes de valores já
    registrados, eles passam a ter o movimento ao salvar ("eles já incluem" deixa como estão). E SEM o "valor aplicado" do
    cadastro, as aplicações até a primeira foto SÃO o aplicado (`aplicadoAteAFoto` na série; o IR e os vencimentos idem): o
    que a foto tem a mais é rendimento, não um depósito sem data.
  · A FICHA DO INVESTIMENTO (06/11/2026, as opções A do mockup "Ficha do investimento"; `FichaInvestimento`): os QUATRO
    NÚMEROS são cartões com HOVER — o cartão acende, a linha de baixo vira a CONTA ("= vale hoje − aplicado") e a COLUNA
    dele na lista acende (`gm-acesa`; o cabeçalho da coluna acende o cartão). A lista dos depósitos tem a ALTURA DA
    FICHA (`calc(90vh−340px)`) e o total preso embaixo. As QUEDAS DO IR têm ABA PRÓPRIA (`QuedasDoIR`: o resumo, a
    escada do IR de hoje até a última queda e as quedas por mês). Editar no cadastro e colar os depósitos são os ÍCONES do
    cabeçalho (o grupo do DRE, ao lado do ✕, pelo `acoes` do `Modal`); o rodapé tem só Resgatar e Aplicar (as moedas).
    Sem dinheiro ainda: o convite para aplicar ou colar.
  · O VALOR QUE ANDA SOZINHO (06/11/2026, o mockup aprovado "Valor pelo CDI": carteira A, conferir C, Tesouro A;
    `lib/valorEstimado.js`, testada em `test/valorEstimado.test.js`): as séries DIÁRIAS do SGS do Banco Central
    (`api/taxas.js`: CDI 12 e Selic 11, % ao dia útil, até ontem; IPCA 433 ao mês — abertas ao navegador) fazem o valor de
    quem rende por taxa pública (`andaSozinho`: % do CDI, CDI +, Selic +, IPCA +, prefixado; NUNCA Tesouro IPCA+/prefixado,
    fundo, debênture, poupança, saldo) andar DIA ÚTIL A DIA ÚTIL desde a última FOTO REAL: (valor + o que entrou − o que
    saiu) × (1 + CDI do dia × %) — a mudança do CDI vale dali em diante sobre o que já rendeu. `estimarValores` faz FOTOS
    ESTIMADAS (`estimado: true`): no fim de cada mês entre duas reais (o caminho AJUSTADO à real seguinte) e depois da última
    (fins de mês + o dia seguinte ao último publicado, `ultimo`), que entram nas séries (`useDadosPatrimonio`:
    `valoresSerie`) — o mês a mês, o painel e o líquido seguem sem a foto de todo mês. A DATA DA FOTO é o dia em que o banco
    mostrou o valor (já tem os dias úteis antes dela). Na carteira, "≈ pelo CDI até 05/11" embaixo do valor e o balão com a
    conta; na ficha, o "Vale hoje". CONFERIR (`pendentesDeValor`, pela última foto REAL): os que andam sozinhos a cada 3
    meses, os de preço de mercado todo mês; no "Atualizar valores" o campo vazio mostra a estimativa e o Enter a usa.
    O IR de cada depósito também passou ao CDI de cada dia (`fatorDiario`; o do mês fica de reserva): o RDB real deu IR ≈
    R$ 1.149,38 contra os R$ 1.149,32 do banco (antes, R$ 1.150,38).

## Indicadores (06/11/2026, o mockup aprovado "Indicadores e importações", opção A)

- `pages/Indicadores.jsx` (/indicadores, em Análises, depois de Patrimônio e Investimentos): o MERCADO, à parte do seu
  dinheiro. O grid da Visão geral (`GridPersonalizavel`, escopo `indicadores_v1`): os cinco números (Selic meta, CDI, IPCA
  de 12 meses, dólar e euro PTAX, com a variação no dia e em 12 meses), "Selic, IPCA e o juro real" (a Selic em degraus, o
  IPCA de 12 meses e a área entre os dois), "O que o mercado espera" (a Focus: IPCA, Selic e dólar do ano e dos dois
  seguintes), "Dólar e euro" (30 dias | 12 meses, lembrado em `indicadores_moeda`), "IPCA de cada mês" e "Sua carteira ×
  CDI × IPCA" (cada mês fechado do Patrimônio: o rendimento, o % do CDI e o juro real). No celular, os blocos em pilha.
- Os dados: `api/indicadores.js` — o SGS do Banco Central (432, 4389, 433, 13522, 1, 21619) e a Focus no Olinda, públicos e
  abertos ao navegador (CORS); cada parte que falha volta null e o bloco avisa. A Selic meta vem com datas futuras (vale até a
  próxima reunião): corta-se em hoje. As contas em `lib/indicadores.js` (testada). Os gráficos em
  `components/indicadores/GraficosIndicadores.jsx` (`GraficoLinhas`, `ColunasMes`: SVG na largura MEDIDA, o balão do app).
- A TAXA DO TESOURO IPCA+ de hoje ficou DE FORA (opção A): o CSV do Tesouro Transparente só abre para o site deles e o JSON
  antigo do Tesouro Direto saiu do ar (410). Trazer pediria um servidor (uma função no Supabase).

## Gastos fixos (fase 5)

- `recorrencias` geram, a cada mês vigente (ativa, entre `inicio` e `fim`), uma SUGESTÃO; o lançamento só existe
  quando a pessoa clica em "Lançar" (origem `fixo`, `recorrencia_id`). Valor sugerido = o do último lançamento da
  recorrência antes do mês; sem histórico, o `valor_padrao_centavos`. Lógica pura em `lib/fixos.js` (testada).
- Índice único `(recorrencia_id, competencia)` (migration 004): o banco recusa o fixo lançado duas vezes no mês.
- Excluir a recorrência mantém os lançamentos (FK `set null`); editar um lançamento de fixo mantém o `recorrencia_id`.
- A TELA é a matriz fixo × mês do ano (opção B, `components/planilha/MatrizFixos.jsx`, células de `matrizDoAno`):
  lançado · a lançar (sugerido em cinza, fundo âmbar) · futuro · fora da vigência (hachurado). Digitar + Enter lança
  (ou corrige o lançado), Ctrl+Enter lança os pendentes da seleção, Delete exclui, Ctrl+V cola do Excel, Ctrl+Z/Y.
  O cadastro continua no modal (clique no nome, Shift+F2 ou botão direito). Legenda no jeito da do DRE: as marcas
  acima da grade são clicáveis (destacam aquele tipo de célula) e o botão "Legenda" explica tudo.
- O QUE FALTA LANÇAR (28/10/2026, opções A + B): conta os pendentes de TODOS os meses até hoje (`pendentesPorMes`).
  (A) "Lançar N ▾" no cabeçalho = o `MenuFixos` (de `AvisoAgora.jsx`, o mesmo do aviso da Visão geral) por mês,
  com "Lançar" e "Não teve" em cada fixo, "Lançar os N" e "Ver na grade". (B) A linha "A lançar" da grade, com um
  ponto âmbar no título do mês; clicar seleciona o mês e a barra de baixo vira a de ação ("Lançar os N · R$" e
  "Não teve", botões da MESMA caixa). As ações moram na grade (`MatrizFixos` com `ref`: `lancar`, `pular`,
  `selecionar`), com o mesmo desfazer. LANÇAR VÁRIOS PEDE CONFIRMAÇÃO com a lista (barra, Ctrl+Enter, menu, "Lançar
  os N"); o "Lançar" de um fixo no menu não pede (a linha já mostra o valor).
- "NÃO TEVE" = tabela `fixos_pulados` (migration 006, recorrência + mês, única): a célula fica hachurada e sai das
  pendências (`matrizDoAno`/`situacaoDoMes` recebem `pulados`). Delete no mês desfaz; lançar um valor nele apaga a
  marca; Ctrl+Z vale. Antes da migration, `listarPulados` devolve null e o "Não teve" só explica o que falta.
- O CABEÇALHO É O DO DRE do Gestor (28/10/2026, opção A do mockup dos botões): os ícones numa caixa só, com o
  nome no tooltip — ✎ o CADASTRO e ▾ "Mais ações" (exportar o ano em CSV; criar um fixo é no cadastro) — e o gesto do dia a
  dia como botão de destaque, "Lançar N ▾" (âmbar). O cadastro NÃO é uma vista da planilha: é um POP-UP
  (`components/ModalCadastroFixos.jsx`), uma tabela de FORMULÁRIO (cada célula é um campo; categoria pelo
  `SeletorCategoria`, vigência pelo `CampoMes`) com todos os fixos. Muda-se em vários, acrescenta,
  marca para excluir, e "Salvar alterações (N)" grava só a diferença de cada um (`atualizarRecorrencia`); fechar
  com mudança pede para descartar. Ao lado do padrão, "≠ último lançado" (clicar o usa). Mudar o padrão não mexe
  no que já foi lançado. A ORDEM (29/10/2026): a alça ⠿ arrasta a linha (`lib/useListaArrastavel.js`, copiado do
  Gestor; o fantasma de um `<tr>` vai dentro de uma tabela) e grava em `recorrencias.ordem` (migration 008) junto
  com as outras alterações; a grade e os menus de lançar seguem essa ordem. Sem a coluna, a alça fica apagada.
- O resumo no topo dos Lançamentos (`components/graficos/CartoesResumo.jsx`, opção C com as setas): cartões com a
  curva dos últimos 6 meses (da `resumo_mensal`; o mês da tela vem da grade); clicar filtra o tipo.

## Visão geral (a tela inicial, 27/10/2026)

- Substituiu o "Resumo do mês": é o Dashboard da planilha (segmentações ANO e MÊS) no estilo do Gestor.
  Filtros: o PERÍODO, tipo, origem, categoria e "Comparar: ano anterior". O PERÍODO (06/11/2026, opção B do mockup
  "O filtro de período"; o mesmo das Categorias) é o `SegPeriodoFiltro` (`components/filtros/`), no lugar do Ano + Meses
  de antes: os TIPOS numa coluna à esquerda (mês · trimestre · semestre · acumulado · ano · 12 meses, com o que cada um
  faz), o ano (Ctrl+clique soma mais um) e a grade do tipo; meses sem lançamento apagados; rodapé com o período em
  palavras e "O ano todo" (o padrão). No "Mês", clique = um, Shift = intervalo, Ctrl = vários; os 12 meses terminam no
  mês escolhido e atravessam o ano. Contas em `lib/periodoFiltro.js` (`per` = { modo, anos, meses, tri, sem, ate } →
  `compsDoPeriodo`, `textoDoPeriodo`; testadas). A folha do celular ainda escolhe ano + meses (`periodoDeAnosMeses`). Contas puras em `lib/visaoGeral.js` (testadas), sobre a `resumo_mensal`; média divide
  pelos meses COM dado.
- O AVISO "AGORA" (28/10/2026, opção A) é a linha do widget Alertas do Dashboard do Gestor
  (`components/dashboard/AvisoAgora.jsx`), no TOPO: pílulas no tom do que pedem — âmbar = fixos a lançar (do ano
  até hoje, com o menu de lá: por mês, "Lançar" em cada um), vermelho = a revisar, cinza = parcelas do mês que vem.
  Sempre do mês atual, sem os filtros. Escopo `visao_v3` (hoje `visao_v4`): a disposição salva em `visao_v2` é lida uma vez
  com o aviso subindo ao topo (`aoTopo` no `ESCOPO_ANTIGO`).
- Gráficos em `components/graficos/GraficosVisao.jsx` + `LegendaSeries.jsx` (legenda-controle do Gestor):
  colunas entradas × gastos com saldo e o ano anterior tracejado, rosca por origem (clique filtra), barras por
  grupo que abrem nas categorias, e a tabela grupo × mês (recolhe com `useLinhasAnimadas`). Clicar num mês abre
  os Lançamentos dele.
- O GRUPO × MÊS (02/11/2026, opção A do mockup) mora em `components/graficos/TabelaGrupoMes.jsx`: o HOVER É A CRUZ
  (a célula com contorno, a linha e a coluna dela acesas — `.gm-acesa`, um véu por tema como CAMADA sobre o fundo da
  intensidade, que por isso vai em `backgroundColor`) e o `BalaoGrafico` em toda célula, também nos totais (coluna
  Total = o grupo no período; linha Total = os maiores grupos do mês). Cabeçalho preso. Ícones do DRE no canto: ⇕
  expandir/recolher tudo, ⬇ CSV, ⤢ o AMPLIADO (o painel de 1280px/90vh, tela cheia, busca e "Valores | % do mês").
  `gruposPorMes` também dá `qtdMeses` (os lançamentos de cada mês, para o balão). ABRIR/RECOLHER SEM TRANCO
  (04/11/2026): a linha do Total tem `data-segue` (o `useLinhasAnimadas` a desliza junto com as de baixo; antes pulava
  inteira no 1º quadro ao abrir e no último ao recolher) e a coluna do nome tem LARGURA FIXA (236px: cabe o grupo e a
  categoria — pelo conteúdo, abrir um grupo alargava a coluna e todas as outras andavam 24px).
- O OLHO DE OCULTAR VALORES (04/11/2026, COPIADO do Gestor, o das telas do celular de lá): no trilho do cabeçalho
  (e no flutuante), antes do ↻ — `onOcultar`/`oculto` do `GridPersonalizavel`, `IconOlho` em `icons.jsx`. Fechado,
  todo valor em reais, percentual e número com casas vira "•••" NO QUE A TELA DESENHA (`useMascararValores` em
  `lib/ocultarValores.js`: um `MutationObserver` no body pega também balões e ampliados); contagens, anos e meses
  ficam. Lembrado em `visao_ocultar`. Para MOSTRAR, os blocos remontam (`versao` no `key` do `renderWidget`). O
  olho PISCA ao alternar (`.icone-pisca` no index.css, `animarIcone`) — o `className` do botão não pode mudar com o
  estado (a cor vai por `aria-pressed:`), senão o React leva a classe da animação embora.
- O "SOBROU" do Saldo do mês tem cor própria, violeta (`--serie-sobrou`, 02/11/2026): era o verde das entradas.
- TRÊS BLOCOS NOVOS (03/11/2026, opções A, C e D do mockup "Visão geral · novos gráficos"; escopo do grid `visao_v5`:
  quem tinha a disposição salva os ganha no lugar e ligados — `abaixoDe`/`aoLadoDe`/`emSeguida` no `ESCOPO_ANTIGO`):
  · GASTOS POR ORIGEM, MÊS A MÊS (`vg_origem_mes`, `OrigemPorMes`): colunas empilhadas cartão / fixos / avulsos (as cores
    da rosca, 2px entre as partes), o total em cima, logo abaixo do Saldo e com a mesma calha (cada mês embaixo do
    seu). FIXAR uma origem na legenda desenha só as fixadas NA ESCALA DELAS (os fixos somem perto do cartão).
  · JÁ COMPROMETIDO (`vg_comprometido`, `JaComprometido`, em BARRAS DEITADAS a pedido; contas em `jaComprometido`,
    testada): do mês atual até a última parcela (6 a 12 meses), fixos (o lançado; senão a MÉDIA MÓVEL dos últimos 6
    lançamentos do fixo até hoje — `mediaMovelDosFixos`, `JANELA_FIXOS`, 05/11/2026, a pedido: antes era o último lançado,
    e a luz de um mês valia o ano inteiro; sem lançamento, o padrão; "não teve" fora; o sugerido de LANÇAR não muda) +
    parcelas que vêm (hachuradas); a tracejada é a média dos gastos dos 12 meses fechados (sem os filtros, como o Agora).
  · FORA DO NORMAL (`vg_fora`, `ForaDoNormal`; `foraDoNormal`, testada): o último mês fechado do período contra a média
    de cada categoria nos 12 meses antes (a regra do `mediaDaCategoria`), em duas colunas, acima e abaixo; só a
    diferença de R$ 100 e 20% ou mais.
- A TELA É UM GRID PERSONALIZÁVEL copiado do Dashboard Comercial do Gestor (`components/dashboard/GridPersonalizavel.jsx`,
  react-grid-layout 2.2.3 exato): arrastar, redimensionar, minimizar, ligar/desligar blocos, separadores, disposição
  compacta. Diferenças da cópia: grava no NAVEGADOR (um `api` falso sobre `lsGet`/`lsSet` com as rotas de lá como
  chave), cabeçalho = `CabecalhoPagina`, "Atualizar" = `onAtualizar`, e o pedido de altura a mais (`onFalta`) só vai
  uma vez por valor — no 2.2.3 a altura nova nem sempre chega ao desenho e o pedido repetido virava laço. Por isso
  os blocos ROLAM POR DENTRO (`.card` com `overflow-hidden` e o miolo `min-h-0 flex-1 overflow-auto`). Bloco de
  altura medida: `.card` por fora e `CardAutoAltura` no miolo, na altura natural (nunca medir o card esticado).
- A LINHA DA GRADE é metade da do Gestor (22px + 16 de vão = 38; item de h linhas = `38h − 16`), para mover e
  redimensionar em passos menores. Escopo `visao_v2`: a disposição salva no escopo antigo (`visao`) é lida uma vez
  com `y`/`h` dobrados (`ESCOPO_ANTIGO` no topo do grid).
- MÉDIAS POR MÊS (toda tela): só os meses em que o valor aparece (mês sem entrada cadastrada não é "entrada zero")
  e sem o mês em andamento quando há outros — `mediaPorMes`/`mesesDaMedia` em `lib/visaoGeral.js` (testadas).
  GASTO FIXO (02/11/2026): a categoria que é sobretudo fixo (metade ou mais do valor de origem `fixo`) só divide A
  PARTIR DO 1º MÊS em que aparece no período (`mediaDaCategoria`; o condomínio de quem se mudou em junho não divide
  desde janeiro); o EVENTUAL segue dividido por todos os meses do período (a festa de um mês pesa no ano). A média do
  GRUPO = a soma das médias das categorias (fecha com o Total). Vale no Gastos por grupo, na tabela grupo × mês e na
  tela Categorias (`usoCategorias`); onde a média começou depois, um RELÓGIO depois do número (`MarcaDesde`,
  04/11/2026, opção A do mockup — o "desde mmm/aa" escrito empurrava só aquelas linhas e desalinhava a coluna): toda
  linha, o cabeçalho e o Total reservam o mesmo espaço de 16px; o "desde" fica no hover e no balão, e a legenda diz
  "◷ média desde o 1º mês (gasto fixo)".
- Gastos por origem = rosca com UMA COR POR ORIGEM (`--origem-cartao/-fixo/-manual` no index.css — azul, laranja e,
  desde 02/11/2026, CINZA nos avulsos: o violeta se confundia com o "Sobrou" do Saldo do mês ao lado — validadas nos
  dois temas) e o centro que conta a fatia sob o cursor. Ela MEDE a caixa e escolhe o arranjo que cabe (rosca ao
  lado ou em cima; legenda completa ou de uma linha — `arranjoRosca`): o bloco não rola. DENTRO DE "CARTÃO (FATURAS)"
  (03/11/2026, a pedido) a fatia de cada cartão: o arco em tons da cor do cartão e uma linha por cartão na legenda
  ("65%" = do cartão; o centro dá o % do total) — `partes` do item, de `porCartao` (`resumoPeriodo`), que sai do
  `cartao_id` da `resumo_mensal` (migration 010; sem ela a leitura cai para a antiga e a rosca não divide). Gastos por grupo = barras na cor do grupo + curva dos meses
  + variação contra o ano anterior (só aparece com dado no mesmo período do ano anterior). As duas são a opção A dos
  mockups; a pílula de variação mora em `components/graficos/Variacao.jsx`. O AMPLIADO do Gastos por grupo
  (29/10/2026, opção A) é o painel do Entradas × gastos (1280px/90vh, tela cheia, CSV): `AmpliadoGrupos.jsx`, nome
  até 320px (em "Categorias", o grupo em cinza depois, encolhendo primeiro), linha de 30px, cabeçalho das colunas
  (com média/mês), busca e o Total preso embaixo. No bloco, o valor tem largura FIXA (com `auto`, cada linha media
  o seu número e as barras terminavam em pontos diferentes).
- Indicadores = `CartaoKpi compacto` (o mesmo cartão do resumo dos Lançamentos). "Entradas × gastos" tem 3 formas
  (colunas, linhas, acumulado), escolhidas no próprio bloco. O cartão do Saldo também mostra a média por mês
  (todo mês com lançamento entra, mesmo negativo).
- O SALDO TEM BLOCO PRÓPRIO, "Saldo do mês" (`vg_saldo`, 29/10/2026, opção A do mockup): a forma "Saldo"
  saiu das colunas, mas a LINHA BRANCA DO SALDO FICA nelas e em "Linhas" (voltou a pedido: ajuda a ler; ponto
  vermelho no mês que faltou). `SaldoDoMes` em `GraficosVisao.jsx`: barras divergentes (sobrou para cima, faltou para
  baixo) com o número e a linha do ACUMULADO no período (os quatro números de cima saíram: o cartão do Saldo já os diz). Fica
  logo abaixo das colunas, da mesma largura e com a mesma calha (cada mês embaixo do seu). Escopo do grid
  `visao_v4`: quem tinha a disposição salva ganha o bloco abaixo do "Entradas × gastos" (`abaixoDe`) e ligado
  (`ligarDepoisDe`, o `configurar` do `ESCOPO_ANTIGO` — sem ele, a lista salva o deixaria desligado).
- "ENTRADAS × GASTOS" = O "ORÇADO × CONFIRMADO ANUAL" DO GESTOR (28/10/2026, opção A; só as cores são daqui): card
  `p-5`, título 13px + período em cinza, eixo à ESQUERDA (`GradeEsq`, calha `CALHA_ESQ` 56px), legenda EMBAIXO com a
  linha que a separa (`LegendaSeries` com `borda`), hover = guia tracejada + meses a 40% + ponto no saldo. Colunas
  SOBREPOSTAS: entradas larga, gastos estreita na frente (recuo 23%), CADA BARRA COM O SEU NÚMERO sem a unidade
  (o da barra mais alta sobe quando tocaria o outro — `posRotulo`).
- AS LINHAS E O ACUMULADO COM NÚMERO (05/11/2026, opção D do mockup "Entradas × gastos em linhas": a A com o final da
  B; `LinhasEntradasGastos`): cada mês com o seu número (a régua das colunas, sem a unidade; a série de cima acima do
  ponto, a de baixo abaixo; até `rotulosAte` meses), cada linha TERMINA com o nome e o valor do último mês fechado
  numa calha à direita (`CALHA_DIR` 104px, a `direita` do `GradeEsq` e da `ReguaMeses`; rótulos empilhados com
  `FOLGA_FIM`), e no acumulado a CHAVE entre as curvas: "sobrou R$ X · N%". O MÊS EM ANDAMENTO (o de hoje) vai
  tracejado com o ponto vazio. Abaixo de 520px medidos, sem os números nem a calha. "UM ANO ANTES" SÓ COM DADO: sem o
  ano anterior no app, `anterior` é null (a série e a legenda somem, também nas colunas). Com a calha, os meses das
  Linhas não ficam mais exatamente sobre os do Saldo do mês (as colunas continuam alinhadas).
- A AMPLIAÇÃO substituiu a tela "Evolução mensal" (removida): `components/graficos/AmpliadoEntradasGastos.jsx`, o
  painel do Gestor (1280px/90vh, tela cheia 96vw/94vh), a tabela com todas as colunas (cartão, fixos, avulsos,
  acumulado, um ano antes, variação) + Total, CSV, e "Período da tela | Todo o histórico" (`compsDoHistorico`).

## Resumo, evolução e gráficos (fase 4)

- Views (migration 003): `resumo_mensal` (totais por mês × tipo × origem × categoria) e `parcelas_futuras` (as
  parcelas que faltam das compras da fatura MAIS RECENTE de cada cartão, uma por mês). As somas do front em
  `lib/resumo.js` (funções puras, testadas) partem delas.
- Gráficos em `components/graficos/Graficos.jsx`, no chrome do Gestor (divs posicionadas por %, calha do eixo Y à
  direita, `BalaoGrafico` no hover). Cores das séries em `index.css` (`--serie-gastos`, `--serie-entradas`), uma por
  tema, validadas com o validador do skill dataviz. **Padding em % num item flex é relativo ao CONTÊINER**, não ao
  item: largura de barra vai num miolo interno com `min-w-0` na coluna.
- `ErrorBoundary` por tela (no Layout, chave = endereço): erro numa tela não derruba o app.

## Faturas de cartão (fase 3)

- O IMPORTADOR CONFIGURÁVEL (fase 7 do `PLANO.md`; 7.1 pronta em 03/11/2026): o formato de um CSV é um MODELO
  (dado, não código) — `lib/modeloCsv.js` (testada): `lerComModelo(texto, config)` devolve o mesmo { linhas,
  ignoradas } dos leitores de antes; `config` = separador, linha do cabeçalho, linhas do fim a ignorar, o índice de
  cada coluna (data, estabelecimento, valor, parcela, portador), o formato da data, o sinal do GASTO (o outro sinal
  fica de fora), a parcela ('nenhuma' | 'coluna' | 'texto': "- Parcela 9/12", "(Parcela 3 de 10)") e o vencimento.
  `reconhecerModelo` pela ASSINATURA do cabeçalho (minúsculo, sem acento, espaço nem aspas). Nubank e XP são
  `MODELOS_PRONTOS` (no código); os do usuário, a tabela `modelos_importacao` (migration 011, que também abre o
  formato 'modelo' + `modelo_id` do cartão; `api/modelos.js`, `listarModelos` devolve null sem a tabela). Para o
  assistente (7.2): `detectarFormato` e `sugerirColunas` (pelo nome do cabeçalho e pelo conteúdo) e `decodificar`
  (UTF-8, ou Windows-1252 quando o UTF-8 não lê limpo).
  O ASSISTENTE (7.2, 03/11/2026, o mockup aprovado): `components/AssistenteModelo.jsx`, três passos — O ARQUIVO (um
  CSV de exemplo; separador, codificação, linha do cabeçalho e rodapé achados e trocáveis; o arquivo como é), AS
  COLUNAS (o seletor em cima de cada uma — `comPapel`/`papelDaColuna`; data, sinal do gasto, parcela; o rodapé diz o
  que falta — `problemaDoModelo`; linhas do outro sinal em vermelho) e CONFERIR E SALVAR (como entra, com a categoria
  das regras; o vencimento — `vencimentoDoArquivo` em `lib/lerFatura.js`; "reconhecer pelo cabeçalho"; o nome).
  Abre pelo "Ensinar um formato novo" no formulário e no cadastro do cartão — a AÇÃO no pé da lista do "Como a
  fatura entra", depois de uma linha (`acao` do `SelectSimples`, como o "+ Criar categoria"; `ENSINAR_FORMATO`), não
  uma opção; o modelo salvo já fica escolhido. Sem a migration 011, salvar explica que ela falta.
  OS IMPORTADORES (7.3, 03/11/2026): `ImportarFatura` e `ImportarArquivos` leem o texto dos BYTES (`decodificar`) e a
  fatura por `lerFaturaComModelos` (`lib/lerFatura.js`, testada): o primeiro modelo que reconhece o cabeçalho (os do
  usuário antes dos prontos), o cartão (pronto: nome do arquivo / célula / único do formato; do usuário: célula /
  único ligado ao modelo) e o vencimento (o do modelo; o da célula vale sobre o palpite do dia). Nenhum reconhece →
  `naoReconhecido` e o botão "Ensinar este formato" (o assistente com `arquivoInicial`; salvo, o arquivo é relido
  COM o modelo novo — `modeloId`). O MODELO SEM CABEÇALHO ("reconhecer sozinho" desligado) entra pelo do cartão da
  célula que abriu o importador ou pelo "Ler com o modelo…" do erro (`modeloId`; só no importador de uma fatura).
  O CAMINHO INTEIRO de um banco novo (bytes Windows-1252 → assistente → o modelo como a tabela devolve → a fatura do
  mês seguinte) é o `test/importadorModelo.test.js`. O CARTÃO SE LIGA AO MODELO na primeira fatura que entra por
  um modelo do usuário num cartão de LANÇAMENTO MANUAL (`modeloParaLigar` em `lib/cartoes.js`, testada;
  `ligarCartaoAoModelo` com o filtro do formato no banco): a prévia avisa e o toast confirma. Sem isso, o modelo
  ensinado pelo importador ficava solto e o "Importar arquivos" não achava o cartão. Pronto (Nubank, XP) ou já
  ligado a outro modelo não muda. Cartão novo, sem fatura, não tem coluna na tela Importar: a primeira entra pelo
  bloco dele em Cartões ou pelo "Importar arquivos".
  A TELA `pages/Modelos.jsx` (/cadastros/modelos, em Cadastros): os prontos (só leitura) e os do usuário — clicar no
  nome renomeia, "Ensinar de novo" (o assistente com `modelo`: com o mesmo cabeçalho, as colunas dele) e "Excluir"
  (`excluirModelo` devolve os cartões dele ao lançamento manual antes).
- `lib/lerFatura.js`: reconhece o formato pelo CABEÇALHO — Nubank original (`date,title,amount`, parcela no fim do
  título: "Loja - Parcela 9/12") e o da XP (`Data;Estabelecimento;Portador;Valor;Parcela`, também o das faturas do
  Nubank que o usuário converteu). OS CRÉDITOS ENTRAM (03/11/2026, migration 012 — antes todo negativo ficava de fora,
  "como na planilha", e o total da fatura ficava com as compras BRUTAS: a XP de outubro dava R$ 15.036,36 em vez dos
  R$ 14.073,56 do banco): só o PAGAMENTO fica de fora; o ESTORNO e o CRÉDITO entram como gasto de cartão com valor
  NEGATIVO (`separarCreditos`), classificados pelas regras como as compras, e abatem da fatura, dos gastos e da
  categoria — não são entrada. A linha do SALDO DO MÊS ANTERIOR ("Valor pendente do mês anterior", a fatura paga com
  atraso repetida na seguinte) também fica de fora (`semSaldoAnterior`); multa, juros e IOF do atraso entram. Fatura
  que já existe sem os créditos: "Acrescentar só os créditos que faltam" (`creditosQueFaltam` + `acrescentarCreditos`,
  sem substituir nada; no "Importar arquivos" é o padrão quando faltam). Os créditos gravam num passo à parte das
  compras: sem a 012, a fatura entra e o aviso diz que eles faltam. Na grade, a marca "estorno" e o valor segue
  negativo ao editar (`interpretar` com `credito`); no "Onde mais comprou" abate do total da loja sem ser compra. Desde 03/11/2026
  lê pelos `MODELOS_PRONTOS` de `lib/modeloCsv.js` (a mesma leitura dos modelos do usuário); a API dele não mudou.
- Cartão e vencimento pelo nome do arquivo (`Nubank_AAAA-MM-DD…`, `FaturaAAAA-MM-DD…`); sem pista, o vencimento é o
  próximo dia de vencimento do cartão depois da última compra. Competência = mês do vencimento.
- `lib/classificar.js` reproduz o `PROCURAR` do Excel da planilha: primeira regra por prioridade, substring sem
  diferenciar maiúscula, com CURINGAS (`*`, `?`, `~*`) — 42 regras da planilha dependem deles.
- Fatura é única por cartão + vencimento; a repetida só entra substituindo (a FK apaga os lançamentos da anterior).
- O TOTAL DA FATURA (`faturas.total_centavos`, o que a tela Cartões mostra) = a soma dos lançamentos dela, mantida
  pelo GATILHO da migration 009 (03/11/2026) a cada lançamento que entra, sai, muda de valor ou de fatura — antes era
  gravado só na importação, e excluir uma compra pela grade deixava o total antigo.
- Os CSVs reais ficam em `dados/Faturas cartão/` (fora do git). Teste dos leitores: dados FICTÍCIOS em `test/`.

## Histórico da planilha (fase 2, já importado)

`scripts/migrar-planilha.mjs "…\Gastos total.xlsx"` → `dados/planilha.json` (pasta no `.gitignore`: dados financeiros
NUNCA no git). A tela que gravava (Cadastros → Importar histórico) saiu em 29/10/2026: foi usada uma vez; o que
ficou é o pop-up do histórico (conferir e desfazer). A gravação está no histórico do git (`importarPlanilha`). Parcelas que o Excel virou data
("06/dez", "46363,0") são lidas por `lib/parcela.js` (dia = parcela, mês = total) — reaproveitar nos importadores da fase 3.

## Convenções

- **Dinheiro em centavos inteiros (`bigint`) e positivos**; a direção vem de `tipo` (`saida`/`entrada`). A ÚNICA exceção é o
  ESTORNO do cartão (gasto de origem `cartao` com valor negativo, migration 012). Use
  `lib/dinheiro.js` (`parseValor`, `formatBRL`, `brlCurto` — todos em CENTAVOS). Nunca some reais em float.
- **Datas**: coluna DATE pelos 10 primeiros caracteres (`formatDate`, `diaDeData`); timestamp por `formatDateTime`.
  Nunca `new Date('AAAA-MM-DD')`. **Competência** é `'AAAA-MM'` no front e `date` dia 1 no banco
  (`competenciaParaBanco`). Gasto de cartão conta no mês do **vencimento da fatura**.
- **Tela nova**: entra em `lib/navegacao.js` (barra lateral e menu do celular) e em `App.jsx`; a página abre com
  `CabecalhoPagina` como PRIMEIRO filho (ele nega o `p-6` do Layout e nomeia a aba do navegador).
- **Celular** (04/11/2026, opção A do mockup "Meus Gastos no celular": SÓ PARA VER; COPIADO do celular do Gestor):
  `lib/celular.js` decide (`ehCelular` = até 767px E toque grosso; "Ver versão completa" vale até fechar o app, em
  `sessionStorage`) e o `Layout` troca a barra lateral pelo casco `components/movel/LayoutMovel.jsx` — sem rotas
  próprias: a tela lê `useNoCelular()` e desenha a versão dela. O casco: topo fixo de 56px (☰, o nome da tela, a lupa da
  busca rápida, o avatar) com a SEGUNDA LINHA por portal (`useSlotTopo`: o ‹ mês › dos Lançamentos e dos Fixos), a
  GAVETA (`movel/PainelMovel.jsx`: 280px, desliza, fecha arrastando, tocando fora ou com o voltar do aparelho —
  `useVoltarFecha`) com as telas de ler (Visão geral, Lançamentos, Gastos fixos, Cartões, Patrimônio), e a folha do
  usuário (tema, versão completa, sair). `html.app-movel`: sem zoom (`travarZoom`, nunca `minimum-scale=1`), sem
  clarão do toque, `overflow-x: clip`, e o escuro mais escuro (#0a0a0a / #161616). No celular: o `CabecalhoPagina` some
  (as ações dele são de editar), todo `Modal` vira TELA CHEIA (entra da direita, voltar de vidro, sem as `acoes`), os
  FILTROS são a folha `movel/FiltrosMovel.jsx` (por campos: pílulas, meses, único, lista; rascunho que só vale no "Ver
  resultados"), o toque aperta e volta com mola (`.toque`, `.toque-icone`). Por tela: a Visão geral sem o grid (os
  blocos em `BLOCOS_MOVEL`, ordem e altura fixas; sem o grupo × mês; 4 números 2 × 2 com a média curta), os
  Lançamentos em lista por dia (por mês num período) com a FICHA só de leitura numa folha, os Fixos como o mês em lista
  e o ano em colunas, e nos Cartões e no Patrimônio somem importar, editar e excluir. O "Agora" só informa. Tela nova:
  se ela for de ler, entra em `SECOES_MOVEL` e desenha a sua versão; se for de editar, fica fora da gaveta. Os meses dos
  gráficos na tela estreita: UM A CADA TRÊS, contados do último, sem `truncate` (`pulaNoCelular`).
- **Seletores**: escolher categoria é sempre o `SeletorCategoria` (busca, grupos em ordem alfabética, "+ Criar
  categoria" que abre o `ModalCategoria` e já escolhe a nova). Listas curtas: `SelectSimples` (= `SelectBusca`
  sem busca). Os dois portam a lista ao body — nunca `absolute` dentro de cartão/modal, que recorta.
  Em TABELA, `compacto` (32px no BOTÃO, como o `CampoData`); o `className` vai na caixa de fora — um `!h-8` ali
  deixava o botão com 38px, vazando para baixo da linha (03/11/2026).
- **Barra lateral em z-[32]** (no computador): acima dos cabeçalhos presos das tabelas (z-30 — no empate a tela
  cobria o menu da barra recolhida) e abaixo do ampliado (z-[35]) e dos modais.
- **Datas**: nunca `<input type="date">`/`"month"` (destoam). Data = `CampoData`; mês (vigência, competência) =
  `CampoMes` — os dois em `components/CampoData.jsx`, o calendário COPIADO do Gestor (`CalendarioData` +
  `calendario/CabecalhoCalendario.jsx`, sem os feriados) e o `CalendarioMes` no mesmo desenho. O calendário vai
  PORTADO ao body (lá era `absolute`). `min`/`max` hachuram o que não vale; `compacto` = altura de tabela.
  O CampoData SE DIGITA (06/11/2026, a pedido): "11042027" (as barras entram sozinhas — `mascaraData`, lib/format.js),
  "11/4/27" ou "11/04" (o ano de agora; a régua é a `lerData` da grade); clicar ou a seta abre o calendário; vale ao
  completar, no Enter ou ao sair; o inválido volta ao de antes; apagar limpa.
- **Barra de rolagem não empurra a tela** (29/10/2026): `scrollbar-gutter: stable` no `<html>` (index.css; o
  `travarRolagem` não compensa mais o padding) e na caixa que rola por dentro e muda de altura (a "Grupo × mês").
  Caixa nova que abre/recolhe linhas e rola por dentro: `[scrollbar-gutter:stable]`.
- **Botões do cabeçalho = o grupo do DRE** (Fixos, Importar, Lançamentos): ícones numa caixa só, nome no tooltip,
  e o gesto do dia a dia como botão de destaque ao lado. Nos Lançamentos (30/10/2026): a caixa só com o ▾ "Mais
  ações" (Exportar o mês em CSV) e "+ Novo lançamento" sempre à vista.
- **Números do menu** (30/10/2026): o que ainda pede a pessoa depois de importar — Importar (a importar), Gastos
  fixos (a lançar, do ano até hoje) e Revisar pendências (a revisar). `contador` + `dica` no item de
  `lib/navegacao.js`, contas em `lib/useContadores.js`; pílula âmbar ao lado do nome, ponto âmbar no grupo fechado e
  no ícone da barra recolhida. Refazem sozinhos: o `fetch` do supabase (`api/supabase.js`) solta `EVENTO_DADOS` em
  toda gravação no PostgREST, e o hook reconta 800 ms depois da rajada — tela nova que grava não precisa avisar.
- `localStorage` só por `lsGet`/`lsSet` (`lib/storage.js`) e só para preferência de tela — nunca dado financeiro.
- Confirmação é `useConfirmacao()` com `await` (nunca `window.confirm`); avisos por `useToast()`.
- Nunca logar valores financeiros nem dados pessoais.
- Repositório é **público**: nada de segredo no código (só a chave publishable).
- Edição de código com `$`, crase ou barra invertida: por script em ARQUIVO (no scratchpad), nunca `node -e`/`sed` inline.
- Git: oferecer commit, mas nunca commitar ou dar push sem o usuário pedir.
- **Ícone pequeno numa caixa = PX INTEIROS** (06/11/2026): o rem do app é 14px, então `h-3`/`h-4`/`h-5` dão 10,5 / 14 /
  17,5 px, e um ícone de traço fino centrado num desses fica meio pixel fora do lugar (borrado, "esquisito"). O "+" no
  círculo tracejado é o `CirculoMais` (icons.jsx: 16 e 8 px, ou 18 e 10 no `grande`); a seta de abrir dos investimentos, o
  `QUADRADO_SETA` (20 e 12 px). Caixa e ícone em `h-[Npx]` com a diferença PAR.
- **Ícone** (barras e tendência, 27/10/2026): `public/icon.svg` é a fonte, no MESMO desenho do Coppi Gains (fundo em
  degradê #343434 → #101010, símbolo branco recortado por máscara, a mesma sombra). Os PNGs, o maskable e o
  `favicon.ico` (48px) saem dele nos tamanhos do preset minimal-2023 do `@vite-pwa/assets-generator`, sem padding
  (o SVG já tem a margem da área segura). Mudou o SVG → gere todos de novo.

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
  No celular continua a lista (só leitura + formulário).
  ORDENAR (29/10/2026): o título da coluna SELECIONA (planilha); a SETA ao lado ORDENA (aparece no hover, fica à vista
  na ordenada; 3ª vez volta ao padrão, data mais nova em cima) — `ordenarLinhas`/`proximaOrdem` em `lib/planilha.js`,
  a escolha lembrada no navegador. A ordem vale ao carregar e ao clicar, e não se refaz sozinha (editar não pula a
  linha). ESC TIRA A SELEÇÃO, como no DRE (nada aceso, sem a soma); seta/Tab/Enter ou clique a trazem de volta.
- **Categorias = planilha agrupada** (opção A): grupos recolhíveis, e por categoria o uso tirado da `resumo_mensal`
  (`lib/usoCategorias.js`: 12 meses, total no mês, média pelos meses com dado, último uso).
  GERIR (29/10/2026, opção A do mockup "Categorias · gerir mais fácil"): o cabeçalho é o grupo do DRE (✎ Gerir
  categorias · ▾ Novo grupo / Exportar CSV) + "+ Nova categoria". O ✎ abre `components/ModalCadastroCategorias.jsx`,
  o cadastro no jeito do dos fixos: grupos como cabeçalho, categorias embaixo, cada célula um campo (nome, grupo,
  cor/tipo do grupo, ativa); a alça ⠿ arrasta (abaixo de outro cabeçalho = muda de grupo), ▲▼ ordenam os grupos
  (as colunas `ordem` já existiam). "Salvar alterações (N)" grava só a diferença (contas puras e testadas em
  `lib/cadastroCategorias.js`). MARCAR categorias → Mover para, Desativar e JUNTAR EM UMA (`juntarCategoria`:
  lançamentos, fixos e regras passam para a que fica, e ela sai — ao salvar, com confirmação). Categoria com
  lançamentos não se exclui (junta ou desativa); excluir leva as REGRAS dela (FK em cascata) e a confirmação diz.

## Importar (a tela, 28/10/2026)

- UM ITEM SÓ NO MENU, "Importar" (`SOLTOS` em `lib/navegacao.js`, com o número do que falta — `useContadores`):
  `pages/Importar.jsx`. NADA DE IMPORTAR ABRE OUTRA TELA (29/10/2026): os três importadores são POP-UPS abertos dali —
  `ImportarFatura`, `ImportarExtrato` (era a tela /extrato; com a prévia, cresce para o painel dos ampliados, 1100px/90vh,
  rodapé preso) e `ImportarArquivos`. A TELA FATURAS SAIU: cada fatura está na aba Por mês (a célula que entrou tem
  o ↗ "Ver os lançamentos do mês") e sai pelo "Excluir" da linha dela no Histórico; as da PLANILHA (sem linha própria)
  saem pela lista "As faturas dela" do pop-up da planilha. `/faturas` e `/extrato` levam ao Importar, e "Revisar
  pendências" foi para Movimentação. O ↓ de importar é O MESMO botão cheio em toda célula (à vista no "Falta", no hover
  nas outras).
- ABA "POR MÊS": linha = mês do ano (filtro de ano), coluna = FONTE (cada cartão e o extrato); a célula diz QUANDO
  entrou ou o que falta (`mesesDoAno` em `lib/importacoes.js`, testada). Fonte DEVE o mês quando ele já pode ser
  importado: a fatura a partir do vencimento; o extrato quando o mês acabou (o mês corrente é "em andamento" ou
  "até dd/mm", sem contar como pendência). Antes da primeira importação da fonte, "—". A célula que falta abre o
  importador da fatura já com cartão e vencimento (`inicial`) ou o do extrato.
- ABA "HISTÓRICO" = tabela `importacoes` (migration 007, que também preenche o passado): toda importação chama
  `registrarImportacao` (fatura, extrato, planilha; sem a tabela, ignora em silêncio). "Excluir" a fatura (apaga a
  fatura) e "Desfazer" o ÚLTIMO extrato (`desfazer` = ids criados + os fixos corrigidos como eram, de `gravarExtrato`).
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

## Extrato da conta corrente

- `lib/lerExtrato.js`: CSV do extrato do Nubank (`Data,Valor,Identificador,Descrição`); a `contraparte` (quem recebeu
  ou enviou) sai da descrição sem CPF/banco. `lib/planoExtrato.js` dá o destino de cada linha (fora, já importada,
  fixo novo, corrige o fixo, avulso) — a prévia mostra exatamente o plano, e `api/extrato.js` grava.
- Decisões do usuário: entradas do extrato ficam de fora (lançadas à mão); pagamento de fatura e investimentos
  (RDB, dinheiro guardado) sempre de fora; transferência entre contas próprias por REGRA DE IGNORAR
  (`regras.ignorar`, migration 005 — também vale nas faturas); pagamento cuja categoria é a de uma recorrência
  vigente vira o fixo do mês com o valor real (se o fixo já foi lançado à mão, o valor é corrigido).
- **Classificar só pela contraparte**, nunca pela descrição inteira: a regra "4" → Outros da planilha pegava todo
  Pix pelos dígitos do CPF. `id_externo` (identificador do banco, índice único) impede importar duas vezes.

## Patrimônio (fase 6)

- `contas` + `saldos` (foto do saldo numa data, única por conta + data: registrar de novo na mesma data substitui).
- Patrimônio no mês = soma, por conta, da foto mais recente até o fim do mês (vale até a próxima); conta sem foto
  ainda não entra. Conta encerrada: registrar saldo 0 antes de desativar. Lógica em `lib/patrimonio.js` (testada).

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
  Filtros: anos (vários), meses (grade de 12, Shift = intervalo, atalhos de trimestre), tipo, origem, categoria e
  "Comparar: ano anterior". Contas puras em `lib/visaoGeral.js` (testadas), sobre a `resumo_mensal`; média divide
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
- Gastos por origem = rosca com UMA COR POR ORIGEM (`--origem-cartao/-fixo/-manual` no index.css, validadas nos
  dois temas) e o centro que conta a fatia sob o cursor. Ela MEDE a caixa e escolhe o arranjo que cabe (rosca ao
  lado ou em cima; legenda completa ou de uma linha — `arranjoRosca`): o bloco não rola. Gastos por grupo = barras na cor do grupo + curva dos meses
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

- `lib/lerFatura.js`: reconhece o formato pelo CABEÇALHO — Nubank original (`date,title,amount`, parcela no fim do
  título: "Loja - Parcela 9/12") e o da XP (`Data;Estabelecimento;Portador;Valor;Parcela`, também o das faturas do
  Nubank que o usuário converteu). Valor negativo (pagamento, estorno) fica de fora, como na planilha.
- Cartão e vencimento pelo nome do arquivo (`Nubank_AAAA-MM-DD…`, `FaturaAAAA-MM-DD…`); sem pista, o vencimento é o
  próximo dia de vencimento do cartão depois da última compra. Competência = mês do vencimento.
- `lib/classificar.js` reproduz o `PROCURAR` do Excel da planilha: primeira regra por prioridade, substring sem
  diferenciar maiúscula, com CURINGAS (`*`, `?`, `~*`) — 42 regras da planilha dependem deles.
- Fatura é única por cartão + vencimento; a repetida só entra substituindo (a FK apaga os lançamentos da anterior).
- Os CSVs reais ficam em `dados/Faturas cartão/` (fora do git). Teste dos leitores: dados FICTÍCIOS em `test/`.

## Histórico da planilha (fase 2, já importado)

`scripts/migrar-planilha.mjs "…\Gastos total.xlsx"` → `dados/planilha.json` (pasta no `.gitignore`: dados financeiros
NUNCA no git). A tela que gravava (Cadastros → Importar histórico) saiu em 29/10/2026: foi usada uma vez; o que
ficou é o pop-up do histórico (conferir e desfazer). A gravação está no histórico do git (`importarPlanilha`). Parcelas que o Excel virou data
("06/dez", "46363,0") são lidas por `lib/parcela.js` (dia = parcela, mês = total) — reaproveitar nos importadores da fase 3.

## Convenções

- **Dinheiro em centavos inteiros (`bigint`) e positivos**; a direção vem de `tipo` (`saida`/`entrada`). Use
  `lib/dinheiro.js` (`parseValor`, `formatBRL`, `brlCurto` — todos em CENTAVOS). Nunca some reais em float.
- **Datas**: coluna DATE pelos 10 primeiros caracteres (`formatDate`, `diaDeData`); timestamp por `formatDateTime`.
  Nunca `new Date('AAAA-MM-DD')`. **Competência** é `'AAAA-MM'` no front e `date` dia 1 no banco
  (`competenciaParaBanco`). Gasto de cartão conta no mês do **vencimento da fatura**.
- **Tela nova**: entra em `lib/navegacao.js` (barra lateral e menu do celular) e em `App.jsx`; a página abre com
  `CabecalhoPagina` como PRIMEIRO filho (ele nega o `p-6` do Layout e nomeia a aba do navegador).
- **Celular**: abaixo de `md` a barra lateral vira menu (☰). Telas precisam ser legíveis em 375px (tabela larga →
  rolagem horizontal dentro do `card` ou lista).
- **Seletores**: escolher categoria é sempre o `SeletorCategoria` (busca, grupos em ordem alfabética, "+ Criar
  categoria" que abre o `ModalCategoria` e já escolhe a nova). Listas curtas: `SelectSimples` (= `SelectBusca`
  sem busca). Os dois portam a lista ao body — nunca `absolute` dentro de cartão/modal, que recorta.
- **Datas**: nunca `<input type="date">`/`"month"` (destoam). Data = `CampoData`; mês (vigência, competência) =
  `CampoMes` — os dois em `components/CampoData.jsx`, o calendário COPIADO do Gestor (`CalendarioData` +
  `calendario/CabecalhoCalendario.jsx`, sem os feriados) e o `CalendarioMes` no mesmo desenho. O calendário vai
  PORTADO ao body (lá era `absolute`). `min`/`max` hachuram o que não vale; `compacto` = altura de tabela.
- **Barra de rolagem não empurra a tela** (29/10/2026): `scrollbar-gutter: stable` no `<html>` (index.css; o
  `travarRolagem` não compensa mais o padding) e na caixa que rola por dentro e muda de altura (a "Grupo × mês").
  Caixa nova que abre/recolhe linhas e rola por dentro: `[scrollbar-gutter:stable]`.
- **Botões do cabeçalho = o grupo do DRE** (Fixos, Importar, Lançamentos): ícones numa caixa só, nome no tooltip,
  e o gesto do dia a dia como botão de destaque ao lado.
- `localStorage` só por `lsGet`/`lsSet` (`lib/storage.js`) e só para preferência de tela — nunca dado financeiro.
- Confirmação é `useConfirmacao()` com `await` (nunca `window.confirm`); avisos por `useToast()`.
- Nunca logar valores financeiros nem dados pessoais.
- Repositório é **público**: nada de segredo no código (só a chave publishable).
- Edição de código com `$`, crase ou barra invertida: por script em ARQUIVO (no scratchpad), nunca `node -e`/`sed` inline.
- Git: oferecer commit, mas nunca commitar ou dar push sem o usuário pedir.
- **Ícone** (barras e tendência, 27/10/2026): `public/icon.svg` é a fonte, no MESMO desenho do Coppi Gains (fundo em
  degradê #343434 → #101010, símbolo branco recortado por máscara, a mesma sombra). Os PNGs, o maskable e o
  `favicon.ico` (48px) saem dele nos tamanhos do preset minimal-2023 do `@vite-pwa/assets-generator`, sem padding
  (o SVG já tem a margem da área segura). Mudou o SVG → gere todos de novo.

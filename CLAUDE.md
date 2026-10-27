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
- **Categorias = planilha agrupada** (opção A): grupos recolhíveis, e por categoria o uso tirado da `resumo_mensal`
  (`lib/usoCategorias.js`: 12 meses, total no mês, média pelos meses com dado, último uso).

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
- O resumo no topo dos Lançamentos (`components/graficos/CartoesResumo.jsx`, opção C com as setas): cartões com a
  curva dos últimos 6 meses (da `resumo_mensal`; o mês da tela vem da grade); clicar filtra o tipo.

## Visão geral (a tela inicial, 27/10/2026)

- Substituiu o "Resumo do mês": é o Dashboard da planilha (segmentações ANO e MÊS) no estilo do Gestor.
  Filtros: anos (vários), meses (grade de 12, Shift = intervalo, atalhos de trimestre), tipo, origem, categoria e
  "Comparar: ano anterior". Contas puras em `lib/visaoGeral.js` (testadas), sobre a `resumo_mensal`; média divide
  pelos meses COM dado. A faixa "Agora" (pendências, fixos a lançar, parcelas do próximo mês) é sempre do mês atual.
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
  dois temas) e o centro que conta a fatia sob o cursor. Gastos por grupo = barras na cor do grupo + curva dos meses
  + variação contra o ano anterior (só aparece com dado no mesmo período do ano anterior). As duas são a opção A dos
  mockups; a pílula de variação mora em `components/graficos/Variacao.jsx`.
- Indicadores = `CartaoKpi compacto` (o mesmo cartão do resumo dos Lançamentos). "Entradas × gastos" tem 4 formas
  (colunas, linhas, saldo, acumulado), escolhidas no próprio bloco.

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
NUNCA no git). A tela Cadastros → Importar histórico grava e confere por fatura. Parcelas que o Excel virou data
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

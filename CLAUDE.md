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
- `localStorage` só por `lsGet`/`lsSet` (`lib/storage.js`) e só para preferência de tela — nunca dado financeiro.
- Confirmação é `useConfirmacao()` com `await` (nunca `window.confirm`); avisos por `useToast()`.
- Nunca logar valores financeiros nem dados pessoais.
- Repositório é **público**: nada de segredo no código (só a chave publishable).
- Edição de código com `$`, crase ou barra invertida: por script em ARQUIVO (no scratchpad), nunca `node -e`/`sed` inline.
- Git: oferecer commit, mas nunca commitar ou dar push sem o usuário pedir.

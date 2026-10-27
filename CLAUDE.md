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

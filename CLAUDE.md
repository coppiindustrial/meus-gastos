# Meus Gastos

Webapp pessoal de finanças (gastos, entradas, faturas de cartão e patrimônio) que substitui a planilha
`OneDrive\CONTAS\Gastos\Gastos total.xlsx`. Usuário único. Uso principal pelo celular (PWA instalado), importação de faturas costuma ser no PC.

- **Plano, modelo de dados e fases:** `PLANO.md` (fonte da verdade do escopo; atualizar o status das fases ao concluir).
- **Projetos irmãos** (mesma pasta `Downloads`): `Projeto app de treino` (base desta stack: sync, componentes, estilos) e
  `Projeto Gestor Integrado Coppi Industrial` (ideias de DRE, `formatBRL`, export CSV, gráficos SVG).

## Stack

React 19 + TypeScript (strict) + Vite 8 · `vite-plugin-pwa` · `react-router-dom` (HashRouter) · Dexie (IndexedDB) ·
Supabase (Auth + tabela `records`) · Vitest · CSS puro com variáveis (`src/styles.css`, tema escuro estilo iOS) · deploy no GitHub Pages.

## Estrutura

```
src/lib/        db.ts (Dexie), sync.ts, supabase.ts, types.ts (modelo), dinheiro.ts, format.ts (datas e competência), backup.ts
src/components/ Layout (TabBar de vidro, TopBar, TabHead, EmptyState), Sheet, Dialogs, SwipeRow, ActionMenu, Icon
src/screens/    uma tela por arquivo; rotas em App.tsx
supabase/schema.sql   tabela records + RLS (rodar no SQL Editor)
public/icon.svg       ícone; `npm run icons` gera os PNGs
```

## Como rodar

```
npm install
npm run dev        # http://localhost:5182 (preview do Claude: .claude/launch.json "meus-gastos")
npm test           # Vitest (lógica em src/lib)
npm run build      # tsc + vite build
```

Supabase: projeto `abofajutoxukbvrfisem`. URL e chave pública ficam em `.env.local` (dev, fora do git) e em `deploy.yml` (produção).
Sem essas variáveis o app roda só local; dá para colar URL e chave em Mais → Conta e backup.
Com a nuvem configurada, o app exige login (componente `Portao` em `App.tsx`).

## Dados e sincronização

- Offline-first: tudo grava primeiro no Dexie com `dirty: 1`; `scheduleSync()` envia depois. Cada tabela de `SYNCED_TABLES`
  vira um `kind` na tabela `records` do Supabase (`data` jsonb). Mudar o modelo **não** exige migração no Supabase,
  mas exige nova `version()` no Dexie quando mudar índices.
- Apagar = `deleted: 1` (nunca remover a linha), para o apagamento chegar aos outros aparelhos.
- Registros criados automaticamente (seeds) devem ter **id fixo**, senão cada aparelho cria uma cópia.
- Booleans que precisam de índice são `0 | 1` (IndexedDB não indexa boolean).

## Convenções

- **Dinheiro em centavos inteiros e positivos**; a direção vem de `tipo` (`saida`/`entrada`). Use `dinheiro.ts`
  (`parseValor`, `formatBRL`, `brlCurto`). Nunca somar reais em float.
- **Datas só-data como texto `AAAA-MM-DD`**; competência (mês em que conta) como `AAAA-MM`. Gasto de cartão conta no
  mês do **vencimento da fatura**. Para converter use `fromISODate` (meio-dia local), nunca `new Date('AAAA-MM-DD')`.
- UI, comentários e nomes do domínio em português (`lancamento`, `competencia`); código genérico herdado do app de treino segue em inglês.
- Nunca logar valores financeiros nem dados pessoais.
- Repositório é **público**: nada de segredo no código. Só a chave pública (publishable/anon) do Supabase, via variáveis do repositório no GitHub Actions.
- Git: oferecer commit, mas nunca commitar ou dar push sem o usuário pedir.

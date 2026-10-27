# Meus Gastos — Arquitetura, modelo de dados e plano por fases

> Status: **aprovado** (2026-10-27). Supabase: projeto novo, só para este app.
> Fase 0: código local pronto (login, abas, sync, PWA, deploy). Falta: projeto Supabase + repositório no GitHub.
> Substitui a planilha `OneDrive\CONTAS\Gastos\Gastos total.xlsx`.

## 1. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Backend | Supabase (login e-mail/senha + RLS), cadastro desativado após criar a conta |
| Código / deploy | Repo **público** na org `coppiindustrial`, publicado no **GitHub Pages** |
| Usuários | Só você |
| Offline | Offline-first: grava no aparelho e sincroniza depois |
| Cartões | Nubank (vence dia 13) e XP (vence dia 10), importando o **CSV original** do banco. Inter: só histórico |
| Extrato bancário | Fase futura. Até lá, gastos fora do cartão são manuais |
| Mês do gasto no cartão | **Mês da fatura** (vencimento) |
| Parcelas | Projetar parcelas futuras (comprometido por mês) |
| Categorias | Grupo + categoria. Amazon e Mercado Livre continuam como categoria |
| Entradas | Todas contam igual (salário, comissão, VA, FGTS) |
| Extras | Saldo das contas + investimentos/patrimônio |
| Migração | Todo o histórico da planilha |
| Tela inicial | Resumo do mês |

## 2. Arquitetura

```
Celular / PC (navegador ou app instalado – PWA)
 ├─ React 19 + TypeScript + Vite 8
 ├─ IndexedDB (Dexie)  ← fonte da verdade local, funciona offline
 └─ sync.ts ──(HTTPS)──► Supabase
                          ├─ Auth (só a sua conta)
                          └─ tabela public.records (jsonb, RLS por usuário)
Deploy: GitHub Actions → GitHub Pages
```

**Base = app de treino**, copiando e adaptando:
- Estrutura Vite + TS + `vite-plugin-pwa` (manifest, ícones, auto-update), `HashRouter`.
- Camada de dados `db.ts` (Dexie com flag `dirty`), `sync.ts` (push/pull incremental por `synced_at`) e `supabase.ts`.
- `supabase/schema.sql`: **a mesma tabela genérica `records`** (cada tabela local vira um `kind`). O schema do Supabase quase não muda quando o app evolui, e o sync já está testado.
- Componentes: `Layout` (TabBar, TopBar), `Sheet`, `SwipeRow`, `Dialogs`, `ActionMenu`, `Pickers`, `ErrorBoundary`, `Charts`; os helpers de data de `format.ts`; `backup.ts`; os tokens de tema de `styles.css`.

**Do Gestor Coppi:**
- `formatBRL` e `brlCurto` (adaptados para centavos).
- `exportCsv.js` (CSV no padrão do Excel, para exportar lançamentos).
- `NumeroKpi`, `GraficoSerie`, `BalaoGrafico`, `CurvaPareto`.
- A ideia de filtro de período.
- Convenções: datas-só-data tratadas como texto `AAAA-MM-DD`; nunca logar valores financeiros.

**Layout responsivo:** mobile-first com abas embaixo. Em telas largas (PC), as abas viram uma barra lateral e as listas ganham colunas extras, porque a importação de faturas tende a ser feita no PC.

**Segurança com repo público:** nenhum segredo no código. A chave anon do Supabase é pública por design; a proteção vem do login + RLS + cadastro desativado.

**Ponto de atenção:** o Supabase grátis **pausa o projeto depois de 7 dias sem acesso**. Como o app é offline-first, nada se perde, e basta reativar no painel. Mesmo assim, terá exportação de backup (JSON) e CSV.

## 3. Modelo de dados

Valores sempre em **centavos (inteiro, positivo)**. A direção vem do campo `tipo`, o que evita erro de arredondamento. Datas como texto `AAAA-MM-DD` e competência como `AAAA-MM`. Todo registro tem `id`, `updatedAt`, `deleted` e `dirty` (padrão do sync).

| Tabela | Campos principais | Observações |
|---|---|---|
| `grupos` | nome, tipo (`saida`/`entrada`), ordem, cor | Ex.: Alimentação, Casa, Transporte, Saúde, Lazer, Compras, Renda |
| `categorias` | grupoId, nome, ordem, ativa | As 36 atuais, organizadas em grupos (+ categorias de entrada: Salário, Comissão, VA, FGTS) |
| `regras` | palavraChave, categoriaId, prioridade | As 250 atuais. A primeira que bate (por prioridade) classifica, igual à planilha |
| `cartoes` | nome, diaVencimento, formato (`nubank`/`xp`), ativo | Nubank, XP, Inter (inativo) |
| `faturas` | cartaoId, vencimento, competencia, arquivo, hashArquivo, totalCentavos, importadaEm | Uma por cartão+vencimento. Reimportar = aviso + opção de substituir |
| `lancamentos` | tipo (`saida`/`entrada`), origem (`cartao`/`fixo`/`manual`/`entrada`), data, competencia, descricao, estabelecimento, valorCentavos, categoriaId, faturaId, parcelaAtual, parcelaTotal, portador, recorrenciaId, revisar, obs | Tabela central. Equivale à aba **Base** |
| `recorrencias` | descricao, categoriaId, valorPadraoCentavos, diaDoMes, inicio, fim, ativa | Os gastos fixos: luz, internet, condomínio, empregada, personal |
| `contas` | nome, tipo (`corrente`/`investimento`/`reserva`/`outro`), instituicao, ativa | Para patrimônio |
| `saldos` | contaId, data, valorCentavos | Foto do saldo informada por você. Gera a evolução do patrimônio |

**Regras de cálculo:**
- **Competência:** cartão = mês do vencimento da fatura; manual/fixo/entrada = mês da data.
- **Classificação:** na importação, cada linha passa pelas regras; sem regra = `revisar = true`. Ao criar uma regra a partir de uma pendência, ela é aplicada a todas as pendências iguais.
- **Parcelas futuras:** calculadas na hora, sem gravar nada. Para cada linha "3 de 10" da **fatura mais recente** de cada cartão, projeta as parcelas 4..10 nos meses seguintes. Quando a próxima fatura chega, a projeção se ajusta sozinha.
- **Fixos:** no início de cada mês, o app sugere os lançamentos das recorrências ativas com o valor padrão, e você confirma ou ajusta (luz e condomínio variam).
- **Resultado do mês** = entradas − (cartão + fixo + manual) da competência.

## 4. Telas

Abas: **Resumo · Lançamentos · ＋ · Patrimônio · Mais**

- **Resumo (inicial):** seletor de mês. Mostra:
  - entradas, gastos e saldo do mês;
  - comparação com a média dos últimos 3 meses;
  - gastos por origem (cartão/fixo/outros);
  - top grupos e categorias;
  - parcelas já comprometidas nos próximos meses;
  - pendências a revisar e fixos ainda não lançados.
- **Lançamentos:** lista do mês com busca e filtros (origem, categoria, cartão). Toque para editar, deslize para excluir.
- **＋ Lançar:** formulário rápido de gasto ou entrada, pensado para uso com uma mão no celular.
- **Patrimônio:** contas com o último saldo, total e gráfico de evolução; registrar saldo novo.
- **Mais:**
  - Importar fatura;
  - Revisar pendências;
  - Gastos fixos;
  - Categorias e grupos;
  - Regras;
  - Cartões;
  - Evolução mensal (entradas × gastos);
  - Backup/Exportar CSV;
  - Conta e sincronização.

## 5. Estrutura de pastas

```
meus-gastos/
├─ CLAUDE.md                 contexto do projeto para as próximas sessões
├─ supabase/schema.sql       tabela records + RLS (copiada do app de treino)
├─ scripts/migrar-planilha.mjs   lê o .xlsx e gera um backup JSON importável
├─ src/
│  ├─ lib/       db.ts, sync.ts, supabase.ts, dinheiro.ts, datas.ts, classificar.ts,
│  │             parcelas.ts, resumo.ts, backup.ts, exportCsv.ts
│  │  └─ importadores/  detectar.ts, nubank.ts, xp.ts
│  ├─ repo/      funções de leitura/gravação por tabela
│  ├─ screens/   Resumo, Lancamentos, LancamentoForm, Importar, Pendencias, Fixos,
│  │             Categorias, Regras, Cartoes, Patrimonio, Evolucao, Ajustes
│  └─ components/  (do app de treino) + Kpi, BarrasCategoria, GraficoMensal
└─ .github/workflows/deploy.yml
```

Nomes do domínio em português (`lancamento`, `competencia`), como no Gestor Coppi; UI em português. Testes com **Vitest** só na lógica que pode errar sem ninguém ver: importadores, competência, parcelas, classificação e resumo.

## 6. Plano por fases

Cada fase termina com algo usável e é revisada antes da próxima.

| Fase | Entrega | Pronto quando |
|---|---|---|
| **0. Fundação** | Projeto criado a partir do app de treino; projeto Supabase + schema; repo + deploy no Pages; login; CLAUDE.md | App vazio abre no PC e instala no celular, com login e sync funcionando |
| **1. Lançamentos manuais** | Grupos/categorias, cartões, lançar gasto/entrada, lista do mês com filtros, editar/excluir | Você consegue lançar e ver gastos pelo celular, inclusive offline |
| **2. Migração da planilha** | Script que converte o xlsx em backup JSON + tela de importar backup | Todo o histórico aparece no app, e os totais por arquivo de fatura, fixos, manuais e entradas batem com a planilha |
| **3. Importar faturas** | Leitores Nubank/XP (CSV original), detecção de fatura duplicada, classificação por regras, tela de pendências, criar regra a partir de pendência, editar regras | Importar uma fatura nova leva menos de 1 minuto e não deixa nada sem categoria |
| **4. Resumo do mês** | Dashboard completo, parcelas futuras, evolução mensal, exportar CSV | Substitui o Dashboard da planilha |
| **5. Gastos fixos** | Recorrências + sugestão mensal | Fixos do mês lançados com 1 toque cada |
| **6. Patrimônio** | Contas, saldos, gráfico de evolução | Você vê seu patrimônio mês a mês |
| **Futuro** | Importar extrato da conta corrente (OFX/CSV) | — |

**Dependência:** a fase 3 precisa de **um CSV original, sem converter, de cada banco** (Nubank e XP).

## 7. Pontos em aberto

1. **Projeto Supabase:** criar um projeto novo só para os gastos (recomendado: isola os dados do app de treino; o plano grátis permite 2 projetos ativos) ou usar o mesmo do treino?
2. **Grupos de categorias:** na fase 1 eu proponho a lista de grupos com cada categoria encaixada, para você ajustar.

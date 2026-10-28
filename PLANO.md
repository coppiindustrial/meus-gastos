# Meus Gastos — Arquitetura, modelo de dados e plano por fases

> Status: **aprovado** (2026-10-27), **revisado em 2026-10-27**: o uso é no **computador** (sistema web
> no padrão do Gestor Coppi); o celular só **visualiza**. Online, sem cópia offline.
> Fase 0 concluída. **Fase 1 pronta (2026-10-27)**: categorias e grupos (com a estrutura sugerida), cartões,
> lançamentos do mês (tabela no PC, lista no celular, filtros, novo/editar/excluir).
> **Fase 2 concluída (2026-10-27)**: histórico importado (12 faturas/962 linhas de cartão, 21 fixos, 12 manuais,
> 24 entradas, 249 regras); conferência por fatura 100% e julho idêntico ao Dashboard da planilha (R$ 17.017,80).
> **Fase 3 pronta (2026-10-27)**: importar fatura (CSV original do Nubank `date,title,amount` e o da XP
> `Data;Estabelecimento;Portador;Valor;Parcela`), fatura repetida só substituindo, classificação com os curingas do
> Excel, pendências com "criar regra", tela de regras. Os 13 CSVs reais batem com a planilha (linhas, total, categoria, parcela).
> **Fase 4 pronta (2026-10-27)**: Resumo do mês (KPIs, média de 3 meses, grupos/categorias, origem, parcelas
> comprometidas, 12 meses), Evolução mensal com tabela e CSV, CSV dos lançamentos. Contas nas views `resumo_mensal` e
> `parcelas_futuras` (migration 003). Conferido: totais = planilha; parcelas de set/26 = R$ 4.380,04 pelo cálculo direto.
> **Fase 5 pronta (2026-10-27)**: Gastos fixos — cadastro (6 criados do histórico, com os 21 lançamentos antigos
> ligados), fixos do mês com valor sugerido (o do último mês) e "Lançar"; um por mês (migration 004); aviso no Resumo.
> **Fase 6 pronta (2026-10-27)**: Patrimônio — contas, "Registrar saldos" (uma data, um campo por conta, já com o
> último valor), total por tipo, evolução mensal (o último saldo vale até a próxima foto), histórico por conta.
> **Todas as fases do plano concluídas.**
> **Extrato da conta (2026-10-27)**: CSV do extrato do Nubank; entradas continuam à mão; fatura, investimentos e
> transferências entre contas próprias (regra de ignorar) ficam de fora; pagamento de fixo vira o fixo do mês com o
> valor real; o resto entra como avulso (sem regra → Revisar pendências). Migration 005.
> No ar em https://coppiindustrial.github.io/meus-gastos/ (repo `coppiindustrial/meus-gastos`, Supabase `abofajutoxukbvrfisem`).
> Substitui a planilha `OneDrive\CONTAS\Gastos\Gastos total.xlsx`.

## 1. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Uso | **Preencher tudo no computador**; no celular, só visualizar (atalho na tela inicial) |
| Visual | **Igual ao Gestor Coppi**: barra lateral, tabelas, painéis laterais, tema claro/escuro |
| Backend | Supabase (login e-mail/senha + RLS), cadastro desativado após criar a conta |
| Dados | **Só online**: tabelas reais no Postgres do Supabase, sem cópia local |
| Código / deploy | Repo **público** `coppiindustrial/meus-gastos`, publicado no **GitHub Pages** |
| Usuários | Só você |
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
Navegador (PC para lançar · celular para ver)
 └─ React 18 + Vite + Tailwind (JS, padrão do Gestor Coppi)
     └─ supabase-js ──(HTTPS)──► Supabase
                                  ├─ Auth (só a sua conta)
                                  ├─ Postgres: tabelas com RLS por usuário
                                  └─ VIEWs para os totais (resumo do mês, parcelas)
Deploy: GitHub Actions → GitHub Pages
```

**Do Gestor Coppi** (copiado e adaptado): Tailwind com o sistema de tema claro/escuro (`tema/`, `npm run tema`,
`varCor`), `index.css`, barra lateral (`Layout.jsx`, sem sino/busca/atalhos), `Modal`, `SidePanel`, `Tooltip`,
`CabecalhoPagina`, `Spinner`, `ListaVazia`, ícones, contexts de Toast e Confirmação, `storage.js`, `useEscape`,
`format.js`, `exportCsv.js`; a partir da fase 1 o molde de tabela TanStack e a faixa de filtros; na fase 4 os
gráficos SVG e KPIs.

**Regra de ouro (do Gestor): a lógica de negócio mora nas VIEWs SQL** (totais por competência, parcelas
comprometidas), e o front só lê.

**Celular:** abaixo de 768px a barra lateral vira um menu que abre por cima (botão ☰). Página com
`manifest` e ícones para "Adicionar à Tela de Início" (sem service worker: sempre a versão mais nova).

**Migrations:** arquivos `supabase/migrations/NNN_nome.sql`, append-only como no Gestor. Aplicados colando no
SQL Editor do Supabase.

**Segurança com repo público:** nenhum segredo no código. A chave publishable do Supabase é pública por design;
a proteção vem do login + RLS + cadastro desativado. VIEWs com `security_invoker = on` para respeitarem o RLS.

**Ponto de atenção:** o Supabase grátis **pausa o projeto depois de 7 dias sem acesso** (reativa no painel, sem
perda). Exportação CSV dos lançamentos como cópia de segurança.

## 3. Modelo de dados (Postgres)

Toda tabela tem `id uuid`, `user_id uuid default auth.uid()` (RLS: só o dono lê e grava), `criado_em` e
`atualizado_em`. Valores em **centavos (`bigint`, positivo)**; a direção vem de `tipo`. Competência é `date`
no dia 1 do mês (o front mostra `AAAA-MM`).

| Tabela | Campos principais | Observações |
|---|---|---|
| `grupos` | nome, tipo (`saida`/`entrada`), ordem, cor | Ex.: Alimentação, Casa, Transporte, Saúde, Lazer, Compras, Renda |
| `categorias` | grupo_id, nome, ordem, ativa | As 36 atuais em grupos (+ entradas: Salário, Comissão, VA, FGTS) |
| `regras` | palavra_chave, categoria_id, prioridade | As 250 atuais. A primeira que bate (menor prioridade) classifica |
| `cartoes` | nome, dia_vencimento, formato (`nubank`/`xp`/`manual`), ativo | Nubank, XP, Inter (inativo) |
| `faturas` | cartao_id, vencimento, competencia, arquivo, hash_arquivo, total_centavos, importada_em | Uma por cartão+vencimento |
| `lancamentos` | tipo, origem (`cartao`/`fixo`/`manual`/`entrada`), data, competencia, descricao, estabelecimento, valor_centavos, categoria_id, fatura_id, cartao_id, parcela_atual, parcela_total, portador, recorrencia_id, revisar, obs | Tabela central (a aba **Base**). Apagar a fatura apaga as linhas dela |
| `recorrencias` | descricao, categoria_id, valor_padrao_centavos, dia_do_mes, inicio, fim, ativa | Gastos fixos |
| `fixos_pulados` | recorrencia_id, competencia | O mês em que o fixo "não teve" (migration 006): sai das pendências |
| `importacoes` | tipo, cartao_id, fatura_id, competencia, periodo_de/ate, arquivo, linhas, resumo, desfazer | O histórico de importações da tela Importar (migration 007) |
| `contas` | nome, tipo (`corrente`/`investimento`/`reserva`/`outro`), instituicao, ativa | Patrimônio |
| `saldos` | conta_id, data, valor_centavos | Foto do saldo numa data |

**Regras de cálculo:**
- **Competência:** cartão = mês do vencimento da fatura; manual/fixo/entrada = mês da data.
- **Classificação:** na importação, cada linha passa pelas regras; sem regra = `revisar = true`. Criar uma regra a partir de uma pendência aplica a todas as pendências iguais.
- **Parcelas futuras:** calculadas (VIEW), sem gravar nada: para cada "3 de 10" da **fatura mais recente** de cada cartão, projeta 4..10 nos meses seguintes.
- **Fixos:** no início do mês o app sugere os lançamentos das recorrências ativas; você confirma ou ajusta.
- **Resultado do mês** = entradas − (cartão + fixo + manual) da competência.

## 4. Telas (barra lateral)

- **Resumo** (inicial): seletor de mês; entradas, gastos e saldo; comparação com a média de 3 meses; gastos por origem; top grupos e categorias; parcelas comprometidas; pendências e fixos não lançados.
- **Lançamentos:** tabela do mês com busca, filtros (origem, categoria, cartão) e ordenação; novo/editar em painel lateral; exportar CSV.
- **Faturas:** importar fatura (CSV original), lista de faturas importadas, revisar pendências.
- **Gastos fixos** · **Patrimônio** (contas, saldos, evolução) · ~~Evolução mensal~~ (28/10/2026: virou a ampliação do
  "Entradas × gastos" da Visão geral, com a tabela completa e "Todo o histórico").
- **Cadastros:** categorias e grupos, regras, cartões.
- Rodapé: usuário, tema (claro/escuro/sistema), sair.

No celular as mesmas telas, em modo leitura confortável (tabelas viram listas onde fizer sentido).

## 5. Estrutura de pastas

```
meus-gastos/
├─ CLAUDE.md · PLANO.md
├─ supabase/migrations/   001_inicial.sql, ...
├─ scripts/               tema.mjs (do Gestor), migrate.mjs, migrar-planilha.mjs (fase 2)
├─ tema/                  cores.json + escuro.mjs (do Gestor)
├─ src/
│  ├─ api/        supabase.js + uma camada por tabela (lancamentos.js, categorias.js…)
│  ├─ context/    AuthContext (Supabase), ToastContext, ConfirmContext
│  ├─ lib/        dinheiro.js, format.js, storage.js, tema.js, navegacao.js, useEscape.js…
│  ├─ components/ Layout, Modal, SidePanel, Tooltip, … (do Gestor)
│  └─ pages/      Resumo, Lancamentos, Faturas, Fixos, Patrimonio, Cadastros…
└─ test/          node:test (lógica: dinheiro, competência, importadores, parcelas)
```

Nomes, comentários e UI em português, como no Gestor.

## 6. Plano por fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| **0. Fundação** | Base no padrão do Gestor; tabelas + RLS no Supabase; login; barra lateral (e menu no celular); deploy | App abre no PC e no celular, com login, e as tabelas existem |
| **1. Lançamentos manuais** | Grupos/categorias, cartões, lançar gasto/entrada, tabela do mês com filtros, editar/excluir | Você lança e edita gastos no PC e vê no celular |
| **2. Migração da planilha** | Script que lê o xlsx e grava no Supabase | Todo o histórico aparece, e os totais por fatura, fixos, manuais e entradas batem com a planilha |
| **3. Importar faturas** | Leitores Nubank/XP (CSV original), fatura duplicada, regras, pendências, criar regra a partir de pendência | Importar uma fatura leva menos de 1 minuto e não deixa nada sem categoria |
| **4. Resumo do mês** | Dashboard completo, parcelas futuras, evolução mensal, exportar CSV | Substitui o Dashboard da planilha |
| **5. Gastos fixos** | Recorrências + sugestão mensal | Fixos do mês lançados com 1 clique cada |
| **6. Patrimônio** | Contas, saldos, gráfico de evolução | Você vê seu patrimônio mês a mês |
| **Futuro** | Importar extrato da conta corrente (OFX/CSV) | — |

**Dependência:** a fase 3 precisa de **um CSV original, sem converter, de cada banco** (Nubank e XP).

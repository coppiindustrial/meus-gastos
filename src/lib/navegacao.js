// O CATÁLOGO DAS TELAS: a barra lateral (e o menu do celular) leem daqui. Tela nova entra aqui e no
// `App.jsx`. `fase` marca as telas que ainda não existem (ver PLANO.md): aparecem esmaecidas.
import { SbChart, SbCompass, SbDashboard, SbFinanceiro, SbImportar } from '../components/sidebarIcons.jsx';

export const DASHBOARD = { to: '/', label: 'Visão geral', icon: SbDashboard, end: true };
// IMPORTAR (28/10/2026): o lugar único de tudo o que se importa — as faturas, o extrato e o histórico da
// planilha saíram dos grupos. O NÚMERO AO LADO (`contador`, de `useContadores`) é o que ainda pede a pessoa
// depois de importar — aqui, o que falta importar; `dica` diz o que ele conta.
export const IMPORTAR = { to: '/importar', label: 'Importar', icon: SbImportar, contador: 'importar', dica: 'a importar' };
// Os itens soltos, no topo, antes dos grupos. O IMPORTAR foi para dentro de Cadastros (02/11/2026, a pedido), com o
// mesmo número do que falta importar.
export const SOLTOS = [DASHBOARD];

export const GRUPOS = [
  {
    label: 'Movimentação',
    icon: SbFinanceiro,
    items: [
      { to: '/lancamentos', label: 'Lançamentos' },
      { to: '/fixos', label: 'Gastos fixos', contador: 'fixos', dica: 'a lançar' },
      // As FATURAS saíram do menu (29/10/2026): cada uma está no Importar (aba Por mês, com o ↗ para os lançamentos
      // do mês; o "Desfazer" no Histórico), e o grupo "Cartões" ficou só com isto.
      { to: '/pendencias', label: 'Revisar pendências', contador: 'revisar', dica: 'a revisar' },
    ],
  },
  {
    label: 'Cadastros',
    icon: SbCompass,
    items: [
      { to: '/cadastros/categorias', label: 'Categorias e grupos' },
      { to: '/cadastros/cartoes', label: 'Cartões' },
      { to: '/cadastros/regras', label: 'Regras de classificação' },
      { to: '/cadastros/modelos', label: 'Modelos de importação' },
      { to: IMPORTAR.to, label: IMPORTAR.label, contador: IMPORTAR.contador, dica: IMPORTAR.dica },
    ],
  },
  // O PATRIMÔNIO NO FIM (02/11/2026, a pedido): depois dos cadastros, o último item da barra.
  {
    label: 'Análises',
    icon: SbChart,
    items: [
      { to: '/patrimonio', label: 'Patrimônio' },
    ],
  },
];

// Todas as telas numa lista só (para as rotas provisórias).
export const TELAS = GRUPOS.flatMap((g) => g.items);

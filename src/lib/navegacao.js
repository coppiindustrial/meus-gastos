// O CATÁLOGO DAS TELAS: a barra lateral (e o menu do celular) leem daqui. Tela nova entra aqui e no
// `App.jsx`. `fase` marca as telas que ainda não existem (ver PLANO.md): aparecem esmaecidas.
import { SbChart, SbCompass, SbDashboard, SbFinanceiro, SbImportar } from '../components/sidebarIcons.jsx';

export const DASHBOARD = { to: '/', label: 'Visão geral', icon: SbDashboard, end: true };
// IMPORTAR (28/10/2026): o lugar único de tudo o que se importa — as faturas, o extrato e o histórico da
// planilha saíram dos grupos. O número ao lado (`contador: 'importar'`) é o que falta importar.
export const IMPORTAR = { to: '/importar', label: 'Importar', icon: SbImportar, contador: 'importar' };
// Os itens soltos, no topo, antes dos grupos.
export const SOLTOS = [DASHBOARD, IMPORTAR];

export const GRUPOS = [
  {
    label: 'Movimentação',
    icon: SbFinanceiro,
    items: [
      { to: '/lancamentos', label: 'Lançamentos' },
      { to: '/fixos', label: 'Gastos fixos' },
      // As FATURAS saíram do menu (29/10/2026): cada uma está no Importar (aba Por mês, com o ↗ para os lançamentos
      // do mês; o "Desfazer" no Histórico), e o grupo "Cartões" ficou só com isto.
      { to: '/pendencias', label: 'Revisar pendências' },
    ],
  },
  {
    label: 'Análises',
    icon: SbChart,
    items: [
      { to: '/patrimonio', label: 'Patrimônio' },
    ],
  },
  {
    label: 'Cadastros',
    icon: SbCompass,
    items: [
      { to: '/cadastros/categorias', label: 'Categorias e grupos' },
      { to: '/cadastros/cartoes', label: 'Cartões' },
      { to: '/cadastros/regras', label: 'Regras de classificação' },
    ],
  },
];

// Todas as telas numa lista só (para as rotas provisórias).
export const TELAS = GRUPOS.flatMap((g) => g.items);

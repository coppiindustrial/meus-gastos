// O CATÁLOGO DAS TELAS: a barra lateral (e o menu do celular) leem daqui. Tela nova entra aqui e no
// `App.jsx`. `fase` marca as telas que ainda não existem (ver PLANO.md): aparecem esmaecidas.
import { SbChart, SbCompass, SbDashboard, SbDoc, SbFinanceiro } from '../components/sidebarIcons.jsx';

export const DASHBOARD = { to: '/', label: 'Resumo do mês', icon: SbDashboard };

export const GRUPOS = [
  {
    label: 'Movimentação',
    icon: SbFinanceiro,
    items: [
      { to: '/lancamentos', label: 'Lançamentos' },
      { to: '/fixos', label: 'Gastos fixos' },
    ],
  },
  {
    label: 'Cartões',
    icon: SbDoc,
    items: [
      { to: '/faturas', label: 'Faturas' },
      { to: '/pendencias', label: 'Revisar pendências' },
    ],
  },
  {
    label: 'Análises',
    icon: SbChart,
    items: [
      { to: '/evolucao', label: 'Evolução mensal' },
      { to: '/patrimonio', label: 'Patrimônio', fase: 6 },
    ],
  },
  {
    label: 'Cadastros',
    icon: SbCompass,
    items: [
      { to: '/cadastros/categorias', label: 'Categorias e grupos' },
      { to: '/cadastros/cartoes', label: 'Cartões' },
      { to: '/cadastros/regras', label: 'Regras de classificação' },
      { to: '/cadastros/importar', label: 'Importar histórico' },
    ],
  },
];

// Todas as telas numa lista só (para as rotas provisórias).
export const TELAS = GRUPOS.flatMap((g) => g.items);

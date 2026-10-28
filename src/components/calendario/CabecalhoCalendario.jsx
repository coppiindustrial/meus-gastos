import { useState } from 'react';
import { IconSeta } from '../icons.jsx';

// COPIADO DO GESTOR COPPI (`components/calendario/CabecalhoCalendario.jsx`, 28/10/2026). Diferença: os
// estilos (`SETA`, `CELULA`, `GATILHO`) e `inicioPagina` são exportados — o `CalendarioMes` daqui os usa.
//
// Peças COMPARTILHADAS dos dois calendários do app (`CalendarioData` e `CalendarioIntervalo`).
// Antes destas linhas os dois arquivos repetiam ~40 linhas byte a byte: MESES, DIAS, isoOf,
// parseISO, buildGrid, o estado `cursor`, o `irMes` e o cabeçalho inteiro. O seletor de mês/ano
// seria a 41ª — daí a extração, no molde de `components/cards/pecas.jsx` (helpers e componente no
// mesmo arquivo, sem contexto de React exigido).

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export const isoOf = (d) => d.toLocaleDateString('en-CA'); // yyyy-mm-dd local
export function parseISO(iso) { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); }

// 42 células (6 semanas) começando no domingo da semana do dia 1. O número é FIXO de propósito: é
// o que mantém a altura do calendário constante em qualquer mês — e, agora, é o que deixa o painel
// de mês/ano casar essa altura sem o popover pular ao abrir.
// O `date` vinha só na cópia do CalendarioIntervalo; entregar sempre não custa nada e evita que as
// duas versões voltem a divergir.
export function buildGrid(ano, mes) {
  const first = new Date(ano, mes, 1);
  const start = new Date(ano, mes, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return { date: d, iso: isoOf(d), dia: d.getDate(), out: d.getMonth() !== mes };
  });
}

export const ANOS_POR_PAGINA = 12;
// Primeiro ano da página que contém `ano`, ancorada em múltiplos de 12 a partir de 2000 — assim a
// mesma página aparece sempre com os mesmos 12 anos, em vez de deslizar conforme onde se entrou.
export const inicioPagina = (ano) => 2000 + Math.floor((ano - 2000) / ANOS_POR_PAGINA) * ANOS_POR_PAGINA;

export const SETA = 'h-[22px] w-[22px] inline-flex items-center justify-center rounded text-[12px] text-gray-400 hover:bg-gray-100 hover:text-gray-700';
// Alvo do painel: 3 colunas dentro dos 204px úteis (226 − 11 de padding × 2) dão ~66px por célula.
export const CELULA = 'text-[11px] capitalize rounded-md py-[5px] transition';
export const GATILHO = 'inline-flex items-center gap-1 rounded px-[7px] py-px text-[12.5px] font-semibold text-gray-800 transition-colors hover:bg-gray-100';

// Cabeçalho + navegação do calendário, com MÊS e ANO como dois gatilhos independentes — cada um
// abre o próprio seletor direto (sem passar um pelo outro).
//
// A grade de dias entra como `children` e é SUBSTITUÍDA pelo painel enquanto ele está aberto, em
// vez de o painel se sobrepor com `absolute`: os dois calendários têm rodapés de alturas diferentes
// (e o de intervalo ainda tem dois campos acima do cabeçalho), então qualquer `inset` fixo daria
// certo num e errado no outro.
//
// Três restrições que este desenho respeita, e que valem para os 18 pontos de uso do calendário:
//
//  1. NADA de portal. Todo consumidor fecha o calendário testando `contains(e.target)` na própria
//     ref; um painel portado ao body cairia fora dela e o primeiro clique num mês fecharia o
//     calendário inteiro antes de a escolha valer.
//  2. NADA rola. Duas telas (FiltroPeriodo.jsx e Custos.jsx) fecham o popover a QUALQUER evento de
//     rolagem capturado, sem a guarda "ignore se foi dentro do menu" que os outros popovers têm —
//     então a lista de anos é uma GRADE paginada, e não uma lista com barra de rolagem.
//  3. `type="button"` em tudo: quatro consumidores vivem dentro de <form> e um clique sem isso
//     submeteria o formulário.
export default function CabecalhoCalendario({ cursor, setCursor, children }) {
  const [painel, setPainel] = useState(null); // null | 'mes' | 'ano'
  const [paginaAno, setPaginaAno] = useState(() => inicioPagina(cursor.ano));

  const irMes = (delta) => setCursor((c) => {
    const d = new Date(c.ano, c.mes + delta, 1); return { ano: d.getFullYear(), mes: d.getMonth() };
  });

  // Cada gatilho abre o PRÓPRIO painel direto — sem passar pelo outro. Clicar de novo no mesmo
  // gatilho alterna e fecha, como o resto dos popovers do app.
  const abrirMes = () => setPainel((p) => (p === 'mes' ? null : 'mes'));
  const abrirAno = () => {
    setPainel((p) => {
      if (p === 'ano') return null;
      setPaginaAno(inicioPagina(cursor.ano));
      return 'ano';
    });
  };

  // Escape fecha SÓ o painel. Sem o `stopPropagation` ele subiria para os listeners de `document`
  // de três consumidores e fecharia o calendário junto — o usuário perderia os dois de uma vez.
  const onKeyDown = (e) => {
    if (e.key !== 'Escape' || !painel) return;
    e.stopPropagation();
    setPainel(null);
  };

  const anos = Array.from({ length: ANOS_POR_PAGINA }, (_, i) => paginaAno + i);
  // As setas do topo trocam de dono conforme o painel aberto: sem painel andam o MÊS (irMes); no
  // painel de ano paginam de 12 em 12; no painel de mês elas somem — a grade ali já é o alvo direto
  // do clique, não há o que as setas andariam.
  const passo = painel === 'ano' ? (d) => setPaginaAno((p) => p + d * ANOS_POR_PAGINA) : irMes;

  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between mb-1">
        <button type="button" onClick={() => passo(-1)} aria-label="Anterior"
          className={`${SETA} ${painel === 'mes' ? 'invisible' : ''}`}>‹</button>
        <span className="inline-flex items-center gap-0.5">
          <button type="button" onClick={abrirMes} aria-expanded={painel === 'mes'} aria-haspopup="true"
            className={`${GATILHO} capitalize ${painel === 'mes' ? 'bg-gray-200' : ''}`}>
            {MESES[cursor.mes]}
            <IconSeta className={`opacity-60 transition-transform duration-200 ease-out ${painel === 'mes' ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={abrirAno} aria-expanded={painel === 'ano'} aria-haspopup="true"
            className={`${GATILHO} tabular-nums ${painel === 'ano' ? 'bg-gray-200' : ''}`}>
            {cursor.ano}
            <IconSeta className={`opacity-60 transition-transform duration-200 ease-out ${painel === 'ano' ? 'rotate-180' : ''}`} />
          </button>
        </span>
        <button type="button" onClick={() => passo(1)} aria-label="Próximo"
          className={`${SETA} ${painel === 'mes' ? 'invisible' : ''}`}>›</button>
      </div>

      {painel === null && children}

      {painel === 'mes' && (
        // `min-h` casa a altura da grade de dias — 194px MEDIDOS no navegador (a grade tem sempre
        // 42 células, então o número não varia com o mês). Sem isso o popover encolhe ao abrir o
        // painel e o calendário "pula" debaixo do cursor.
        <div className="grid min-h-[194px] grid-cols-3 gap-1">
          {MESES_CURTOS.map((m, i) => (
            <button key={m} type="button"
              onClick={() => { setCursor((c) => ({ ...c, mes: i })); setPainel(null); }}
              className={`${CELULA} ${i === cursor.mes ? 'bg-gray-800 font-semibold text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              {m}
            </button>
          ))}
        </div>
      )}

      {painel === 'ano' && (
        <div className="grid min-h-[194px] grid-cols-3 gap-1">
          {anos.map((a) => (
            <button key={a} type="button"
              onClick={() => { setCursor((c) => ({ ...c, ano: a })); setPainel(null); }}
              className={`${CELULA} tabular-nums ${a === cursor.ano ? 'bg-gray-800 font-semibold text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

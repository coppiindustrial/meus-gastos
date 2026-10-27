import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { temaEscuro, SELETOR_ESCURO } from './tema/escuro.mjs';

// Caminhos absolutos (independentes do diretório de execução).
const dir = path.dirname(fileURLToPath(import.meta.url));

const BRAND = {
  50: '#eff6ff',
  100: '#dbeafe',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
};
// O MODO ESCURO (tema/escuro.mjs): toda cor vira uma variável com a de hoje como fallback, e só o
// `data-tema="escuro"` no <html> define as versões escuras. `tema/cores.json` é gerado pelo `npm run tema`.
const CORES = JSON.parse(fs.readFileSync(path.join(dir, 'tema', 'cores.json'), 'utf8'));
const TEMA = temaEscuro(CORES, { brand: BRAND });

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', SELETOR_ESCURO],
  content: [
    path.join(dir, 'index.html'),
    path.join(dir, 'src/**/*.{js,jsx}'),
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      ...TEMA.theme,
      colors: {
        brand: BRAND,
        // Escala neutra (grafite) para o tema moderno.
        ink: {
          50: '#f6f6f7',
          100: '#f1f1f1',
          200: '#e3e3e3',
          300: '#d4d4d4',
          500: '#6b6b6b',
          700: '#4a4a4a',
          800: '#2b2b2b',
          900: '#1a1a1a',
        },
      },
      // Abertura de popovers/menus: aparece subindo de leve, em vez de "piscar" na tela.
      keyframes: {
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(-5px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'backdrop-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // Navegação DENTRO de um painel que não sai da tela (o do sino, que abre as preferências
        // como segunda vista). O deslocamento é de 10px e horizontal: diz "avancei/voltei um
        // nível", que é diferente do `modal-in`, que vem de cima e diz "isto apareceu por cima".
        'vista-avanca': {
          '0%': { opacity: '0', transform: 'translateX(10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'vista-volta': {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        // Saída: o caminho inverso da entrada. Sobe 8px e não 16, e em 130ms contra 180: entrada
        // pode se apresentar, saída não — o que já foi decidido tem de sair de vista rápido.
        // Quem segura o modal montado durante estes 130ms é o próprio Modal.jsx.
        'modal-out': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-8px)' },
        },
        'backdrop-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        // (O `expand-row` das linhas de grupo saiu daqui: keyframe só anima a ENTRADA, e a retração
        // ficava seca. Quem faz as duas pontas é `components/tabela/LinhaExpandida.jsx`, com o par
        // `grid-rows-[0fr]/[1fr]` em transição — o mesmo idioma dos outros colapsos do app.)
        // Entrada dos pontos do gráfico de dispersão (Esfriando ampliado). Anima só opacidade e
        // escala: quem centra o ponto na coordenada é o wrapper (com `-translate-x/y-1/2`), e quem
        // esmaece os pontos fora do recorte também — se a opacidade do recorte estivesse no MESMO
        // elemento, o `fill-mode: both` desta animação a sobrescreveria com o 1 do último quadro.
        'dot-in': {
          '0%': { opacity: '0', transform: 'scale(0.4)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // Barras que crescem da esquerda (faixas, responsáveis, canais). Exige `origin-left`.
        'bar-in': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        // Barra FLUTUANTE que sobe do rodapé (seleção em massa, modo de edição do dashboard).
        // Sobe 10px em vez dos 16 do modal: ela nasce perto de onde já está, e um percurso maior
        // faria uma barra pequena parecer que veio de fora da tela.
        'barra-in': {
          '0%': { opacity: '0', transform: 'translate(-50%, 10px)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0)' },
        },
        // Botão flutuante do canto (Personalizar). Sem o -50% da barra: ele não é centrado.
        'flutuante-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // A volta do `flutuante-in`, para o toast de notificação sair em vez de sumir de um quadro
        // para o outro. Mesma regra do `modal-out`: desce 8px e não os 10 da entrada, porque
        // entrada pode se apresentar e saída não — o que já foi lido tem de sair de vista rápido.
        'flutuante-out': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(8px)' },
        },
        // Tooltip: fade + zoom de 95% + deslize de 8px vindo DO LADO DO GATILHO (molde do shadcn:
        // `fade-in-0 zoom-in-95 slide-in-from-top-2`). São duas porque o deslize tem de vir de cima
        // quando o balão abre embaixo e de baixo quando ele vira para cima — o contrário faz a
        // caixa parecer que se afasta do que ela explica.
        // Elas vivem num wrapper INTERNO, nunca no elemento posicionado: este último carrega o
        // `translateX(-50%)`/`translateY(-100%)` do posicionamento, e a animação o sobrescreveria.
        'tooltip-baixo': {
          '0%': { opacity: '0', transform: 'translateY(-8px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'tooltip-cima': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        // O par LATERAL, para o `placement="left"|"right"`: os mesmos 8px e o mesmo zoom de 95%, no
        // eixo X. Vale a regra idêntica à das irmãs — o deslize vem DO LADO DO GATILHO —, então o
        // balão à ESQUERDA entra vindo da direita e o da DIREITA, vindo da esquerda.
        'tooltip-esquerda': {
          '0%': { opacity: '0', transform: 'translateX(8px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'tooltip-direita': {
          '0%': { opacity: '0', transform: 'translateX(-8px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.15s ease-out',
        'modal-in': 'modal-in 0.18s ease-out',
        'backdrop-in': 'backdrop-in 0.15s ease-out',
        'vista-avanca': 'vista-avanca 0.19s ease-out',
        'vista-volta': 'vista-volta 0.19s ease-out',
        // `forwards`: sem ele o último quadro seria descartado e a caixa PISCARIA de volta ao
        // opaco no intervalo entre o fim da animação e o desmonte.
        'modal-out': 'modal-out 0.13s ease-in forwards',
        'backdrop-out': 'backdrop-out 0.13s ease-in forwards',
        'dot-in': 'dot-in 0.35s ease-out both',
        'bar-in': 'bar-in 0.45s ease-out both',
        'barra-in': 'barra-in 0.18s ease-out',
        'flutuante-in': 'flutuante-in 0.18s ease-out',
        'flutuante-out': 'flutuante-out 0.13s ease-in forwards',
        'tooltip-baixo': 'tooltip-baixo 0.15s ease-out',
        'tooltip-cima': 'tooltip-cima 0.15s ease-out',
        'tooltip-esquerda': 'tooltip-esquerda 0.15s ease-out',
        'tooltip-direita': 'tooltip-direita 0.15s ease-out',
      },
    },
  },
  plugins: [TEMA.plugin],
};

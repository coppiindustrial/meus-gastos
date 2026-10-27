// `npm run tema` — prepara o código para o modo escuro (ver tema/escuro.mjs):
//   1. troca cada classe de hex fixo pelo token equivalente: `bg-[#f4f5f7]` → `bg-hx-f4f5f7`;
//   2. troca o véu dos modais (`bg-black/40`, e o preto cheio) por `bg-veu`, que não clareia;
//   3. grava em tema/cores.json quais hex e quais paletas o código usa — é dessa lista que o
//      tailwind.config.js gera os tokens e as versões escuras.
// No claro nada muda: o token resolve para o MESMO hex. Rodar de novo não faz nada.
// `--simular` só conta, sem gravar.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const simular = process.argv.includes('--simular');

const FAMILIA = {
  bg: 'fundo', from: 'fundo', via: 'fundo', to: 'fundo',
  text: 'texto', fill: 'texto', stroke: 'texto', decoration: 'texto', placeholder: 'texto', caret: 'texto', accent: 'texto',
  border: 'borda', ring: 'borda', 'ring-offset': 'borda', divide: 'borda', outline: 'borda', shadow: 'borda',
};
const UTIL = '(bg|from|via|to|text|fill|stroke|decoration|placeholder|caret|accent|border(?:-[xytrblse])?|ring-offset|ring|divide|outline|shadow)';
const RE_HEX = new RegExp(`(?<![\\w-])${UTIL}-\\[#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\]`, 'g');
const RE_TOKEN = new RegExp(`(?<![\\w-])${UTIL}-hx-([0-9a-f]{6})(?![\\w-])`, 'g');
const RE_PALETA = new RegExp(`(?<![\\w-])${UTIL}-([a-z]+)-(50|100|200|300|400|500|600|700|800|900|950)(?![\\w-])`, 'g');
const RE_VARCOR = /varCor\(\s*['"`]#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})['"`]\s*(?:,\s*['"`](fundo|texto|borda)['"`]\s*)?\)/g;
const RE_VAR = /--t([ftb])-hx-([0-9a-f]{6})\b/g;
// O véu: preto cheio, ou com opacidade de 20% para cima. Abaixo disso é o escurecedor de hover.
const RE_VEU = /(?<![\w-])bg-black(?:\/(\d+|\[[\d.]+\]))?(?![\w-])/g;

const familiaDe = (util) => FAMILIA[util.startsWith('border') ? 'border' : util];
const seis = (h) => (h.length === 3 ? h.split('').map((c) => c + c).join('') : h).toLowerCase();

function arquivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...arquivos(p));
    else if (/\.(jsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const hex = { fundo: new Set(), texto: new Set(), borda: new Set() };
const paletas = new Set();
let trocas = 0; let veus = 0; let mexidos = 0;
for (const arq of arquivos(path.join(raiz, 'src'))) {
  const antes = fs.readFileSync(arq, 'utf8');
  let s = antes.replace(RE_HEX, (_, util, h) => { trocas++; return `${util}-hx-${seis(h)}`; });
  s = s.replace(RE_VEU, (m, a) => {
    if (a === undefined) { veus++; return 'bg-veu'; }
    const n = a.startsWith('[') ? Number(a.slice(1, -1)) * 100 : Number(a);
    if (n < 20) return m;
    veus++; return `bg-veu/${a}`;
  });
  for (const m of s.matchAll(RE_TOKEN)) hex[familiaDe(m[1])].add(m[2]);
  // As cores fora das classes: `varCor('#e5e7eb', 'borda')` (lib/varCor.js) e a variável escrita
  // à mão num valor arbitrário (`shadow-[0_0_0_1px_rgb(var(--tb-hx-e5e7eb,229_231_235))]`).
  for (const m of s.matchAll(RE_VARCOR)) hex[m[2] ?? 'texto'].add(seis(m[1]));
  for (const m of s.matchAll(RE_VAR)) hex[{ f: 'fundo', t: 'texto', b: 'borda' }[m[1]]].add(m[2]);
  for (const m of s.matchAll(RE_PALETA)) paletas.add(m[2]);
  if (s !== antes) { mexidos++; if (!simular) fs.writeFileSync(arq, s); }
}

const cores = {
  paletas: [...paletas].sort(),
  hex: Object.fromEntries(Object.entries(hex).map(([k, v]) => [k, [...v].sort()])),
};
if (!simular) fs.writeFileSync(path.join(raiz, 'tema', 'cores.json'), `${JSON.stringify(cores, null, 2)}\n`);
console.log(`${simular ? '[simulação] ' : ''}${trocas} classes de hex trocadas, ${veus} véus, ${mexidos} arquivos mexidos.`);
console.log(`hex: ${cores.hex.fundo.length} de fundo, ${cores.hex.texto.length} de texto, ${cores.hex.borda.length} de borda · paletas: ${cores.paletas.join(', ')}`);

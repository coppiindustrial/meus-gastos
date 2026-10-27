// O GitHub Pages não conhece as rotas do app (/lancamentos, /faturas…): abrir uma delas direto, ou
// dar F5 nela, cairia num 404 do GitHub. Com uma cópia do index.html como 404.html, o Pages entrega o
// próprio app, e o React Router abre a tela certa pelo endereço.
import { copyFileSync } from 'node:fs';

copyFileSync(new URL('../dist/index.html', import.meta.url), new URL('../dist/404.html', import.meta.url));

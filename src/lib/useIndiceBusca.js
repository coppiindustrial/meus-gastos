import { useEffect, useState } from 'react';
import { EVENTO_DADOS } from '../api/supabase.js';
import { listarParaBusca } from '../api/lancamentos.js';

// O ÍNDICE DA BUSCA, um só para o app (a busca rápida e o aviso dos Lançamentos dividem): todos os lançamentos,
// lidos uma vez e guardados aqui. Toda gravação (`EVENTO_DADOS`) o deixa velho; ele se relê 800 ms depois da rajada
// (a grade grava campo a campo) se alguém o estiver usando, ou na próxima vez que alguém pedir.
// `useIndiceBusca(ligado)` devolve a lista (null enquanto lê).

let dados = null;
let lendo = null;
let velho = true;
let espera = null;
const ouvintes = new Set();

function ler() {
  if (lendo) return lendo;
  velho = false;
  lendo = listarParaBusca()
    .then((l) => { dados = l; })
    .catch(() => { velho = true; })
    .finally(() => { lendo = null; ouvintes.forEach((f) => f(dados)); });
  return lendo;
}

if (typeof window !== 'undefined') {
  window.addEventListener(EVENTO_DADOS, () => {
    velho = true;
    clearTimeout(espera);
    espera = setTimeout(() => { if (ouvintes.size) ler(); }, 800);
  });
}

export default function useIndiceBusca(ligado = true) {
  const [lista, setLista] = useState(dados);
  useEffect(() => {
    if (!ligado) return undefined;
    ouvintes.add(setLista);
    if (velho || !dados) ler(); else setLista(dados);
    return () => { ouvintes.delete(setLista); };
  }, [ligado]);
  return ligado ? lista : null;
}

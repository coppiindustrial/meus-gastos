import { useEffect } from 'react';

// O NOME DA ABA do navegador. Todas as abas do app se chamavam "Sistema Coppi Industrial", então
// quem trabalha com Fila, Controle e duas fichas abertas não tinha como saber qual era qual —
// a única pista era o favicon, igual nas quatro.
//
// Formato: `<página> · Coppi Industrial`, com o nome da página PRIMEIRO. É o que importa quando a
// aba encolhe: o navegador corta pelo fim, então o que sobra é justamente o que distingue. O
// separador é `·` e não `—` porque vários títulos já têm um travessão dentro ("Painel — Brasil"), e
// dois travessões na mesma linha deixam de separar coisa alguma.
const APP = 'Meus Gastos';
export const PADRAO = APP;

// Aplica o título enquanto a tela estiver montada. Passar nulo/vazio NÃO faz nada — é o que permite
// uma tela pôr o título genérico e um filho refiná-lo quando o registro carrega, sem piscar: no
// primeiro render o filho ainda não tem dado e se cala, e o efeito do pai é o único que escreve.
//
// Sem limpeza no desmonte, de propósito: a tela seguinte escreve o dela na sequência, e uma limpeza
// devolveria o título ao padrão por um quadro no meio de cada navegação. Toda rota do app define o
// seu (as 19 pelo `CabecalhoPagina`, as outras cinco à mão), então não sobra buraco.
export function useTituloAba(titulo) {
  const texto = typeof titulo === 'string' ? titulo.trim() : '';
  useEffect(() => {
    if (!texto) return;
    document.title = `${texto} · ${APP}`;
  }, [texto]);
}

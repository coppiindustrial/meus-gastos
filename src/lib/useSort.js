import { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from './storage.js';
import { cmpValor, CHAVES_POR_CAMPO } from './ordenar.js';

// Lê { key, dir } salvos no localStorage; null se não houver/for inválido.
function lerSalvo(storageKey) {
  if (!storageKey) return null;
  try {
    const s = JSON.parse(lsGet(storageKey));
    if (s && typeof s === 'object' && 'key' in s && 'dir' in s) return s;
  } catch { /* ignora */ }
  return null;
}

// Hook de ordenação client-side para tabelas.
// Uso: const sort = useSort(rows, 'prox_contato', 'asc'); sort.sorted; sort.toggle('cliente');
// storageKey (opcional): persiste e restaura a última coluna/direção no localStorage.
// tieKey/tieDir (opcionais): critério de DESEMPATE quando a coluna ativa empata
// (ex.: mesmo data_envio → mais recém-cadastrado primeiro). Ignorado se = coluna ativa.
export function useSort(rows, initialKey = null, initialDir = 'asc', storageKey = null, tieKey = null, tieDir = 'desc') {
  const salvo = lerSalvo(storageKey);
  const [sortKey, setSortKey] = useState(salvo ? salvo.key : initialKey);
  const [sortDir, setSortDir] = useState(salvo ? salvo.dir : initialDir);

  useEffect(() => {
    if (!storageKey) return;
    try { lsSet(storageKey, JSON.stringify({ key: sortKey, dir: sortDir })); }
    catch { /* ignora */ }
  }, [storageKey, sortKey, sortDir]);

  const toggle = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey || !Array.isArray(rows)) return rows;
    // `cmpValor` mora em `lib/ordenar.js`: é o MESMO comparador que o Kanban de Custos usa nos
    // cards, e ele já esteve escrito duas vezes. O desempate aqui é um caso particular da
    // hierarquia que o `ordenarPorCriterios` de lá generaliza — mas o hook continua com um nível
    // só, porque é o que as tabelas usam (a hierarquia é escolhida pelo usuário, e no cabeçalho
    // de tabela não há onde escolher).
    // `CHAVES_POR_CAMPO` traduz o valor de campos cujo conteúdo não é o que ordena — hoje só o
    // número do orçamento, que tem o ANO nos quatro últimos dígitos. Fica no hook e não em cada
    // tela porque são oito listas com essa coluna, e ligar uma a uma deixa a próxima de fora.
    const ler = (linha, campo) => (CHAVES_POR_CAMPO[campo] ? CHAVES_POR_CAMPO[campo](linha[campo]) : linha[campo]);
    const arr = [...rows];
    arr.sort((a, b) => {
      let r = cmpValor(ler(a, sortKey), ler(b, sortKey), sortDir);
      if (r === 0 && tieKey && tieKey !== sortKey) r = cmpValor(ler(a, tieKey), ler(b, tieKey), tieDir);
      return r;
    });
    return arr;
  }, [rows, sortKey, sortDir, tieKey, tieDir]);

  return { sorted, sortKey, sortDir, toggle };
}

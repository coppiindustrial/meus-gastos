import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planejarExtrato } from '../src/lib/planoExtrato.js';
import { criarClassificador } from '../src/lib/classificar.js';

const L = (id, data, valor, contraparte, descricao_original = `Pix - ${contraparte}`) => ({ id_externo: id, data, valor_centavos: valor, contraparte, descricao_original });
const classificar = criarClassificador([
  { palavra_chave: 'PROVEDOR', categoria_id: 'internet', prioridade: 1 },
  { palavra_chave: 'ELETRICA', categoria_id: 'luz', prioridade: 2 },
  { palavra_chave: 'EU MESMO', categoria_id: null, ignorar: true, prioridade: 3 },
  { palavra_chave: 'PADARIA', categoria_id: 'padaria', prioridade: 4 },
]);
const recorrencias = [
  { id: 'r-net', categoria_id: 'internet', ativa: true, inicio: '2026-01-01', fim: null },
  { id: 'r-luz', categoria_id: 'luz', ativa: true, inicio: '2026-01-01', fim: null },
];

test('cada linha recebe o destino certo', () => {
  const linhas = [
    L('a', '2026-09-04', -14990, 'PROVEDOR X'),        // fixo ainda não lançado → fixo_novo
    L('b', '2026-09-04', -18126, 'CIA ELETRICA'),      // fixo lançado à mão → fixo_corrigir
    L('c', '2026-09-05', -900000, 'EU MESMO'),         // regra de ignorar
    L('d', '2026-09-06', -1250, 'PADARIA DO ZE'),      // avulso com categoria
    L('e', '2026-09-07', -3000, 'LOJA NOVA'),          // avulso sem categoria (vai para Revisar)
    L('f', '2026-09-08', 100000, 'QUALQUER'),          // entrada
    L('g', '2026-09-09', -500, 'PADARIA DO ZE'),       // já importada
    L('h', '2026-09-20', -14990, 'PROVEDOR X'),        // 2º pagamento do mesmo fixo no mês → avulso
  ];
  const fixosLancados = [{ id: 'lan-luz', recorrencia_id: 'r-luz', competencia: '2026-09', id_externo: null }];
  const p = planejarExtrato(linhas, { classificar, recorrencias, fixosLancados, jaImportados: new Set(['g']) });
  assert.deepEqual(p.map((x) => x.acao), ['fixo_novo', 'fixo_corrigir', 'ignorar', 'avulso', 'avulso', 'ignorar', 'ja', 'avulso']);
  assert.equal(p[0].recorrencia.id, 'r-net');
  assert.equal(p[1].existente.id, 'lan-luz');
  assert.equal(p[2].motivo, 'regra de ignorar');
  assert.equal(p[3].categoriaId, 'padaria');
  assert.equal(p[4].categoriaId, null);
  assert.equal(p[7].categoriaId, 'internet');
});

test('classifica só pelo nome, nunca pelos números da descrição (CPF, agência)', () => {
  const c = criarClassificador([{ palavra_chave: '4', categoria_id: 'outros', prioridade: 1 }]);
  const p = planejarExtrato([L('z', '2026-09-04', -100, 'Fulano', 'Pix - Fulano - •••.420.459-•• - BANCO (0001) Agência: 4')], {
    classificar: c, recorrencias: [], fixosLancados: [], jaImportados: new Set(),
  });
  assert.equal(p[0].categoriaId, null);
});

test('fixo já vindo de outro extrato não é corrigido de novo', () => {
  const p = planejarExtrato([L('x', '2026-09-04', -18126, 'CIA ELETRICA')], {
    classificar, recorrencias, jaImportados: new Set(),
    fixosLancados: [{ id: 'l', recorrencia_id: 'r-luz', competencia: '2026-09', id_externo: 'outro' }],
  });
  assert.equal(p[0].acao, 'avulso');
});

test('recorrência fora da vigência não pega', () => {
  const p = planejarExtrato([L('y', '2025-12-04', -14990, 'PROVEDOR X')], { classificar, recorrencias, fixosLancados: [], jaImportados: new Set() });
  assert.equal(p[0].acao, 'avulso');
});

test('trazer as entradas: o crédito vira entrada; o de uma conta sua e o já lançado à mão ficam de fora', () => {
  const c = criarClassificador([
    { palavra_chave: 'EMPRESA', categoria_id: 'salario', prioridade: 1 },
    { palavra_chave: 'EU MESMO', categoria_id: null, ignorar: true, prioridade: 2 },
    { palavra_chave: 'PADARIA', categoria_id: 'padaria', prioridade: 3 },
  ]);
  const linhas = [
    L('s', '2026-09-05', 800000, 'EMPRESA X'),     // salário → entrada com a categoria (de entrada)
    L('t', '2026-09-06', 50000, 'EU MESMO'),       // transferência de uma conta sua → regra de ignorar
    L('u', '2026-09-10', 12000, 'FULANO'),         // já lançada à mão no dia 9 com o mesmo valor
    L('v', '2026-09-12', 1500, 'PADARIA DO ZE'),   // estorno: a regra é de gasto → entrada sem categoria
    L('w', '2026-09-13', 30000, 'RDB', 'Resgate RDB'), // investimento: sempre de fora
  ];
  const base = { classificar: c, recorrencias: [], fixosLancados: [], jaImportados: new Set(), ehEntrada: (id) => id === 'salario' };
  const sem = planejarExtrato(linhas, base);
  assert.deepEqual(sem.map((x) => x.acao), ['ignorar', 'ignorar', 'ignorar', 'ignorar', 'ignorar']); // o padrão continua
  const com = planejarExtrato(linhas, { ...base, entradas: true, entradasManuais: [{ id: 'm', data: '2026-09-09', valor_centavos: 12000 }] });
  assert.deepEqual(com.map((x) => x.acao), ['entrada', 'ignorar', 'ignorar', 'entrada', 'ignorar']);
  assert.equal(com[0].categoriaId, 'salario');
  assert.equal(com[1].motivo, 'regra de ignorar');
  assert.equal(com[2].motivo, 'já lançada à mão (09/09)');
  assert.equal(com[3].categoriaId, null);
  assert.equal(com[4].motivo, 'investimento');
});

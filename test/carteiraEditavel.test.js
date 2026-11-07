import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicadoSem, lerCelula, modoDaCelula, moverAtiva, planoDoAporte, planoDoNovoAporte, proximaEditavel, textoDaCelula,
} from '../src/lib/carteiraEditavel.js';

// dados FICTÍCIOS
const inv = { id: 'i1', nome: 'CDB Teste', conta_id: 'c1', ativo: true, aplicado_em: null, aplicado_inicial_centavos: null };
const g = { conta: { id: 'c1', nome: 'Banco X' } };
const x = { inv, vale: 123456, semValor: false };
const loteMov = { data: '2026-06-03', depositado: 100012, fonte: { tipo: 'mov', id: 'm1', data: '2026-06-03', valor: 100000, exato: true } };
const loteDep = { data: '2026-09-04', depositado: 50300, fonte: { tipo: 'dep', id: 'd1', data: '2026-09-04', valor: 51000, referencia: '2026-11-05', exato: false } };
const loteIni = { data: '2026-01-10', depositado: 30000, fonte: { tipo: 'inicial', data: '2026-01-10', valor: 30000, base: 20000, exato: true } };
const linhas = [
  { id: 'g:c1', tipo: 'grupo', g },
  { id: 'i:i1', tipo: 'inv', g, x },
  { id: 'l:m1', tipo: 'lote', g, x, lo: loteMov },
  { id: 'na:i1', tipo: 'novoAporte', g, x },
  { id: 'ni:c1', tipo: 'novoInv', g },
  { id: 'nq', tipo: 'novaInst' },
];

test('modoDaCelula: o que cada linha edita', () => {
  assert.equal(modoDaCelula(linhas[0], 'nome'), 'texto');
  assert.equal(modoDaCelula(linhas[0], 'vale'), null);
  assert.equal(modoDaCelula(linhas[1], 'nome'), 'rende');
  assert.equal(modoDaCelula(linhas[1], 'resgate'), 'resgate');
  assert.equal(modoDaCelula(linhas[1], 'vale'), 'valor');
  assert.equal(modoDaCelula(linhas[1], 'aplicado'), null); // calculado
  assert.equal(modoDaCelula(linhas[2], 'nome'), 'data');
  assert.equal(modoDaCelula(linhas[2], 'aplicado'), 'valor');
  assert.equal(modoDaCelula(linhas[2], 'vale'), null);
  assert.equal(modoDaCelula(linhas[3], 'nome'), 'data');
  assert.equal(modoDaCelula(linhas[3], 'aplicado'), 'valor');
  assert.equal(modoDaCelula(linhas[4], 'nome'), 'novoInv');
  assert.equal(modoDaCelula(linhas[5], 'nome'), 'texto');
  // o encerrado só muda o nome; o aporte sem a origem não se edita
  const enc = { ...linhas[1], x: { ...x, inv: { ...inv, ativo: false } } };
  assert.equal(modoDaCelula(enc, 'nome'), 'rende');
  assert.equal(modoDaCelula(enc, 'vale'), null);
  assert.equal(modoDaCelula({ ...linhas[2], lo: { ...loteMov, fonte: null } }, 'nome'), null);
});

test('moverAtiva: as setas, presas nas bordas', () => {
  assert.deepEqual(moverAtiva(linhas, null, 1, 0), { id: 'g:c1', col: 'nome' });
  assert.deepEqual(moverAtiva(linhas, { id: 'g:c1', col: 'nome' }, 1, 0), { id: 'i:i1', col: 'nome' });
  assert.deepEqual(moverAtiva(linhas, { id: 'g:c1', col: 'nome' }, -1, -1), { id: 'g:c1', col: 'nome' });
  assert.deepEqual(moverAtiva(linhas, { id: 'i:i1', col: 'vale' }, 0, 1), { id: 'i:i1', col: 'liquido' });
  assert.deepEqual(moverAtiva(linhas, { id: 'nq', col: 'curva' }, 1, 1), { id: 'nq', col: 'curva' });
  // a linha sumiu (o desfazer a tirou): volta à primeira, na mesma coluna
  assert.deepEqual(moverAtiva(linhas, { id: 'sumiu', col: 'vale' }, 1, 0), { id: 'g:c1', col: 'vale' });
});

test('proximaEditavel: o Tab pula as calculadas e passa de linha', () => {
  assert.deepEqual(proximaEditavel(linhas, { id: 'i:i1', col: 'nome' }), { id: 'i:i1', col: 'resgate' });
  assert.deepEqual(proximaEditavel(linhas, { id: 'i:i1', col: 'resgate' }), { id: 'i:i1', col: 'vale' });
  assert.deepEqual(proximaEditavel(linhas, { id: 'i:i1', col: 'vale' }), { id: 'l:m1', col: 'nome' });
  assert.deepEqual(proximaEditavel(linhas, { id: 'l:m1', col: 'nome' }), { id: 'l:m1', col: 'resgate' }); // o vencimento do aporte
  assert.deepEqual(proximaEditavel(linhas, { id: 'l:m1', col: 'resgate' }), { id: 'l:m1', col: 'aplicado' });
  assert.deepEqual(proximaEditavel(linhas, { id: 'l:m1', col: 'nome' }, -1), { id: 'i:i1', col: 'vale' });
  assert.deepEqual(proximaEditavel(linhas, { id: 'nq', col: 'nome' }), { id: 'nq', col: 'nome' }); // a última fica
});

test('textoDaCelula: o valor exato do aporte; o estimado, o depositado', () => {
  assert.equal(textoDaCelula(linhas[0], 'nome'), 'Banco X');
  assert.equal(textoDaCelula(linhas[1], 'vale'), '1.234,56');
  assert.equal(textoDaCelula({ ...linhas[1], x: { ...x, semValor: true } }, 'vale'), '');
  assert.equal(textoDaCelula(linhas[2], 'nome'), '03/06/2026');
  assert.equal(textoDaCelula(linhas[2], 'aplicado'), '1.000,00');
  assert.equal(textoDaCelula({ ...linhas[2], lo: loteDep }, 'aplicado'), '503,00');
  assert.equal(textoDaCelula(linhas[3], 'nome', { data: '2026-11-06' }), '06/11/2026');
  assert.equal(textoDaCelula(linhas[3], 'aplicado', { valor: '50' }), '50');
});

test('lerCelula: data, valor (com conta) e nome', () => {
  const hoje = '2026-11-06';
  assert.deepEqual(lerCelula('data', '03/06/2026', hoje), { ok: true, valor: '2026-06-03' });
  assert.deepEqual(lerCelula('data', '3/6', hoje), { ok: true, valor: '2026-06-03' });
  assert.equal(lerCelula('data', '31/02/2026', hoje).ok, false);
  assert.equal(lerCelula('data', '10/11/2026', hoje).erro, 'A data não pode ser depois de hoje.');
  assert.deepEqual(lerCelula('valor', '4.800,00', hoje), { ok: true, valor: 480000 });
  assert.deepEqual(lerCelula('valor', '=4.800+200', hoje), { ok: true, valor: 500000 });
  assert.equal(lerCelula('valor', '', hoje).ok, false);
  assert.equal(lerCelula('valor', 'abc', hoje).ok, false);
  assert.deepEqual(lerCelula('texto', '  Banco Y ', hoje), { ok: true, valor: 'Banco Y' });
  assert.equal(lerCelula('texto', '   ', hoje).ok, false);
});

test('planoDoAporte: o do app leva a foto do mesmo dia e valor junto', () => {
  const fotos = [{ id: 'v1', data: '2026-06-03', valor_centavos: 100000 }, { id: 'v2', data: '2026-10-11', valor_centavos: 200000 }];
  const p = planoDoAporte({ lo: loteMov, inv, campo: 'valor', valor: 120000, fotos });
  assert.equal(p.alvo, 'mov');
  assert.equal(p.id, 'm1');
  assert.deepEqual(p.mudancas, { valor_centavos: 120000 });
  assert.deepEqual(p.antes, { data: '2026-06-03', valor_centavos: 100000 });
  assert.deepEqual(p.gemea, { id: 'v1', antes: { data: '2026-06-03', valor_centavos: 100000 }, mudancas: { data: '2026-06-03', valor_centavos: 120000 } });
  const d = planoDoAporte({ lo: loteMov, inv, campo: 'data', valor: '2026-06-02', fotos: [fotos[1]] });
  assert.deepEqual(d.mudancas, { data: '2026-06-02' });
  assert.equal(d.gemea, null);
});

test('planoDoAporte: o de antes do app vira "o que foi depositado" ao mudar o valor', () => {
  const v = planoDoAporte({ lo: loteDep, inv, campo: 'valor', valor: 50000 });
  assert.equal(v.alvo, 'dep');
  assert.deepEqual(v.mudancas, { valor_centavos: 50000, referencia: '2026-09-04' });
  assert.deepEqual(v.antes, { data: '2026-09-04', valor_centavos: 51000, referencia: '2026-11-05' });
  // a data do colado: a referência (o dia em que o banco mostrou o valor) fica
  assert.deepEqual(planoDoAporte({ lo: loteDep, inv, campo: 'data', valor: '2026-09-03' }).mudancas, { data: '2026-09-03' });
  // o digitado (referência = data): as duas andam juntas
  const dig = { ...loteDep, fonte: { ...loteDep.fonte, referencia: '2026-09-04', exato: true } };
  assert.deepEqual(planoDoAporte({ lo: dig, inv, campo: 'data', valor: '2026-09-03' }).mudancas, { data: '2026-09-03', referencia: '2026-09-03' });
});

test('planoDoAporte: o do cadastro sem data muda o cadastro', () => {
  const d = planoDoAporte({ lo: loteIni, inv, campo: 'data', valor: '2026-01-09' });
  assert.deepEqual(d, { alvo: 'inv', id: 'i1', mudancas: { aplicado_em: '2026-01-09' }, antes: { aplicado_em: null } });
  // o valor: o aplicado do cadastro é o deste aporte mais o que já tem data
  const v = planoDoAporte({ lo: loteIni, inv: { ...inv, aplicado_inicial_centavos: 50000 }, campo: 'valor', valor: 35000 });
  assert.deepEqual(v.mudancas, { aplicado_inicial_centavos: 55000 });
  assert.deepEqual(v.antes, { aplicado_inicial_centavos: 50000 });
});

test('planoDoNovoAporte: a primeira foto, os valores de depois e o de antes dos digitados', () => {
  assert.deepEqual(planoDoNovoAporte({ inv, data: '2026-11-06', valores: [] }), { foto: true, depois: [] });
  const valores = [
    { id: 'v2', investimento_id: 'i1', data: '2026-10-31', valor_centavos: 1 },
    { id: 'v1', investimento_id: 'i1', data: '2026-09-30', valor_centavos: 1 },
    { id: 'e1', investimento_id: 'i1', data: '2026-11-05', valor_centavos: 1, estimado: true },
    { id: 'o1', investimento_id: 'outro', data: '2026-10-31', valor_centavos: 1 },
  ];
  const p = planoDoNovoAporte({ inv, data: '2026-09-15', valores });
  assert.equal(p.foto, false);
  assert.deepEqual(p.depois.map((f) => f.id), ['v1', 'v2']); // a estimada e a de outro título não contam
  const deps = [{ investimento_id: 'i1', data: '2026-08-01', referencia: '2026-09-05' }];
  assert.match(planoDoNovoAporte({ inv, data: '2026-09-05', depositos: deps }).erro, /antes do app/);
  assert.equal(planoDoNovoAporte({ inv, data: '2026-09-06', depositos: deps }).erro, undefined);
});

test('o vencimento de cada aporte: digitado, vazio volta à regra, sem o ano é o próximo', () => {
  assert.equal(modoDaCelula(linhas[2], 'resgate'), 'vencimento');
  assert.equal(modoDaCelula({ ...linhas[2], lo: loteIni }, 'resgate'), null); // o do cadastro não tem onde guardar
  assert.equal(modoDaCelula(linhas[3], 'resgate'), 'vencimento');
  const hoje = '2026-11-06';
  assert.deepEqual(lerCelula('vencimento', '', hoje), { ok: true, valor: null });
  assert.deepEqual(lerCelula('vencimento', '02/09/2027', hoje), { ok: true, valor: '2027-09-02' });
  assert.deepEqual(lerCelula('vencimento', '02/09', hoje), { ok: true, valor: '2027-09-02' }); // 02/09/2026 já passou
  assert.deepEqual(lerCelula('vencimento', '10/12', hoje), { ok: true, valor: '2026-12-10' });
  assert.equal(lerCelula('vencimento', '31/02', hoje).ok, false);
  // o que a célula mostra ao abrir: o vencimento da linha (o digitado ou o da regra)
  assert.equal(textoDaCelula({ ...linhas[2], vence: '2027-03-12' }, 'resgate'), '12/03/2027');
  assert.equal(textoDaCelula(linhas[3], 'resgate', { venc: '2027-09-02' }), '02/09/2027');
  // grava só a coluna dele, no aporte do app ou no de antes do app
  assert.deepEqual(planoDoAporte({ lo: loteMov, inv, campo: 'vencimento', valor: '2027-03-12' }),
    { alvo: 'mov', id: 'm1', mudancas: { vencimento: '2027-03-12' }, antes: { vencimento: null } });
  const dep = { ...loteDep, fonte: { ...loteDep.fonte, vencimento: '2027-01-01' } };
  assert.deepEqual(planoDoAporte({ lo: dep, inv, campo: 'vencimento', valor: null }),
    { alvo: 'dep', id: 'd1', mudancas: { vencimento: null }, antes: { vencimento: '2027-01-01' } });
});

test('o aplicado do investimento acompanha o aporte de antes do app (a diferença; o que sai leva o dele)', () => {
  const comAplicado = { ...inv, aplicado_inicial_centavos: 1476934 };
  // o digitado (o depositado exato): trocar 1.000,00 por 990,00 tira 10,00 do aplicado
  const dig = { data: '2024-12-05', depositado: 100012, fonte: { tipo: 'dep', id: 'd2', data: '2024-12-05', valor: 100000, referencia: '2024-12-05', exato: true } };
  const p = planoDoAporte({ lo: dig, inv: comAplicado, campo: 'valor', valor: 99000 });
  assert.deepEqual(p.aplicado, { antes: 1476934, depois: 1475934 });
  // o colado (o que vale hoje): pela diferença ao depositado estimado, que é o que ele soma no aplicado
  assert.deepEqual(planoDoAporte({ lo: loteDep, inv: comAplicado, campo: 'valor', valor: 50000 }).aplicado, { antes: 1476934, depois: 1476634 });
  // a data não mexe no aplicado; sem o aplicado gravado, nada a acompanhar
  assert.equal(planoDoAporte({ lo: dig, inv: comAplicado, campo: 'data', valor: '2024-12-04' }).aplicado, null);
  assert.equal(planoDoAporte({ lo: dig, inv, campo: 'valor', valor: 99000 }).aplicado, null);
  // excluir: o aplicado sem ele (nunca negativo)
  assert.deepEqual(aplicadoSem(dig, comAplicado, null), { antes: 1476934, depois: 1376934 });
  assert.deepEqual(aplicadoSem(dig, { ...inv, aplicado_inicial_centavos: 50000 }, null), { antes: 50000, depois: 0 });
});

test('os dois números do banco no aporte de antes do app: o Vale hoje e o Rendeu', () => {
  const hoje = '2026-11-07';
  const comAplicado = { ...inv, aplicado_inicial_centavos: 1147083 };
  // o colado do banco, ainda sem o rendimento (dados FICTÍCIOS)
  const col = { data: '2024-12-05', vale: 1426501, ganho: 320507, depositado: 1105994, fonte: { tipo: 'dep', id: 'd1', data: '2024-12-05', valor: 1426501, referencia: '2026-11-07', exato: false, principal: null, rendimento: null } };
  const lnha = { ...linhas[2], lo: col };
  assert.equal(modoDaCelula(lnha, 'vale'), 'valor');
  assert.equal(modoDaCelula(lnha, 'rendeu'), 'valor');
  assert.equal(modoDaCelula(linhas[2], 'vale'), null); // o feito pelo app anda pelo CDI
  assert.equal(textoDaCelula(lnha, 'rendeu'), '3.205,07');
  assert.equal(textoDaCelula(lnha, 'vale'), '14.265,01');
  // o Rendimento bruto: o par completo com o valor de hoje; o aplicado vira 14.265,01 − 4.348,68, pela diferença
  const r = planoDoAporte({ lo: col, inv: comAplicado, campo: 'rendimento', valor: 434868, hoje });
  assert.deepEqual(r.mudancas, { valor_centavos: 1426501, referencia: hoje, rendimento_centavos: 434868 });
  assert.deepEqual(r.aplicado, { antes: 1147083, depois: 1147083 - 1105994 + 991633 });
  assert.equal(r.vale, null);
  // com o par: o Valor Bruto novo mantém o aplicado e muda o rendimento; o valor de hoje acompanha a diferença
  const par = { ...col, fonte: { ...col.fonte, exato: true, principal: 991633, rendimento: 434868 } };
  const b = planoDoAporte({ lo: par, inv: comAplicado, campo: 'bruto', valor: 1427000, hoje });
  assert.deepEqual(b.mudancas, { valor_centavos: 1427000, referencia: hoje, rendimento_centavos: 1427000 - 991633 });
  assert.deepEqual(b.vale, { delta: 1427000 - 1426501 });
  assert.equal(b.aplicado, null);
  assert.deepEqual(b.antes, { data: '2024-12-05', valor_centavos: 1426501, referencia: '2026-11-07', rendimento_centavos: 434868 });
  // o Aplicado no par: o rendimento passa a ser o valor − o aplicado
  assert.deepEqual(planoDoAporte({ lo: par, inv: comAplicado, campo: 'valor', valor: 990000, hoje }).mudancas, { rendimento_centavos: 1426501 - 990000 });
  // sem o principal (o colado), o Valor Bruto é só o valor de hoje
  assert.deepEqual(planoDoAporte({ lo: col, inv: comAplicado, campo: 'bruto', valor: 1427000, hoje }).mudancas, { valor_centavos: 1427000, referencia: hoje });
  // o digitado ("o que foi depositado"): o principal fica, o rendimento é a diferença
  const dig = { ...col, fonte: { ...col.fonte, referencia: '2024-12-05', exato: true, principal: 1000000, valor: 1000000 } };
  assert.deepEqual(planoDoAporte({ lo: dig, inv: comAplicado, campo: 'bruto', valor: 1300000, hoje }).mudancas, { valor_centavos: 1300000, referencia: hoje, rendimento_centavos: 300000 });
});

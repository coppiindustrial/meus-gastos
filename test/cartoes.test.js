import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasAte, diferencaCartao, proximoVencimento, resumoDosCartoes, validarCartoes } from '../src/lib/cartoes.js';

// Dados FICTÍCIOS.
const cartoes = [{ id: 'nu', nome: 'Nubank', dia_vencimento: 13, formato: 'nubank', ativo: true }, { id: 'in', nome: 'Inter', dia_vencimento: 5, formato: 'manual', ativo: false }];
const F = (cartao_id, vencimento, total_centavos, qtd = 10) => ({ cartao_id, vencimento, competencia: vencimento.slice(0, 7), total_centavos, qtd });

test('proximoVencimento e diasAte: o de hoje conta; depois, o do mês seguinte; fevereiro curto', () => {
  assert.equal(proximoVencimento(13, '2026-10-30'), '2026-11-13');
  assert.equal(proximoVencimento(13, '2026-10-13'), '2026-10-13');
  assert.equal(proximoVencimento(31, '2027-02-10'), '2027-02-28');
  assert.equal(diasAte('2026-10-30', '2026-11-13'), 14);
});

test('resumoDosCartoes: última, próxima (importada?), parcelas, média e a série de 12 meses', () => {
  const faturas = [F('nu', '2026-10-13', 341280, 64), F('nu', '2026-09-13', 290410), F('nu', '2025-09-13', 100000), F('nu', '2026-11-13', 50000)];
  const parcelas = [
    { cartao_id: 'nu', competencia: '2026-11', valor_centavos: 10000, lancamento_id: 'a' },
    { cartao_id: 'nu', competencia: '2026-12', valor_centavos: 10000, lancamento_id: 'a' },
    { cartao_id: 'nu', competencia: '2027-06', valor_centavos: 5000, lancamento_id: 'b' },
  ];
  const r = resumoDosCartoes({ cartoes, faturas, parcelas, hoje: '2026-10-30' });
  assert.deepEqual(r.nu.ultima, { vencimento: '2026-10-13', competencia: '2026-10', total: 341280, qtd: 64 }); // a de nov ainda não venceu
  assert.deepEqual(r.nu.proxima, { vencimento: '2026-11-13', dias: 14, importada: true });
  assert.deepEqual(r.nu.parcelas, { total: 25000, ate: '2027-06', compras: 2 });
  assert.equal(r.nu.media, Math.round((341280 + 290410) / 2)); // set/25 está fora dos 12 meses; nov/26 também
  assert.equal(r.nu.serie.length, 12);
  assert.equal(r.nu.serie[11].comp, '2026-10');
  assert.equal(r.nu.serie[11].total, 341280);
  assert.equal(r.in.proxima, null); // inativo
  assert.equal(r.in.ultima, null);
});

test('diferencaCartao e validarCartoes', () => {
  const orig = cartoes[0];
  assert.deepEqual(diferencaCartao({ ...orig, orig, dia_vencimento: '12' }), { dia_vencimento: 12 });
  assert.deepEqual(diferencaCartao({ ...orig, orig }), {});
  const L = (id, nome, dia, extra = {}) => ({ id, nome, dia_vencimento: dia, formato: 'manual', ativo: true, ...extra });
  assert.equal(validarCartoes([L('a', 'XP', 10), L('b', 'Nubank', 13)]), null);
  assert.match(validarCartoes([L('a', 'XP', 32)]).motivo, /1 a 31/);
  assert.match(validarCartoes([L('a', 'XP', 10), L('b', ' xp ', 3)]).motivo, /duas vezes/);
  assert.equal(validarCartoes([L('a', 'XP', 10), L('n', '', '', { novo: true })]), null); // linha nova em branco não conta
});

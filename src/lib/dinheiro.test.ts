import { describe, expect, it } from 'vitest';
import { brlCurto, formatBRL, parseValor, valorParaCampo } from './dinheiro';

describe('parseValor', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['R$ 59,90', 5990],
    ['R$ -2.998,73', -299873],
    ['-2.998,73', -299873],
    ['1,234.56', 123456],
    ['1.234', 123400],
    ['229', 22900],
    ['0,1', 10],
    ['  45  ', 4500],
  ])('%s → %i', (texto, esperado) => {
    expect(parseValor(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '12,3,4', 'R$'])('"%s" não é número', (texto) => {
    expect(parseValor(texto)).toBeNull();
  });

  it('não perde centavo com float', () => {
    expect(parseValor('0,29')).toBe(29);
    expect(parseValor('1.005,15')).toBe(100515);
  });
});

describe('formatação', () => {
  it('formatBRL', () => {
    expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(formatBRL(null)).toBe('—');
  });

  it('brlCurto', () => {
    expect(brlCurto(85000)).toBe('R$ 850');
    expect(brlCurto(1230000)).toBe('R$ 12,3 mil');
    expect(brlCurto(-1230000)).toBe('-R$ 12,3 mil');
    expect(brlCurto(120000000)).toBe('R$ 1,2 mi');
  });

  it('valorParaCampo', () => {
    expect(valorParaCampo(123456)).toBe('1234,56');
    expect(valorParaCampo(5)).toBe('0,05');
  });
});

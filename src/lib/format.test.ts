import { describe, expect, it } from 'vitest';
import { addMeses, competenciaCurta, competenciaDe, nomeCompetencia } from './format';

describe('competência', () => {
  it('competenciaDe', () => {
    expect(competenciaDe('2026-08-13')).toBe('2026-08');
  });

  it('addMeses atravessa o ano', () => {
    expect(addMeses('2026-11', 2)).toBe('2027-01');
    expect(addMeses('2026-01', -1)).toBe('2025-12');
    expect(addMeses('2026-05', 0)).toBe('2026-05');
    expect(addMeses('2026-03', -15)).toBe('2024-12');
  });

  it('nomes', () => {
    expect(nomeCompetencia('2026-10')).toBe('outubro de 2026');
    expect(competenciaCurta('2026-03')).toBe('mar/26');
  });
});

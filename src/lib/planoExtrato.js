import { competenciaDe } from './format.js';
import { motivoIgnorar } from './lerExtrato.js';
import { vigente } from './fixos.js';

// O DESTINO DE CADA LINHA DO EXTRATO, antes de gravar (a prévia mostra exatamente isto):
//   ignorar        → fica de fora (`motivo`: entrada, fatura, investimento, regra de ignorar)
//   ja             → já foi importada antes (mesmo identificador do banco)
//   fixo_novo      → é o gasto fixo do mês (a categoria bate com uma recorrência vigente) e ele ainda não
//                    foi lançado: entra como o fixo, com o valor do extrato
//   fixo_corrigir  → o fixo do mês já tinha sido lançado à mão: o valor dele passa a ser o do extrato
//   avulso         → gasto comum (com categoria pela regra, ou sem — aí vai para Revisar pendências)
//
// `classificar(nome)` → a regra que pega (ou null); `fixosLancados`: os lançamentos com `recorrencia_id`
// ({ id, recorrencia_id, competencia, id_externo }); `jaImportados`: Set dos identificadores já gravados.
export function planejarExtrato(linhas, { classificar, recorrencias, fixosLancados, jaImportados }) {
  const usados = new Set(); // recorrência+mês já tomados por uma linha deste arquivo
  return linhas.map((linha) => {
    if (jaImportados.has(linha.id_externo)) return { linha, acao: 'ja' };
    // Só pelo NOME (contraparte): a descrição inteira traz CPF, agência e conta, e uma regra curta da
    // planilha ("4" → Outros) pegava todo Pix pelos dígitos do documento.
    const regra = classificar(linha.contraparte);
    const motivo = motivoIgnorar(linha, () => regra?.ignorar);
    if (motivo) return { linha, acao: 'ignorar', motivo };

    const comp = competenciaDe(linha.data);
    const categoriaId = regra?.categoria_id ?? null;
    const rec = categoriaId && recorrencias.find((r) => r.categoria_id === categoriaId && vigente(r, comp) && !usados.has(`${r.id}|${comp}`));
    if (rec) {
      usados.add(`${rec.id}|${comp}`);
      const existente = fixosLancados.find((f) => f.recorrencia_id === rec.id && f.competencia === comp);
      if (!existente) return { linha, acao: 'fixo_novo', categoriaId, recorrencia: rec };
      // Um fixo que já veio de um extrato não é "corrigido" por outro pagamento: este vira avulso.
      if (!existente.id_externo) return { linha, acao: 'fixo_corrigir', categoriaId, recorrencia: rec, existente };
    }
    return { linha, acao: 'avulso', categoriaId };
  });
}

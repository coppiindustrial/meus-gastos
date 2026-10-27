// A ESTRUTURA INICIAL sugerida: as 36 categorias da aba "Tipos" da planilha, organizadas em grupos,
// mais as que os gastos fixos e as entradas pedem (Condomínio, Diarista, Personal, Salário…).
// Criada por um botão na tela de Categorias quando ela está vazia; depois tudo é editável lá.
// Amazon e Mercado Livre continuam como categoria (decisão do PLANO.md).

export const GRUPOS_SUGERIDOS = [
  { nome: 'Alimentação', tipo: 'saida', cor: '#ea580c', categorias: ['Mercado', 'Restaurante', 'Delivery', 'Bar', 'Padaria / Cafeteria', 'Chocolate'] },
  { nome: 'Casa', tipo: 'saida', cor: '#0d9488', categorias: ['Condomínio', 'Luz', 'Água', 'Internet', 'Diarista / Empregada', 'Casa / Utilidades', 'Eletrodoméstico'] },
  { nome: 'Transporte', tipo: 'saida', cor: '#2563eb', categorias: ['Gasolina', 'Estacionamento / Pedágio', 'Transporte / App', 'Revisão carro', 'Lavação carro'] },
  { nome: 'Saúde e bem-estar', tipo: 'saida', cor: '#16a34a', categorias: ['Farmácia / Saúde', 'Dentista', 'Fisioterapia', 'Academia / Whey', 'Personal', 'Beleza / Cuidados'] },
  { nome: 'Lazer', tipo: 'saida', cor: '#9333ea', categorias: ['Festa / Lazer', 'Viagem / Hospedagem', 'Assinaturas / Streaming'] },
  { nome: 'Compras', tipo: 'saida', cor: '#db2777', categorias: ['Vestuário', 'Eletrônicos / Tecnologia', 'Amazon', 'Mercado Livre', 'Presentes', 'Pets'] },
  { nome: 'Educação', tipo: 'saida', cor: '#ca8a04', categorias: ['Educação / Cursos', 'Livros'] },
  { nome: 'Financeiro', tipo: 'saida', cor: '#475569', categorias: ['Impostos / Taxas', 'Seguros', 'Investimentos'] },
  { nome: 'Outros', tipo: 'saida', cor: '#6b7280', categorias: ['Outros'] },
  { nome: 'Renda', tipo: 'entrada', cor: '#15803d', categorias: ['Salário', 'Comissão', 'Vale alimentação', 'FGTS', 'Outras entradas'] },
];

// Os cartões da planilha: Nubank e XP importam fatura (fase 3); o Inter não é mais usado.
export const CARTOES_SUGERIDOS = [
  { nome: 'Nubank', dia_vencimento: 13, formato: 'nubank', ativo: true },
  { nome: 'XP', dia_vencimento: 10, formato: 'xp', ativo: true },
  { nome: 'Inter', dia_vencimento: 5, formato: 'manual', ativo: false },
];

// Cores oferecidas para os grupos (as mesmas da sugestão, mais algumas).
export const CORES_GRUPO = [
  '#ea580c', '#0d9488', '#2563eb', '#16a34a', '#9333ea', '#db2777',
  '#ca8a04', '#475569', '#6b7280', '#15803d', '#dc2626', '#0891b2',
];

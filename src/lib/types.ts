// Modelo de dados (ver PLANO.md, seção 3).
// Valores em centavos inteiros e positivos; a direção vem de `tipo`.
// Datas em texto AAAA-MM-DD; competência (mês de referência) em AAAA-MM.

/** Campos de controle que todo registro sincronizado tem. */
export interface Base {
  id: string;
  updatedAt: number;
  /** 1 = apagado (fica guardado para o apagamento chegar aos outros aparelhos). */
  deleted: 0 | 1;
  /** 1 = alterado aqui e ainda não enviado à nuvem. */
  dirty: 0 | 1;
}

export type TipoMovimento = 'saida' | 'entrada';

export interface Grupo extends Base {
  nome: string;
  tipo: TipoMovimento;
  ordem: number;
  cor: string;
}

export interface Categoria extends Base {
  grupoId: string;
  nome: string;
  ordem: number;
  ativa: boolean;
}

/** Palavra-chave no nome do estabelecimento → categoria. A primeira que bate (menor prioridade) vence. */
export interface Regra extends Base {
  palavraChave: string;
  categoriaId: string;
  prioridade: number;
}

export type FormatoFatura = 'nubank' | 'xp' | 'manual';

export interface Cartao extends Base {
  nome: string;
  diaVencimento: number;
  formato: FormatoFatura;
  ativo: boolean;
}

export interface Fatura extends Base {
  cartaoId: string;
  vencimento: string;
  competencia: string;
  arquivo: string;
  hashArquivo: string;
  totalCentavos: number;
  importadaEm: number;
}

export type Origem = 'cartao' | 'fixo' | 'manual' | 'entrada';

export interface Lancamento extends Base {
  tipo: TipoMovimento;
  origem: Origem;
  /** Data da compra/recebimento. */
  data: string;
  /** Mês em que o lançamento conta (cartão = mês do vencimento da fatura). */
  competencia: string;
  descricao: string;
  /** Nome do estabelecimento como veio na fatura (usado pelas regras). */
  estabelecimento: string | null;
  valorCentavos: number;
  categoriaId: string | null;
  faturaId: string | null;
  cartaoId: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  portador: string | null;
  recorrenciaId: string | null;
  /** 1 = sem categoria definida por regra: aparece em "Revisar pendências" (0/1 porque o IndexedDB não indexa boolean). */
  revisar: 0 | 1;
  obs: string;
}

/** Gasto fixo mensal (luz, internet, condomínio...). */
export interface Recorrencia extends Base {
  descricao: string;
  categoriaId: string | null;
  valorPadraoCentavos: number;
  diaDoMes: number;
  inicio: string;
  fim: string | null;
  ativa: boolean;
}

export type TipoConta = 'corrente' | 'investimento' | 'reserva' | 'outro';

export interface Conta extends Base {
  nome: string;
  tipo: TipoConta;
  instituicao: string;
  ativa: boolean;
}

/** Foto do saldo de uma conta numa data (informada por você). */
export interface Saldo extends Base {
  contaId: string;
  data: string;
  valorCentavos: number;
}

import { Component } from 'react';

// Se uma tela der erro ao desenhar, mostra um aviso NO LUGAR DELA (a barra lateral continua) em vez de
// o React apagar o app inteiro. O Layout dá a chave pelo endereço: trocar de tela limpa o erro.
export default class ErrorBoundary extends Component {
  state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  componentDidCatch(error, info) {
    console.error('Erro na tela:', error, info.componentStack);
  }

  render() {
    if (!this.state.falhou) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-10 max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center">
        <p className="font-semibold text-gray-800">Algo deu errado nesta tela</p>
        <p className="mt-1 text-sm text-gray-500">Seus dados estão salvos. Recarregue a página ou volte para outra tela.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    );
  }
}

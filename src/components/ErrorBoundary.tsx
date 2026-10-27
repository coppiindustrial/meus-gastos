import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Se uma tela der erro ao desenhar (ex.: o banco do celular falhou), mostra um aviso com "Voltar"
 * e "Recarregar" em vez de deixar tudo preto (sem isto o React apaga o app inteiro).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Erro na tela:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen no-tabs">
        <div className="empty" role="alert">
          <span className="title">Algo deu errado nesta tela</span>
          <span className="small" style={{ lineHeight: 1.5 }}>
            Seus dados continuam salvos. Volte para a tela anterior ou recarregue o app.
          </span>
          <button type="button" className="btn primary" onClick={() => window.history.back()}>
            Voltar
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </div>
      </main>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { extractRawErrorMessage, isQuotaExceededError } from '../firebase';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isQuota: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
    isQuota: false,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = extractRawErrorMessage(error);
    return {
      hasError: true,
      message: raw || 'Ocorreu um erro inesperado ao renderizar o aplicativo.',
      isQuota: isQuotaExceededError(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary capturou erro:', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#cde1cc] px-4 py-8 text-[#0F172A]">
        <div
          role="alert"
          className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-6 sm:p-8 shadow-xs space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-red-50 text-red-700 shrink-0">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900">
                Ocorreu um erro inesperado
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {this.state.isQuota
                  ? 'O limite diário gratuito do Firebase foi atingido. A cota reinicia às 00h (horário do Pacífico) ou pode ser ampliada no console do Firebase.'
                  : 'Não foi possível exibir esta tela no momento. Recarregue o aplicativo para continuar.'}
              </p>
            </div>
          </div>

          <p className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3 break-words">
            {this.state.message}
          </p>

          <button
            type="button"
            onClick={this.handleReload}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Recarregar aplicativo</span>
          </button>
        </div>
      </div>
    );
  }
}

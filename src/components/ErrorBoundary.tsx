import React, { Component, ErrorInfo, ReactNode } from 'react';
import { toast } from 'sonner';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

type ErrorCategory =
  | 'chunk_load'
  | 'network'
  | 'auth'
  | 'supabase'
  | 'date_format'
  | 'render';

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  category?: ErrorCategory;
}

const RELOAD_GUARD_KEY = 'vettale_chunk_reload_attempt';

const categorize = (error: Error | undefined): ErrorCategory => {
  const msg = String(error?.message || error || '');
  const stack = String(error?.stack || '');
  const all = `${msg}\n${stack}`;

  if (
    /Failed to fetch dynamically imported module|Importing a module script failed|module script: Expected a JavaScript module script but the server responded with a MIME type of "text\/html"|ChunkLoadError|Loading chunk \d+ failed/i.test(
      all
    )
  ) {
    return 'chunk_load';
  }
  if (/NetworkError|Failed to fetch|fetch failed|net::ERR/i.test(all)) {
    return 'network';
  }
  if (/JWT|jwt|invalid_grant|refresh_token|session_not_found|Auth session missing|not authenticated/i.test(all)) {
    return 'auth';
  }
  if (/PGRST|PostgREST|supabase|RLS|row-level security|permission denied/i.test(all)) {
    return 'supabase';
  }
  if (/Invalid time value|Invalid Date|RangeError.*date/i.test(all)) {
    return 'date_format';
  }
  return 'render';
};

const CATEGORY_LABEL: Record<ErrorCategory, string> = {
  chunk_load: 'Falha ao carregar arquivos do site (versão desatualizada)',
  network: 'Falha de rede / conexão',
  auth: 'Falha de autenticação (sessão / JWT)',
  supabase: 'Falha no banco de dados (Supabase)',
  date_format: 'Erro de formatação de data',
  render: 'Erro inesperado de renderização',
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, category: categorize(error) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const category = categorize(error);
    this.setState({ errorInfo, category });

    // Use console.warn so it survives even if console.* drops are misconfigured;
    // production logs will still surface this in DevTools.
    try {
      console.warn('[ErrorBoundary]', category, error?.message, error?.stack, errorInfo?.componentStack);
    } catch {}

    if (this.props.onError) {
      try { this.props.onError(error, errorInfo); } catch {}
    }

    // Auto-recovery for stale chunk loads after a deploy.
    // Guard against infinite loop with a sessionStorage flag.
    if (category === 'chunk_load') {
      try {
        const already = sessionStorage.getItem(RELOAD_GUARD_KEY);
        if (!already) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
          // Defer slightly so React finishes committing the error state
          setTimeout(() => {
            try { window.location.reload(); } catch {}
          }, 50);
          return;
        }
      } catch {}
    }

    try {
      toast.error('Ocorreu um erro inesperado. Tente recarregar a página.');
    } catch {}
  }

  private handleReload = () => {
    try { sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch {}
    window.location.reload();
  };

  private handleCopy = () => {
    const { error, errorInfo, category } = this.state;
    const payload = [
      `Categoria: ${category ? CATEGORY_LABEL[category] : 'desconhecida'}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      `User-Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
      `Quando: ${new Date().toISOString()}`,
      '',
      `Mensagem: ${error?.message || ''}`,
      '',
      'Stack:',
      error?.stack || '',
      '',
      'Component stack:',
      errorInfo?.componentStack || '',
    ].join('\n');
    try {
      navigator.clipboard?.writeText(payload);
      toast.success('Detalhes do erro copiados');
    } catch {
      // Fallback: show in prompt for manual copy
      try { window.prompt('Copie os detalhes do erro:', payload); } catch {}
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, category } = this.state;
      const categoryLabel = category ? CATEGORY_LABEL[category] : 'Erro desconhecido';

      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="max-w-2xl w-full text-center">
            <h2 className="text-2xl font-semibold mb-2 text-destructive">
              Algo deu errado
            </h2>
            <p className="text-muted-foreground mb-1">
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Tipo: <span className="font-mono">{categoryLabel}</span>
            </p>

            <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Recarregar Página
              </button>
              <button
                onClick={this.handleCopy}
                className="px-4 py-2 border border-input bg-background rounded-md hover:bg-accent text-sm"
              >
                Copiar detalhes do erro
              </button>
            </div>

            <details className="text-left bg-muted/40 rounded-md p-3 text-xs">
              <summary className="cursor-pointer font-medium select-none">
                Detalhes técnicos (mostre isto ao suporte)
              </summary>
              <div className="mt-3 space-y-2 font-mono whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                <div>
                  <span className="font-semibold">Mensagem:</span> {error?.message || '(sem mensagem)'}
                </div>
                {error?.stack && (
                  <div>
                    <div className="font-semibold mt-2">Stack:</div>
                    <div className="max-h-48 overflow-auto">{error.stack}</div>
                  </div>
                )}
                {errorInfo?.componentStack && (
                  <div>
                    <div className="font-semibold mt-2">Componente:</div>
                    <div className="max-h-48 overflow-auto">{errorInfo.componentStack}</div>
                  </div>
                )}
                <div className="text-muted-foreground mt-2">
                  URL: {typeof window !== 'undefined' ? window.location.href : ''}
                </div>
              </div>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

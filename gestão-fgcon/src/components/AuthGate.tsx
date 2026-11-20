import { AlertCircle, Cloud, Loader2, LogOut, RefreshCw } from 'lucide-react';

interface AuthGateProps {
  mode: 'checking_auth' | 'signed_out' | 'loading_workspace';
  userEmail?: string | null;
  signingIn?: boolean;
  errorMessage?: string | null;
  onSignIn: () => void;
  onRetryLoad?: () => void;
  onSignOut?: () => void;
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3a7.17 7.17 0 0 1-10.67-3.77H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.39 14.32A7.2 7.2 0 0 1 5.01 12c0-.8.14-1.58.38-2.32v-3.1H1.4A12 12 0 0 0 0 12c0 1.94.46 3.77 1.4 5.42l3.99-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.4 6.58l3.99 3.1A7.16 7.16 0 0 1 12 4.77Z"
      />
    </svg>
  );
}

export function AuthGate({
  mode,
  userEmail,
  signingIn = false,
  errorMessage,
  onSignIn,
  onRetryLoad,
  onSignOut,
}: AuthGateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#cde1cc] px-4 py-10 text-[#0F172A]">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-6 sm:p-8 shadow-xs">
        {/* Brand Header */}
        <div className="flex items-center justify-between gap-3 pb-5 border-b border-slate-200">
          <div>
            <span className="font-display text-xl font-bold tracking-tight text-slate-900">
              PlanaObra
            </span>
            <p className="mt-0.5 text-xs text-slate-500">
              Gestão de Emboço Plano e Requadro
            </p>
          </div>
          <div className="p-2 rounded-md bg-slate-100 text-[#1D4ED8]" aria-hidden="true">
            <Cloud className="w-5 h-5" />
          </div>
        </div>

        {mode === 'checking_auth' && (
          <div className="py-10 flex flex-col items-center text-center gap-3">
            <Loader2
              className="w-6 h-6 text-[#1D4ED8] animate-spin"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-slate-700">
              Verificando sessão...
            </p>
          </div>
        )}

        {mode === 'loading_workspace' && (
          <div className="py-8 space-y-5">
            {!errorMessage ? (
              <div className="flex flex-col items-center text-center gap-3">
                <Loader2
                  className="w-6 h-6 text-[#1D4ED8] animate-spin"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Carregando dados da obra...
                  </p>
                  {userEmail && (
                    <p className="mt-1 text-xs text-slate-500">{userEmail}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-3.5 rounded-md bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {onRetryLoad && (
                    <button
                      type="button"
                      onClick={onRetryLoad}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap"
                    >
                      <RefreshCw className="w-4 h-4" aria-hidden="true" />
                      <span>Tentar novamente</span>
                    </button>
                  )}
                  {onSignOut && (
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                    >
                      <LogOut className="w-4 h-4" aria-hidden="true" />
                      <span>Sair</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'signed_out' && (
          <div className="pt-6 space-y-5">
            <div>
              <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                Entre para acessar os dados da obra
              </h1>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Faça login com sua conta Google para carregar e sincronizar em tempo real os lançamentos diários, metas por ambiente, efetivo e relatórios em PDF entre seus dispositivos.
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-md bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors shadow-2xs"
            >
              {signingIn ? (
                <>
                  <Loader2 className="w-4 h-4 text-[#1D4ED8] animate-spin" aria-hidden="true" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <GoogleIcon />
                  <span>Entrar com Google</span>
                </>
              )}
            </button>

            <p className="text-xs text-slate-500 leading-relaxed">
              No primeiro acesso, caso existam dados salvos localmente neste navegador, eles serão migrados automaticamente para sua conta no Firebase sem apagar o histórico local.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

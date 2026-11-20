import {
  BarChart3,
  Building2,
  ClipboardEdit,
  FileText,
  LogOut,
  Users,
  X,
} from 'lucide-react';
import type { ActiveTab } from '../types/project';
import { formatNumberBR } from '../utils/dates';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  projectName: string;
  overallPercent: number;
  remainingM2: number;
  alertCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userLabel?: string | null;
  onSignOut: () => void;
}

const NAV_ITEMS: { id: ActiveTab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'dashboard', label: 'Visão Geral & Curva S', icon: BarChart3 },
  { id: 'daily', label: 'Lançamento Diário', icon: ClipboardEdit },
  { id: 'structure', label: 'Pavimentos & Prazos', icon: Building2 },
  { id: 'attendance', label: 'Frequência & Efetivo', icon: Users },
  { id: 'reports', label: 'Relatórios PDF', icon: FileText },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  projectName,
  overallPercent,
  remainingM2,
  alertCount,
  mobileOpen,
  onCloseMobile,
  userLabel,
  onSignOut,
}: SidebarProps) {
  const content = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      {/* Brand zone: single crisp wordmark */}
      <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => {
            onSelectTab('dashboard');
            onCloseMobile();
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
        >
          PlanaObra
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Fechar menu de navegação"
          className="lg:hidden p-2 -mr-2 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Active project quick summary */}
      <div className="px-6 py-4 border-b border-slate-200">
        <p className="text-xs text-slate-500">Obra ativa</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-900 truncate" title={projectName}>
          {projectName || 'Sem título'}
        </p>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
            <span>Avanço global</span>
            <span className="font-mono font-medium text-slate-900 tabular-nums">
              {formatNumberBR(overallPercent, 1)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1D4ED8] transition-transform duration-200 origin-left"
              style={{ width: `${Math.min(100, Math.max(0, overallPercent))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
            Faltam {formatNumberBR(remainingM2, 1)} m²
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Navegação principal" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'dashboard' && alertCount > 0 && (
                <span
                  aria-label={`${alertCount} alerta(s) de produtividade`}
                  className={`text-xs font-mono font-semibold tabular-nums ${
                    isActive ? 'text-amber-300' : 'text-red-700'
                  }`}
                >
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quiet footer */}
      <div className="px-6 py-4 border-t border-slate-200 text-xs text-slate-500 space-y-2.5">
        <div>
          <p className="font-medium text-slate-700 truncate" title={userLabel || undefined}>
            {userLabel || 'Conta conectada'}
          </p>
          <p className="mt-0.5 text-slate-400">Sincronizado via Firebase</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onSignOut();
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 rounded-md transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {content}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-900/40"
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full">{content}</div>
        </div>
      )}
    </>
  );
}

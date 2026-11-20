import { ClipboardEdit, FileDown, LogOut, Menu } from 'lucide-react';
import type { ActiveTab } from '../types/project';

interface HeaderProps {
  activeTab: ActiveTab;
  projectName: string;
  onOpenMobileMenu: () => void;
  onQuickLog: () => void;
  onQuickReport: () => void;
  onSignOut: () => void;
}

const TAB_TITLES: Record<ActiveTab, string> = {
  dashboard: 'Visão Geral & Curva S',
  daily: 'Lançamento Diário e Armazenamento',
  structure: 'Pavimentos, Ambientes e Prazos',
  attendance: 'Frequência e Efetivo',
  reports: 'Relatórios em PDF',
};

export function Header({
  activeTab,
  projectName,
  onOpenMobileMenu,
  onQuickLog,
  onQuickReport,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sm:gap-8">
      {/* Left: Mobile trigger + Breadcrumb trail */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Abrir menu de navegação"
          className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav aria-label="Localização atual" className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:inline text-slate-500 truncate max-w-[200px]">
            {projectName || 'Obra'}
          </span>
          <span className="hidden sm:inline text-slate-300" aria-hidden="true">
            /
          </span>
          <span className="font-semibold text-slate-900 truncate">
            {TAB_TITLES[activeTab]}
          </span>
        </nav>
      </div>

      {/* Right: Concise single-line actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {activeTab !== 'daily' && (
          <button
            type="button"
            onClick={onQuickLog}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <ClipboardEdit className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Lançar Produção</span>
          </button>
        )}
        {activeTab !== 'reports' && (
          <button
            type="button"
            onClick={onQuickReport}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Relatórios PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Sair</span>
        </button>
      </div>
    </header>
  );
}

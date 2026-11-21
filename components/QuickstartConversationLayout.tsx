'use client';

import type { ReactNode } from 'react';
import { PhoneOff } from 'lucide-react';
import type { PresenceTone } from './PresenceOrb';

type QuickstartConversationLayoutProps = {
  statusPanel: ReactNode;
  transcriptPanel: ReactNode;
  deskBoard: ReactNode;
  viewControls: ReactNode;
  showTranscript: boolean;
  presence: ReactNode;
  tone: PresenceTone;
  compact: boolean;
  controls: ReactNode;
  onEndConversation: () => void;
};

export function QuickstartConversationLayout({
  statusPanel,
  transcriptPanel,
  deskBoard,
  viewControls,
  showTranscript,
  presence,
  tone,
  compact,
  controls,
  onEndConversation,
}: QuickstartConversationLayoutProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden text-left">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.10),transparent_65%)]"
        aria-hidden
      />

      <header
        className={`relative flex shrink-0 items-center justify-between gap-3 ${compact ? 'px-3 py-2.5' : 'px-4 py-3 md:px-6'}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-300 to-indigo-500 text-sm font-bold text-black">
            B
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-base font-semibold leading-none tracking-tight text-white">Beside</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {viewControls}
          {statusPanel}
        </div>
      </header>

      <div
        className={`relative flex min-h-0 w-full flex-1 flex-col gap-4 lg:flex-row ${compact ? 'px-3' : 'px-4 md:px-6'}`}
      >
        {showTranscript && (
          <aside className="order-2 h-64 min-h-0 w-full shrink-0 lg:order-1 lg:h-full lg:w-[18rem] xl:w-[21rem]">
            {transcriptPanel}
          </aside>
        )}

        <main className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <div data-tone={tone} className="beside-stage flex min-h-0 flex-1 flex-col overflow-y-auto pb-1 lg:overflow-hidden">
            {deskBoard}
          </div>
        </main>
      </div>

      <footer className={`relative shrink-0 ${compact ? 'px-3 py-3' : 'px-4 py-4 md:px-6'}`}>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 backdrop-blur-md">
          <div className="min-w-0 flex-1">{presence}</div>
          <div className="flex shrink-0 items-center">{controls}</div>
          <div className="flex min-w-0 flex-1 justify-end">
            <button
              type="button"
              onClick={onEndConversation}
              aria-label="End session"
              title="End session"
              className="flex h-9 items-center gap-2 rounded-full bg-rose-500/90 px-3 text-xs font-semibold text-white transition hover:bg-rose-500"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              {!compact && <span className="hidden sm:inline">End</span>}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

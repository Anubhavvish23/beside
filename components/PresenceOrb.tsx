'use client';

export type PresenceTone =
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'idle'
  | 'quiet'
  | 'conversing'
  | 'off'
  | 'connecting';

const tone_styles: Record<PresenceTone, { core: string; ring: string; label: string; detail: string }> = {
  listening: { core: 'from-sky-300 to-cyan-500', ring: 'border-sky-300/50', label: 'Listening', detail: 'Talk it through out loud' },
  thinking: { core: 'from-amber-200 to-amber-500', ring: 'border-amber-300/50', label: 'Thinking', detail: 'Looking at your work' },
  speaking: { core: 'from-emerald-200 to-emerald-500', ring: 'border-emerald-300/50', label: 'Speaking', detail: 'Interrupt any time' },
  idle: { core: 'from-sky-200/80 to-indigo-400/80', ring: 'border-white/15', label: 'Beside is here', detail: 'Quietly watching' },
  quiet: { core: 'from-zinc-400/70 to-zinc-600/80', ring: 'border-white/10', label: 'Beside is quiet', detail: 'Press Stuck or Conversate' },
  conversing: { core: 'from-sky-300 to-indigo-500', ring: 'border-sky-300/50', label: 'Live conversation', detail: 'Talk freely, Beside is listening' },
  off: { core: 'from-zinc-500 to-zinc-700', ring: 'border-white/10', label: 'Beside is off', detail: 'Turn on for help' },
  connecting: { core: 'from-zinc-300 to-zinc-500', ring: 'border-white/15', label: 'Connecting', detail: 'One moment' },
};

export function PresenceOrb({ tone, compact = false }: { tone: PresenceTone; compact?: boolean }) {
  const style = tone_styles[tone];
  const active = tone === 'listening' || tone === 'speaking' || tone === 'thinking' || tone === 'conversing';
  return (
    <div className="flex min-w-0 items-center gap-3" aria-live="polite">
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
        {active && (
          <>
            <span className={`presence-ring absolute inset-0 rounded-full border ${style.ring}`} />
            <span className={`presence-ring presence-ring-late absolute inset-0 rounded-full border ${style.ring}`} />
          </>
        )}
        <span
          className={`relative h-6 w-6 rounded-full bg-gradient-to-br shadow-[0_0_24px_rgba(56,189,248,0.25)] transition-all duration-500 ${style.core} ${
            tone === 'speaking' ? 'presence-breathe' : tone === 'thinking' ? 'animate-pulse' : ''
          }`}
        />
      </span>
      {!compact && (
        <span className="hidden min-w-0 flex-col sm:flex">
          <span className="truncate text-sm font-medium text-white">{style.label}</span>
          <span className="truncate text-xs text-white/40">{style.detail}</span>
        </span>
      )}
    </div>
  );
}

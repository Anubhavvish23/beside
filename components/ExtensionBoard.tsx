'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentState,
  AgoraVoiceAI,
  ChatMessagePriority,
  ChatMessageType,
  ThinkListeningAction,
  ThinkSpeakingAction,
  ThinkThinkingAction,
} from 'agora-agent-client-toolkit';
import { Check, Eye, Lightbulb, MousePointerClick, Sigma } from 'lucide-react';
import type { LearnerSetupInput } from '@/types/conversation';
import { ask_extension, language_from, on_extension_push, type EditorSnapshot } from '@/lib/extension-bridge';
import { detect_language } from '@/lib/detect-language';
import { count_lines, save_summary } from '@/lib/history';

type CoachView = {
  stuck_level: number;
  reading_line: number;
  hints: { hint_id: string; text: string; line_number: number }[];
  formulas: { formula_id: string; text: string }[];
  milestones: { milestone_id: string; note: string }[];
  ghost: { ghost_id: string; text: string; after_line: number } | null;
  last_error: { code: string; detail: string } | null;
};

type StuckReason = 'asked' | 'quiet' | 'rewriting';

type ExtensionBoardProps = {
  session_key: string;
  setup: LearnerSetupInput;
  agent_uid: string;
  agent_state: AgentState | null;
  agent_enabled: boolean;
};

const quiet_after_ms = 25000;
const rewrite_window_ms = 15000;
const rewrite_chars = 40;
const auto_cooldown_ms = 60000;

export function ExtensionBoard({ session_key, setup, agent_uid, agent_state, agent_enabled }: ExtensionBoardProps) {
  const [view, set_view] = useState<CoachView | null>(null);
  const [snapshot, set_snapshot] = useState<EditorSnapshot | null>(null);
  const [reading, set_reading] = useState(false);
  const [notice, set_notice] = useState<string | null>(null);

  const code_ref = useRef('');
  const cursor_ref = useRef(0);
  const last_change_at = useRef(0);
  const typed_since_stuck = useRef(0);
  const deletes = useRef<{ at: number; count: number }[]>([]);
  const last_auto_at = useRef(0);
  const started_at = useRef(0);
  const baseline_lines = useRef<number | null>(null);
  const language_ref = useRef(setup.language);
  const [language, set_language] = useState(setup.language);
  const stats = useRef({ stuck_asked: 0, stuck_auto: 0, ghosts_accepted: 0, max_help_level: 0 });
  const shown_hint = useRef<string | null>(null);
  const shown_ghost = useRef<string | null>(null);

  const post = useCallback(
    (path: string, body: Record<string, unknown>) =>
      fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...setup, language: language_ref.current, session: session_key, ...body }),
      }),
    [session_key, setup],
  );

  const pull_snapshot = useCallback(async () => {
    const next = await ask_extension<EditorSnapshot>({ type: 'read_code' });
    if (!next) {
      set_snapshot({ ok: false, error: 'no_extension' });
      return null;
    }
    set_snapshot(next);
    if (next.ok && typeof next.code === 'string') {
      const found = language_from(next.language) ?? detect_language(next.code);
      if (found && found !== language_ref.current) {
        language_ref.current = found;
        set_language(found);
        post('/api/draft', { code: next.code }).catch(() => {});
      }
    }
    if (next.ok && typeof next.code === 'string' && baseline_lines.current === null) {
      baseline_lines.current = count_lines(next.code);
    }
    if (next.ok && typeof next.code === 'string' && next.code !== code_ref.current) {
      const previous = code_ref.current;
      if (next.code.length < previous.length) {
        deletes.current.push({ at: Date.now(), count: previous.length - next.code.length });
      } else {
        typed_since_stuck.current += next.code.length - previous.length;
      }
      code_ref.current = next.code;
      last_change_at.current = Date.now();
      post('/api/draft', { code: next.code }).catch(() => {});
    }
    if (next.ok) cursor_ref.current = next.cursor_line ?? 0;
    return next;
  }, [post]);

  useEffect(() => {
    const first = setTimeout(pull_snapshot, 0);
    const timer = setInterval(pull_snapshot, 1500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [pull_snapshot]);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const response = await fetch(`/api/state?session=${session_key}`, { cache: 'no-store' });
        if (!response.ok) return;
        const next = (await response.json()) as CoachView;
        if (alive) set_view(next);
      } catch {}
    };
    pull();
    const timer = setInterval(pull, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [session_key]);

  const send_brief = useCallback(
    async (brief: string, asked: boolean, reason: string) => {
      const ai = AgoraVoiceAI.getInstance();
      try {
        await ai.think(agent_uid, {
          text: brief,
          onListeningAction: ThinkListeningAction.INTERRUPT,
          onThinkingAction: asked ? ThinkThinkingAction.INTERRUPT : ThinkThinkingAction.IGNORE,
          onSpeakingAction: asked ? ThinkSpeakingAction.INTERRUPT : ThinkSpeakingAction.IGNORE,
          interruptable: true,
          metadata: { source: 'beside_extension', reason },
        });
      } catch {
        await ai.sendText(agent_uid, {
          messageType: ChatMessageType.TEXT,
          priority: asked ? ChatMessagePriority.INTERRUPTED : ChatMessagePriority.APPEND,
          responseInterruptable: true,
          text: brief,
        });
      }
    },
    [agent_uid],
  );

  const ask_for_help = useCallback(
    async (reason: StuckReason) => {
      if (!agent_enabled) {
        set_notice('Turn Beside on first.');
        return;
      }
      const fresh = await pull_snapshot();
      if (!fresh?.ok) {
        set_notice('Click into the code editor on your page, then try again.');
        return;
      }
      typed_since_stuck.current = 0;
      deletes.current = [];
      if (reason === 'asked') stats.current.stuck_asked += 1;
      else stats.current.stuck_auto += 1;
      set_reading(true);
      try {
        const response = await post('/api/stuck', { code: code_ref.current, reason, cursor_line: cursor_ref.current });
        const result = (await response.json()) as { ok: boolean; brief?: string; state?: CoachView; detail?: string };
        if (!result.ok || !result.brief) {
          set_reading(false);
          set_notice(result.detail ?? 'Beside could not read your code.');
          return;
        }
        if (result.state) set_view(result.state);
        await send_brief(result.brief, reason === 'asked', reason);
      } catch {
        set_reading(false);
        set_notice('Beside is not connected yet. Give it a second.');
      }
    },
    [agent_enabled, post, pull_snapshot, send_brief],
  );

  useEffect(() => {
    return on_extension_push((push) => {
      if (push.type === 'stuck') ask_for_help('asked');
      if (push.type === 'editor_changed') pull_snapshot();
      if (push.type === 'ghost_result') {
        const ghost_id = shown_ghost.current;
        if (push.accepted) stats.current.ghosts_accepted += 1;
        post('/api/ghost', push.accepted ? { action: 'accept', ghost_id } : { action: 'dismiss' })
          .then(() => pull_snapshot())
          .catch(() => {});
      }
    });
  }, [ask_for_help, post, pull_snapshot]);

  const latest_hint = view?.hints[view.hints.length - 1] ?? null;

  useEffect(() => {
    if (!latest_hint || latest_hint.hint_id === shown_hint.current) return;
    shown_hint.current = latest_hint.hint_id;
    set_reading(false);
    if (!view?.ghost) ask_extension({ type: 'show_hint', text: latest_hint.text });
  }, [latest_hint, view?.ghost]);

  useEffect(() => {
    const ghost = view?.ghost;
    if (!ghost || ghost.ghost_id === shown_ghost.current) return;
    shown_ghost.current = ghost.ghost_id;
    ask_extension({ type: 'show_ghost', text: ghost.text, hint: latest_hint?.text });
  }, [latest_hint?.text, view?.ghost]);

  useEffect(() => {
    const state = !agent_enabled
      ? 'off'
      : agent_state === AgentState.SPEAKING
        ? 'speaking'
        : agent_state === AgentState.THINKING
          ? 'thinking'
          : '';
    ask_extension({ type: 'agent_state', state }, 800);
  }, [agent_enabled, agent_state]);

  useEffect(() => {
    if (!reading) return;
    const timer = setTimeout(() => set_reading(false), 20000);
    return () => clearTimeout(timer);
  }, [reading]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => set_notice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (!agent_enabled || reading || now - last_auto_at.current < auto_cooldown_ms) return;
      if (agent_state === AgentState.SPEAKING || agent_state === AgentState.THINKING) return;
      if (!code_ref.current.trim() || !last_change_at.current) return;
      const idle_for = now - last_change_at.current;
      deletes.current = deletes.current.filter((item) => now - item.at < rewrite_window_ms);
      const deleted = deletes.current.reduce((sum, item) => sum + item.count, 0);
      if (deleted >= rewrite_chars && idle_for > 4000) {
        last_auto_at.current = now;
        ask_for_help('rewriting');
        return;
      }
      if (typed_since_stuck.current > 0 && idle_for > quiet_after_ms) {
        last_auto_at.current = now;
        ask_for_help('quiet');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [agent_enabled, agent_state, ask_for_help, reading]);

  useEffect(() => {
    if (!view) return;
    if (!started_at.current) started_at.current = Date.now();
    stats.current.max_help_level = Math.max(stats.current.max_help_level, view.stuck_level);
    save_summary({
      session_key,
      kind: setup.kind,
      title: setup.title,
      language,
      learner_name: setup.learner_name,
      started_at: started_at.current,
      updated_at: Date.now(),
      ...stats.current,
      hints: view.hints.length,
      lines_written: Math.max(0, count_lines(code_ref.current) - (baseline_lines.current ?? count_lines(code_ref.current))),
      milestones: view.milestones.map((item) => item.note),
      questions: {},
    });
  }, [language, session_key, setup, view]);

  const line_count = (snapshot?.code ?? '').split('\n').filter((line) => line.trim()).length;
  const connected = Boolean(snapshot?.ok);

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        className={`beside-board rounded-2xl border p-4 ${
          connected ? 'border-white/10 bg-white/[0.03]' : 'border-amber-300/30 bg-amber-300/[0.06]'
        }`}
      >
        {connected ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-white/45">Reading your editor</p>
            <p className="mt-1 truncate text-sm text-white">{snapshot?.title || snapshot?.host}</p>
            <p className="mt-1 text-xs text-white/45">
              {language} · {snapshot?.kind} · {line_count} line{line_count === 1 ? '' : 's'}
              {snapshot?.cursor_line ? ` · cursor on line ${snapshot.cursor_line}` : ''}
            </p>
          </>
        ) : (
          <p className="flex items-start gap-2 text-sm text-amber-100/90">
            <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
            {snapshot?.error === 'no_extension'
              ? 'Open this from the Beside extension icon on a page with a code editor.'
              : 'Click into the code editor on your page. Beside will pick it up.'}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => ask_for_help('asked')}
        disabled={reading || !agent_enabled}
        className="flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white/80 transition hover:border-amber-300/60 hover:text-amber-100 disabled:opacity-50"
      >
        {reading ? (
          <>
            <Eye className="h-4 w-4 animate-pulse text-amber-300" />
            Beside is reading line {view?.reading_line || snapshot?.cursor_line || 1}…
          </>
        ) : (
          <>
            <Lightbulb className="h-4 w-4" />
            Stuck?
            <span className="rounded border border-white/10 px-1.5 text-[10px] text-white/40">Ctrl+Shift+Y</span>
          </>
        )}
      </button>
      {notice && <p className="text-xs text-amber-200/80">{notice}</p>}

      {view?.ghost && (
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-white/45">Next line</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 px-3 py-2 font-mono text-[13px] text-white/90">
            {view.ghost.text}
          </pre>
          <button
            type="button"
            onClick={() => ask_extension({ type: 'insert_line', text: view.ghost?.text ?? '' })}
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-black hover:bg-white"
          >
            Insert into editor
          </button>
          <span className="ml-3 text-xs text-white/35">or Alt+Enter on your page</span>
        </div>
      )}

      {latest_hint && (
        <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-sky-300">
            <Lightbulb className="h-3.5 w-3.5" />
            {latest_hint.line_number > 0 ? `Hint · line ${latest_hint.line_number}` : 'Hint'}
          </p>
          <p className="mt-2 text-[15px] leading-6 text-white">{latest_hint.text}</p>
        </div>
      )}

      {(view?.formulas.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.05] p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-violet-300">
            <Sigma className="h-3.5 w-3.5" />
            Rules
          </p>
          <ul className="mt-2 space-y-1.5">
            {view!.formulas
              .slice()
              .reverse()
              .map((formula) => (
                <li key={formula.formula_id} className="font-mono text-sm text-white/90">
                  {formula.text}
                </li>
              ))}
          </ul>
        </div>
      )}

      {(view?.milestones.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-300">
            <Check className="h-3.5 w-3.5" />
            Wins
          </p>
          <ul className="mt-2 space-y-1">
            {view!.milestones.map((milestone) => (
              <li key={milestone.milestone_id} className="text-sm text-white/80">
                {milestone.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view?.last_error && <p className="text-xs text-rose-300/70">{view.last_error.detail}</p>}
    </div>
  );
}

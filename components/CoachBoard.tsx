'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentState,
  AgoraVoiceAI,
  ChatMessagePriority,
  ChatMessageType,
  ThinkListeningAction,
  ThinkSpeakingAction,
  ThinkThinkingAction,
} from 'agora-agent-client-toolkit';
import { Check, Eye, Lightbulb, Sigma, Sparkles } from 'lucide-react';
import type { LearnerSetupInput } from '@/types/conversation';
import { count_lines, save_summary, type SessionSummary } from '@/lib/history';
import { code_languages, detect_language } from '@/lib/detect-language';

type CoachHint = {
  hint_id: string;
  text: string;
  line_number: number;
  stuck_level: number;
  created_at: number;
};

type CoachView = {
  stuck_level: number;
  reading_line: number;
  hints: CoachHint[];
  formulas: { formula_id: string; text: string; created_at: number }[];
  milestones: { milestone_id: string; note: string; created_at: number }[];
  ghost: { ghost_id: string; text: string; after_line: number } | null;
  last_error: { code: string; detail: string; created_at: number } | null;
  question_id: string;
  answers: Record<string, { wrong: number[]; correct_choice: number | null }>;
  question: {
    question_id: string;
    section: 'maths' | 'english';
    topic: string;
    text: string;
    options: string[];
  } | null;
  question_list: { question_id: string; section: 'maths' | 'english'; topic: string }[];
  updated_at: number;
};

const option_letters = ['A', 'B', 'C', 'D'];

type StuckReason = 'asked' | 'quiet' | 'rewriting';

type CoachBoardProps = {
  session_key: string;
  setup: LearnerSetupInput;
  agent_uid: string;
  agent_state: AgentState | null;
  agent_enabled: boolean;
  show_notes: boolean;
};

const line_height = 24;
const quiet_after_ms = 25000;
const rewrite_window_ms = 15000;
const rewrite_chars = 40;
const auto_cooldown_ms = 60000;
const reading_timeout_ms = 20000;

function indent_of(line: string) {
  return line.match(/^\s*/)?.[0] ?? '';
}

function line_at(code: string, position: number) {
  return code.slice(0, position).split('\n').length;
}

function ghost_placement(code: string, after_line: number) {
  const lines = code.split('\n');
  const anchor = Math.min(Math.max(after_line, 1), lines.length);
  const rest_is_empty = lines.slice(anchor).every((line) => !line.trim());
  return { lines, anchor, on_next_line: rest_is_empty };
}

function ghost_text_for(code: string, after_line: number, text: string) {
  if (/^\s/.test(text)) return text;
  const lines = code.split('\n');
  const anchor_line = lines[Math.min(Math.max(after_line, 1), lines.length) - 1] ?? '';
  const base = indent_of(anchor_line);
  const opens = /[:{]\s*$/.test(anchor_line);
  return `${base}${opens ? '    ' : ''}${text}`;
}

export function CoachBoard({
  session_key,
  setup: initial_setup,
  agent_uid,
  agent_state,
  agent_enabled,
  show_notes,
}: CoachBoardProps) {
  const [code, set_code] = useState('');
  const [language, set_language] = useState(initial_setup.language);
  const ignored_detection = useRef<string | null>(null);
  const setup = useMemo(() => ({ ...initial_setup, language }), [initial_setup, language]);
  const [view, set_view] = useState<CoachView | null>(null);
  const [reading, set_reading] = useState<{ line: number; reason: StuckReason } | null>(null);
  const [notice, set_notice] = useState<string | null>(null);
  const [scroll_top, set_scroll_top] = useState(0);
  const [scroll_left, set_scroll_left] = useState(0);
  const [dismissed_ghost, set_dismissed_ghost] = useState<string | null>(null);
  const [cursor, set_cursor] = useState({ line: 1, col: 0 });
  const [focused, set_focused] = useState(false);
  const [idle, set_idle] = useState(false);
  const idle_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const code_ref = useRef('');
  const last_edit_at = useRef(0);
  const typed_since_stuck = useRef(0);
  const deletes = useRef<{ at: number; count: number }[]>([]);
  const last_auto_at = useRef(0);
  const draft_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reading_started = useRef(0);
  const seen_hint = useRef<string | null>(null);
  const started_at = useRef(0);
  const baseline_lines = useRef<number | null>(null);
  const stats = useRef({ stuck_asked: 0, stuck_auto: 0, ghosts_accepted: 0, max_help_level: 0 });

  const is_code = setup.kind === 'code';

  const save_draft = useCallback(
    (next: string) => {
      if (draft_timer.current) clearTimeout(draft_timer.current);
      draft_timer.current = setTimeout(() => {
        fetch('/api/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...setup, session: session_key, code: next }),
        }).catch(() => {});
      }, 400);
    },
    [session_key, setup],
  );

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

  const latest_hint = view?.hints[view.hints.length - 1] ?? null;

  useEffect(() => {
    if (!view) return;
    if (!started_at.current) started_at.current = Date.now();
    if (baseline_lines.current === null) baseline_lines.current = count_lines(code_ref.current);
    stats.current.max_help_level = Math.max(stats.current.max_help_level, view.stuck_level);
    const records: SessionSummary['questions'] = {};
    for (const item of view.question_list ?? []) {
      const answer = view.answers?.[item.question_id];
      if (!answer) continue;
      records[item.question_id] = {
        topic: item.topic,
        section: item.section,
        wrong: answer.wrong.length,
        solved: answer.correct_choice != null,
      };
    }
    save_summary({
      session_key,
      kind: setup.kind,
      title: setup.title,
      language: setup.language,
      learner_name: setup.learner_name,
      started_at: started_at.current,
      updated_at: Date.now(),
      ...stats.current,
      hints: view.hints.length,
      lines_written: Math.max(0, count_lines(code_ref.current) - baseline_lines.current),
      milestones: view.milestones.map((item) => item.note),
      questions: records,
    });
  }, [session_key, setup, view]);

  useEffect(() => {
    if (!latest_hint || latest_hint.hint_id === seen_hint.current) return;
    seen_hint.current = latest_hint.hint_id;
    set_reading(null);
  }, [latest_hint]);

  useEffect(() => {
    if (!reading) return;
    const timer = setTimeout(() => set_reading(null), reading_timeout_ms);
    return () => clearTimeout(timer);
  }, [reading]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => set_notice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const change_language = useCallback(
    (next: string, source: 'manual' | 'auto') => {
      if (!is_code || next === language) return;
      if (source === 'manual') {
        const detected = detect_language(code_ref.current);
        ignored_detection.current = detected && detected !== next ? detected : null;
      }
      set_language(next);
      set_notice(
        source === 'auto'
          ? `Looks like ${next}. Beside switched to it.`
          : `Switched to ${next}. Beside will coach in ${next}.`,
      );
      fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...initial_setup, language: next, session: session_key, code: code_ref.current }),
      }).catch(() => {});
    },
    [initial_setup, is_code, language, session_key],
  );

  useEffect(() => {
    if (!is_code) return;
    const timer = setTimeout(() => {
      const detected = detect_language(code);
      if (!detected || detected === language || detected === ignored_detection.current) return;
      change_language(detected, 'auto');
    }, 900);
    return () => clearTimeout(timer);
  }, [change_language, code, is_code, language]);

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
          metadata: { source: 'beside_board', reason },
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
      const current = code_ref.current;
      const textarea = textarea_ref.current;
      const cursor_line = textarea ? line_at(current, textarea.selectionStart) : 0;
      typed_since_stuck.current = 0;
      deletes.current = [];
      reading_started.current = Date.now();
      if (reason === 'asked') stats.current.stuck_asked += 1;
      else stats.current.stuck_auto += 1;
      try {
        const response = await fetch('/api/stuck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...setup, session: session_key, code: current, reason, cursor_line }),
        });
        const result = (await response.json()) as {
          ok: boolean;
          brief?: string;
          state?: CoachView;
          detail?: string;
        };
        if (!result.ok || !result.brief) {
          set_notice(result.detail ?? 'Beside could not read your work.');
          return;
        }
        if (result.state) {
          set_view(result.state);
          set_reading({ line: result.state.reading_line, reason });
        }
        await send_brief(result.brief, reason === 'asked', reason);
      } catch {
        set_reading(null);
        set_notice('Beside is not connected yet. Give it a second.');
      }
    },
    [send_brief, session_key, setup],
  );

  const working_by_question = useRef<Record<string, string>>({});
  const shown_question = useRef<string | null>(null);

  useEffect(() => {
    if (is_code || !view?.question_id) return;
    const previous = shown_question.current;
    if (previous === view.question_id) return;
    if (previous) working_by_question.current[previous] = code_ref.current;
    shown_question.current = view.question_id;
    const restored = working_by_question.current[view.question_id] ?? '';
    code_ref.current = restored;
    set_code(restored);
    save_draft(restored);
  }, [is_code, save_draft, view?.question_id]);

  const open_question = useCallback(
    async (question_id: string) => {
      try {
        const response = await fetch('/api/question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...setup, session: session_key, question_id }),
        });
        const result = (await response.json()) as { state?: CoachView };
        if (result.state) set_view(result.state);
      } catch {}
    },
    [session_key, setup],
  );

  const pick_option = useCallback(
    async (choice: number) => {
      const question_id = view?.question?.question_id;
      if (!question_id) return;
      try {
        const response = await fetch('/api/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...setup, session: session_key, question_id, choice }),
        });
        const result = (await response.json()) as { ok: boolean; correct?: boolean; brief?: string; state?: CoachView };
        if (result.state) set_view(result.state);
        if (!result.ok || !result.brief) return;
        set_notice(result.correct ? 'Correct! Nice one.' : 'Not quite. Beside has a hint for you.');
        if (agent_enabled) await send_brief(result.brief, true, 'asked');
      } catch {
        set_notice('Could not check that answer. Try again.');
      }
    },
    [agent_enabled, send_brief, session_key, setup, view],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (!agent_enabled || reading || now - last_auto_at.current < auto_cooldown_ms) return;
      if (agent_state === AgentState.SPEAKING || agent_state === AgentState.THINKING) return;
      if (!code_ref.current.trim()) return;
      const idle_for = now - last_edit_at.current;
      deletes.current = deletes.current.filter((item) => now - item.at < rewrite_window_ms);
      const deleted = deletes.current.reduce((sum, item) => sum + item.count, 0);
      if (deleted >= rewrite_chars && idle_for > 4000) {
        last_auto_at.current = now;
        set_notice('Lots of rewriting there. Beside is taking a look.');
        ask_for_help('rewriting');
        return;
      }
      if (typed_since_stuck.current > 0 && idle_for > quiet_after_ms) {
        last_auto_at.current = now;
        set_notice('You went quiet. Beside is taking a look.');
        ask_for_help('quiet');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [agent_enabled, agent_state, ask_for_help, reading]);

  const track_cursor = useCallback(() => {
    const textarea = textarea_ref.current;
    if (!textarea) return;
    const before = textarea.value.slice(0, textarea.selectionStart);
    const parts = before.split('\n');
    set_cursor({ line: parts.length, col: parts[parts.length - 1].length });
    set_idle(false);
    if (idle_timer.current) clearTimeout(idle_timer.current);
    idle_timer.current = setTimeout(() => set_idle(true), 1500);
  }, []);

  useEffect(() => () => {
    if (idle_timer.current) clearTimeout(idle_timer.current);
  }, []);

  const apply_code = useCallback(
    (next: string, cursor?: number) => {
      const previous = code_ref.current;
      if (next.length < previous.length) {
        deletes.current.push({ at: Date.now(), count: previous.length - next.length });
      } else {
        typed_since_stuck.current += next.length - previous.length;
      }
      code_ref.current = next;
      last_edit_at.current = Date.now();
      set_code(next);
      save_draft(next);
      requestAnimationFrame(() => {
        const textarea = textarea_ref.current;
        if (!textarea) return;
        if (cursor !== undefined) {
          textarea.selectionStart = cursor;
          textarea.selectionEnd = cursor;
        }
        track_cursor();
      });
    },
    [save_draft, track_cursor],
  );

  const ghost = view?.ghost && view.ghost.ghost_id !== dismissed_ghost ? view.ghost : null;

  const ghost_layout = useMemo(() => {
    if (!ghost) return null;
    const placement = ghost_placement(code, ghost.after_line);
    return { ...placement, text: ghost_text_for(code, placement.anchor, ghost.text) };
  }, [code, ghost]);

  const inline_ghost = useMemo(() => {
    if (!ghost || !ghost_layout) return null;
    if (cursor.line !== ghost_layout.anchor + 1) return null;
    const line_text = code.split('\n')[cursor.line - 1] ?? '';
    if (cursor.col !== line_text.length) return null;
    const typed = line_text.trim();
    const target = ghost_layout.text.trim();
    if (!target.startsWith(typed) || typed.length >= target.length) return null;
    const indent = indent_of(ghost_layout.text);
    const pad = !typed && line_text.length < indent.length ? indent.slice(line_text.length) : '';
    const full_line = typed
      ? `${indent_of(line_text)}${target}`
      : `${line_text.length >= indent.length ? line_text : indent}${target}`;
    return { line: cursor.line, suffix: `${pad}${target.slice(typed.length)}`, full_line };
  }, [code, cursor, ghost, ghost_layout]);

  const accept_ghost = useCallback(() => {
    if (!ghost || !ghost_layout) return false;
    if (inline_ghost) {
      const next_lines = code.split('\n');
      next_lines[inline_ghost.line - 1] = inline_ghost.full_line;
      const next = next_lines.join('\n');
      apply_code(next, next_lines.slice(0, inline_ghost.line).join('\n').length);
      set_dismissed_ghost(ghost.ghost_id);
      stats.current.ghosts_accepted += 1;
      fetch('/api/ghost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...setup, session: session_key, action: 'accept', ghost_id: ghost.ghost_id, code: next }),
      }).catch(() => {});
      return true;
    }
    const { lines, anchor, text, on_next_line } = ghost_layout;
    const next_lines = [...lines];
    if (on_next_line && anchor < next_lines.length && !next_lines[anchor].trim()) {
      next_lines[anchor] = text;
    } else {
      next_lines.splice(anchor, 0, text);
    }
    const next = next_lines.join('\n');
    const cursor = next_lines.slice(0, anchor + 1).join('\n').length;
    apply_code(next, cursor);
    set_dismissed_ghost(ghost.ghost_id);
    stats.current.ghosts_accepted += 1;
    fetch('/api/ghost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...setup, session: session_key, action: 'accept', ghost_id: ghost.ghost_id, code: next }),
    }).catch(() => {});
    return true;
  }, [apply_code, code, ghost, ghost_layout, inline_ghost, session_key, setup]);

  const dismiss_ghost = useCallback(() => {
    if (!ghost) return;
    set_dismissed_ghost(ghost.ghost_id);
    fetch('/api/ghost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...setup, session: session_key, action: 'dismiss' }),
    }).catch(() => {});
  }, [ghost, session_key, setup]);

  const on_key_down = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    if ((event.ctrlKey || event.metaKey) && (event.key === 'i' || event.key === 'I' || event.key === 'Enter')) {
      event.preventDefault();
      if (agent_enabled && !reading) ask_for_help('asked');
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      if (accept_ghost()) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const next = `${code.slice(0, start)}    ${code.slice(end)}`;
      apply_code(next, start + 4);
      return;
    }
    if (event.key === 'Escape' && ghost) {
      event.preventDefault();
      dismiss_ghost();
      return;
    }
    if (event.key === 'Enter' && is_code) {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current_line = code.slice(0, start).split('\n').pop() ?? '';
      const extra = /[:{]\s*$/.test(current_line) ? '    ' : '';
      const insert = `\n${indent_of(current_line)}${extra}`;
      const next = `${code.slice(0, start)}${insert}${code.slice(end)}`;
      apply_code(next, start + insert.length);
    }
  };

  const lines = code.split('\n');
  const line_count = Math.max(lines.length, 18);
  const reading_line = reading?.line ?? 0;
  const show_stuck_chip =
    agent_enabled &&
    focused &&
    idle &&
    (code.trim().length > 0 || Boolean(latest_hint)) &&
    !ghost &&
    !reading;
  const chip_on_hint_line = show_stuck_chip && cursor.line === latest_hint?.line_number;
  const status_text = !agent_enabled
    ? 'Beside is off'
    : reading
    ? reading.line > 0
      ? `Beside is reading line ${reading.line}…`
      : 'Beside is reading your work…'
    : agent_state === AgentState.SPEAKING
      ? 'Beside is talking'
      : agent_state === AgentState.THINKING
        ? 'Beside is thinking'
        : agent_state === AgentState.LISTENING
          ? 'Beside is listening'
          : 'Beside is beside you';

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 lg:flex-row">
      <section className="beside-board flex min-h-[22rem] flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f12]">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{setup.title}</p>
            {is_code ? (
              <div className="flex items-center gap-1.5 text-xs text-white/40">
                <select
                  value={language}
                  onChange={(event) => change_language(event.target.value, 'manual')}
                  aria-label="Programming language"
                  title="Change language, or just start typing and Beside detects it"
                  className="-ml-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-white/70 outline-none transition hover:border-white/15 focus:border-primary/60"
                >
                  {code_languages.map((item) => (
                    <option key={item} value={item} className="bg-[#161616]">
                      {item}
                    </option>
                  ))}
                </select>
                <span className="truncate">· {setup.learner_name}</span>
              </div>
            ) : (
              <p className="truncate text-xs text-white/40">Aptitude · {setup.learner_name}</p>
            )}
          </div>
          <span
            className={`hidden items-center gap-2 text-xs sm:flex ${reading ? 'text-amber-300' : 'text-white/40'}`}
            aria-live="polite"
          >
            {reading ? <Eye className="h-3.5 w-3.5 animate-pulse" /> : <Sparkles className="h-3.5 w-3.5" />}
            {status_text}
          </span>
        </header>

        {!is_code && view?.question && (
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {(['maths', 'english'] as const).map((section) => {
                const items = view.question_list.filter((item) => item.section === section);
                const solved = items.filter((item) => view.answers[item.question_id]?.correct_choice != null).length;
                return (
                  <div key={section} className="flex items-center gap-2">
                    <span className="w-16 text-xs font-medium uppercase tracking-wide text-white/45">
                      {section === 'maths' ? 'Maths' : 'English'} {solved}/{items.length}
                    </span>
                    <div className="flex gap-1">
                      {items.map((item, index) => {
                        const answer = view.answers[item.question_id];
                        const current = item.question_id === view.question_id;
                        const tone =
                          answer?.correct_choice != null
                            ? 'bg-emerald-400/80 text-black'
                            : answer?.wrong.length
                              ? 'bg-rose-400/30 text-rose-100'
                              : 'bg-white/[0.06] text-white/50';
                        return (
                          <button
                            key={item.question_id}
                            type="button"
                            onClick={() => open_question(item.question_id)}
                            title={item.topic}
                            className={`h-6 w-6 rounded-md text-[11px] font-medium transition ${tone} ${
                              current ? 'ring-2 ring-primary ring-offset-1 ring-offset-[#0d0f12]' : 'hover:bg-white/15'
                            }`}
                          >
                            {index + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-primary/80">{view.question.topic}</p>
            <p className="mt-1 text-[17px] leading-7 text-white">{view.question.text}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {view.question.options.map((option, index) => {
                const answer = view.answers[view.question!.question_id];
                const is_correct = answer?.correct_choice === index;
                const is_wrong = answer?.wrong.includes(index);
                const locked = answer?.correct_choice != null;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={locked || is_wrong}
                    onClick={() => pick_option(index)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      is_correct
                        ? 'border-emerald-400/70 bg-emerald-400/15 text-white'
                        : is_wrong
                          ? 'border-rose-400/40 bg-rose-400/10 text-white/50 line-through'
                          : locked
                            ? 'border-white/5 text-white/35'
                            : 'border-white/10 text-white/85 hover:border-primary/60 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                        is_correct ? 'bg-emerald-400 text-black' : 'bg-white/[0.08] text-white/70'
                      }`}
                    >
                      {is_correct ? <Check className="h-3.5 w-3.5" /> : option_letters[index]}
                    </span>
                    {option}
                  </button>
                );
              })}
            </div>
            {view.answers[view.question.question_id]?.correct_choice != null && (
              <button
                type="button"
                onClick={() => {
                  const index = view.question_list.findIndex((item) => item.question_id === view.question_id);
                  open_question(view.question_list[(index + 1) % view.question_list.length].question_id);
                }}
                className="mt-3 text-sm text-primary hover:text-white"
              >
                Next question →
              </button>
            )}
          </div>
        )}

        <div className="relative min-h-[10rem] flex-1 overflow-hidden font-mono text-[14px]">
          <div
            className="pointer-events-none absolute left-0 top-0 w-12 select-none border-r border-white/5 py-4 text-right text-white/25"
            style={{ transform: `translateY(${-scroll_top}px)` }}
          >
            {Array.from({ length: line_count }, (_, index) => (
              <div
                key={index}
                className={`pr-3 ${reading_line === index + 1 ? 'text-amber-300' : ''}`}
                style={{ height: line_height, lineHeight: `${line_height}px` }}
              >
                {index + 1}
              </div>
            ))}
          </div>

          <div className="absolute inset-y-0 left-12 right-0 overflow-hidden">
            <div
              className="pointer-events-none absolute left-0 top-0 min-w-full whitespace-pre px-4 py-4"
              style={{ transform: `translate(${-scroll_left}px, ${-scroll_top}px)` }}
              aria-hidden
            >
              {Array.from({ length: line_count }, (_, index) => {
                const text = lines[index] ?? '';
                const line_number = index + 1;
                const highlight =
                  reading_line === line_number
                    ? 'bg-amber-300/10'
                    : latest_hint?.line_number === line_number && !reading
                      ? 'bg-sky-400/10'
                      : '';
                const at_cursor = inline_ghost?.line === line_number;
                const ghost_next =
                  !inline_ghost && ghost_layout?.on_next_line && ghost_layout.anchor + 1 === line_number && !text.trim();
                const ghost_inline =
                  !inline_ghost && ghost_layout && !ghost_layout.on_next_line && ghost_layout.anchor === line_number;
                const show_hint_lens =
                  !ghost && !reading && latest_hint && latest_hint.line_number === line_number;
                return (
                  <div
                    key={index}
                    className={`-mx-4 px-4 ${highlight}`}
                    style={{ height: line_height, lineHeight: `${line_height}px` }}
                  >
                    {ghost_next ? (
                      <span className="italic text-white/30">{ghost_layout.text}</span>
                    ) : (
                      <span className="text-[#e6e6e6]">{text}</span>
                    )}
                    {at_cursor && <span className="italic text-white/30">{inline_ghost.suffix}</span>}
                    {ghost_inline && (
                      <span className="italic text-white/30">
                        {'    '}
                        {ghost_layout.text.trim()}
                      </span>
                    )}
                    {reading_line === line_number && (
                      <span className="ml-6 font-sans text-xs italic text-amber-300/70">
                        Beside is reading this line…
                      </span>
                    )}
                    {show_hint_lens && (
                      <span
                        className={`font-sans text-xs text-sky-300/60 ${
                          chip_on_hint_line && cursor.line === line_number ? 'ml-[8.5rem]' : 'ml-6'
                        }`}
                      >
                        {latest_hint.text.length > 70 ? `${latest_hint.text.slice(0, 70)}…` : latest_hint.text}
                      </span>
                    )}
                    {(at_cursor || ghost_next || ghost_inline) && (
                      <span className="ml-3 rounded border border-white/10 px-1.5 font-sans text-[10px] not-italic text-white/35">
                        Tab
                      </span>
                    )}
                  </div>
                );
              })}
              {ghost_layout?.on_next_line && ghost_layout.anchor >= line_count && (
                <div className="text-white/30" style={{ height: line_height, lineHeight: `${line_height}px` }}>
                  {ghost_layout.text}
                </div>
              )}
            </div>

            <textarea
              ref={textarea_ref}
              value={code}
              onChange={(event) => apply_code(event.target.value)}
              onKeyDown={on_key_down}
              onSelect={track_cursor}
              onFocus={() => {
                set_focused(true);
                track_cursor();
              }}
              onBlur={() => set_focused(false)}
              onScroll={(event) => {
                set_scroll_top(event.currentTarget.scrollTop);
                set_scroll_left(event.currentTarget.scrollLeft);
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              wrap="off"
              placeholder={
                latest_hint
                  ? ''
                  : is_code
                  ? `Start ${setup.title} here. Beside is watching quietly.`
                  : view?.question?.section === 'english'
                    ? 'Jot your thinking here if it helps, or just pick an option.'
                    : 'Write your working one step per line. Beside checks the maths.'
              }
              className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent px-4 py-4 text-transparent caret-amber-300 outline-none placeholder:text-white/20 selection:bg-sky-400/30"
              style={{ lineHeight: `${line_height}px` }}
              aria-label={is_code ? 'Code editor' : 'Working pad'}
            />

            {show_stuck_chip && (
              <div
                className="absolute"
                style={{
                  top: 16 + (cursor.line - 1) * line_height - scroll_top,
                  left: `calc(1rem + ${(lines[cursor.line - 1] ?? '').length + 2}ch - ${scroll_left}px)`,
                  height: line_height,
                }}
              >
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    ask_for_help('asked');
                  }}
                  className="flex h-full animate-in fade-in items-center gap-1.5 whitespace-nowrap font-sans text-xs text-white/25 transition hover:text-amber-200"
                >
                  <Lightbulb className="h-3 w-3" />
                  Stuck?
                  <span className="rounded border border-white/10 px-1 text-[10px]">Ctrl+I</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2 text-[11px] text-white/35">
          <span>
            {ghost
              ? 'Tab to accept the suggestion · Esc to skip'
              : agent_enabled
                ? 'Ctrl+I when stuck, or press Conversate to talk live'
                : 'Beside is off. Turn it on below to get help.'}
          </span>
          {notice && <span className="text-amber-200/80">{notice}</span>}
          {view?.last_error && !notice && (
            <span className="text-rose-300/70">{view.last_error.detail}</span>
          )}
        </footer>
      </section>

      {show_notes && (
      <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto lg:w-80">
        {latest_hint && (
          <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-sky-300">
              <Lightbulb className="h-3.5 w-3.5" />
              {latest_hint.line_number > 0 ? `Hint · line ${latest_hint.line_number}` : 'Hint'}
            </p>
            <p className="mt-2 text-[15px] leading-6 text-white">{latest_hint.text}</p>
          </div>
        )}

        {(!is_code || (view?.formulas.length ?? 0) > 0) && (
          <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.05] p-4">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-violet-300">
              <Sigma className="h-3.5 w-3.5" />
              {is_code ? 'Rules' : 'Formulas & rules'}
            </p>
            {view?.formulas.length ? (
              <ul className="mt-2 space-y-2">
                {view.formulas
                  .slice()
                  .reverse()
                  .map((formula) => (
                    <li key={formula.formula_id} className="font-mono text-sm text-white/90">
                      {formula.text}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-white/40">Beside writes the formulas you need here.</p>
            )}
          </div>
        )}

        {(view?.hints.length ?? 0) > 1 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">Earlier hints</p>
            <ul className="mt-2 space-y-2">
              {view!.hints
                .slice(0, -1)
                .reverse()
                .slice(0, 5)
                .map((hint) => (
                  <li key={hint.hint_id} className="text-sm leading-5 text-white/60">
                    {hint.line_number > 0 && <span className="mr-1 text-white/30">L{hint.line_number}</span>}
                    {hint.text}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-300">
            <Check className="h-3.5 w-3.5" />
            Wins
          </p>
          {view?.milestones.length ? (
            <ul className="mt-2 space-y-1.5">
              {view.milestones.map((milestone) => (
                <li key={milestone.milestone_id} className="text-sm text-white/80">
                  {milestone.note}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-white/40">Your first win lands here.</p>
          )}
        </div>

        {view && view.stuck_level > 0 && (
          <div className="flex items-center gap-2 px-1 text-xs text-white/35">
            Help level
            {[1, 2, 3].map((level) => (
              <span
                key={level}
                className={`h-1.5 w-6 rounded-full ${level <= view.stuck_level ? 'bg-amber-300/80' : 'bg-white/10'}`}
              />
            ))}
          </div>
        )}
      </aside>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart3, Calculator, Code2, Loader2, Play, Puzzle } from 'lucide-react';
import type { LearnerSetupInput } from '@/types/conversation';

type QuickstartPreCallCardProps = {
  isLoading: boolean;
  error: string | null;
  onStartConversation: (setup: LearnerSetupInput) => void;
  onOpenDashboard: () => void;
  surface?: 'app' | 'extension';
  initial_title?: string;
  initial_language?: string;
};

const languages = ['Python', 'JavaScript', 'Java', 'C++', 'C'];
const storage_key = 'beside:setup';

const title_ideas: Record<LearnerSetupInput['kind'], string[]> = {
  code: ['a calculator program', 'a to-do list', 'FizzBuzz', 'a palindrome checker'],
  aptitude: ['placement prep', 'a campus test warm-up', 'quant and English practice', 'an aptitude round'],
};

export function QuickstartPreCallCard({
  isLoading,
  error,
  onStartConversation,
  onOpenDashboard,
  surface = 'app',
  initial_title,
  initial_language,
}: QuickstartPreCallCardProps) {
  const [title, set_title] = useState('');
  const [learner_name, set_learner_name] = useState('');
  const [kind, set_kind] = useState<LearnerSetupInput['kind']>('code');
  const [language, set_language] = useState('Python');
  const [touched, set_touched] = useState(false);
  const title_input_ref = useRef<HTMLInputElement>(null);
  const title_locked = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storage_key) ?? '{}');
      if (typeof saved.learner_name === 'string') set_learner_name(saved.learner_name);
      if (languages.includes(saved.language)) set_language(saved.language);
      if (saved.kind === 'aptitude' || saved.kind === 'code') set_kind(saved.kind);
    } catch {}
  }, []);

  useEffect(() => {
    if (initial_title && !title_locked.current) set_title(initial_title);
    if (initial_language && languages.includes(initial_language)) set_language(initial_language);
    if (surface === 'extension') set_kind('code');
  }, [initial_language, initial_title, surface]);

  const pick_title = (idea: string) => {
    title_locked.current = true;
    set_title(idea);
    requestAnimationFrame(() => {
      const input = title_input_ref.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(idea.length, idea.length);
    });
  };

  const title_ok = title.trim().length >= 2;
  const name_ok = learner_name.trim().length >= 1;

  const start = () => {
    set_touched(true);
    if (!title_ok || !name_ok || isLoading) return;
    const setup: LearnerSetupInput = {
      title: title.trim(),
      learner_name: learner_name.trim(),
      kind,
      language,
    };
    try {
      localStorage.setItem(storage_key, JSON.stringify({ learner_name: setup.learner_name, language, kind }));
    } catch {}
    onStartConversation(setup);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
      className="mx-auto flex w-[min(92vw,30rem)] animate-fade-up flex-col rounded-[24px] border border-[#2b2b2b] px-8 py-9 text-left shadow-[0_10px_40px_rgba(0,0,0,0.4)]"
      style={{
        backgroundImage:
          'linear-gradient(164.988deg, rgba(54,54,54,0.2) 1.0596%, rgba(0,0,0,0) 96.089%), linear-gradient(90deg, rgb(16,16,16) 0%, rgb(16,16,16) 100%)',
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Beside</p>
        <button
          type="button"
          onClick={onOpenDashboard}
          className="flex items-center gap-1.5 text-xs text-white/45 transition hover:text-white"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Your progress
        </button>
      </div>
      <h1 className="mt-2 text-[26px] font-medium leading-[1.2] text-white">
        {kind === 'code' ? 'What are you building today?' : 'What are you practicing today?'}
      </h1>

      <input
        ref={title_input_ref}
        autoFocus
        value={title}
        onChange={(event) => {
          title_locked.current = true;
          set_title(event.target.value);
        }}
        maxLength={80}
        placeholder={kind === 'code' ? 'a calculator program' : 'trains and relative speed'}
        className="mt-5 h-12 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[16px] text-white outline-none transition placeholder:text-white/25 focus:border-primary/70"
        aria-label="Title"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {title_ideas[kind].map((idea) => {
          const picked = title.trim() === idea;
          return (
            <button
              key={idea}
              type="button"
              aria-pressed={picked}
              onClick={() => pick_title(idea)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                picked
                  ? 'border-white/70 bg-white/10 text-white'
                  : 'border-white/10 text-white/45 hover:border-white/30 hover:text-white/80'
              }`}
            >
              {idea}
            </button>
          );
        })}
      </div>
      {touched && !title_ok && <p className="mt-2 text-xs text-destructive">Tell Beside what you are working on.</p>}

      {surface === 'extension' && (
        <p className="mt-3 text-xs text-white/40">
          {initial_title ? 'Picked up from your editor tab. Edit it if you like.' : 'Click into your code editor tab so Beside can find it.'}
        </p>
      )}

      <div className={`mt-6 grid grid-cols-2 gap-2 ${surface === 'extension' ? 'hidden' : ''}`}>
        {(['code', 'aptitude'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => set_kind(option)}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm transition ${
              kind === option
                ? 'border-primary/70 bg-primary/10 text-white'
                : 'border-white/10 text-white/50 hover:text-white/80'
            }`}
          >
            {option === 'code' ? <Code2 className="h-4 w-4" /> : <Calculator className="h-4 w-4" />}
            {option === 'code' ? 'Code' : 'Aptitude'}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={learner_name}
          onChange={(event) => set_learner_name(event.target.value)}
          maxLength={32}
          placeholder="Your name"
          className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-primary/70"
          aria-label="Your name"
        />
        {kind === 'code' && (
          <select
            value={language}
            onChange={(event) => set_language(event.target.value)}
            className="h-11 rounded-xl border border-white/10 bg-[#161616] px-3 text-sm text-white outline-none focus:border-primary/70"
            aria-label="Language"
          >
            {languages.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}
      </div>
      {touched && !name_ok && <p className="mt-2 text-xs text-destructive">Beside wants to know your name.</p>}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="submit"
          disabled={isLoading}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-black shadow-[0_0_0_6px_rgba(255,255,255,0.04)] transition hover:scale-105 hover:bg-white disabled:opacity-70"
          aria-label={isLoading ? 'Starting Beside' : 'Start Beside'}
        >
          {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="ml-1 h-6 w-6 fill-current" />}
        </button>
        <p className="text-sm leading-5 text-white/45">
          {isLoading
            ? 'Beside is pulling up a chair…'
            : 'Press play. Beside says hi, then stays quiet until you need it.'}
        </p>
      </div>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {surface === 'app' && (
        <a
          href="/beside-extension.zip"
          download
          className="mt-6 flex items-center gap-2 border-t border-white/5 pt-4 text-xs text-white/40 transition hover:text-white"
        >
          <Puzzle className="h-3.5 w-3.5" />
          Use Beside on LeetCode, HackerRank, Replit and more with the Chrome extension
        </a>
      )}
    </form>
  );
}

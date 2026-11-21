'use client';

import { useMemo, useState } from 'react';
import { Calculator, Code2, Flame, Lightbulb, Play, Target, Trophy, X } from 'lucide-react';
import {
  clear_history,
  duration_label,
  has_activity,
  last_seven_days,
  read_history,
  seconds_of,
  streak_days,
  topic_stats,
  type SessionSummary,
} from '@/lib/history';

type DashboardProps = {
  recap_session?: string | null;
  onClose: () => void;
};

function solved_count(session: SessionSummary) {
  return Object.values(session.questions ?? {}).filter((item) => item.solved).length;
}

function attempted_count(session: SessionSummary) {
  return Object.keys(session.questions ?? {}).length;
}

function Tile({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/45">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {note && <p className="mt-1 text-xs text-white/40">{note}</p>}
    </div>
  );
}

export function Dashboard({ recap_session, onClose }: DashboardProps) {
  const [all_history, set_history] = useState<SessionSummary[]>(() => read_history());
  const history = useMemo(() => all_history.filter(has_activity), [all_history]);

  const recap = recap_session ? all_history.find((item) => item.session_key === recap_session) ?? null : null;
  const learner_name = all_history[0]?.learner_name;

  const totals = useMemo(() => {
    const minutes = Math.round(history.reduce((sum, item) => sum + seconds_of(item), 0) / 60);
    const wins = history.reduce((sum, item) => sum + item.milestones.length, 0);
    const code_sessions = history.filter((item) => item.kind === 'code');
    const lines = code_sessions.reduce((sum, item) => sum + item.lines_written, 0);
    const accepted = code_sessions.reduce((sum, item) => sum + item.ghosts_accepted, 0);
    const solo = lines > 0 ? Math.round(((lines - Math.min(accepted, lines)) / lines) * 100) : null;
    const records = history.flatMap((item) => Object.values(item.questions ?? {}));
    const first_try = records.filter((item) => item.solved && item.wrong === 0).length;
    const accuracy = records.length > 0 ? Math.round((first_try / records.length) * 100) : null;
    return { minutes, wins, solo, accuracy, answered: records.length };
  }, [history]);

  const week = useMemo(() => last_seven_days(history), [history]);
  const week_max = Math.max(10, ...week.map((day) => day.minutes));
  const topics = useMemo(() => topic_stats(history), [history]);
  const weakest = topics.find((topic) => topic.first_try / topic.attempted < 1);
  const streak = streak_days(history);

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl animate-fade-up flex-col overflow-y-auto px-4 pb-24 pt-8 text-left md:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Beside</p>
          <h1 className="mt-1 text-2xl font-medium text-white">
            {learner_name ? `Your progress, ${learner_name}` : 'Your progress'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-black transition hover:bg-white"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            New session
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {history.length === 0 && !recap ? (
        <div className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <p className="text-lg text-white">No sessions yet.</p>
          <p className="mt-2 text-sm text-white/45">Finish your first session and your progress shows up here.</p>
        </div>
      ) : (
        <>
          {recap && (
            <section className="mt-6 rounded-2xl border border-primary/30 bg-primary/[0.06] p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Session recap</p>
              <p className="mt-1 text-lg text-white">
                {recap.kind === 'code' ? `${recap.title} in ${recap.language}` : recap.title}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div>
                  <p className="text-white/45">Time</p>
                  <p className="text-white">{duration_label(seconds_of(recap))}</p>
                </div>
                <div>
                  <p className="text-white/45">Wins</p>
                  <p className="text-white">{recap.milestones.length}</p>
                </div>
                <div>
                  <p className="text-white/45">Stuck moments</p>
                  <p className="text-white">{recap.stuck_asked + recap.stuck_auto}</p>
                </div>
                <div>
                  <p className="text-white/45">Hints</p>
                  <p className="text-white">{recap.hints}</p>
                </div>
                <div>
                  <p className="text-white/45">{recap.kind === 'code' ? 'Suggestions taken' : 'Solved'}</p>
                  <p className="text-white">
                    {recap.kind === 'code'
                      ? recap.ghosts_accepted
                      : `${solved_count(recap)} of ${attempted_count(recap)}`}
                  </p>
                </div>
              </div>
              {recap.milestones.length > 0 && (
                <p className="mt-4 text-sm text-white/70">You got done: {recap.milestones.join(', ')}.</p>
              )}
            </section>
          )}

          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Streak"
              value={`${streak} day${streak === 1 ? '' : 's'}`}
              note={`${history.length} sessions, ${totals.minutes} min total`}
            />
            <Tile icon={<Trophy className="h-3.5 w-3.5" />} label="Wins" value={String(totals.wins)} />
            <Tile
              icon={<Target className="h-3.5 w-3.5" />}
              label="First-try accuracy"
              value={totals.accuracy === null ? '–' : `${totals.accuracy}%`}
              note={totals.answered ? `${totals.answered} questions answered` : 'Try an aptitude session'}
            />
            <Tile
              icon={<Code2 className="h-3.5 w-3.5" />}
              label="Lines on your own"
              value={totals.solo === null ? '–' : `${totals.solo}%`}
              note="Code you wrote without taking a suggestion"
            />
          </section>

          <section className="mt-6 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-white/45">Last 7 days</p>
              <div className="mt-4 flex h-32 gap-2">
                {week.map((day, index) => (
                  <div key={index} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-md ${day.minutes ? 'bg-primary/80' : 'bg-white/[0.06]'}`}
                        style={{ height: `${Math.max(4, (day.minutes / week_max) * 100)}%` }}
                        title={`${day.minutes} min`}
                      />
                    </div>
                    <span className="text-[11px] text-white/40">{day.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/45">
                <Calculator className="h-3.5 w-3.5" />
                Aptitude topics
              </p>
              {topics.length === 0 ? (
                <p className="mt-4 text-sm text-white/40">Answer a few aptitude questions to see your strong and weak topics.</p>
              ) : (
                <>
                  {weakest && (
                    <p className="mt-3 flex items-center gap-2 text-sm text-amber-200/90">
                      <Lightbulb className="h-3.5 w-3.5" />
                      Practice next: {weakest.topic}
                    </p>
                  )}
                  <ul className="mt-3 space-y-2.5">
                    {topics.slice(0, 7).map((topic) => {
                      const percent = Math.round((topic.first_try / topic.attempted) * 100);
                      return (
                        <li key={topic.topic}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/80">
                              {topic.topic}
                              <span className="ml-2 text-xs text-white/35">{topic.section}</span>
                            </span>
                            <span className="text-xs text-white/50">{percent}% first try</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-white/[0.06]">
                            <div
                              className={`h-full rounded-full ${percent >= 70 ? 'bg-emerald-400/80' : percent >= 40 ? 'bg-amber-300/80' : 'bg-rose-400/80'}`}
                              style={{ width: `${Math.max(4, percent)}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-white/45">Recent sessions</p>
              <button
                type="button"
                onClick={() => {
                  clear_history();
                  set_history([]);
                }}
                className="text-xs text-white/35 hover:text-rose-300"
              >
                Clear history
              </button>
            </div>
            <ul className="mt-3 divide-y divide-white/5">
              {history.slice(0, 8).map((session) => (
                <li key={session.session_key} className="flex items-center gap-3 py-3 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/60">
                    {session.kind === 'code' ? <Code2 className="h-4 w-4" /> : <Calculator className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-white/85">{session.title}</p>
                    <p className="text-xs text-white/40">
                      {new Date(session.started_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {duration_label(seconds_of(session))}
                      {session.kind === 'code' ? ` · ${session.language}` : ''}
                    </p>
                  </div>
                  <div className="hidden gap-4 text-xs text-white/50 sm:flex">
                    <span>
                      {session.milestones.length} win{session.milestones.length === 1 ? '' : 's'}
                    </span>
                    <span>{session.stuck_asked + session.stuck_auto} stuck</span>
                    <span>
                      {session.kind === 'code'
                        ? `${session.ghosts_accepted} suggestions`
                        : `${solved_count(session)}/${attempted_count(session)} solved`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

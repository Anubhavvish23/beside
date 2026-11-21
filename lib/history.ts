export type QuestionRecord = {
  topic: string;
  section: 'maths' | 'english';
  wrong: number;
  solved: boolean;
};

export type SessionSummary = {
  session_key: string;
  kind: 'code' | 'aptitude';
  title: string;
  language: string;
  learner_name: string;
  started_at: number;
  updated_at: number;
  stuck_asked: number;
  stuck_auto: number;
  hints: number;
  ghosts_accepted: number;
  max_help_level: number;
  lines_written: number;
  milestones: string[];
  questions: Record<string, QuestionRecord>;
};

const history_key = 'beside:history';
const max_sessions = 60;

export function read_history(): SessionSummary[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(history_key) ?? '[]');
    return Array.isArray(parsed) ? (parsed as SessionSummary[]) : [];
  } catch {
    return [];
  }
}

export function save_summary(summary: SessionSummary) {
  try {
    const rest = read_history().filter((item) => item.session_key !== summary.session_key);
    const next = [summary, ...rest].sort((a, b) => b.started_at - a.started_at).slice(0, max_sessions);
    localStorage.setItem(history_key, JSON.stringify(next));
  } catch {}
}

export function clear_history() {
  try {
    localStorage.removeItem(history_key);
  } catch {}
}

export function seconds_of(summary: SessionSummary) {
  return Math.max(0, (summary.updated_at - summary.started_at) / 1000);
}

export function minutes_of(summary: SessionSummary) {
  return Math.round(seconds_of(summary) / 60);
}

export function duration_label(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 1 ? '<1 min' : `${minutes} min`;
}

export function has_activity(summary: SessionSummary) {
  return (
    summary.lines_written > 0 ||
    summary.hints > 0 ||
    summary.stuck_asked + summary.stuck_auto > 0 ||
    summary.ghosts_accepted > 0 ||
    summary.milestones.length > 0 ||
    Object.keys(summary.questions ?? {}).length > 0 ||
    seconds_of(summary) >= 60
  );
}

export function count_lines(code: string) {
  return code.split('\n').filter((line) => line.trim()).length;
}

function day_key(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function streak_days(history: SessionSummary[]) {
  const days = new Set(history.map((item) => day_key(item.started_at)));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(day_key(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(day_key(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function last_seven_days(history: SessionSummary[]) {
  const result: { label: string; minutes: number }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = day_key(date.getTime());
    const seconds = history
      .filter((item) => day_key(item.started_at) === key)
      .reduce((sum, item) => sum + seconds_of(item), 0);
    result.push({ label: date.toLocaleDateString('en-IN', { weekday: 'short' }), minutes: Math.round(seconds / 60) });
  }
  return result;
}

export type TopicStat = {
  topic: string;
  section: 'maths' | 'english';
  attempted: number;
  solved: number;
  first_try: number;
  wrong: number;
};

export function topic_stats(history: SessionSummary[]): TopicStat[] {
  const topics = new Map<string, TopicStat>();
  for (const session of history) {
    for (const record of Object.values(session.questions ?? {})) {
      if (!record.solved && record.wrong === 0) continue;
      const stat = topics.get(record.topic) ?? {
        topic: record.topic,
        section: record.section,
        attempted: 0,
        solved: 0,
        first_try: 0,
        wrong: 0,
      };
      stat.attempted += 1;
      stat.wrong += record.wrong;
      if (record.solved) stat.solved += 1;
      if (record.solved && record.wrong === 0) stat.first_try += 1;
      topics.set(record.topic, stat);
    }
  }
  return [...topics.values()].sort(
    (a, b) =>
      a.first_try / a.attempted - b.first_try / b.attempted ||
      a.solved / a.attempted - b.solved / b.attempted ||
      b.wrong - a.wrong,
  );
}

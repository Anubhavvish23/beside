import { read_raw, write_raw } from "@/lib/store";
import { find_question, option_letters, public_question, questions, type Question } from "@/lib/questions";

export type SessionKind = "code" | "aptitude";

export type LearnerSetup = {
  learner_name: string;
  title: string;
  kind: SessionKind;
  language: string;
};

export type CoachHint = {
  hint_id: string;
  text: string;
  line_number: number;
  stuck_level: number;
  created_at: number;
};

export type CoachFormula = {
  formula_id: string;
  text: string;
  created_at: number;
};

export type CoachMilestone = {
  milestone_id: string;
  note: string;
  created_at: number;
};

export type GhostLine = {
  ghost_id: string;
  text: string;
  after_line: number;
};

export type CoachError = {
  code: string;
  detail: string;
  created_at: number;
};

export type CoachState = LearnerSetup & {
  session_key: string;
  code: string;
  stuck_level: number;
  stuck_reason: string | null;
  reading_line: number;
  hints: CoachHint[];
  formulas: CoachFormula[];
  milestones: CoachMilestone[];
  ghost: GhostLine | null;
  last_error: CoachError | null;
  question_id: string;
  answers: Record<string, QuestionAnswer>;
  updated_at: number;
};

export type QuestionAnswer = {
  wrong: number[];
  correct_choice: number | null;
};

export type ToolFailure = { ok: false; error: string; detail: string };

const languages = ["Python", "JavaScript", "Java", "C++", "C"];
const max_code_chars = 12000;
const queues = new Map<string, Promise<void>>();

export function clean_text(value: unknown, max_length: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max_length);
}

export function clean_session(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(trimmed)) return null;
  return trimmed;
}

export function clean_setup(input: Partial<Record<keyof LearnerSetup, unknown>>): LearnerSetup {
  const kind: SessionKind = input.kind === "aptitude" ? "aptitude" : "code";
  const learner_name = clean_text(input.learner_name, 32) || "there";
  const fallback_title = kind === "code" ? "a small program" : "aptitude practice";
  const title = clean_text(input.title, 80) || fallback_title;
  const language_text = clean_text(input.language, 20);
  const language =
    languages.find((item) => item.toLowerCase() === language_text.toLowerCase()) ??
    "Python";
  return { learner_name, title, kind, language };
}

export function new_state(session_key: string, setup: LearnerSetup): CoachState {
  return {
    ...setup,
    session_key,
    code: "",
    stuck_level: 0,
    stuck_reason: null,
    reading_line: 0,
    hints: [],
    formulas: [],
    milestones: [],
    ghost: null,
    last_error: null,
    question_id: questions[0].question_id,
    answers: {},
    updated_at: Date.now(),
  };
}

function current_question(state: CoachState): Question {
  return find_question(state.question_id) ?? questions[0];
}

function question_block(state: CoachState): string {
  const question = current_question(state);
  const answer = state.answers[question.question_id];
  const tried = answer?.wrong.length
    ? `Already tried and wrong: ${answer.wrong.map((index) => option_letters[index]).join(", ")}.`
    : "No attempts yet.";
  return [
    `Current question (${question.section}, ${question.topic}): ${question.text}`,
    question.options.map((option, index) => `${option_letters[index]}) ${option}`).join("   "),
    tried,
  ].join("\n");
}

function help_for_level(question: Question, level: number): string {
  if (level <= 1) return `Teacher's nudge, rephrase it in your own words: ${question.hint}`;
  if (level === 2) {
    return `Give the method now. Put this in the formula field of post_hint: "${question.formula}". Teacher's nudge: ${question.hint}`;
  }
  return `Walk through the method step by step, but let them say the final option: ${question.method} Formula: "${question.formula}".`;
}

export function select_question(state: CoachState, question_id: unknown) {
  const question = find_question(question_id);
  if (!question) return false;
  if (state.question_id !== question.question_id) {
    state.question_id = question.question_id;
    state.stuck_level = 0;
    state.stuck_reason = null;
    state.ghost = null;
  }
  state.updated_at = Date.now();
  return true;
}

export function answer_question(state: CoachState, input: { question_id?: unknown; choice?: unknown }) {
  const question = find_question(input.question_id);
  const choice = Number(input.choice);
  if (!question || !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
    return { ok: false as const, error: "bad_answer" };
  }
  select_question(state, question.question_id);
  const answer = state.answers[question.question_id] ?? { wrong: [], correct_choice: null };
  if (answer.correct_choice !== null) {
    return { ok: false as const, error: "already_solved" };
  }
  const correct = choice === question.answer_index;
  if (correct) {
    answer.correct_choice = choice;
  } else if (!answer.wrong.includes(choice)) {
    answer.wrong.push(choice);
  }
  state.answers[question.question_id] = answer;
  const attempts = answer.wrong.length + (correct ? 1 : 0);
  const solved = Object.values(state.answers).filter((item) => item.correct_choice !== null).length;
  const picked = `${option_letters[choice]}) ${question.options[choice]}`;
  let brief: string;
  if (correct) {
    state.stuck_level = 0;
    brief = [
      `[[desk]] ${state.learner_name} picked ${picked} for "${question.text}" and it is CORRECT${attempts > 1 ? ` after ${attempts} tries` : " on the first try"}.`,
      `They have solved ${solved} of ${questions.length}.`,
      question.section === "maths"
        ? `Cheer briefly, and say the quick reason in one line. You may add this formula to the side panel with post_hint: "${question.formula}". Call save_milestone with the topic "${question.topic}".`
        : `Cheer briefly, and say the rule in one line. Call save_milestone with the topic "${question.topic}".`,
      "End on the cheer. Do not ask if they want another one; the board has a Next button.",
    ].join("\n");
  } else {
    state.stuck_level = Math.min(3, answer.wrong.length);
    brief = [
      `[[desk]] ${state.learner_name} picked ${picked} for "${question.text}" and it is WRONG. Wrong attempts: ${answer.wrong.length}.`,
      question.options.map((option, index) => `${option_letters[index]}) ${option}`).join("   "),
      "Do not say which option is right.",
      help_for_level(question, state.stuck_level),
      "Be kind about the mistake, call post_hint, then say the hint in one or two warm sentences.",
    ].join("\n");
  }
  state.updated_at = Date.now();
  return { ok: true as const, correct, attempts, brief };
}

function next_id(prefix: string, count: number): string {
  return `${prefix}-${count + 1}-${Date.now().toString(36)}`;
}

function code_lines(state: CoachState): string[] {
  return state.code.replace(/\r\n/g, "\n").split("\n");
}

function last_filled_line(state: CoachState): number {
  const lines = code_lines(state);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim()) return index + 1;
  }
  return 0;
}

export function numbered_code(state: CoachState, max_lines = 80): string {
  const lines = code_lines(state);
  const start = Math.max(0, lines.length - max_lines);
  return lines
    .slice(start)
    .map((line, index) => `${start + index + 1}| ${line}`)
    .join("\n");
}

function fail(state: CoachState, code: string, detail: string): ToolFailure {
  state.last_error = { code, detail, created_at: Date.now() };
  state.updated_at = Date.now();
  return { ok: false, error: code, detail };
}

export function read_code(state: CoachState) {
  const filled = last_filled_line(state);
  if (state.kind === "aptitude") {
    const question = current_question(state);
    const answer = state.answers[question.question_id];
    return {
      ok: true as const,
      learner_name: state.learner_name,
      kind: state.kind,
      question: public_question(question),
      wrong_attempts: answer?.wrong.map((index) => option_letters[index]) ?? [],
      solved: answer?.correct_choice !== null && answer?.correct_choice !== undefined,
      stuck_level: state.stuck_level,
      working: filled === 0 ? "(no working yet)" : numbered_code(state),
    };
  }
  if (filled === 0) {
    return fail(
      state,
      "empty_code",
      state.kind === "code"
        ? "Nothing is typed yet. Encourage them to write the first line."
        : "No working yet. Encourage them to write the first step.",
    );
  }
  return {
    ok: true as const,
    learner_name: state.learner_name,
    kind: state.kind,
    title: state.title,
    language: state.language,
    stuck_level: state.stuck_level,
    last_line_number: filled,
    last_line: code_lines(state)[filled - 1].trim(),
    code: numbered_code(state),
  };
}

export function post_hint(
  state: CoachState,
  input: {
    hint?: unknown;
    line_number?: unknown;
    next_line?: unknown;
    formula?: unknown;
  },
) {
  const hint = clean_text(input.hint, 280);
  if (hint.length < 4) {
    return fail(state, "empty_hint", "Write the hint in one short sentence.");
  }
  const raw_next = typeof input.next_line === "string" ? input.next_line.replace(/\r/g, "") : "";
  const next_line = raw_next.replace(/^\n+|\n+$/g, "");
  if (next_line.trim()) {
    if (next_line.includes("\n")) {
      return fail(state, "not_one_line", "next_line must be one line. Send only the very next line.");
    }
    if (next_line.length > 100) {
      return fail(state, "line_too_long", "next_line is too long. Send a shorter single line.");
    }
    if (state.stuck_level < 2) {
      return fail(
        state,
        "too_early",
        "They have only been stuck once. Give the hint in words, with next_line empty.",
      );
    }
  }
  const line_count = code_lines(state).length;
  const asked_line = Number(input.line_number);
  const line_number =
    Number.isInteger(asked_line) && asked_line > 0 && asked_line <= line_count ? asked_line : 0;
  state.hints.push({
    hint_id: next_id("hint", state.hints.length),
    text: hint,
    line_number,
    stuck_level: state.stuck_level,
    created_at: Date.now(),
  });
  state.hints = state.hints.slice(-20);
  const formula = clean_text(input.formula, 160);
  if (formula) {
    state.formulas.push({
      formula_id: next_id("formula", state.formulas.length),
      text: formula,
      created_at: Date.now(),
    });
    state.formulas = state.formulas.slice(-12);
  }
  if (next_line.trim()) {
    state.ghost = {
      ghost_id: next_id("ghost", state.hints.length),
      text: next_line,
      after_line: line_number || last_filled_line(state),
    };
  }
  state.reading_line = 0;
  state.last_error = null;
  state.updated_at = Date.now();
  return {
    ok: true as const,
    shown_on_board: true,
    ghost_ready: Boolean(next_line.trim()),
    formula_added: Boolean(formula),
  };
}

export function save_milestone(state: CoachState, input: { note?: unknown }) {
  const note = clean_text(input.note, 120);
  if (note.length < 3) {
    return fail(state, "empty_note", "Say what they got working in a few words.");
  }
  state.milestones.push({
    milestone_id: next_id("milestone", state.milestones.length),
    note,
    created_at: Date.now(),
  });
  state.milestones = state.milestones.slice(-12);
  state.stuck_level = 0;
  state.stuck_reason = null;
  state.last_error = null;
  state.updated_at = Date.now();
  return { ok: true as const, milestones: state.milestones.length };
}

type Token = { kind: "number"; value: number } | { kind: "op"; value: string };

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  const text = expression
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/,/g, "")
    .replace(/\s+/g, "");
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/[0-9.]/.test(char)) {
      let end = index;
      while (end < text.length && /[0-9.]/.test(text[end])) end += 1;
      const value = Number(text.slice(index, end));
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "number", value });
      index = end;
      continue;
    }
    if ("+-*/^()%".includes(char)) {
      tokens.push({ kind: "op", value: char });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

function evaluate(tokens: Token[]): number {
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];

  const primary = (): number => {
    const token = take();
    if (!token) throw new Error("bad_expression");
    if (token.kind === "number") {
      const next = peek();
      if (next && next.kind === "op" && next.value === "%") {
        take();
        return token.value / 100;
      }
      return token.value;
    }
    if (token.value === "(") {
      const value = sum();
      const close = take();
      if (!close || close.kind !== "op" || close.value !== ")") throw new Error("bad_expression");
      return value;
    }
    if (token.value === "-") return -primary();
    if (token.value === "+") return primary();
    throw new Error("bad_expression");
  };

  const power = (): number => {
    const base = primary();
    const next = peek();
    if (next && next.kind === "op" && next.value === "^") {
      take();
      return base ** power();
    }
    return base;
  };

  const product = (): number => {
    let value = power();
    for (;;) {
      const next = peek();
      if (!next || next.kind !== "op" || (next.value !== "*" && next.value !== "/")) return value;
      take();
      const right = power();
      if (next.value === "/") {
        if (right === 0) throw new Error("divide_by_zero");
        value /= right;
      } else {
        value *= right;
      }
    }
  };

  const sum = (): number => {
    let value = product();
    for (;;) {
      const next = peek();
      if (!next || next.kind !== "op" || (next.value !== "+" && next.value !== "-")) return value;
      take();
      const right = product();
      value = next.value === "+" ? value + right : value - right;
    }
  };

  const result = sum();
  if (position !== tokens.length) throw new Error("bad_expression");
  return result;
}

export function calculate(input: { expression?: unknown }) {
  const expression = typeof input.expression === "string" ? input.expression.slice(0, 200) : "";
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) {
    return {
      ok: false as const,
      error: "bad_expression",
      detail: "Use numbers with + - * / ^ ( ) and %.",
    };
  }
  try {
    const value = evaluate(tokens);
    if (!Number.isFinite(value)) throw new Error("bad_expression");
    const rounded = Math.round(value * 1e6) / 1e6;
    return { ok: true as const, expression, result: rounded };
  } catch (error) {
    const code = error instanceof Error && error.message === "divide_by_zero" ? "divide_by_zero" : "bad_expression";
    return {
      ok: false as const,
      error: code,
      detail: code === "divide_by_zero" ? "That divides by zero." : "Use numbers with + - * / ^ ( ) and %.",
    };
  }
}

export function mark_stuck(
  state: CoachState,
  input: { code?: unknown; reason?: unknown; cursor_line?: unknown },
) {
  if (typeof input.code === "string") state.code = input.code.slice(0, max_code_chars);
  const reason = input.reason === "quiet" || input.reason === "rewriting" ? input.reason : "asked";
  state.stuck_level = Math.min(3, state.stuck_level + 1);
  state.stuck_reason = reason;
  const cursor_line = Number(input.cursor_line);
  const line_count = code_lines(state).length;
  state.reading_line =
    Number.isInteger(cursor_line) && cursor_line > 0 && cursor_line <= line_count
      ? cursor_line
      : last_filled_line(state);
  state.updated_at = Date.now();
  return state;
}

export function stuck_brief(state: CoachState): string {
  const opener =
    state.stuck_reason === "quiet"
      ? "They went quiet for a while without typing. Check in gently, like a friend looking over."
      : state.stuck_reason === "rewriting"
        ? "They keep deleting and rewriting the same part. Notice that kindly."
        : "They pressed Stuck.";
  if (state.kind === "aptitude") {
    const working = last_filled_line(state) === 0 ? "(no working yet)" : numbered_code(state);
    return [
      `[[desk]] ${opener} Stuck level ${state.stuck_level} of 3.`,
      question_block(state),
      `Their working:\n${working}`,
      "Do not say which option is right.",
      help_for_level(current_question(state), state.stuck_level),
      "Call post_hint, then say the hint out loud in your own warm words. One or two sentences.",
    ].join("\n");
  }
  const level_rule =
    state.stuck_level >= 2
      ? "Stuck level 2 or more: you may put the single next line in next_line."
      : "Stuck level 1: give the hint in words only, next_line empty.";
  const work = state.kind === "code" ? `${state.language} code` : "aptitude working";
  const lines = last_filled_line(state) === 0 ? "(nothing typed yet)" : numbered_code(state);
  return [
    `[[desk]] ${opener} Stuck level ${state.stuck_level} of 3.`,
    `${state.learner_name} is working on "${state.title}". Their ${work}, with line numbers:`,
    lines,
    `They stopped around line ${state.reading_line || 1}.`,
    level_rule,
    "Read it, call post_hint, then say the hint out loud in your own warm words. One or two sentences.",
  ].join("\n");
}

export function accept_ghost(state: CoachState, input: { ghost_id?: unknown; code?: unknown }) {
  if (!state.ghost || input.ghost_id !== state.ghost.ghost_id) return false;
  if (typeof input.code === "string") state.code = input.code.slice(0, max_code_chars);
  state.ghost = null;
  state.updated_at = Date.now();
  return true;
}

export function dismiss_ghost(state: CoachState) {
  state.ghost = null;
  state.updated_at = Date.now();
}

export function save_code(state: CoachState, code: unknown) {
  if (typeof code === "string") state.code = code.slice(0, max_code_chars);
  state.updated_at = Date.now();
}

export function present_state(state: CoachState) {
  return {
    session_key: state.session_key,
    learner_name: state.learner_name,
    title: state.title,
    kind: state.kind,
    language: state.language,
    stuck_level: state.stuck_level,
    reading_line: state.reading_line,
    hints: state.hints,
    formulas: state.formulas,
    milestones: state.milestones,
    ghost: state.ghost,
    last_error: state.last_error,
    question_id: state.question_id,
    answers: state.answers,
    question: state.kind === "aptitude" ? public_question(current_question(state)) : null,
    question_list:
      state.kind === "aptitude"
        ? questions.map((question) => ({
            question_id: question.question_id,
            section: question.section,
            topic: question.topic,
          }))
        : [],
    updated_at: state.updated_at,
  };
}

function state_key(session_key: string) {
  return `beside:session:${session_key}`;
}

export async function load_state(session_key: string): Promise<CoachState | null> {
  const raw = await read_raw(state_key(session_key));
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as CoachState;
    state.question_id = state.question_id || questions[0].question_id;
    state.answers = state.answers ?? {};
    return state;
  } catch {
    return null;
  }
}

async function store_state(state: CoachState) {
  await write_raw(state_key(state.session_key), JSON.stringify(state));
}

function enqueue<T>(session_key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(session_key) ?? Promise.resolve();
  const run = previous.then(work, work);
  queues.set(
    session_key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export function create_session(
  session_key: string,
  setup: LearnerSetup,
  keep_existing = false,
): Promise<CoachState> {
  return enqueue(session_key, async () => {
    if (keep_existing) {
      const existing = await load_state(session_key);
      if (existing) return existing;
    }
    const state = new_state(session_key, setup);
    await store_state(state);
    return state;
  });
}

export function setup_from(body: Record<string, unknown>): LearnerSetup | null {
  if (typeof body.title !== "string" || !body.title.trim()) return null;
  return clean_setup(body);
}

export function change_session<T>(
  session_key: string,
  change: (state: CoachState) => T,
  fallback_setup: LearnerSetup | null = null,
): Promise<{ found: false } | { found: true; result: T; state: CoachState }> {
  return enqueue(session_key, async () => {
    const stored = await load_state(session_key);
    const state = stored ?? (fallback_setup ? new_state(session_key, fallback_setup) : null);
    if (!state) return { found: false as const };
    const result = change(state);
    await store_state(state);
    return { found: true as const, result, state };
  });
}

import {
  answer_question,
  select_question,
  calculate,
  change_session,
  clean_setup,
  create_session,
  load_state,
  mark_stuck,
  post_hint,
  read_code,
  save_milestone,
  stuck_brief,
} from '../lib/coach';
import { build_greeting } from '../lib/prompt';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const setup = clean_setup({ learner_name: 'Anubhav', title: 'a calculator program', kind: 'code', language: 'python' });
  assert(setup.language === 'Python', 'language is normalized');
  const greeting = build_greeting(setup);
  assert(greeting.includes('Anubhav') && greeting.includes('calculator program'), 'greeting is personal');

  const session = 'ai-conversation-test-abc123';
  await create_session(session, setup);

  const empty = await change_session(session, (state) => read_code(state));
  assert(empty.found && !empty.result.ok && empty.result.error === 'empty_code', 'empty code is reported');

  await change_session(session, (state) => {
    state.code = 'def add(a, b):\n    return a + b\n\ndef calc(op, a, b):';
  });

  const early = await change_session(session, (state) => {
    mark_stuck(state, { reason: 'asked' });
    return post_hint(state, { hint: 'Check op first.', line_number: 4, next_line: 'if op == "+":', formula: '' });
  });
  assert(early.found && !early.result.ok && early.result.error === 'too_early', 'next_line blocked at level 1');

  const words = await change_session(session, (state) =>
    post_hint(state, { hint: 'What decides which function runs?', line_number: 4, next_line: '', formula: '' }),
  );
  assert(words.found && words.result.ok, 'word hint posts');

  const multi = await change_session(session, (state) => {
    mark_stuck(state, { reason: 'quiet' });
    return post_hint(state, { hint: 'Branch on op.', line_number: 4, next_line: 'if op:\n  x', formula: '' });
  });
  assert(multi.found && !multi.result.ok && multi.result.error === 'not_one_line', 'multi line blocked');

  const ghost = await change_session(session, (state) =>
    post_hint(state, { hint: 'Branch on op.', line_number: 4, next_line: 'if op == "+":', formula: '' }),
  );
  assert(ghost.found && ghost.result.ok && ghost.result.ghost_ready, 'ghost line posts at level 2');

  const brief = await change_session(session, (state) => stuck_brief(state));
  assert(brief.found && brief.result.startsWith('[[desk]]') && brief.result.includes('4| def calc'), 'brief has numbered code');

  const win = await change_session(session, (state) => save_milestone(state, { note: 'add works' }));
  assert(win.found && win.result.ok, 'milestone saves');

  const stored = await load_state(session);
  assert(stored?.ghost?.text === 'if op == "+":' && stored.stuck_level === 0, 'state persists and resets level');

  const resumed = await create_session(session, setup, true);
  assert(resumed.milestones.length === 1 && resumed.ghost !== null, 'turning back on keeps the session');
  assert(build_greeting(setup, true).includes("I'm back"), 'resume greeting is short');

  const apt_session = 'ai-conversation-apt-xyz789';
  await create_session(apt_session, clean_setup({ learner_name: 'Anubhav', title: 'placement prep', kind: 'aptitude' }));
  const apt_read = await change_session(apt_session, (state) => read_code(state));
  assert(apt_read.found && apt_read.result.ok && 'question' in apt_read.result, 'aptitude read returns the question');
  assert(!JSON.stringify(apt_read.result).includes('answer_index'), 'answer never leaks to the agent');

  const wrong_once = await change_session(apt_session, (state) => answer_question(state, { question_id: 'm1', choice: 0 }));
  assert(wrong_once.found && wrong_once.result.ok && !wrong_once.result.correct, 'wrong answer graded');
  assert(wrong_once.result.ok && wrong_once.result.brief.includes('pole'), 'first miss gives the hint');
  assert(wrong_once.result.ok && !wrong_once.result.brief.includes('36 km/h is'), 'no answer in the hint');

  const wrong_twice = await change_session(apt_session, (state) => answer_question(state, { question_id: 'm1', choice: 2 }));
  assert(wrong_twice.found && wrong_twice.result.ok && wrong_twice.result.brief.includes('18/5'), 'second miss gives the formula');

  const right = await change_session(apt_session, (state) => answer_question(state, { question_id: 'm1', choice: 1 }));
  assert(right.found && right.result.ok && right.result.correct, 'correct answer graded');
  const again = await change_session(apt_session, (state) => answer_question(state, { question_id: 'm1', choice: 1 }));
  assert(again.found && !again.result.ok && again.result.error === 'already_solved', 'solved stays solved');

  const english = await change_session(apt_session, (state) => {
    select_question(state, 'e4');
    return stuck_brief(mark_stuck(state, { reason: 'asked' }));
  });
  assert(english.found && english.result.includes('Each of the students'), 'english stuck brief has the question');

  const math = calculate({ expression: '60 / (45 / 60)' });
  assert(math.ok && math.result === 80, 'calculate works');
  const zero = calculate({ expression: '5 / (2 - 2)' });
  assert(!zero.ok && zero.error === 'divide_by_zero', 'divide by zero caught');
  const bad = calculate({ expression: 'process.exit()' });
  assert(!bad.ok && bad.error === 'bad_expression', 'bad expression caught');

  console.log('coach checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

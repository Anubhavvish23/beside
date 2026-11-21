import { readFileSync } from 'node:fs';

const env_text = readFileSync('.env.local', 'utf8');
const tool_secret = env_text.match(/^TOOL_SECRET=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, '');
const base = process.argv[2] || 'https://in-class-pi.vercel.app';
const session = `probe-${Date.now()}`;
const setup = { learner_name: 'Anubhav', title: 'a calculator program', kind: 'code', language: 'Python' };

async function post(path, body, secret) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-tool-secret': secret } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const code = 'def add(a, b):\n    return a + b\n\ndef calc(op, a, b):';
const stuck = await post('/api/stuck', { ...setup, session, code, reason: 'asked' });
console.log('stuck', stuck.status, stuck.body.ok, stuck.body.state?.stuck_level);
console.log('no secret', (await post('/api/tools/read_code', { ...setup, session })).status);
const read = await post('/api/tools/read_code', { ...setup, session }, tool_secret);
console.log('read_code', read.status, read.body.ok, read.body.last_line_number);
const early = await post('/api/tools/post_hint', { ...setup, session, hint: 'Branch on op.', line_number: 4, next_line: 'if op == "+":', formula: '' }, tool_secret);
console.log('early ghost', early.body.error);
await post('/api/stuck', { ...setup, session, code, reason: 'quiet' });
const ghost = await post('/api/tools/post_hint', { ...setup, session, hint: 'Branch on op.', line_number: 4, next_line: 'if op == "+":', formula: '' }, tool_secret);
console.log('ghost', ghost.body.ok, ghost.body.ghost_ready);
const math = await post('/api/tools/calculate', { expression: '60 / (45 / 60)' }, tool_secret);
console.log('calculate', math.body.result);
const state = await fetch(`${base}/api/state?session=${session}`);
const view = state.ok ? await state.json() : null;
console.log('state', state.status, view?.ghost?.text ?? null, view?.hints?.length ?? 0);

const apt = { learner_name: 'Anubhav', title: 'placement prep', kind: 'aptitude', language: 'Python', session: `probe-apt-${Date.now()}` };
const tap_wrong = await post('/api/answer', { ...apt, question_id: 'm1', choice: 0 });
console.log('tap wrong', tap_wrong.body.ok, tap_wrong.body.correct, tap_wrong.body.state?.question?.topic);
const say_right = await post('/api/tools/check_answer', { ...apt, choice: 'B' }, tool_secret);
console.log('say right', say_right.body.ok, say_right.body.correct);
const english = await post('/api/tools/open_question', { ...apt, question_id: 'english' }, tool_secret);
console.log('open english', english.body.question?.question_id, 'answer leaked:', JSON.stringify(english.body).includes('answer_index'));

import { NextResponse } from "next/server";
import { change_session, clean_session, present_state, select_question, setup_from } from "@/lib/coach";
import { missing_session, read_body } from "@/lib/session-route";

export async function POST(request: Request) {
  const body = await read_body(request);
  const session_key = clean_session(body.session);
  if (!session_key) return missing_session();
  const outcome = await change_session(
    session_key,
    (state) => select_question(state, body.question_id),
    setup_from(body),
  );
  if (!outcome.found) return missing_session();
  return NextResponse.json({ ok: outcome.result, state: present_state(outcome.state) });
}

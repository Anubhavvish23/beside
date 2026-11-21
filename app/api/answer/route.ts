import { NextResponse } from "next/server";
import { answer_question, change_session, clean_session, present_state, setup_from } from "@/lib/coach";
import { missing_session, read_body } from "@/lib/session-route";

export async function POST(request: Request) {
  const body = await read_body(request);
  const session_key = clean_session(body.session);
  if (!session_key) return missing_session();
  const outcome = await change_session(session_key, (state) => answer_question(state, body), setup_from(body));
  if (!outcome.found) return missing_session();
  return NextResponse.json({ ...outcome.result, state: present_state(outcome.state) });
}

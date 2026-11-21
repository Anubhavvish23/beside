import { NextResponse } from "next/server";
import { change_session, clean_session, setup_from, present_state, save_code } from "@/lib/coach";
import { missing_session, read_body } from "@/lib/session-route";

export async function POST(request: Request) {
  const body = await read_body(request);
  const session_key = clean_session(body.session);
  if (!session_key) return missing_session();
  const outcome = await change_session(session_key, (state) => save_code(state, body.code, body.language), setup_from(body));
  if (!outcome.found) return missing_session();
  return NextResponse.json({ ok: true, language: outcome.state.language, updated_at: outcome.state.updated_at });
}

export async function PUT(request: Request) {
  const body = await read_body(request);
  const session_key = clean_session(body.session);
  if (!session_key) return missing_session();
  const outcome = await change_session(session_key, (state) => save_code(state, body.code, body.language), setup_from(body));
  if (!outcome.found) return missing_session();
  return NextResponse.json(present_state(outcome.state));
}

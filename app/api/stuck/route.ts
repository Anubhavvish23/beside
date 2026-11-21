import { NextResponse } from "next/server";
import { apply_language, change_session, clean_session, setup_from, mark_stuck, present_state, stuck_brief } from "@/lib/coach";
import { missing_session, read_body } from "@/lib/session-route";

export async function POST(request: Request) {
  const body = await read_body(request);
  const session_key = clean_session(body.session);
  if (!session_key) return missing_session();
  const outcome = await change_session(session_key, (state) => {
    apply_language(state, body.language);
    mark_stuck(state, body);
    return stuck_brief(state);
  }, setup_from(body));
  if (!outcome.found) return missing_session();
  return NextResponse.json({
    ok: true,
    brief: outcome.result,
    state: present_state(outcome.state),
  });
}

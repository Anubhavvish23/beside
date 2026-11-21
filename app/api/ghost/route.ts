import { NextResponse } from "next/server";
import { accept_ghost, change_session, clean_session, dismiss_ghost, present_state, setup_from } from "@/lib/coach";
import { missing_session, read_body } from "@/lib/session-route";

export async function POST(request: Request) {
  const body = await read_body(request);
  const session_key = clean_session(body.session);
  if (!session_key) return missing_session();
  const outcome = await change_session(session_key, (state) => {
    if (body.action === "dismiss") {
      dismiss_ghost(state);
      return true;
    }
    return accept_ghost(state, body);
  }, setup_from(body));
  if (!outcome.found) return missing_session();
  return NextResponse.json({ ok: outcome.result, state: present_state(outcome.state) });
}

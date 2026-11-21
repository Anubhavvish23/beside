import { NextResponse } from "next/server";
import { change_session, clean_session, setup_from, type CoachState } from "@/lib/coach";
import { reject_unauthorized } from "@/lib/tool-guard";

export async function read_body(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => ({}));
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export function missing_session() {
  return NextResponse.json(
    { ok: false, error: "unknown_session", detail: "This session has ended. Ask them to press play again." },
    { status: 200 },
  );
}

export async function run_tool<T>(
  request: Request,
  change: (state: CoachState, body: Record<string, unknown>) => T,
) {
  const rejected = reject_unauthorized(request);
  if (rejected) return rejected;
  const body = await read_body(request);
  const session_key = clean_session(body.session);
  if (!session_key) return missing_session();
  const outcome = await change_session(session_key, (state) => change(state, body), setup_from(body));
  if (!outcome.found) return missing_session();
  return NextResponse.json(outcome.result);
}

import { NextResponse } from "next/server";
import { clean_session, load_state, present_state } from "@/lib/coach";

export async function GET(request: Request) {
  const session_key = clean_session(new URL(request.url).searchParams.get("session"));
  if (!session_key) {
    return NextResponse.json({ error: "session is required" }, { status: 400 });
  }
  const state = await load_state(session_key);
  if (!state) {
    return NextResponse.json({ error: "unknown_session" }, { status: 404 });
  }
  return NextResponse.json(present_state(state), {
    headers: { "cache-control": "no-store" },
  });
}

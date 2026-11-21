import { save_milestone } from "@/lib/coach";
import { run_tool } from "@/lib/session-route";

export function POST(request: Request) {
  return run_tool(request, (state, body) => save_milestone(state, body));
}

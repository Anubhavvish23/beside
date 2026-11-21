import { read_code } from "@/lib/coach";
import { run_tool } from "@/lib/session-route";

export function POST(request: Request) {
  return run_tool(request, (state) => read_code(state));
}

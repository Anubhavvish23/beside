import { read_code, select_question } from "@/lib/coach";
import { questions } from "@/lib/questions";
import { run_tool } from "@/lib/session-route";

export function POST(request: Request) {
  return run_tool(request, (state, body) => {
    const index = questions.findIndex((question) => question.question_id === state.question_id);
    const asked = String(body.question_id ?? "").trim().toLowerCase();
    let target = asked;
    if (asked === "next" || asked === "") {
      target = questions[(index + 1) % questions.length].question_id;
    } else if (asked === "english") {
      target = "e1";
    } else if (asked === "maths" || asked === "math") {
      target = "m1";
    }
    if (!select_question(state, target)) {
      return { ok: false, error: "unknown_question", detail: "Use next, maths, english, or an id like m3 or e5." };
    }
    return read_code(state);
  });
}

import { answer_question } from "@/lib/coach";
import { option_letters } from "@/lib/questions";
import { run_tool } from "@/lib/session-route";

export function POST(request: Request) {
  return run_tool(request, (state, body) => {
    const letter = String(body.choice ?? "").trim().toUpperCase().charAt(0);
    const choice = option_letters.indexOf(letter);
    if (choice < 0) {
      return { ok: false, error: "bad_choice", detail: "Ask them which option, A, B, C or D." };
    }
    const result = answer_question(state, { question_id: state.question_id, choice });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        detail: result.error === "already_solved" ? "They already solved this one. Offer the next question." : "Could not read that answer.",
      };
    }
    return {
      ok: true,
      correct: result.correct,
      attempts: result.attempts,
      guidance: result.brief.replace("[[desk]] ", ""),
    };
  });
}

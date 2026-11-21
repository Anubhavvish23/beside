import type { LlmTool } from "agora-agents";

function tool_headers(): Record<string, string> {
  return { "x-tool-secret": "{{template_variables.tool_secret}}" };
}

function session_body(extra: Record<string, string> = {}) {
  return {
    session: "{{template_variables.session_key}}",
    learner_name: "{{template_variables.learner_name}}",
    title: "{{template_variables.title}}",
    kind: "{{template_variables.kind}}",
    language: "{{template_variables.language}}",
    ...extra,
  };
}

export function coach_tools(public_base_url: string): LlmTool[] {
  const base = public_base_url.replace(/\/$/, "");
  return [
    {
      type: "function",
      function: {
        name: "read_code",
        description:
          "Read exactly what the learner has typed in the editor right now, with line numbers. Call this before you talk about their code or working.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      execution: { mode: "sync" },
      server: {
        method: "POST",
        url: `${base}/api/tools/read_code`,
        headers: tool_headers(),
        body: session_body(),
        timeout_ms: 8000,
      },
    },
    {
      type: "function",
      function: {
        name: "post_hint",
        description:
          "Put your hint on the learner's screen. Use line_number for the line you mean. next_line is one line of code or working they can accept with Tab, only when they are properly stuck. formula is for aptitude rules like Speed = Distance / Time.",
        parameters: {
          type: "object",
          properties: {
            hint: { type: "string", description: "One short sentence about the logic, as you would write it on a sticky note." },
            line_number: { type: "integer", description: "The line the hint is about, or 0." },
            next_line: { type: "string", description: "Empty string, or the single next line only. Never the whole solution." },
            formula: { type: "string", description: "Empty string, or one formula or rule for the side panel." },
          },
          required: ["hint", "line_number", "next_line", "formula"],
          additionalProperties: false,
        },
      },
      execution: { mode: "sync" },
      server: {
        method: "POST",
        url: `${base}/api/tools/post_hint`,
        headers: tool_headers(),
        body: session_body({
          hint: "{{args.hint}}",
          line_number: "{{args.line_number}}",
          next_line: "{{args.next_line}}",
          formula: "{{args.formula}}",
        }),
        timeout_ms: 8000,
      },
    },
    {
      type: "function",
      function: {
        name: "calculate",
        description:
          "Work out arithmetic exactly before you tell an aptitude learner they are right or wrong. Supports + - * / ^ ( ) and %.",
        parameters: {
          type: "object",
          properties: {
            expression: { type: "string", description: "For example 60 / (45 / 60)." },
          },
          required: ["expression"],
          additionalProperties: false,
        },
      },
      execution: { mode: "sync" },
      server: {
        method: "POST",
        url: `${base}/api/tools/calculate`,
        headers: tool_headers(),
        body: { expression: "{{args.expression}}" },
        timeout_ms: 8000,
      },
    },
    {
      type: "function",
      function: {
        name: "check_answer",
        description:
          "Aptitude only. When the learner says their answer out loud, send the option letter here. The server grades it and tells you how to respond. Never decide right or wrong yourself.",
        parameters: {
          type: "object",
          properties: {
            choice: { type: "string", description: "A, B, C or D." },
          },
          required: ["choice"],
          additionalProperties: false,
        },
      },
      execution: { mode: "sync" },
      server: {
        method: "POST",
        url: `${base}/api/tools/check_answer`,
        headers: tool_headers(),
        body: session_body({ choice: "{{args.choice}}" }),
        timeout_ms: 8000,
      },
    },
    {
      type: "function",
      function: {
        name: "open_question",
        description:
          "Aptitude only. Move the board to another question: next, maths, english, or an id like m3 or e5. Returns the new question.",
        parameters: {
          type: "object",
          properties: {
            question_id: { type: "string", description: "next, maths, english, or an id like m3 or e5." },
          },
          required: ["question_id"],
          additionalProperties: false,
        },
      },
      execution: { mode: "sync" },
      server: {
        method: "POST",
        url: `${base}/api/tools/open_question`,
        headers: tool_headers(),
        body: session_body({ question_id: "{{args.question_id}}" }),
        timeout_ms: 8000,
      },
    },
    {
      type: "function",
      function: {
        name: "save_milestone",
        description:
          "Record a win on their progress list when a part works or they get an answer right.",
        parameters: {
          type: "object",
          properties: {
            note: { type: "string", description: "A few words, like Add function works." },
          },
          required: ["note"],
          additionalProperties: false,
        },
      },
      execution: { mode: "sync" },
      server: {
        method: "POST",
        url: `${base}/api/tools/save_milestone`,
        headers: tool_headers(),
        body: session_body({ note: "{{args.note}}" }),
        timeout_ms: 8000,
      },
    },
  ];
}

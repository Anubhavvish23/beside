import { NextResponse } from "next/server";

export function reject_unauthorized(request: Request): NextResponse | null {
  const expected = process.env.TOOL_SECRET;
  const given = request.headers.get("x-tool-secret");
  if (!expected || given !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  return null;
}

import { NextResponse } from "next/server";
import { calculate } from "@/lib/coach";
import { read_body } from "@/lib/session-route";
import { reject_unauthorized } from "@/lib/tool-guard";

export async function POST(request: Request) {
  const rejected = reject_unauthorized(request);
  if (rejected) return rejected;
  const body = await read_body(request);
  return NextResponse.json(calculate(body));
}

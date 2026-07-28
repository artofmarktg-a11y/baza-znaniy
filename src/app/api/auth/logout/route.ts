import { NextResponse } from "next/server";
import { expiredSessionCookie, revokeSession, sessionCookieName } from "@/lib/auth";

export async function POST(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${sessionCookieName}=`))
    ?.slice(sessionCookieName.length + 1);

  await revokeSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(expiredSessionCookie());
  return response;
}

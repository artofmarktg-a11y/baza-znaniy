import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Требуется авторизация." }, { status: 401 }) };
  if (user.role !== "ADMIN") return { error: NextResponse.json({ error: "Недостаточно прав." }, { status: 403 }) };
  return { user };
}

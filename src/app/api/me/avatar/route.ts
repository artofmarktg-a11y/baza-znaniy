import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const avatar = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarData: true, avatarMimeType: true, hasAvatar: true },
  });
  if (!avatar?.hasAvatar || !avatar.avatarData || !avatar.avatarMimeType) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Buffer.from(avatar.avatarData, "base64"), {
    headers: { "Content-Type": avatar.avatarMimeType, "Cache-Control": "private, no-store" },
  });
}

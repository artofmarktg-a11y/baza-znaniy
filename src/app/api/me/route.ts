import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isRussianPhone, normalizeRussianPhone } from "@/lib/phone";

const avatarPattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const phoneSchema = z.string().trim().max(50).transform(normalizeRussianPhone).refine(isRussianPhone);
const profileSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(80),
  lastName: z.string().trim().max(120),
  firstName: z.string().trim().max(120),
  middleName: z.string().trim().max(120),
  phone: phoneSchema,
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  avatar: z.string().max(1_400_000).optional().nullable(),
});

function publicProfile(user: {
  username: string; lastName: string; firstName: string; middleName: string; phone: string; email: string | null;
  position: string; role: "ADMIN" | "ROP" | "KNOWLEDGE_EDITOR" | "MANAGER"; hasAvatar: boolean;
}) {
  return {
    username: user.username,
    lastName: user.lastName,
    firstName: user.firstName,
    middleName: user.middleName,
    phone: user.phone,
    email: user.email || "",
    position: user.position,
    role: user.role,
    hasAvatar: user.hasAvatar,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });

  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      username: true, lastName: true, firstName: true, middleName: true, phone: true, email: true,
      position: true, role: true, hasAvatar: true,
    },
  });
  return NextResponse.json(publicProfile(profile));
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Проверьте заполнение профиля и формат фотографии." }, { status: 400 });

  const input = parsed.data;
  let avatarUpdate: { avatarData: string | null; avatarMimeType: string | null; hasAvatar: boolean } | undefined;
  if (input.avatar === null) {
    avatarUpdate = { avatarData: null, avatarMimeType: null, hasAvatar: false };
  } else if (input.avatar) {
    const match = avatarPattern.exec(input.avatar);
    if (!match || Buffer.from(match[2], "base64").byteLength > 1_000_000) {
      return NextResponse.json({ error: "Загрузите фотографию PNG, JPEG или WebP размером до 1 МБ." }, { status: 400 });
    }
    avatarUpdate = { avatarData: match[2], avatarMimeType: `image/${match[1]}`, hasAvatar: true };
  }

  try {
    const profile = await prisma.user.update({
      where: { id: user.id },
      data: {
        username: input.username,
        lastName: input.lastName,
        firstName: input.firstName,
        middleName: input.middleName,
        phone: input.phone,
        email: input.email || null,
        ...avatarUpdate,
      },
      select: {
        username: true, lastName: true, firstName: true, middleName: true, phone: true, email: true,
        position: true, role: true, hasAvatar: true,
      },
    });
    return NextResponse.json(publicProfile(profile));
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Этот логин или email уже занят." }, { status: 409 });
    }
    throw error;
  }
}

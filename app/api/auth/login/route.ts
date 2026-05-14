import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return Response.json({ error: "Email ou mot de passe incorrect" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return Response.json({ error: "Email ou mot de passe incorrect" }, { status: 401 });
  }

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return Response.json({ ok: true, role: user.role });
}

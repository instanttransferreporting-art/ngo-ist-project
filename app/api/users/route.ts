import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  return Response.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "Email déjà utilisé" }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, password: hashed, role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return Response.json(user, { status: 201 });
}

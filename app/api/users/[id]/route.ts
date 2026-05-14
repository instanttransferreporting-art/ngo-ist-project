import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Employees can only get their own profile
  if (session.role !== "ADMIN" && session.userId !== id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  if (!user) return Response.json({ error: "Utilisateur introuvable" }, { status: 404 });
  return Response.json(user);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.password) {
    data.password = await bcrypt.hash(parsed.data.password, 12);
  }
  delete data.password; // Remove plain password from data
  if (parsed.data.password) {
    data.password = await bcrypt.hash(parsed.data.password, 12);
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true },
  });

  return Response.json(user);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Prevent self-deletion
  if (session.userId === id) {
    return Response.json({ error: "Impossible de supprimer son propre compte" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}

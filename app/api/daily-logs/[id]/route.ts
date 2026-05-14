import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  done: z.boolean().optional(),
  extraLabel: z.string().optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  const existing = await prisma.dailyTaskLog.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Log introuvable" }, { status: 404 });

  if (session.role !== "ADMIN" && session.userId !== existing.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const log = await prisma.dailyTaskLog.update({ where: { id }, data: parsed.data });
  return Response.json(log);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.dailyTaskLog.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Log introuvable" }, { status: 404 });

  if (session.role !== "ADMIN" && session.userId !== existing.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.dailyTaskLog.delete({ where: { id } });
  return Response.json({ ok: true });
}

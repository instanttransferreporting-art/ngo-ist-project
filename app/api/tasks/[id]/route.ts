import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  group: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  deadline: z.string().optional(),
  order: z.number().int().optional(),
});

type Params = { params: Promise<{ id: string }> };

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

  const task = await prisma.taskLibrary.update({ where: { id }, data: parsed.data });
  return Response.json(task);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.taskLibrary.delete({ where: { id } });
  return Response.json({ ok: true });
}

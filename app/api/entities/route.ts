import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6b7280"),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const entities = await prisma.entity.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return Response.json(entities);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  const existing = await prisma.entity.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    return Response.json({ error: "Une entité avec ce nom existe déjà" }, { status: 409 });
  }

  const entity = await prisma.entity.create({
    data: parsed.data,
    include: { _count: { select: { users: true } } },
  });

  return Response.json(entity, { status: 201 });
}

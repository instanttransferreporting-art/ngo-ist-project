import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  group: z.string().min(1),
  title: z.string().min(1),
  deadline: z.string().optional(),
  order: z.number().int().default(0),
});

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await prisma.taskLibrary.findMany({
    orderBy: [{ group: "asc" }, { order: "asc" }, { title: "asc" }],
  });

  return Response.json(tasks);
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

  const task = await prisma.taskLibrary.create({ data: parsed.data });
  return Response.json(task, { status: 201 });
}

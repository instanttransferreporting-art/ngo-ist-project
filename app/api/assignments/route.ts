import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const assignSchema = z.object({
  userId: z.string(),
  taskIds: z.array(z.string()),
});

const removeSchema = z.object({
  userId: z.string(),
  taskId: z.string().optional(),
});

/** GET /api/assignments?userId=xxx  — list assignments for a user */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("userId") ?? session.userId;

  // Employees can only see their own
  if (session.role !== "ADMIN" && session.userId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const assignments = await prisma.taskAssignment.findMany({
    where: { userId },
    include: { task: true },
    orderBy: [{ task: { group: "asc" } }, { order: "asc" }],
  });

  return Response.json(assignments);
}

/** POST /api/assignments — assign a list of taskIds to a user (upsert) */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  const { userId, taskIds } = parsed.data;

  // Upsert each assignment
  await prisma.$transaction(
    taskIds.map((taskId, idx) =>
      prisma.taskAssignment.upsert({
        where: { userId_taskId: { userId, taskId } },
        create: { userId, taskId, order: idx },
        update: { order: idx },
      })
    )
  );

  return Response.json({ ok: true });
}

/** DELETE /api/assignments — remove a single assignment */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  const { userId, taskId } = parsed.data;
  if (taskId) {
    await prisma.taskAssignment.deleteMany({ where: { userId, taskId } });
  } else {
    // No taskId = delete ALL assignments for this user
    await prisma.taskAssignment.deleteMany({ where: { userId } });
  }
  return Response.json({ ok: true });
}

/** PATCH /api/assignments — update executors for a specific assignment */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { userId, taskId, executors } = body as { userId?: string; taskId?: string; executors?: string };

  if (!userId || !taskId) {
    return Response.json({ error: "userId et taskId requis" }, { status: 400 });
  }

  await prisma.taskAssignment.updateMany({
    where: { userId, taskId },
    data: { executors: executors ?? "" },
  });

  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const upsertSchema = z.object({
  userId: z.string(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  useCurrentTasks: z.boolean(),
  taskIds: z.array(z.string()).optional(),
});

/** GET /api/monthly-plan?userId=xxx&month=6&year=2026 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId");
  const month = parseInt(sp.get("month") ?? "");
  const year = parseInt(sp.get("year") ?? "");

  if (!userId || isNaN(month) || isNaN(year)) {
    return Response.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const plan = await prisma.monthlyAssignmentPlan.findUnique({
    where: { userId_month_year: { userId, month, year } },
    include: {
      tasks: {
        include: { task: true },
        orderBy: [{ task: { group: "asc" } }, { order: "asc" }],
      },
    },
  });

  if (!plan) {
    return Response.json({ exists: false, useCurrentTasks: true, taskIds: [] });
  }

  return Response.json({
    exists: true,
    planId: plan.id,
    useCurrentTasks: plan.useCurrentTasks,
    taskIds: plan.tasks.map((t) => t.taskId),
  });
}

/** POST /api/monthly-plan — upsert plan for a user/month */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  const { userId, month, year, useCurrentTasks, taskIds = [] } = parsed.data;

  const now = new Date();
  const targetDate = new Date(year, month - 1, 1);
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  if (targetDate <= currentMonthDate) {
    return Response.json({ error: "Impossible de planifier pour un mois passé ou en cours" }, { status: 400 });
  }

  const plan = await prisma.monthlyAssignmentPlan.upsert({
    where: { userId_month_year: { userId, month, year } },
    create: { userId, month, year, useCurrentTasks },
    update: { useCurrentTasks },
  });

  // Replace plan tasks
  await prisma.monthlyPlanTask.deleteMany({ where: { planId: plan.id } });

  if (!useCurrentTasks && taskIds.length > 0) {
    await prisma.monthlyPlanTask.createMany({
      data: taskIds.map((taskId, idx) => ({ planId: plan.id, taskId, order: idx })),
      skipDuplicates: true,
    });
  }

  return Response.json({ ok: true, planId: plan.id });
}

/** DELETE /api/monthly-plan?userId=xxx&month=6&year=2026 — reset plan */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId");
  const month = parseInt(sp.get("month") ?? "");
  const year = parseInt(sp.get("year") ?? "");

  if (!userId || isNaN(month) || isNaN(year)) {
    return Response.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  await prisma.monthlyAssignmentPlan.deleteMany({
    where: { userId, month, year },
  });

  return Response.json({ ok: true });
}

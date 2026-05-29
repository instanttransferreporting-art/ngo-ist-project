import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/cron/apply-plans  — called by Vercel Cron on the 1st of each month at 00:05
 * POST /api/cron/apply-plans — manual trigger from admin UI
 *
 * For every MonthlyAssignmentPlan with useCurrentTasks=false for the current month,
 * replaces the employee's TaskAssignment with the planned tasks.
 */
async function handler(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const isCronCall = auth === `Bearer ${process.env.CRON_SECRET}`;
  const origin = req.headers.get("origin") ?? "";
  const isLocalDevCall =
    process.env.NODE_ENV !== "production" &&
    (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));

  if (!isCronCall) {
    const session = await getSession();
    if ((!session || session.role !== "ADMIN") && !isLocalDevCall) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Find all plans for the current month that override assignments
  const plans = await prisma.monthlyAssignmentPlan.findMany({
    where: { month, year, useCurrentTasks: false },
    include: {
      tasks: { orderBy: { order: "asc" } },
    },
  });

  let applied = 0;
  for (const plan of plans) {
    // Replace TaskAssignment for this user with the plan tasks
    await prisma.$transaction(async (tx) => {
      await tx.taskAssignment.deleteMany({ where: { userId: plan.userId } });
      if (plan.tasks.length > 0) {
        await tx.taskAssignment.createMany({
          data: plan.tasks.map((pt) => ({
            userId: plan.userId,
            taskId: pt.taskId,
            order: pt.order,
          })),
          skipDuplicates: true,
        });
      }
      // Delete the applied plan
      await tx.monthlyAssignmentPlan.delete({ where: { id: plan.id } });
    });
    applied++;
  }

  return Response.json({ ok: true, month, year, applied });
}

export { handler as GET, handler as POST };

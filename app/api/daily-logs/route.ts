import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isSunday, parseISO } from "date-fns";
import { z } from "zod";

const toggleSchema = z.object({
  userId: z.string(),
  taskId: z.string().optional(), // null for extra tasks
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  done: z.boolean(),
  type: z.enum(["PREDEFINED", "EXTRA"]).default("PREDEFINED"),
  extraLabel: z.string().optional(),
});

/** GET /api/daily-logs?userId=xxx&month=5&year=2026 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId") ?? session.userId;
  const month = sp.get("month") ? parseInt(sp.get("month")!) : null;
  const year = sp.get("year") ? parseInt(sp.get("year")!) : null;
  const dateStr = sp.get("date");

  if (session.role !== "ADMIN" && session.userId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let where: Record<string, unknown> = { userId };

  if (dateStr) {
    where.date = new Date(dateStr);
  } else if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    where.date = { gte: start, lte: end };
  }

  const logs = await prisma.dailyTaskLog.findMany({
    where,
    include: { task: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  return Response.json(logs);
}

/** POST /api/daily-logs — toggle a predefined task or create an extra task */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  const { userId, taskId, date, done, type, extraLabel } = parsed.data;

  // Employees can only act on their own logs
  if (session.role !== "ADMIN" && session.userId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Block Sunday
  if (isSunday(parseISO(date))) {
    return Response.json({ error: "Aucune action le dimanche" }, { status: 400 });
  }

  const dateObj = new Date(date);

  if (type === "PREDEFINED" && taskId) {
    // Upsert predefined log
    const log = await prisma.dailyTaskLog.upsert({
      where: { userId_taskId_date: { userId, taskId, date: dateObj } },
      create: { userId, taskId, date: dateObj, done, type: "PREDEFINED" },
      update: { done },
    });
    return Response.json(log);
  } else {
    // Create extra task log (always done when created)
    if (!extraLabel) {
      return Response.json({ error: "Le libellé est requis pour une tâche extra" }, { status: 400 });
    }
    const log = await prisma.dailyTaskLog.create({
      data: { userId, date: dateObj, done: true, type: "EXTRA", extraLabel },
    });
    return Response.json(log, { status: 201 });
  }
}

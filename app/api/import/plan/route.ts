import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseTasksFromExcel } from "@/lib/excel";

/**
 * POST /api/import/plan
 * FormData: file, userId, month, year
 *
 * Parses tasks from an Excel/CSV file, matches them against the existing
 * TaskLibrary by title (case-insensitive), and sets those as the monthly plan
 * tasks for the given user/month/year. Sets useCurrentTasks = false.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const userId = formData.get("userId") as string | null;
  const monthStr = formData.get("month") as string | null;
  const yearStr = formData.get("year") as string | null;

  if (!file || !userId || !monthStr || !yearStr) {
    return Response.json({ error: "Paramètres manquants (file, userId, month, year)" }, { status: 400 });
  }

  const month = parseInt(monthStr);
  const year = parseInt(yearStr);

  if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2000 || year > 2100) {
    return Response.json({ error: "Mois/année invalides" }, { status: 400 });
  }

  const now = new Date();
  const targetDate = new Date(year, month - 1, 1);
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  if (targetDate <= currentMonthDate) {
    return Response.json({ error: "Impossible de planifier pour un mois passé ou en cours" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "Impossible de lire le fichier" }, { status: 400 });
  }

  let rows: Array<{ groupe: string; titre: string; delai?: string; ordre?: number; executants?: string }>;
  try {
    rows = parseTasksFromExcel(buffer);
  } catch {
    return Response.json({ error: "Fichier invalide ou format non supporté" }, { status: 400 });
  }

  if (rows.length === 0) {
    return Response.json(
      { error: "Aucune tâche trouvée dans le fichier. Vérifiez que les colonnes 'groupe' et 'titre' existent." },
      { status: 400 }
    );
  }

  // Match rows against existing library tasks by title (case-insensitive)
  const allTasks = await prisma.taskLibrary.findMany();
  const matched: string[] = [];
  const executantsMap = new Map<string, string>(); // taskId -> executors string
  for (const row of rows) {
    const needle = row.titre.trim().toLowerCase();
    const found = allTasks.find((t) => t.title.trim().toLowerCase() === needle);
    if (found && !matched.includes(found.id)) {
      matched.push(found.id);
    }
    if (found && row.executants) {
      executantsMap.set(found.id, row.executants);
    }
  }

  // Upsert the plan record
  const plan = await prisma.monthlyAssignmentPlan.upsert({
    where: { userId_month_year: { userId, month, year } },
    create: { userId, month, year, useCurrentTasks: false },
    update: { useCurrentTasks: false },
  });

  // Replace plan tasks with the matched ones
  await prisma.monthlyPlanTask.deleteMany({ where: { planId: plan.id } });
  if (matched.length > 0) {
    await prisma.monthlyPlanTask.createMany({
      data: matched.map((taskId, idx) => ({ planId: plan.id, taskId, order: idx })),
      skipDuplicates: true,
    });
  }

  // Update TaskAssignment executors for rows that had executants
  for (const [taskId, executors] of executantsMap.entries()) {
    await prisma.taskAssignment.updateMany({
      where: { userId, taskId },
      data: { executors },
    });
  }

  return Response.json({ ok: true, matched: matched.length, total: rows.length });
}

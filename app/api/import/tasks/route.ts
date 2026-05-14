import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseTasksFromExcel } from "@/lib/excel";

/**
 * POST /api/import/tasks
 * Body: FormData with file (Excel/CSV) + optional userId (to auto-assign)
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const userId = formData.get("userId") as string | null;
  const assignToUser = formData.get("assign") === "true";

  if (!file) {
    return Response.json({ error: "Aucun fichier fourni" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows;
  try {
    rows = parseTasksFromExcel(buffer);
  } catch {
    return Response.json({ error: "Fichier invalide ou format non supporté" }, { status: 400 });
  }

  if (rows.length === 0) {
    return Response.json({ error: "Aucune tâche trouvée dans le fichier" }, { status: 400 });
  }

  // Create tasks in the library
  const created = await prisma.$transaction(
    rows.map((row) =>
      prisma.taskLibrary.create({
        data: {
          group: row.groupe,
          title: row.titre,
          deadline: row.delai,
          order: row.ordre ?? 0,
        },
      })
    )
  );

  // If userId provided and assign=true, create assignments
  let assigned = 0;
  if (assignToUser && userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return Response.json({ error: "Utilisateur introuvable pour l'assignation" }, { status: 404 });
    }

    await prisma.$transaction(
      created.map((task, idx) =>
        prisma.taskAssignment.upsert({
          where: { userId_taskId: { userId, taskId: task.id } },
          create: { userId, taskId: task.id, order: idx },
          update: { order: idx },
        })
      )
    );
    assigned = created.length;
  }

  return Response.json({
    ok: true,
    imported: created.length,
    assigned,
    tasks: created,
  });
}

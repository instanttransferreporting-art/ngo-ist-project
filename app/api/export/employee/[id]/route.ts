import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildEmployeeExcel } from "@/lib/excel";
import { getEmployeeSheetData } from "@/lib/employeeSheet";
import { getWorkingDaysOfMonth, formatMonthLabel } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

/** GET /api/export/employee/[id]?month=5&year=2026 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession();
    const { id: userId } = await params;

    // Admins can export anyone; employees can only export themselves
    if (!session || (session.role !== "ADMIN" && session.userId !== userId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const month = sp.get("month") ? parseInt(sp.get("month")!) : now.getMonth() + 1;
    const year = sp.get("year") ? parseInt(sp.get("year")!) : now.getFullYear();

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    if (!user) return Response.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const workingDays = getWorkingDaysOfMonth(year, month);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);

    const { headers, rows } = await getEmployeeSheetData(userId, monthStart, monthEnd, workingDays);

    const buffer = buildEmployeeExcel({
      name: user.name,
      month: formatMonthLabel(year, month),
      headers,
      rows,
    });

    const filename = `${user.name.replace(/\s/g, "_")}-${formatMonthLabel(year, month).replace(/\s/g, "_")}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    console.error("Failed to export employee excel:", err);
    return Response.json({ error: "Erreur lors de la génération du fichier Excel" }, { status: 500 });
  }
}

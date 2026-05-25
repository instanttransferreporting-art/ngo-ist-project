import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getWorkingDaysOfMonth, isOnLeave, toIsoDate, calcMonthStats, formatMonthLabel, getScoreColor, capitalizeFirst } from "@/lib/utils";
import { isSunday, format, parseISO } from "date-fns";
import Link from "next/link";

async function getDashboardData() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const todayStr = format(now, "yyyy-MM-dd"); // local calendar date
  const today = new Date(todayStr + "T00:00:00.000Z"); // UTC midnight for DB queries
  const todayIsSunday = isSunday(now);

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const workingDays = getWorkingDaysOfMonth(year, month).filter((d) => toIsoDate(d) <= todayStr);

  const employeeStats = await Promise.all(
    employees.map(async (emp) => {
      const [assignments, logs, leaves] = await Promise.all([
        prisma.taskAssignment.count({ where: { userId: emp.id } }),
        prisma.dailyTaskLog.findMany({
          where: { userId: emp.id, date: { gte: monthStart, lte: monthEnd } },
        }),
        prisma.leaveRequest.findMany({
          where: { userId: emp.id, status: "APPROVED", startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
        }),
      ]);

      const approvedLeaves = leaves.map((l) => ({ startDate: l.startDate, endDate: l.endDate }));

      // Today's status
      const todayOnLeave = !todayIsSunday && isOnLeave(today, approvedLeaves);
      const todayDonePredefined = logs.filter(
        (l) => toIsoDate(new Date(l.date)) === todayStr && l.done && l.type === "PREDEFINED"
      ).length;
      const todayExtraLogs = logs.filter(
        (l) => toIsoDate(new Date(l.date)) === todayStr && l.type === "EXTRA"
      );
      const todayDoneExtra = todayExtraLogs.filter((l) => l.done).length;
      const todayTotal = assignments + todayExtraLogs.length;
      const todayDone = todayDonePredefined + todayDoneExtra;
      const todayPercent = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0;

      // Monthly stats
      const dayStats = workingDays.map((day) => {
        const ds = toIsoDate(day);
        const dayLogs = logs.filter((l) => toIsoDate(new Date(l.date)) === ds);
        return {
          date: ds,
          totalPredefined: assignments,
          donePredefined: dayLogs.filter((l) => l.type === "PREDEFINED" && l.done).length,
          totalExtra: dayLogs.filter((l) => l.type === "EXTRA").length,
          doneExtra: dayLogs.filter((l) => l.type === "EXTRA" && l.done).length,
          isLeave: isOnLeave(day, approvedLeaves),
          isSundayDay: false,
        };
      });

      const monthly = calcMonthStats(dayStats);

      return {
        ...emp,
        todayOnLeave,
        todayDone,
        todayTotal,
        todayPercent: todayIsSunday ? null : todayPercent,
        monthly,
      };
    })
  );

  return { employeeStats, month, year, todayStr, todayIsSunday };
}

const badgeMap = {
  red: "bg-red-100 text-red-700",
  yellow: "bg-yellow-100 text-yellow-700",
  green: "bg-green-100 text-green-700",
  gray: "bg-slate-100 text-slate-500",
};

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const { employeeStats, month, year, todayStr, todayIsSunday } = await getDashboardData();

  const red = employeeStats.filter((e) => !e.todayOnLeave && (e.todayPercent ?? 0) < 50).length;
  const yellow = employeeStats.filter((e) => !e.todayOnLeave && (e.todayPercent ?? 0) >= 50 && (e.todayPercent ?? 0) <= 75).length;
  const green = employeeStats.filter((e) => !e.todayOnLeave && (e.todayPercent ?? 0) > 75).length;
  const onLeave = employeeStats.filter((e) => e.todayOnLeave).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Tableau de bord</h1>
        <p className="text-slate-500 mt-1">
          {capitalizeFirst(formatMonthLabel(year, month))}
          {todayIsSunday && <span className="ml-2 text-sm bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Dimanche – pas de tâches</span>}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Rouge (<50%)", count: red, color: "text-red-600", bg: "bg-red-50 border-red-100" },
          { label: "Jaune (50–75%)", count: yellow, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-100" },
          { label: "Vert (>75%)", count: green, color: "text-green-600", bg: "bg-green-50 border-green-100" },
          { label: "En congé", count: onLeave, color: "text-slate-600", bg: "bg-slate-50 border-slate-100" },
        ].map((c) => (
          <div key={c.label} className={`${c.bg} border rounded-xl p-4`}>
            <div className={`text-2xl font-bold ${c.color}`}>{c.count}</div>
            <div className="text-sm text-slate-600 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Employee table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Employés – Aujourd&apos;hui ({todayStr})</h2>
                <Link
                  href="/admin/reports"
            className="text-sm text-blue-700 hover:underline"
          >
            Voir rapports →
          </Link>
        </div>

        {todayIsSunday ? (
          <div className="px-6 py-12 text-center text-slate-400">
            <p className="text-lg font-medium">C&apos;est dimanche</p>
            <p className="text-sm mt-1">Aucune tâche ni rapport ce jour-là.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Employé</th>
                  <th className="text-center px-4 py-3 font-medium">Aujourd&apos;hui</th>
                  <th className="text-center px-4 py-3 font-medium">% Jour</th>
                  <th className="text-center px-4 py-3 font-medium">Tâches mois</th>
                  <th className="text-center px-4 py-3 font-medium">% Mois</th>
                  <th className="text-center px-4 py-3 font-medium">Score /20</th>
                  <th className="text-center px-4 py-3 font-medium">Statut</th>
                  <th className="text-right px-6 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeeStats.map((emp) => {
                  const scoreColor = emp.todayOnLeave
                    ? "gray"
                    : getScoreColor(emp.todayPercent ?? 0);

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-900">{emp.name}</td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {emp.todayOnLeave ? "—" : `${emp.todayDone} / ${emp.todayTotal}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {emp.todayOnLeave ? (
                          <span className="text-slate-400">Congé</span>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badgeMap[scoreColor]}`}>
                            {emp.todayPercent}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 text-xs whitespace-nowrap">
                        {emp.monthly.totalDone} / {emp.monthly.totalTasks}
                        {emp.monthly.leaveDays > 0 && <span className="text-slate-400 ml-1">({emp.monthly.leaveDays}j.c)</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badgeMap[getScoreColor(emp.monthly.percentTotal)]}`}>
                          {emp.monthly.percentTotal.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badgeMap[getScoreColor(emp.monthly.percentTotal)]}`}>
                          {emp.monthly.score20} /20
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${emp.todayOnLeave ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {emp.todayOnLeave ? "En congé" : "Présent"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                                href={`/admin/employees/${emp.id}`}
                          className="text-xs text-blue-700 hover:underline font-medium"
                        >
                          Voir fiche
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {employeeStats.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                            Aucun employé trouvé. <Link href="/admin/employees" className="text-blue-700 hover:underline">Ajouter des employés</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

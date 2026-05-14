"use client";

import { useState } from "react";
import { format } from "date-fns";
import { getScoreColor } from "@/lib/utils";

interface DailyRow {
  userId: string;
  name: string;
  done: number;
  total: number;
  percent: number;
  status: string;
  isLeave: boolean;
}

interface MonthlyRow {
  userId: string;
  name: string;
  score20: number;
  percentTotal: number;
  totalDone: number;
  totalTasks: number;
  leaveDays: number;
  workingDays: number;
  monthLabel: string;
}

const badgeMap = {
  red: "bg-red-100 text-red-700",
  yellow: "bg-yellow-100 text-yellow-700",
  green: "bg-green-100 text-green-700",
  gray: "bg-slate-100 text-slate-500",
};

export default function ReportsPage() {
  const now = new Date();
  const [tab, setTab] = useState<"daily" | "monthly">("daily");
  const [dailyDate, setDailyDate] = useState(format(now, "yyyy-MM-dd"));
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [dailyData, setDailyData] = useState<{ date: string; rows: DailyRow[] } | null>(null);
  const [monthlyData, setMonthlyData] = useState<{ month: number; year: number; monthLabel: string; rows: MonthlyRow[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchDailyReport() {
    setLoading(true);
    const res = await fetch(`/api/reports/daily?date=${dailyDate}`);
    if (res.ok) setDailyData(await res.json());
    setLoading(false);
  }

  async function fetchMonthlyReport() {
    setLoading(true);
    const res = await fetch(`/api/reports/monthly?month=${reportMonth}&year=${reportYear}`);
    if (res.ok) setMonthlyData(await res.json());
    setLoading(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Rapports & Exports</h1>
        <p className="text-slate-500 mt-1">Statistiques et exports Excel</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <button onClick={() => setTab("daily")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "daily" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
          Rapport journalier
        </button>
        <button onClick={() => setTab("monthly")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "monthly" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
          Rapport mensuel
        </button>
      </div>

      {/* Daily */}
      {tab === "daily" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)}
              className="px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
            <button onClick={fetchDailyReport} disabled={loading}
              className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition-colors">
              {loading ? "Chargement..." : "Générer le rapport"}
            </button>
            {dailyData && (
              <a href={`/api/export/daily?date=${dailyDate}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white font-medium rounded-lg text-sm transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exporter Excel
              </a>
            )}
          </div>

          {dailyData && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
                Rapport du {dailyData.date}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-6 py-3 font-medium">Employé</th>
                      <th className="text-center px-4 py-3 font-medium">Tâches</th>
                      <th className="text-center px-4 py-3 font-medium">%</th>
                      <th className="text-center px-4 py-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyData.rows.map((row) => {
                      const color = row.isLeave ? "gray" : getScoreColor(row.percent);
                      return (
                        <tr key={row.userId} className="hover:bg-slate-50">
                          <td className="px-6 py-3 font-medium text-slate-900">{row.name}</td>
                          <td className="px-4 py-3 text-center text-slate-600">
                            {row.isLeave ? "—" : `${row.done} / ${row.total}`}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {row.isLeave ? (
                              <span className="text-slate-400">Congé</span>
                            ) : (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badgeMap[color]}`}>
                                {row.percent}%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${row.isLeave ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                              {row.isLeave ? "En congé" : "Présent"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly */}
      {tab === "monthly" && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select value={reportMonth} onChange={(e) => setReportMonth(parseInt(e.target.value))}
              className="px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2024, i).toLocaleString("fr-FR", { month: "long" })}
                </option>
              ))}
            </select>
            <input type="number" value={reportYear} onChange={(e) => setReportYear(parseInt(e.target.value))}
              min="2020" max="2099"
              className="w-24 px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
            <button onClick={fetchMonthlyReport} disabled={loading}
              className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition-colors">
              {loading ? "Chargement..." : "Générer le rapport"}
            </button>
            {monthlyData && (
              <a href={`/api/export/monthly?month=${reportMonth}&year=${reportYear}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white font-medium rounded-lg text-sm transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exporter Excel
              </a>
            )}
          </div>

          {monthlyData && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
                Rapport – {monthlyData.monthLabel}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-6 py-3 font-medium">Employé</th>
                      <th className="text-center px-4 py-3 font-medium">Score /20</th>
                      <th className="text-center px-4 py-3 font-medium">%</th>
                      <th className="text-center px-4 py-3 font-medium">Tâches</th>
                      <th className="text-center px-4 py-3 font-medium">J. Congé</th>
                      <th className="text-center px-4 py-3 font-medium">J. Ouvrés</th>
                      <th className="text-right px-6 py-3 font-medium">Exporter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthlyData.rows.map((row) => {
                      const color = getScoreColor(row.percentTotal);
                      return (
                        <tr key={row.userId} className="hover:bg-slate-50">
                          <td className="px-6 py-3 font-medium text-slate-900">{row.name}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badgeMap[color]}`}>
                              {row.score20}/20
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badgeMap[color]}`}>
                              {row.percentTotal}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600">{row.totalDone}/{row.totalTasks}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{row.leaveDays}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{row.workingDays}</td>
                          <td className="px-6 py-3 text-right">
                            <a href={`/api/export/employee/${row.userId}?month=${reportMonth}&year=${reportYear}`}
                              className="text-xs text-green-700 hover:underline font-medium">Excel</a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

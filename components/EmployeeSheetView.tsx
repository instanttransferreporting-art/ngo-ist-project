"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, isToday, isPast } from "date-fns";
import { fr } from "date-fns/locale";
import { capitalizeFirst, getScoreColor } from "@/lib/utils";

interface TaskLog {
  taskId: string | null;
  logId: string | null;
  done: boolean;
  group: string;
  title: string;
  deadline?: string | null;
}

interface ExtraLog {
  logId: string;
  extraLabel: string | null;
  done: boolean;
}

interface DayData {
  date: string;
  isLeave: boolean;
  predefinedLogs: TaskLog[];
  extraLogs: ExtraLog[];
}

interface Assignment {
  taskId: string;
  group: string;
  title: string;
  deadline?: string | null;
}

interface MonthStats {
  score20: number;
  percentTotal: number;
  percentPredefined: number;
  percentExtra: number;
  totalDone: number;
  totalTasks: number;
  leaveDays: number;
  workingDays: number;
}

interface SheetData {
  userId: string;
  month: number;
  year: number;
  lockMode: "FREE" | "LOCKED" | "HIDDEN";
  assignments: Assignment[];
  days: DayData[];
  stats: MonthStats;
}

export function EmployeeSheetView({
  userId,
  isAdmin = false,
}: {
  userId: string;
  isAdmin?: boolean;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sheet" | "tasklist">("sheet");
  const [extraInput, setExtraInput] = useState("");
  const [addingExtra, setAddingExtra] = useState(false);
  const [filterDone, setFilterDone] = useState<"all" | "done" | "undone">("all");

  const todayStr = format(now, "yyyy-MM-dd");

  const fetchSheet = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/monthly-sheet?userId=${userId}&month=${month}&year=${year}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [userId, month, year]);

  useEffect(() => { fetchSheet(); }, [fetchSheet]);

  async function toggleTask(date: string, taskId: string, currentDone: boolean) {
    const res = await fetch("/api/daily-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, taskId, date, done: !currentDone, type: "PREDEFINED" }),
    });
    if (res.ok) fetchSheet();
  }

  async function addExtraTask(date: string) {
    if (!extraInput.trim()) return;
    setAddingExtra(true);
    const res = await fetch("/api/daily-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, date, done: true, type: "EXTRA", extraLabel: extraInput.trim() }),
    });
    if (res.ok) { setExtraInput(""); fetchSheet(); }
    setAddingExtra(false);
  }

  async function toggleExtra(logId: string, currentDone: boolean) {
    const res = await fetch(`/api/daily-logs/${logId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !currentDone }),
    });
    if (res.ok) fetchSheet();
  }

  async function deleteExtra(logId: string) {
    const res = await fetch(`/api/daily-logs/${logId}`, { method: "DELETE" });
    if (res.ok) fetchSheet();
  }

  function isDayEditable(dateStr: string): boolean {
    if (isAdmin) return false; // Admin view is read-only
    if (!data) return false;
    if (data.lockMode === "FREE") return true;
    if (data.lockMode === "LOCKED" || data.lockMode === "HIDDEN") {
      return isToday(parseISO(dateStr));
    }
    return false;
  }

  function isDayVisible(dateStr: string): boolean {
    if (isAdmin) return true;
    if (!data) return false;
    if (data.lockMode === "HIDDEN") return isToday(parseISO(dateStr));
    return true;
  }

  const scoreColor = data ? getScoreColor(data.stats.percentTotal) : "gray";
  const scoreColorClass = {
    red: "text-red-600 bg-red-50 border-red-200",
    yellow: "text-yellow-600 bg-yellow-50 border-yellow-200",
    green: "text-green-600 bg-green-50 border-green-200",
    gray: "text-slate-500 bg-slate-50 border-slate-200",
  }[scoreColor];

  const monthLabel = data
    ? capitalizeFirst(format(new Date(data.year, data.month - 1), "MMMM yyyy", { locale: fr }))
    : "";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <svg className="w-6 h-6 animate-spin mr-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Chargement...
      </div>
    );
  }

  if (!data) return <div className="text-red-500">Erreur de chargement</div>;

  // Group assignments by group name
  const groups: Record<string, Assignment[]> = {};
  for (const a of data.assignments) {
    if (!groups[a.group]) groups[a.group] = [];
    groups[a.group].push(a);
  }

  const visibleDays = data.days.filter((d) => isDayVisible(d.date));

  return (
    <div>
      {/* Month selector & stats */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const d = new Date(year, month - 2);
              setMonth(d.getMonth() + 1);
              setYear(d.getFullYear());
            }}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="font-semibold text-slate-800 text-lg min-w-36 text-center">{monthLabel}</span>
          <button
            onClick={() => {
              const d = new Date(year, month);
              setMonth(d.getMonth() + 1);
              setYear(d.getFullYear());
            }}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {/* Monthly stats */}
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium ${scoreColorClass}`}>
          <span>Score: {data.stats.score20}/20</span>
          <span>|</span>
          <span>{data.stats.percentTotal}%</span>
          <span>|</span>
          <span>{data.stats.totalDone}/{data.stats.totalTasks} tâches</span>
          {data.stats.leaveDays > 0 && (
            <>
              <span>|</span>
              <span>{data.stats.leaveDays} j. congé</span>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("sheet")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "sheet" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          Feuille {monthLabel}
        </button>
        <button
          onClick={() => setActiveTab("tasklist")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "tasklist" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          TASK_LOG (tâches assignées)
        </button>
      </div>

      {/* TASK_LOG TAB */}
      {activeTab === "tasklist" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Tâches assignées</h2>
            <p className="text-sm text-slate-500 mt-0.5">{data.assignments.length} tâche(s) prédéfinies</p>
          </div>
          {Object.entries(groups).map(([groupName, tasks]) => (
            <div key={groupName} className="border-b border-slate-100 last:border-0">
              <div className="px-6 py-2 bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                {groupName}
              </div>
              {tasks.map((t) => (
                <div key={t.taskId} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50">
                  <span className="text-sm text-slate-800">{t.title}</span>
                  {t.deadline && (
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{t.deadline}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          {data.assignments.length === 0 && (
            <div className="px-6 py-10 text-center text-slate-400">Aucune tâche assignée</div>
          )}
        </div>
      )}

      {/* MONTHLY SHEET TAB */}
      {activeTab === "sheet" && (
        <div>
          {/* Filter (admin only) */}
          {isAdmin && (
            <div className="flex gap-2 mb-4">
              {(["all", "done", "undone"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterDone(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterDone === f ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {f === "all" ? "Tout" : f === "done" ? "Faites" : "Non faites"}
                </button>
              ))}
            </div>
          )}

          {/* Daily columns */}
          <div className="space-y-4">
            {visibleDays.map((day) => {
              const dayDate = parseISO(day.date);
              const isDayToday = isToday(dayDate);
              const isPastDay = isPast(dayDate) && !isDayToday;
              const editable = isDayEditable(day.date);
              const dayLabel = format(dayDate, "EEEE dd MMMM", { locale: fr });

              let dayFilteredPredefined = day.predefinedLogs;
              if (isAdmin && filterDone !== "all") {
                dayFilteredPredefined = day.predefinedLogs.filter((l) =>
                  filterDone === "done" ? l.done : !l.done
                );
              }

              if (day.isLeave) {
                return (
                  <div key={day.date} className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-amber-800 capitalize">{dayLabel}</div>
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-medium rounded-full">En congé</span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={day.date}
                  className={`bg-white border rounded-xl overflow-hidden ${isDayToday ? "border-blue-300 shadow-sm" : "border-slate-200"}`}
                >
                  {/* Day header */}
                  <div className={`px-6 py-3 flex items-center justify-between ${isDayToday ? "bg-blue-50" : "bg-slate-50"}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold capitalize ${isDayToday ? "text-blue-800" : "text-slate-700"}`}>
                        {dayLabel}
                      </span>
                      {isDayToday && <span className="px-2 py-0.5 bg-blue-700 text-white text-xs font-medium rounded-full">Aujourd&apos;hui</span>}
                    </div>
                    {/* Day stats */}
                    <div className="text-xs text-slate-500">
                      {day.predefinedLogs.filter((l) => l.done).length + day.extraLogs.filter((l) => l.done).length}
                      {" / "}
                      {day.predefinedLogs.length + day.extraLogs.length}
                      {" faites"}
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {/* Predefined tasks grouped */}
                    {Object.entries(groups).map(([groupName, tasks]) => {
                      const groupLogs = dayFilteredPredefined.filter((l) =>
                        tasks.some((t) => t.taskId === l.taskId)
                      );
                      if (groupLogs.length === 0) return null;
                      return (
                        <div key={groupName}>
                          <div className="px-6 py-1.5 bg-slate-50/60 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {groupName}
                          </div>
                          {groupLogs.map((log) => (
                            <label
                              key={log.taskId}
                              className={`flex items-center gap-3 px-6 py-3 hover:bg-slate-50 cursor-pointer ${!editable ? "opacity-70" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={log.done}
                                disabled={!editable}
                                onChange={() => log.taskId && toggleTask(day.date, log.taskId, log.done)}
                              />
                              <span className={`text-sm flex-1 ${log.done ? "line-through text-slate-400" : "text-slate-800"}`}>
                                {log.title}
                              </span>
                              {log.deadline && (
                                <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{log.deadline}</span>
                              )}
                            </label>
                          ))}
                        </div>
                      );
                    })}

                    {/* Extra tasks */}
                    {(day.extraLogs.length > 0 || (editable && isDayToday)) && (
                      <div>
                        {day.extraLogs.length > 0 && (
                          <div className="px-6 py-1.5 bg-slate-50/60 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            Tâches extra
                          </div>
                        )}
                        {day.extraLogs.map((extra) => (
                          <div key={extra.logId} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={extra.done}
                              disabled={!editable}
                              onChange={() => toggleExtra(extra.logId, extra.done)}
                            />
                            <span className={`text-sm flex-1 ${extra.done ? "line-through text-slate-400" : "text-slate-800"}`}>
                              {extra.extraLabel}
                            </span>
                            {editable && (
                              <button
                                onClick={() => deleteExtra(extra.logId)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Add extra task (today only, not admin) */}
                        {editable && isDayToday && !isAdmin && (
                          <div className="flex items-center gap-2 px-6 py-3 border-t border-dashed border-slate-200">
                            <input
                              type="text"
                              value={extraInput}
                              onChange={(e) => setExtraInput(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addExtraTask(day.date)}
                              placeholder="Ajouter une tâche extra..."
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                            <button
                              onClick={() => addExtraTask(day.date)}
                              disabled={addingExtra || !extraInput.trim()}
                              className="px-3 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              {addingExtra ? "..." : "Ajouter"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Add extra button for today (when no extras yet) */}
                    {editable && isDayToday && !isAdmin && day.extraLogs.length === 0 && (
                      <div className="flex items-center gap-2 px-6 py-3 border-t border-dashed border-slate-200">
                        <input
                          type="text"
                          value={extraInput}
                          onChange={(e) => setExtraInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addExtraTask(day.date)}
                          placeholder="Ajouter une tâche extra..."
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                          onClick={() => addExtraTask(day.date)}
                          disabled={addingExtra || !extraInput.trim()}
                          className="px-3 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          {addingExtra ? "..." : "Ajouter"}
                        </button>
                      </div>
                    )}

                    {data.assignments.length === 0 && day.extraLogs.length === 0 && (
                      <div className="px-6 py-4 text-center text-slate-400 text-sm">Aucune tâche assignée</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats section (admin only) */}
          {isAdmin && data.stats.totalTasks > 0 && (
            <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold text-slate-800 mb-4">Résultats du mois – {monthLabel}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Score /20", value: `${data.stats.score20}`, color: scoreColorClass },
                  { label: "% Global", value: `${data.stats.percentTotal}%`, color: scoreColorClass },
                  { label: "% Tâches prédéfinies", value: `${data.stats.percentPredefined}%`, color: "" },
                  { label: "% Tâches extra", value: `${data.stats.percentExtra}%`, color: "" },
                  { label: "Tâches faites", value: `${data.stats.totalDone}`, color: "" },
                  { label: "Total tâches", value: `${data.stats.totalTasks}`, color: "" },
                  { label: "Jours de congé", value: `${data.stats.leaveDays}`, color: "" },
                  { label: "Jours ouvrés", value: `${data.stats.workingDays}`, color: "" },
                ].map((s) => (
                  <div key={s.label} className="bg-slate-50 rounded-lg p-3">
                    <div className={`text-xl font-bold ${s.color || "text-slate-800"}`}>{s.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

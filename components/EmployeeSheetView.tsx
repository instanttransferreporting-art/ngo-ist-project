"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format, parseISO, isToday } from "date-fns";
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
  minMonth: number;
  minYear: number;
  maxMonth: number;
  maxYear: number;
  lockMode: "FREE" | "LOCKED" | "HIDDEN";
  globalTemplate?: "A" | "B";
  userTemplate?: "A" | "B" | null;
  template: "A" | "B";
  assignments: Assignment[];
  days: DayData[];
  stats: MonthStats;
}

function monthIndex(year: number, month: number): number {
  return year * 12 + month;
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
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"sheet" | "tasklist">("sheet");
  const [extraInput, setExtraInput] = useState("");
  const [addingExtra, setAddingExtra] = useState(false);
  const [filterDone, setFilterDone] = useState<"all" | "done" | "undone">("all");
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const todayStr = format(now, "yyyy-MM-dd");

  const fetchSheet = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    const res = await fetch(`/api/monthly-sheet?userId=${userId}&month=${month}&year=${year}`);
    if (res.ok) {
      setData(await res.json());
      setError("");
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur de chargement");
    }

    if (silent) setRefreshing(false);
    else setLoading(false);
  }, [userId, month, year]);

  useEffect(() => { fetchSheet(); }, [fetchSheet]);

  useEffect(() => {
    setCollapsedWeeks({});
    setCollapsedDays({});
  }, [month, year, userId]);

  async function saveTemplate(nextTemplate: "A" | "B") {
    if (!isAdmin || !data) return;
    setSavingTemplate(true);
    const res = await fetch("/api/lock", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: data.lockMode, template: nextTemplate }),
    });
    if (res.ok) await fetchSheet(true);
    setSavingTemplate(false);
  }

  async function saveUserTemplate(nextTemplate: "A" | "B" | null) {
    if (isAdmin || !data) return;

    setSavingTemplate(true);
    setData((prev) => {
      if (!prev) return prev;
      const resolved = nextTemplate ?? prev.globalTemplate ?? "A";
      return { ...prev, template: resolved, userTemplate: nextTemplate };
    });
    setError("");

    const res = await fetch(`/api/users/${userId}/template-preference`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: nextTemplate }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Impossible d'enregistrer votre template.");
      await fetchSheet(true);
    }
    setSavingTemplate(false);
  }

  function updateDoneState(date: string, taskId: string, done: boolean) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) =>
          d.date !== date
            ? d
            : {
                ...d,
                predefinedLogs: d.predefinedLogs.map((l) =>
                  l.taskId === taskId ? { ...l, done } : l
                ),
              }
        ),
      };
    });
  }

  async function toggleTask(date: string, taskId: string, currentDone: boolean) {
    updateDoneState(date, taskId, !currentDone);
    setError("");
    const res = await fetch("/api/daily-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, taskId, date, done: !currentDone, type: "PREDEFINED" }),
    });
    if (res.ok) {
      fetchSheet(true);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la sauvegarde");
      updateDoneState(date, taskId, currentDone); // revert optimistic update
    }
  }

  async function addExtraTask(date: string) {
    if (!extraInput.trim()) return;
    setAddingExtra(true);
    const res = await fetch("/api/daily-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, date, done: true, type: "EXTRA", extraLabel: extraInput.trim() }),
    });
    if (res.ok) { setExtraInput(""); fetchSheet(true); }
    setAddingExtra(false);
  }

  function updateExtraState(logId: string, done: boolean) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) => ({
          ...d,
          extraLogs: d.extraLogs.map((l) => (l.logId === logId ? { ...l, done } : l)),
        })),
      };
    });
  }

  async function toggleExtra(logId: string, currentDone: boolean) {
    updateExtraState(logId, !currentDone);
    setError("");
    const res = await fetch(`/api/daily-logs/${logId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !currentDone }),
    });
    if (res.ok) {
      fetchSheet(true);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la sauvegarde");
      updateExtraState(logId, currentDone); // revert optimistic update
    }
  }

  async function deleteExtra(logId: string) {
    const res = await fetch(`/api/daily-logs/${logId}`, { method: "DELETE" });
    if (res.ok) fetchSheet(true);
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

  const minYear = data?.minYear ?? year;
  const minMonth = data?.minMonth ?? month;
  const maxYear = data?.maxYear ?? now.getFullYear();
  const maxMonth = data?.maxMonth ?? now.getMonth() + 1;

  const canGoPrev = monthIndex(year, month) > monthIndex(minYear, minMonth);
  const canGoNext = monthIndex(year, month) < monthIndex(maxYear, maxMonth);

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = minYear; y <= maxYear; y++) arr.push(y);
    return arr;
  }, [minYear, maxYear]);

  const monthOptions = useMemo(() => {
    const all = Array.from({ length: 12 }, (_, i) => i + 1);
    return all.filter((m) => {
      if (year === minYear && m < minMonth) return false;
      if (year === maxYear && m > maxMonth) return false;
      return true;
    });
  }, [year, minYear, minMonth, maxYear, maxMonth]);

  const groups: Record<string, Assignment[]> = {};
  if (data) {
    for (const a of data.assignments) {
      if (!groups[a.group]) groups[a.group] = [];
      groups[a.group].push(a);
    }
  }

  const visibleDays = data ? data.days.filter((d) => isDayVisible(d.date)) : [];

  const groupedAssignments = Object.entries(groups).map(([groupName, items]) => ({ groupName, items, id: groupName }));

  const weeks = useMemo(() => {
    const out: Array<{ key: string; label: string; days: DayData[] }> = [];
    let current: DayData[] = [];

    visibleDays.forEach((d, idx) => {
      const date = parseISO(d.date);
      const startsWeek = idx === 0 || date.getDay() === 1; // Monday

      if (startsWeek && current.length > 0) {
        const first = parseISO(current[0].date);
        const last = parseISO(current[current.length - 1].date);
        out.push({
          key: `w-${out.length + 1}-${current[0].date}`,
          label: `Semaine ${out.length + 1} (${format(first, "dd MMM", { locale: fr })} - ${format(last, "dd MMM", { locale: fr })})`,
          days: current,
        });
        current = [];
      }

      current.push(d);
    });

    if (current.length > 0) {
      const first = parseISO(current[0].date);
      const last = parseISO(current[current.length - 1].date);
      out.push({
        key: `w-${out.length + 1}-${current[0].date}`,
        label: `Semaine ${out.length + 1} (${format(first, "dd MMM", { locale: fr })} - ${format(last, "dd MMM", { locale: fr })})`,
        days: current,
      });
    }

    return out;
  }, [visibleDays]);

  const predefinedByDateTask = useMemo(() => {
    const out: Record<string, Record<string, TaskLog>> = {};
    for (const day of visibleDays) {
      out[day.date] = {};
      for (const log of day.predefinedLogs) {
        if (log.taskId) out[day.date][log.taskId] = log;
      }
    }
    return out;
  }, [visibleDays]);

  const todayDay = visibleDays.find((d) => d.date === todayStr);
  const activeTemplate = data?.template ?? "A";
  const employeeTemplateChoice = data?.userTemplate ?? "GLOBAL";

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

  if (!data) return <div className="text-red-500">{error || "Erreur de chargement"}</div>;

  return (
    <div>
      {/* Month selector & stats */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            disabled={!canGoPrev}
            onClick={() => {
              if (!canGoPrev) return;
              const d = new Date(year, month - 2);
              setMonth(d.getMonth() + 1);
              setYear(d.getFullYear());
            }}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="font-semibold text-slate-800 text-lg min-w-36 text-center">{monthLabel}</span>
          <button
            disabled={!canGoNext}
            onClick={() => {
              if (!canGoNext) return;
              const d = new Date(year, month);
              setMonth(d.getMonth() + 1);
              setYear(d.getFullYear());
            }}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>

          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {capitalizeFirst(format(new Date(2026, m - 1, 1), "MMMM", { locale: fr }))}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {isAdmin ? (
            <select
              value={activeTemplate}
              onChange={(e) => saveTemplate(e.target.value as "A" | "B")}
              disabled={savingTemplate}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:opacity-60"
            >
              <option value="A">Template A - Liste journalière</option>
              <option value="B">Template B - Grille mensuelle</option>
            </select>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={employeeTemplateChoice}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "GLOBAL") saveUserTemplate(null);
                  else saveUserTemplate(value as "A" | "B");
                }}
                disabled={savingTemplate}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:opacity-60"
              >
                <option value="GLOBAL">Suivre le template global admin ({data.globalTemplate ?? "A"})</option>
                <option value="A">Mon template: A - Liste journaliere</option>
                <option value="B">Mon template: B - Grille mensuelle</option>
              </select>
              <div className="px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 bg-slate-50">
                Defaut global admin: {data.globalTemplate ?? "A"}
              </div>
            </div>
          )}
        </div>

        {/* Monthly stats */}
          {isAdmin && <div
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium ${scoreColorClass}`}>
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
          </div>}
      </div>

      {refreshing && (
        <div className="mb-3 text-xs text-slate-400">Mise à jour en cours...</div>
      )}

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
      )}

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

          {activeTemplate === "B" ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-auto max-h-[70vh]">
                <table className="min-w-[1100px] w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky top-0 z-30 bg-slate-100 border-b border-r border-slate-200 px-3 py-2 text-left" style={{ left: 0, position: "sticky", minWidth: 220 }}>Groupe</th>
                      <th className="sticky top-0 z-30 bg-slate-100 border-b border-r border-slate-200 px-3 py-2 text-left" style={{ left: 220, position: "sticky", minWidth: 340 }}>Tâche</th>
                      <th className="sticky top-0 z-30 bg-slate-100 border-b border-r border-slate-200 px-3 py-2 text-left" style={{ left: 560, position: "sticky", minWidth: 130 }}>Délai</th>
                      {visibleDays.map((d) => {
                        const isTodayCol = d.date === todayStr;
                        return (
                          <th
                            key={d.date}
                            className={`sticky top-0 z-20 border-b border-r border-slate-200 px-2 py-2 text-center min-w-[88px] ${isTodayCol ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-slate-700"}`}
                          >
                            {format(parseISO(d.date), "d MMM", { locale: fr })}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedAssignments.map(({ id, groupName, items }) => (
                      <React.Fragment key={id}>
                        <tr>
                          <td className="sticky z-10 bg-amber-50 border-r border-b border-slate-200 px-3 py-2 font-semibold text-amber-800" style={{ left: 0, position: "sticky" }} colSpan={3}>
                            {groupName}
                          </td>
                          {visibleDays.map((d) => (
                            <td key={`group-${groupName}-${d.date}`} className="border-b border-r border-slate-200 bg-amber-50/40" />
                          ))}
                        </tr>
                        {items.map((task) => (
                          <tr key={task.taskId} className="hover:bg-slate-50/60">
                            <td className="sticky z-10 bg-white border-r border-b border-slate-200 px-3 py-2 text-slate-600" style={{ left: 0, position: "sticky" }} />
                            <td className="sticky z-10 bg-white border-r border-b border-slate-200 px-3 py-2 text-slate-800" style={{ left: 220, position: "sticky" }}>{task.title}</td>
                            <td className="sticky z-10 bg-white border-r border-b border-slate-200 px-3 py-2 text-slate-500" style={{ left: 560, position: "sticky" }}>{task.deadline ?? "-"}</td>
                            {visibleDays.map((d) => {
                              const log = predefinedByDateTask[d.date]?.[task.taskId];
                              const checked = !!log?.done;
                              const editable = isDayEditable(d.date) && !d.isLeave;
                              const isTodayCol = d.date === todayStr;
                              return (
                                <td
                                  key={`${task.taskId}-${d.date}`}
                                  className={`border-b border-r border-slate-200 text-center px-2 py-2 ${isTodayCol ? "bg-blue-50" : "bg-white"}`}
                                >
                                  {d.isLeave ? (
                                    <span className="text-[11px] text-amber-700">Congé</span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!editable}
                                      onChange={() => toggleTask(d.date, task.taskId, checked)}
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}

                    <tr>
                      <td className="sticky z-10 bg-slate-50 border-r border-b border-slate-200 px-3 py-2 font-semibold text-slate-700" style={{ left: 0, position: "sticky" }}>Extra</td>
                      <td className="sticky z-10 bg-slate-50 border-r border-b border-slate-200 px-3 py-2 text-slate-600" style={{ left: 220, position: "sticky" }}>Historique des tâches extra</td>
                      <td className="sticky z-10 bg-slate-50 border-r border-b border-slate-200 px-3 py-2 text-slate-500" style={{ left: 560, position: "sticky" }}>-</td>
                      {visibleDays.map((d) => {
                        const tooltip = d.extraLogs
                          .map((e) => `${e.done ? "[x]" : "[ ]"} ${e.extraLabel ?? "Sans libellé"}`)
                          .join("\n");
                        const isTodayCol = d.date === todayStr;
                        return (
                          <td key={`extra-col-${d.date}`} className={`border-b border-r border-slate-200 px-2 py-2 text-center ${isTodayCol ? "bg-blue-50" : "bg-white"}`}>
                            {d.extraLogs.length > 0 ? (
                              <button
                                title={tooltip}
                                className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                              >
                                Extra ({d.extraLogs.length})
                              </button>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {!isAdmin && todayDay && (
                <div className="border-t border-slate-200 p-4 space-y-3">
                  <div className="text-sm font-semibold text-slate-800">Tâches extra du jour</div>
                  {todayDay.extraLogs.length > 0 && (
                    <div className="space-y-2">
                      {todayDay.extraLogs.map((extra) => (
                        <div key={extra.logId} className="flex items-center gap-3">
                          <input type="checkbox" checked={extra.done} onChange={() => toggleExtra(extra.logId, extra.done)} />
                          <span className={`text-sm flex-1 ${extra.done ? "line-through text-slate-400" : "text-slate-800"}`}>{extra.extraLabel}</span>
                          <button onClick={() => deleteExtra(extra.logId)} className="text-xs text-red-600 hover:text-red-800">Supprimer</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {isDayEditable(todayStr) && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={extraInput}
                        onChange={(e) => setExtraInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addExtraTask(todayStr)}
                        placeholder="Ajouter une tâche extra pour aujourd'hui..."
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        onClick={() => addExtraTask(todayStr)}
                        disabled={addingExtra || !extraInput.trim()}
                        className="px-3 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        {addingExtra ? "..." : "Ajouter"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
          <div className="space-y-4">
            {weeks.map((week) => {
              const weekCollapsed = !!collapsedWeeks[week.key];
              return (
                <div key={week.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCollapsedWeeks((prev) => ({ ...prev, [week.key]: !prev[week.key] }))}
                    className="w-full px-6 py-3 bg-slate-100 border-b border-slate-200 text-left flex items-center justify-between"
                  >
                    <span className="font-semibold text-slate-800">{week.label}</span>
                    <span className="text-slate-500 text-xs">{weekCollapsed ? "Afficher" : "Masquer"}</span>
                  </button>

                  {!weekCollapsed && (
                    <div className="p-4 space-y-4">
                      {week.days.map((day) => {
                        const dayDate = parseISO(day.date);
                        const isDayToday = isToday(dayDate);
                        const editable = isDayEditable(day.date);
                        const dayLabel = format(dayDate, "EEEE dd MMMM", { locale: fr });
                        const dayCollapsed = !!collapsedDays[day.date];

                        let dayFilteredPredefined = day.predefinedLogs;
                        if (isAdmin && filterDone !== "all") {
                          dayFilteredPredefined = day.predefinedLogs.filter((l) =>
                            filterDone === "done" ? l.done : !l.done
                          );
                        }

                        return (
                          <div
                            key={day.date}
                            className={`bg-white border rounded-xl overflow-hidden ${isDayToday ? "border-blue-300 shadow-sm" : "border-slate-200"}`}
                          >
                            {/* Day header */}
                            <button
                              type="button"
                              onClick={() => setCollapsedDays((prev) => ({ ...prev, [day.date]: !prev[day.date] }))}
                              className={`w-full px-6 py-3 flex items-center justify-between ${isDayToday ? "bg-blue-50" : "bg-slate-50"}`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`text-sm font-semibold capitalize ${isDayToday ? "text-blue-800" : "text-slate-700"}`}>
                                  {dayLabel}
                                </span>
                                {isDayToday && <span className="px-2 py-0.5 bg-blue-700 text-white text-xs font-medium rounded-full">Aujourd&apos;hui</span>}
                                {day.isLeave && <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-medium rounded-full">En congé</span>}
                              </div>
                              <div className="text-xs text-slate-500 flex items-center gap-3">
                                <span>
                                  {day.predefinedLogs.filter((l) => l.done).length + day.extraLogs.filter((l) => l.done).length}
                                  {" / "}
                                  {day.predefinedLogs.length + day.extraLogs.length}
                                  {" faites"}
                                </span>
                                <span>{dayCollapsed ? "Afficher" : "Masquer"}</span>
                              </div>
                            </button>

                            {!dayCollapsed && !day.isLeave && (
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

                    {data.assignments.length === 0 && day.extraLogs.length === 0 && (
                      <div className="px-6 py-4 text-center text-slate-400 text-sm">Aucune tâche assignée</div>
                    )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}

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

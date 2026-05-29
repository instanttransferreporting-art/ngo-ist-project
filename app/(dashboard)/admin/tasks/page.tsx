
"use client";

import { useState, useEffect, useRef } from "react";

const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

interface Task {
  id: string;
  group: string;
  title: string;
  deadline: string | null;
  order: number;
}

interface User {
  id: string;
  name: string;
  role: string;
}

interface Assignment {
  id: string;
  taskId: string;
  task: Task;
  userId: string;
  executors: string;
}

interface MonthlyPlan {
  exists: boolean;
  useCurrentTasks: boolean;
  taskIds: string[];
}

export default function TasksPage() {
  const now = new Date();

  // Next 12 future months available for planning
  const futureMonths = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear(), label: `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}` };
  });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // ── Assign tab state ────────────────────────────────────────────────────
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  // ── Planning tab state ──────────────────────────────────────────────────
  const [planUserId, setPlanUserId] = useState("");
  const [planMonth, setPlanMonth] = useState(futureMonths[0].month);
  const [planYear, setPlanYear] = useState(futureMonths[0].year);
  const [planAssignments, setPlanAssignments] = useState<Assignment[]>([]);
  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planSuccess, setPlanSuccess] = useState("");

  // ── UI state ─────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"library" | "assign" | "planning" | "import">("library");
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState({ group: "", title: "", deadline: "", order: "0" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUserId, setImportUserId] = useState("");
  const [importAssign, setImportAssign] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Plan import state ───────────────────────────────────────────────────
  const [planImportFile, setPlanImportFile] = useState<File | null>(null);
  const [planImporting, setPlanImporting] = useState(false);
  const [planImportError, setPlanImportError] = useState("");
  const [planImportSuccess, setPlanImportSuccess] = useState("");
  const [showPlanImport, setShowPlanImport] = useState(false);
  const [showRecentTasks, setShowRecentTasks] = useState(true);
  const planFileRef = useRef<HTMLInputElement>(null);

  // ── Search state ──────────────────────────────────────────────
  const [searchLib, setSearchLib] = useState("");
  const [searchAssign, setSearchAssign] = useState("");
  const [searchPlan, setSearchPlan] = useState("");

  const planMonthLabel =
    futureMonths.find((m) => m.month === planMonth && m.year === planYear)?.label ??
    `${MONTHS_FR[planMonth - 1]} ${planYear}`;

  // ── Refetch triggers (incremented from event handlers to re-run effects) ─

  const [tasksFetchKey, setTasksFetchKey] = useState(0);
  const [assignFetchKey, setAssignFetchKey] = useState(0);
  const [planFetchKey, setPlanFetchKey] = useState(0);

  // Load tasks & users on mount or on manual refresh
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tr, ur] = await Promise.all([fetch("/api/tasks"), fetch("/api/users")]);
      if (tr.ok && !cancelled) setTasks(await tr.json());
      if (ur.ok && !cancelled) {
        const all: User[] = await ur.json();
        setUsers(all.filter((u: User) => u.role === "EMPLOYEE"));
      }
    })();
    return () => { cancelled = true; };
  }, [tasksFetchKey]);

  // Load assignments when selected user changes or after a mutation
  useEffect(() => {
    if (!selectedUserId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/assignments?userId=${selectedUserId}`);
      if (res.ok && !cancelled) setAssignments(await res.json());
    })();
    return () => { cancelled = true; };
  }, [selectedUserId, assignFetchKey]);

  // Load plan + plan assignments when user/month/year changes or after a mutation
  useEffect(() => {
    if (!planUserId) return;
    let cancelled = false;
    (async () => {
      setLoadingPlan(true);
      const [ar, pr] = await Promise.all([
        fetch(`/api/assignments?userId=${planUserId}`),
        fetch(`/api/monthly-plan?userId=${planUserId}&month=${planMonth}&year=${planYear}`),
      ]);
      if (ar.ok && !cancelled) setPlanAssignments(await ar.json());
      if (!cancelled) {
        if (pr.ok) setPlan(await pr.json());
        else setPlan({ exists: false, useCurrentTasks: true, taskIds: [] });
        setLoadingPlan(false);
      }
    })();
    return () => { cancelled = true; };
  }, [planUserId, planMonth, planYear, planFetchKey]);

  // ── Group helpers ─────────────────────────────────────────────────────────

  const groups: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  }

  const isAssigned = (taskId: string) => assignments.some((a) => a.taskId === taskId);

  function groupAssignState(groupTasks: Task[]): "all" | "some" | "none" {
    const n = groupTasks.filter((t) => isAssigned(t.id)).length;
    if (n === groupTasks.length) return "all";
    if (n > 0) return "some";
    return "none";
  }

  async function toggleGroupAssign(groupTasks: Task[]) {
    if (!selectedUserId) return;
    const state = groupAssignState(groupTasks);
    if (state === "all") {
      for (const task of groupTasks) {
        await fetch("/api/assignments", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: selectedUserId, taskId: task.id }),
        });
      }
    } else {
      await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, taskIds: groupTasks.map((t) => t.id) }),
      });
    }
    setAssignFetchKey((k) => k + 1);
  }

  function planGroupState(groupTasks: Task[]): "all" | "some" | "none" {
    if (!plan || plan.useCurrentTasks) return "none";
    const n = groupTasks.filter((t) => plan.taskIds.includes(t.id)).length;
    if (n === groupTasks.length) return "all";
    if (n > 0) return "some";
    return "none";
  }

  function toggleGroupPlan(groupTasks: Task[]) {
    if (!plan) return;
    const state = planGroupState(groupTasks);
    const groupIds = groupTasks.map((t) => t.id);
    const newIds =
      state === "all"
        ? plan.taskIds.filter((id) => !groupIds.includes(id))
        : [...new Set([...plan.taskIds, ...groupIds])];
    setPlan((prev) => (prev ? { ...prev, taskIds: newIds } : prev));
    savePlanState(false, newIds);
  }

  // ── Plan import ──────────────────────────────────────────────────────────

  async function handlePlanImport(e: React.FormEvent) {
    e.preventDefault();
    if (!planImportFile || !planUserId) return;
    setPlanImporting(true);
    setPlanImportError("");
    setPlanImportSuccess("");
    const fd = new FormData();
    fd.append("file", planImportFile);
    fd.append("userId", planUserId);
    fd.append("month", String(planMonth));
    fd.append("year", String(planYear));
    try {
      const res = await fetch("/api/import/plan", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Erreur serveur (${res.status})`);
      setPlanImportSuccess(`${data.matched} tâche(s) correspondante(s) planifiées sur ${data.total} ligne(s) du fichier.`);
      setPlanImportFile(null);
      if (planFileRef.current) planFileRef.current.value = "";
      // Refresh plan state
      setPlanFetchKey((k) => k + 1);
    } catch (err: unknown) {
      setPlanImportError(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setPlanImporting(false);
    }
  }

  // ── Plan persistence ──────────────────────────────────────────────────────

  async function savePlanState(useCurrentTasks: boolean, taskIds: string[]) {
    if (!planUserId) return;
    setSavingPlan(true);
    setPlanError("");
    setPlanSuccess("");
    const res = await fetch("/api/monthly-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: planUserId, month: planMonth, year: planYear, useCurrentTasks, taskIds }),
    });
    if (res.ok) {
      setPlan({ exists: true, useCurrentTasks, taskIds: useCurrentTasks ? [] : taskIds });
      setPlanSuccess("Plan enregistré");
      setTimeout(() => setPlanSuccess(""), 2000);
    } else {
      const body = await res.json().catch(() => ({}));
      setPlanError(body.error ?? "Erreur lors de l'enregistrement du plan");
    }
    setSavingPlan(false);
  }

  async function resetPlan() {
    if (!planUserId) return;
    if (!confirm(`Réinitialiser le plan pour ${planMonthLabel} ?`)) return;
    setSavingPlan(true);
    setPlanError("");
    const res = await fetch(
      `/api/monthly-plan?userId=${planUserId}&month=${planMonth}&year=${planYear}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setPlan({ exists: false, useCurrentTasks: true, taskIds: [] });
      setPlanSuccess("Plan réinitialisé");
      setTimeout(() => setPlanSuccess(""), 2000);
    } else {
      const body = await res.json().catch(() => ({}));
      setPlanError(body.error ?? "Erreur lors de la réinitialisation");
    }
    setSavingPlan(false);
  }

  function handleToggleUseCurrentTasks(checked: boolean) {
    const newTaskIds = checked ? [] : planAssignments.map((a) => a.taskId);
    setPlan((prev) => ({ ...(prev ?? { exists: true }), useCurrentTasks: checked, taskIds: newTaskIds }));
    savePlanState(checked, newTaskIds);
  }

  function handleTogglePlanTask(taskId: string) {
    if (!plan) return;
    const newIds = plan.taskIds.includes(taskId)
      ? plan.taskIds.filter((id) => id !== taskId)
      : [...plan.taskIds, taskId];
    setPlan((prev) => (prev ? { ...prev, taskIds: newIds } : prev));
    savePlanState(false, newIds);
  }

  async function assignAllPlan() {
    const allIds = tasks.map((t) => t.id);
    setPlan((prev) => (prev ? { ...prev, useCurrentTasks: false, taskIds: allIds } : prev));
    await savePlanState(false, allIds);
  }

  async function unassignAllPlan() {
    setPlan((prev) => (prev ? { ...prev, useCurrentTasks: false, taskIds: [] } : prev));
    await savePlanState(false, []);
  }

  // ── Task CRUD ─────────────────────────────────────────────────────────────

  function openCreate() {
    setEditTask(null);
    setForm({ group: "", title: "", deadline: "", order: "0" });
    setShowForm(true);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setForm({ group: task.group, title: task.title, deadline: task.deadline ?? "", order: String(task.order) });
    setShowForm(true);
  }

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = { group: form.group, title: form.title, deadline: form.deadline || undefined, order: parseInt(form.order) };
    const res = editTask
      ? await fetch(`/api/tasks/${editTask.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Erreur"); setSaving(false); return; }
    setShowForm(false);
    setTasksFetchKey((k) => k + 1);
    setSaving(false);
  }

  async function deleteTask(id: string) {
    if (!confirm("Supprimer cette tâche ?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasksFetchKey((k) => k + 1);
  }

  async function toggleAssign(taskId: string) {
    if (!selectedUserId) return;
    if (isAssigned(taskId)) {
      await fetch("/api/assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, taskId }),
      });
    } else {
      await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, taskIds: [taskId] }),
      });
    }
    setAssignFetchKey((k) => k + 1);
  }

  async function assignAll() {
    if (!selectedUserId) return;
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, taskIds: tasks.map((t) => t.id) }),
    });
    setAssignFetchKey((k) => k + 1);
  }

  async function unassignAll() {
    if (!selectedUserId) return;
    if (!confirm("Désassigner toutes les tâches de cet employé ?")) return;
    await fetch("/api/assignments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId }),
    });
    setAssignFetchKey((k) => k + 1);
  }

  async function toggleExecutor(taskId: string, userName: string) {
    if (!selectedUserId) return;
    const assignment = assignments.find((a) => a.taskId === taskId);
    if (!assignment) return;
    const names = assignment.executors.split("/").map((n) => n.trim()).filter(Boolean);
    const newNames = names.includes(userName)
      ? names.filter((n) => n !== userName)
      : [...names, userName];
    const newExecutors = newNames.join(" / ");
    setAssignments((prev) =>
      prev.map((a) => (a.taskId === taskId ? { ...a, executors: newExecutors } : a))
    );
    await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, taskId, executors: newExecutors }),
    });
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setError("");
    setSuccess("");
    const fd = new FormData();
    fd.append("file", importFile);
    if (importUserId) fd.append("userId", importUserId);
    if (importAssign) fd.append("assign", "true");
    try {
      const res = await fetch("/api/import/tasks", { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text();
        try {
          const j = JSON.parse(text);
          throw new Error(j.error || `Erreur serveur (${res.status})`);
        } catch {
          throw new Error(`Le serveur a répondu avec une erreur ${res.status}.`);
        }
      }
      const data = await res.json();
      setSuccess(`${data.imported} tâche(s) importée(s)${data.assigned ? `, ${data.assigned} assignée(s)` : ""}`);
      setTasksFetchKey((k) => k + 1);
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur réseau ou serveur est survenue.");
    } finally {
      setImporting(false);
    }
  }

  // ── Computed filtered/sorted data for tabs ────────────────────────────────

  const libQ = searchLib.toLowerCase();
  const libGroups: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (libQ && !t.title.toLowerCase().includes(libQ) && !t.group.toLowerCase().includes(libQ)) continue;
    if (!libGroups[t.group]) libGroups[t.group] = [];
    libGroups[t.group].push(t);
  }

  const assignQ = searchAssign.toLowerCase();
  const assignedTaskGroups: Record<string, Task[]> = {};
  const unassignedTaskGroups: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (assignQ && !t.title.toLowerCase().includes(assignQ) && !t.group.toLowerCase().includes(assignQ)) continue;
    if (isAssigned(t.id)) {
      if (!assignedTaskGroups[t.group]) assignedTaskGroups[t.group] = [];
      assignedTaskGroups[t.group].push(t);
    } else {
      if (!unassignedTaskGroups[t.group]) unassignedTaskGroups[t.group] = [];
      unassignedTaskGroups[t.group].push(t);
    }
  }

  const planQ = searchPlan.toLowerCase();
  const planAssignedIds = new Set(planAssignments.map((a) => a.taskId));
  const planAssignedTaskGroups: Record<string, Task[]> = {};
  const planOtherTaskGroups: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (planQ && !t.title.toLowerCase().includes(planQ) && !t.group.toLowerCase().includes(planQ)) continue;
    if (planAssignedIds.has(t.id)) {
      if (!planAssignedTaskGroups[t.group]) planAssignedTaskGroups[t.group] = [];
      planAssignedTaskGroups[t.group].push(t);
    } else {
      if (!planOtherTaskGroups[t.group]) planOtherTaskGroups[t.group] = [];
      planOtherTaskGroups[t.group].push(t);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bibliothèque de tâches</h1>
          <p className="text-slate-500 mt-1">{tasks.length} tâche(s) dans la bibliothèque</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle tâche
        </button>
      </div>

      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>}

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        {(["library", "assign", "planning", "import"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "library" ? "Bibliothèque" : t === "assign" ? "Assigner" : t === "planning" ? "Planification" : "Importer"}
          </button>
        ))}
      </div>

      {/* ── Modal task form ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{editTask ? "Modifier la tâche" : "Nouvelle tâche"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={saveTask} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Groupe</label>
                <input
                  type="text" required value={form.group}
                  onChange={(e) => setForm({ ...form, group: e.target.value })}
                  placeholder="Ex: Administration, Communication..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Intitulé de la tâche</label>
                <input
                  type="text" required value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Délai <span className="text-slate-400 font-normal">(optionnel)</span></label>
                <input
                  type="text" value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  placeholder="Ex: 24h, Immédiat, Fin de journée..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Ordre d&apos;affichage</label>
                <input
                  type="number" value={form.order} min="0"
                  onChange={(e) => setForm({ ...form, order: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════ LIBRARY TAB ══════════════════════ */}
      {tab === "library" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-100">
            <input
              type="search"
              value={searchLib}
              onChange={(e) => setSearchLib(e.target.value)}
              placeholder="Rechercher une tâche ou un groupe..."
              className="w-full max-w-sm px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          {Object.entries(libGroups).map(([groupName, groupTasks]) => (
            <div key={groupName} className="border-b border-slate-100 last:border-0">
              <div className="px-6 py-2 bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center justify-between">
                <span>{groupName}</span>
                <span className="font-normal text-slate-400">{groupTasks.length} tâche(s)</span>
              </div>
              {groupTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 border-b border-slate-50">
                  <div className="flex-1">
                    <div className="text-sm text-slate-800">{task.title}</div>
                    {task.deadline && <div className="text-xs text-slate-400 mt-0.5">Délai: {task.deadline}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(task)} className="text-xs text-slate-500 hover:text-slate-700">Modifier</button>
                    <button onClick={() => deleteTask(task.id)} className="text-xs text-red-500 hover:text-red-700">Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {tasks.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-400">Aucune tâche. Créez-en une ou importez depuis Excel.</div>
          ) : Object.keys(libGroups).length === 0 && (
            <div className="px-6 py-10 text-center text-slate-400">Aucun résultat pour « {searchLib} »</div>
          )}
        </div>
      )}

      {/* ══════════════════════ ASSIGN TAB ══════════════════════ */}
      {tab === "assign" && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
            >
              <option value="">-- Sélectionner un employé --</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {selectedUserId && (
              <>
                <button onClick={assignAll}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
                  Tout assigner
                </button>
                <button onClick={unassignAll}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors">
                  Désassigner tout
                </button>
              </>
            )}
          </div>

          {selectedUserId ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600 shrink-0">{assignments.length} tâche(s) assignée(s)</span>
                <input
                  type="search"
                  value={searchAssign}
                  onChange={(e) => setSearchAssign(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full max-w-xs px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* ── Section 1 : tâches assignées ── */}
              {Object.keys(assignedTaskGroups).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-6 py-2 bg-blue-50 border-b border-blue-100 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Tâches assignées à {users.find((u) => u.id === selectedUserId)?.name}
                  </div>
                  {Object.entries(assignedTaskGroups).map(([groupName, groupTasks]) => {
                    const gState = groupAssignState(groups[groupName] ?? groupTasks);
                    return (
                      <div key={groupName} className="border-b border-slate-100 last:border-0">
                        <label className="flex items-center gap-3 px-6 py-2 bg-blue-50/50 cursor-pointer hover:bg-blue-100/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={gState === "all"}
                            ref={(el) => { if (el) el.indeterminate = gState === "some"; }}
                            onChange={() => toggleGroupAssign(groups[groupName] ?? groupTasks)}
                            className="w-4 h-4 accent-blue-700"
                          />
                          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{groupName}</span>
                          <span className="text-xs text-slate-400 ml-auto">{groupTasks.length} tâche(s)</span>
                        </label>
                        {groupTasks.map((task) => {
                          const executorNames = (assignments.find((a) => a.taskId === task.id)?.executors ?? "")
                            .split("/").map((n) => n.trim()).filter(Boolean);
                          return (
                            <div key={task.id}>
                              <label className="flex items-center gap-3 px-6 py-3 pl-14 hover:bg-slate-50 cursor-pointer border-t border-slate-50">
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() => toggleAssign(task.id)}
                                  className="accent-blue-700"
                                />
                                <span className="text-sm text-slate-800">{task.title}</span>
                                {task.deadline && <span className="text-xs text-slate-400 ml-auto">{task.deadline}</span>}
                              </label>
                              <div className="flex items-start gap-2 px-6 pb-2.5 pl-14 bg-blue-50/60">
                                <span className="text-xs text-slate-500 whitespace-nowrap shrink-0 mt-1">Exécutants :</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {users.map((u) => {
                                    const checked = executorNames.includes(u.name);
                                    return (
                                      <label
                                        key={u.id}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs cursor-pointer transition-colors select-none ${
                                          checked
                                            ? "bg-blue-100 border-blue-400 text-blue-800 font-medium"
                                            : "bg-white border-slate-200 text-slate-500 hover:border-blue-300"
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleExecutor(task.id, u.name)}
                                          className="sr-only"
                                        />
                                        {checked && (
                                          <svg className="w-3 h-3 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                        <span>{u.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Section 2 : bibliothèque — non assignées ── */}
              {Object.keys(unassignedTaskGroups).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-6 py-2 bg-slate-50 border-y border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Bibliothèque — non assignées
                  </div>
                  {Object.entries(unassignedTaskGroups).map(([groupName, groupTasks]) => {
                    const gState = groupAssignState(groups[groupName] ?? groupTasks);
                    return (
                      <div key={groupName} className="border-b border-slate-100 last:border-0">
                        <label className="flex items-center gap-3 px-6 py-2 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={gState === "all"}
                            ref={(el) => { if (el) el.indeterminate = gState === "some"; }}
                            onChange={() => toggleGroupAssign(groups[groupName] ?? groupTasks)}
                            className="w-4 h-4 accent-blue-700"
                          />
                          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{groupName}</span>
                          <span className="text-xs text-slate-400 ml-auto">{groupTasks.length} tâche(s)</span>
                        </label>
                        {groupTasks.map((task) => (
                          <label key={task.id} className="flex items-center gap-3 px-6 py-3 pl-14 hover:bg-slate-50 cursor-pointer border-t border-slate-50">
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => toggleAssign(task.id)}
                              className="accent-blue-700"
                            />
                            <span className="text-sm text-slate-800">{task.title}</span>
                            {task.deadline && <span className="text-xs text-slate-400 ml-auto">{task.deadline}</span>}
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {tasks.length === 0 && (
                <div className="px-6 py-8 text-center text-slate-400">Aucune tâche dans la bibliothèque</div>
              )}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400">Sélectionnez un employé pour gérer ses assignations</div>
          )}
        </div>
      )}

      {/* ══════════════════════ PLANNING TAB ══════════════════════ */}
      {tab === "planning" && (
        <div>
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <select
              value={planUserId}
              onChange={(e) => setPlanUserId(e.target.value)}
              className="px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
            >
              <option value="">-- Sélectionner un employé --</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select
              value={`${planYear}-${planMonth}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setPlanYear(y);
                setPlanMonth(m);
              }}
              className="px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
            >
              {futureMonths.map((m) => (
                <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* ── Import section ── */}
          {planUserId && (
            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPlanImport((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Importer depuis Excel / CSV
                </span>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${showPlanImport ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showPlanImport && (
                <div className="px-5 py-4">
                  <p className="text-xs text-slate-500 mb-3">
                    Le fichier doit contenir une colonne <code className="bg-slate-100 px-1 rounded">titre</code> avec les intitulés exacts des tâches de la bibliothèque.
                    Les tâches correspondantes remplaceront la sélection actuelle pour {planMonthLabel}.
                  </p>
                  {planImportError && (
                    <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{planImportError}</div>
                  )}
                  {planImportSuccess && (
                    <div className="mb-3 bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-2 rounded-lg">{planImportSuccess}</div>
                  )}
                  <form onSubmit={handlePlanImport} className="flex items-center gap-3">
                    <input
                      ref={planFileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      required
                      onChange={(e) => setPlanImportFile(e.target.files?.[0] ?? null)}
                      className="flex-1 text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-medium hover:file:bg-blue-100 cursor-pointer"
                    />
                    <button
                      type="submit"
                      disabled={planImporting || !planImportFile}
                      className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      {planImporting ? "Import..." : "Importer"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {planUserId ? (
            <div className="mt-4 border border-blue-200 rounded-xl overflow-hidden">
              <div className="px-6 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
                <div
                  role="button"
                //   type="button"
                  onClick={() => setShowRecentTasks((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
                >
                    <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h3 className="font-semibold text-slate-800 text-sm">
                        Plan de {users.find((u) => u.id === planUserId)?.name} — {planMonthLabel}
                    </h3>
                    </div>
                    <button
                    onClick={resetPlan}
                    disabled={savingPlan || !plan?.exists}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 rounded-lg transition-colors disabled:opacity-40"
                    >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Réinitialiser
                    </button>
                </div>
              </div>

              {showRecentTasks &&
              <div className="px-6 py-4">
                {planError && (
                  <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{planError}</div>
                )}
                {planSuccess && (
                  <div className="mb-3 bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-2 rounded-lg">{planSuccess}</div>
                )}

                {loadingPlan ? (
                  <div className="text-sm text-slate-400 py-4">Chargement du plan...</div>
                ) : (
                  <>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={plan?.useCurrentTasks ?? true}
                        onChange={(e) => handleToggleUseCurrentTasks(e.target.checked)}
                        disabled={savingPlan}
                        className="mt-0.5 accent-blue-700"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-800 group-hover:text-blue-700">
                          Reconduire les tâches en cours
                        </span>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Si coché, les tâches actuellement assignées seront automatiquement reconduites pour {planMonthLabel}.
                        </p>
                      </div>
                    </label>

                    {plan && !plan.useCurrentTasks && (
                      <div className="mt-5">
                        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                          <span className="text-xs text-slate-500 shrink-0">{plan.taskIds.length} tâche(s) planifiée(s)</span>
                          <input
                            type="search"
                            value={searchPlan}
                            onChange={(e) => setSearchPlan(e.target.value)}
                            placeholder="Rechercher..."
                            className="flex-1 min-w-0 max-w-xs px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                          <div className="flex gap-2 shrink-0">
                            <button onClick={assignAllPlan} disabled={savingPlan}
                              className="px-2.5 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium disabled:opacity-50">
                              Tout sélectionner
                            </button>
                            <button onClick={unassignAllPlan} disabled={savingPlan}
                              className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium disabled:opacity-50">
                              Tout décocher
                            </button>
                          </div>
                        </div>

                        {/* Section 1: tasks currently assigned to this employee */}
                        {Object.keys(planAssignedTaskGroups).length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 px-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              Tâches assignées à {users.find((u) => u.id === planUserId)?.name}
                            </div>
                            {Object.entries(planAssignedTaskGroups).map(([groupName, groupTasks]) => {
                              const gState = planGroupState(groupTasks);
                              return (
                                <div key={groupName} className="border border-blue-200 rounded-lg overflow-hidden mb-2">
                                  <label className="flex items-center gap-3 px-4 py-2 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={gState === "all"}
                                      ref={(el) => { if (el) el.indeterminate = gState === "some"; }}
                                      onChange={() => toggleGroupPlan(groupTasks)}
                                      disabled={savingPlan}
                                      className="w-4 h-4 accent-blue-700"
                                    />
                                    <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{groupName}</span>
                                    <span className="text-xs text-slate-400 ml-auto">{groupTasks.length} tâche(s)</span>
                                  </label>
                                  {groupTasks.map((task) => (
                                    <label key={task.id} className="flex items-center gap-3 px-4 py-2.5 pl-11 hover:bg-blue-50 cursor-pointer border-t border-blue-100">
                                      <input
                                        type="checkbox"
                                        checked={plan.taskIds.includes(task.id)}
                                        onChange={() => handleTogglePlanTask(task.id)}
                                        disabled={savingPlan}
                                        className="accent-blue-700"
                                      />
                                      <span className="text-sm text-slate-800">{task.title}</span>
                                      {task.deadline && <span className="text-xs text-slate-400 ml-auto">{task.deadline}</span>}
                                    </label>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Section 2: other tasks from library */}
                        {Object.keys(planOtherTaskGroups).length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">
                              Autres tâches de la bibliothèque
                            </div>
                            {Object.entries(planOtherTaskGroups).map(([groupName, groupTasks]) => {
                              const gState = planGroupState(groupTasks);
                              return (
                                <div key={groupName} className="border border-slate-200 rounded-lg overflow-hidden mb-2">
                                  <label className="flex items-center gap-3 px-4 py-2 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={gState === "all"}
                                      ref={(el) => { if (el) el.indeterminate = gState === "some"; }}
                                      onChange={() => toggleGroupPlan(groupTasks)}
                                      disabled={savingPlan}
                                      className="w-4 h-4 accent-blue-700"
                                    />
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{groupName}</span>
                                    <span className="text-xs text-slate-400 ml-auto">{groupTasks.length} tâche(s)</span>
                                  </label>
                                  {groupTasks.map((task) => (
                                    <label key={task.id} className="flex items-center gap-3 px-4 py-2.5 pl-11 hover:bg-blue-50 cursor-pointer border-t border-slate-100">
                                      <input
                                        type="checkbox"
                                        checked={plan.taskIds.includes(task.id)}
                                        onChange={() => handleTogglePlanTask(task.id)}
                                        disabled={savingPlan}
                                        className="accent-blue-700"
                                      />
                                      <span className="text-sm text-slate-800">{task.title}</span>
                                      {task.deadline && <span className="text-xs text-slate-400 ml-auto">{task.deadline}</span>}
                                    </label>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {tasks.length === 0 && (
                          <div className="text-center py-6 text-slate-400 text-sm">Aucune tâche dans la bibliothèque</div>
                        )}
                      </div>
                    )}

                    {(plan?.useCurrentTasks ?? true) && (
                      <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-600">
                        Les {planAssignments.length} tâche(s) actuellement assignées seront reconduites automatiquement pour {planMonthLabel}.
                      </div>
                    )}
                  </>
                )}
              </div>
              }
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400">Sélectionnez un employé pour planifier ses tâches</div>
          )}

        </div>
      )}

      {/* ══════════════════════ IMPORT TAB ══════════════════════ */}
      {tab === "import" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg">
          <h2 className="font-semibold text-slate-800 mb-1">Importer des tâches depuis Excel ou CSV</h2>
          <p className="text-sm text-slate-500 mb-4">
            Le fichier doit contenir les colonnes :{" "}
            <code className="bg-slate-100 px-1 rounded">groupe</code>,{" "}
            <code className="bg-slate-100 px-1 rounded">titre</code>, et optionnellement{" "}
            <code className="bg-slate-100 px-1 rounded">delai</code>,{" "}
            <code className="bg-slate-100 px-1 rounded">ordre</code>,{" "}
            <code className="bg-slate-100 px-1 rounded">executants</code>.
          </p>

          {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
          {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>}

          <form onSubmit={handleImport} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fichier Excel / CSV</label>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xls,.csv" required
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100 cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Assigner à un employé <span className="text-slate-400 font-normal">(optionnel)</span>
              </label>
              <select
                value={importUserId}
                onChange={(e) => setImportUserId(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
              >
                <option value="">-- Ne pas assigner --</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            {importUserId && (
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={importAssign} onChange={(e) => setImportAssign(e.target.checked)} />
                Assigner automatiquement toutes les tâches importées à cet employé
              </label>
            )}
            <button
              type="submit" disabled={importing || !importFile}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition-colors"
            >
              {importing ? "Importation..." : "Importer"}
            </button>
          </form>

          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
            <strong>Format attendu :</strong><br />
            Ligne 1 : en-têtes (groupe, titre, delai, ordre, executants)<br />
            Lignes suivantes : données des tâches
          </div>
        </div>
      )}
    </div>
  );
}

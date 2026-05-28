"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  taskId: string;
  task: Task;
  userId: string;
}

interface MonthlyPlan {
  exists: boolean;
  useCurrentTasks: boolean;
  taskIds: string[];
}

export default function TasksPage() {
  const now = new Date();

  // Next month reference (computed once per render — stable during a session)
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const planMonth = nextMonthDate.getMonth() + 1;
  const planYear = nextMonthDate.getFullYear();
  const nextMonthLabel = `${MONTHS_FR[nextMonthDate.getMonth()]} ${nextMonthDate.getFullYear()}`;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [tab, setTab] = useState<"library" | "assign" | "import">("library");
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

  // Planning state for next month
  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planSuccess, setPlanSuccess] = useState("");

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    if (res.ok) setTasks(await res.json());
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) {
      const all: User[] = await res.json();
      setUsers(all.filter((u) => u.role === "EMPLOYEE"));
    }
  }, []);

  const fetchAssignments = useCallback(async (userId: string) => {
    if (!userId) return;
    const res = await fetch(`/api/assignments?userId=${userId}`);
    if (res.ok) setAssignments(await res.json());
  }, []);

  const fetchPlan = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoadingPlan(true);
    const res = await fetch(`/api/monthly-plan?userId=${userId}&month=${planMonth}&year=${planYear}`);
    if (res.ok) setPlan(await res.json());
    else setPlan({ exists: false, useCurrentTasks: true, taskIds: [] });
    setLoadingPlan(false);
  }, [planMonth, planYear]);

  useEffect(() => { fetchTasks(); fetchUsers(); }, [fetchTasks, fetchUsers]);
  useEffect(() => {
    if (selectedUserId) {
      fetchAssignments(selectedUserId);
      fetchPlan(selectedUserId);
    } else {
      setPlan(null);
    }
  }, [selectedUserId, fetchAssignments, fetchPlan]);

  async function savePlanState(useCurrentTasks: boolean, taskIds: string[]) {
    if (!selectedUserId) return;
    setSavingPlan(true);
    setPlanError("");
    setPlanSuccess("");
    const res = await fetch("/api/monthly-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, month: planMonth, year: planYear, useCurrentTasks, taskIds }),
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
    if (!selectedUserId) return;
    if (!confirm(`Réinitialiser le plan pour ${nextMonthLabel} ?`)) return;
    setSavingPlan(true);
    setPlanError("");
    const res = await fetch(`/api/monthly-plan?userId=${selectedUserId}&month=${planMonth}&year=${planYear}`, { method: "DELETE" });
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
    const newTaskIds = checked ? [] : assignments.map((a) => a.taskId);
    setPlan((prev) => ({ ...(prev ?? { exists: true }), useCurrentTasks: checked, taskIds: newTaskIds }));
    savePlanState(checked, newTaskIds);
  }

  function handleTogglePlanTask(taskId: string) {
    if (!plan) return;
    const currentIds = plan.taskIds;
    const newIds = currentIds.includes(taskId)
      ? currentIds.filter((id) => id !== taskId)
      : [...currentIds, taskId];
    setPlan((prev) => prev ? { ...prev, taskIds: newIds } : prev);
    savePlanState(false, newIds);
  }

  async function assignAllPlan() {
    const allIds = tasks.map((t) => t.id);
    setPlan((prev) => prev ? { ...prev, useCurrentTasks: false, taskIds: allIds } : prev);
    await savePlanState(false, allIds);
  }

  async function unassignAllPlan() {
    setPlan((prev) => prev ? { ...prev, useCurrentTasks: false, taskIds: [] } : prev);
    await savePlanState(false, []);
  }

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

    let res: Response;
    if (editTask) {
      res = await fetch(`/api/tasks/${editTask.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }

    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Erreur"); setSaving(false); return; }

    setShowForm(false);
    fetchTasks();
    setSaving(false);
  }

  async function deleteTask(id: string) {
    if (!confirm("Supprimer cette tâche ?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    fetchTasks();
  }

  const isAssigned = (taskId: string) => assignments.some((a) => a.taskId === taskId);

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
    fetchAssignments(selectedUserId);
  }

  async function assignAll() {
    if (!selectedUserId) return;
    const allIds = tasks.map((t) => t.id);
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, taskIds: allIds }),
    });
    fetchAssignments(selectedUserId);
  }

  async function unassignAll() {
    if (!selectedUserId) return;
    if (!confirm("Désassigner toutes les tâches de cet employé ?")) return;
    await fetch("/api/assignments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId }),
    });
    fetchAssignments(selectedUserId);
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
      const res = await fetch("/api/import/tasks", { 
        method: "POST", 
        body: fd 
      });

      // 1. Vérification si la réponse est correcte (status 200-299)
      if (!res.ok) {
        // Si ce n'est pas OK, on récupère le texte brut pour diagnostiquer
        const errorText = await res.text();
        console.error("Détails de l'erreur serveur :", errorText);
        
        // On essaie de voir si le serveur a envoyé un message d'erreur en JSON quand même
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || `Erreur serveur (${res.status})`);
        } catch {
          throw new Error(`Le serveur a répondu avec une erreur ${res.status}.`);
        }
      }

      // 2. Lecture sécurisée du JSON
      const data = await res.json();

      // 3. Mise à jour de l'interface en cas de succès
      setSuccess(
        `${data.imported} tâche(s) importée(s)${
          data.assigned ? `, ${data.assigned} assignée(s)` : ""
        }`
      );
      fetchTasks();
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      
    } catch (err: any) {
      console.error("Erreur lors de l'importation :", err);
      setError(err.message || "Une erreur réseau ou serveur est survenue.");
    } finally {
    setImporting(false);
    }
  }

  const groups: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bibliothèque de tâches</h1>
          <p className="text-slate-500 mt-1">{tasks.length} tâche(s) dans la bibliothèque</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg text-sm transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nouvelle tâche
        </button>
      </div>

      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        {(["library", "assign", "import"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t === "library" ? "Bibliothèque" : t === "assign" ? "Assigner aux employés" : "Importer (Excel/CSV)"}
          </button>
        ))}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{editTask ? "Modifier la tâche" : "Nouvelle tâche"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveTask} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Groupe</label>
                <input type="text" required value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}
                  placeholder="Ex: Administration, Communication..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Intitulé de la tâche</label>
                <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Délai <span className="text-slate-400 font-normal">(optionnel)</span></label>
                <input type="text" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  placeholder="Ex: 24h, Immédiat, Fin de journée..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Ordre d&apos;affichage</label>
                <input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} min="0"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Annuler</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Library tab */}
      {tab === "library" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {Object.entries(groups).map(([groupName, groupTasks]) => (
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
          {tasks.length === 0 && <div className="px-6 py-10 text-center text-slate-400">Aucune tâche. Créez-en une ou importez depuis Excel.</div>}
        </div>
      )}

      {/* Assign tab */}
      {tab === "assign" && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}
              className="px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
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

          {selectedUserId && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
              <div className="px-6 py-3 border-b border-slate-100 text-sm text-slate-600">
                {assignments.length} tâche(s) assignée(s) — mois en cours
              </div>
              {Object.entries(groups).map(([groupName, groupTasks]) => (
                <div key={groupName} className="border-b border-slate-100 last:border-0">
                  <div className="px-6 py-2 bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">{groupName}</div>
                  {groupTasks.map((task) => (
                    <label key={task.id} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={isAssigned(task.id)} onChange={() => toggleAssign(task.id)} />
                      <span className="text-sm text-slate-800">{task.title}</span>
                      {task.deadline && <span className="text-xs text-slate-400 ml-auto">{task.deadline}</span>}
                    </label>
                  ))}
                </div>
              ))}
              {tasks.length === 0 && <div className="px-6 py-8 text-center text-slate-400">Aucune tâche dans la bibliothèque</div>}
            </div>
          )}

          {/* ── Future month planning ── */}
          {selectedUserId && (
            <div className="border border-blue-200 rounded-xl overflow-hidden">
              <div className="px-6 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h3 className="font-semibold text-slate-800 text-sm">Planifier pour {nextMonthLabel}</h3>
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

              <div className="px-6 py-4">
                {planError && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{planError}</div>}
                {planSuccess && <div className="mb-3 bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-2 rounded-lg">{planSuccess}</div>}

                {loadingPlan ? (
                  <div className="text-sm text-slate-400">Chargement du plan...</div>
                ) : (
                  <>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={plan?.useCurrentTasks ?? true}
                        onChange={(e) => handleToggleUseCurrentTasks(e.target.checked)}
                        disabled={savingPlan}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-800 group-hover:text-blue-700">Utiliser les tâches en cours</span>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Si coché, les tâches actuellement assignées à cet employé seront automatiquement reconduites pour {nextMonthLabel}.
                        </p>
                      </div>
                    </label>

                    {plan && !plan.useCurrentTasks && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs text-slate-500">{plan.taskIds.length} tâche(s) planifiée(s)</span>
                          <div className="flex gap-2">
                            <button
                              onClick={assignAllPlan}
                              disabled={savingPlan}
                              className="px-2.5 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium disabled:opacity-50"
                            >
                              Tout sélectionner
                            </button>
                            <button
                              onClick={unassignAllPlan}
                              disabled={savingPlan}
                              className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium disabled:opacity-50"
                            >
                              Tout décocher
                            </button>
                          </div>
                        </div>

                        {Object.entries(groups).map(([groupName, groupTasks]) => (
                          <div key={groupName} className="border border-slate-100 rounded-lg overflow-hidden mb-2">
                            <div className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">{groupName}</div>
                            {groupTasks.map((task) => (
                              <label key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-t border-slate-50">
                                <input
                                  type="checkbox"
                                  checked={plan.taskIds.includes(task.id)}
                                  onChange={() => handleTogglePlanTask(task.id)}
                                  disabled={savingPlan}
                                />
                                <span className="text-sm text-slate-800">{task.title}</span>
                                {task.deadline && <span className="text-xs text-slate-400 ml-auto">{task.deadline}</span>}
                              </label>
                            ))}
                          </div>
                        ))}
                        {tasks.length === 0 && (
                          <div className="text-center py-6 text-slate-400 text-sm">Aucune tâche dans la bibliothèque</div>
                        )}
                      </div>
                    )}

                    {(plan?.useCurrentTasks ?? true) && (
                      <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-600">
                        Les {assignments.length} tâche(s) actuellement assignées seront reconduites automatiquement pour {nextMonthLabel}.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {!selectedUserId && <div className="text-center py-10 text-slate-400">Sélectionnez un employé pour gérer ses assignations</div>}
        </div>
      )}

      {/* Import tab */}
      {tab === "import" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg">
          <h2 className="font-semibold text-slate-800 mb-1">Importer des tâches depuis Excel ou CSV</h2>
          <p className="text-sm text-slate-500 mb-4">
            Le fichier doit contenir les colonnes : <code className="bg-slate-100 px-1 rounded">groupe</code>, <code className="bg-slate-100 px-1 rounded">titre</code>, et optionnellement <code className="bg-slate-100 px-1 rounded">delai</code>, <code className="bg-slate-100 px-1 rounded">ordre</code>.
          </p>

          {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
          {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>}

          <form onSubmit={handleImport} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fichier Excel / CSV</label>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" required
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100 cursor-pointer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Assigner à un employé <span className="text-slate-400 font-normal">(optionnel)</span></label>
              <select value={importUserId} onChange={(e) => setImportUserId(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
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
            <button type="submit" disabled={importing || !importFile}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition-colors">
              {importing ? "Importation..." : "Importer"}
            </button>
          </form>

          {/* Template download hint */}
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
            <strong>Format attendu :</strong><br />
            Ligne 1 : en-têtes (groupe, titre, delai, ordre)<br />
            Lignes suivantes : données des tâches
          </div>
        </div>
      )}
    </div>
  );
}

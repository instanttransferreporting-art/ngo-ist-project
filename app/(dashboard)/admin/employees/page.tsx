"use client";

import { useState, useEffect, useCallback } from "react";

interface Entity {
  id: string;
  name: string;
  color: string;
  _count?: { users: number };
}

interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  createdAt: string;
  entityId?: string | null;
  entity?: Entity | null;
}

export default function EmployeesPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "EMPLOYEE", entityId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Entity management state
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editEntity, setEditEntity] = useState<Entity | null>(null);
  const [entityForm, setEntityForm] = useState({ name: "", color: "#6b7280" });
  const [savingEntity, setSavingEntity] = useState(false);
  const [entityError, setEntityError] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  const fetchEntities = useCallback(async () => {
    const res = await fetch("/api/entities");
    if (res.ok) setEntities(await res.json());
  }, []);

  useEffect(() => { fetchUsers(); fetchEntities(); }, [fetchUsers, fetchEntities]);

  function openCreate() {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", role: "EMPLOYEE", entityId: "" });
    setError("");
    setShowForm(true);
  }

  function openEdit(user: User) {
    setEditUser(user);
    setForm({ name: user.name, email: user.email, password: "", role: user.role, entityId: user.entityId ?? "" });
    setError("");
    setShowForm(true);
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      let res: Response;
      if (editUser) {
        const body: Record<string, string | null> = { name: form.name, email: form.email, role: form.role, entityId: form.entityId || null };
        if (form.password) body.password = form.password;
        res = await fetch(`/api/users/${editUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, entityId: form.entityId || null }),
        });
      }

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur"); return; }

      setSuccess(editUser ? "Utilisateur mis à jour" : "Utilisateur créé");
      setShowForm(false);
      fetchUsers();
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Supprimer ${name} ? Cette action est irréversible.`)) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) fetchUsers();
  }

  function openCreateEntity() {
    setEditEntity(null);
    setEntityForm({ name: "", color: "#6b7280" });
    setEntityError("");
    setShowEntityForm(true);
  }

  function openEditEntity(entity: Entity) {
    setEditEntity(entity);
    setEntityForm({ name: entity.name, color: entity.color });
    setEntityError("");
    setShowEntityForm(true);
  }

  async function saveEntity(e: React.FormEvent) {
    e.preventDefault();
    setSavingEntity(true);
    setEntityError("");
    try {
      const res = editEntity
        ? await fetch(`/api/entities/${editEntity.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entityForm),
          })
        : await fetch("/api/entities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entityForm),
          });
      const data = await res.json();
      if (!res.ok) { setEntityError(data.error ?? "Erreur"); return; }
      setShowEntityForm(false);
      fetchEntities();
      fetchUsers();
    } finally {
      setSavingEntity(false);
    }
  }

  async function deleteEntity(id: string, name: string) {
    if (!confirm(`Supprimer l'entité "${name}" ? Les employés rattachés ne seront plus associés.`)) return;
    const res = await fetch(`/api/entities/${id}`, { method: "DELETE" });
    if (res.ok) { fetchEntities(); fetchUsers(); }
  }

  return (
    <div className="space-y-6">
      {/* Entities section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">Entités</h2>
            <p className="text-slate-500 text-sm mt-0.5">Sous-groupes avec couleur distinctive dans les rapports</p>
          </div>
          <button
            onClick={openCreateEntity}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nouvelle entité
          </button>
        </div>
        {entities.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">Aucune entité créée.</div>
        ) : (
          <div className="p-4 flex flex-wrap gap-3">
            {entities.map((ent) => (
              <div key={ent.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: ent.color }} />
                <span className="text-sm font-medium text-slate-800">{ent.name}</span>
                {ent._count !== undefined && <span className="text-xs text-slate-400">({ent._count.users} emp.)</span>}
                <button onClick={() => openEditEntity(ent)} className="ml-1 text-xs text-slate-500 hover:text-slate-800 font-medium">Modifier</button>
                <button onClick={() => deleteEntity(ent.id, ent.name)} className="text-xs text-red-500 hover:text-red-700 font-medium">Suppr.</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Entity form modal */}
      {showEntityForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{editEntity ? "Modifier l'entité" : "Nouvelle entité"}</h2>
              <button onClick={() => setShowEntityForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveEntity} className="p-6 space-y-4">
              {entityError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{entityError}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom de l&apos;entité</label>
                <input type="text" required value={entityForm.name}
                  onChange={(e) => setEntityForm({ ...entityForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Couleur</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={entityForm.color}
                    onChange={(e) => setEntityForm({ ...entityForm, color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border border-slate-300 p-0.5" />
                  <span className="text-sm text-slate-600 font-mono">{entityForm.color}</span>
                  <span className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: entityForm.color }} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEntityForm(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                  Annuler
                </button>
                <button type="submit" disabled={savingEntity}
                  className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
                  {savingEntity ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users section */}
      <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employés</h1>
          <p className="text-slate-500 mt-1">Gérer les comptes utilisateurs</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Ajouter un utilisateur
        </button>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{editUser ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveUser} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom complet</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Mot de passe {editUser && <span className="text-slate-400 font-normal">(laisser vide pour ne pas changer)</span>}
                </label>
                <input type="password" {...(!editUser ? { required: true } : {})}
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Rôle</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
                  <option value="EMPLOYEE">Employé</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Entité (ENT)</label>
                <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
                  <option value="">— Aucune entité —</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>{ent.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-slate-400">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-center px-4 py-3 font-medium w-12">#</th>
                  <th className="text-left px-6 py-3 font-medium">Nom</th>
                  <th className="text-left px-6 py-3 font-medium">Email</th>
                  <th className="text-center px-4 py-3 font-medium">Entité</th>
                  <th className="text-center px-4 py-3 font-medium">Rôle</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user, index) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-center text-slate-400 text-xs font-medium">{index + 1}</td>
                    <td className="px-6 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {user.entity && (
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: user.entity.color }}
                            title={user.entity.name}
                          />
                        )}
                        {user.name}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3 text-center">
                      {user.entity ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border"
                          style={{ borderColor: user.entity.color, color: user.entity.color, backgroundColor: user.entity.color + "18" }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: user.entity.color }} />
                          {user.entity.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${user.role === "ADMIN" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {user.role === "ADMIN" ? "Admin" : "Employé"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a href={`/admin/employees/${user.id}`}
                          className="text-xs text-blue-700 hover:underline font-medium">Fiche</a>
                        <button onClick={() => openEdit(user)}
                          className="text-xs text-slate-600 hover:text-slate-900 font-medium">Modifier</button>
                        <button onClick={() => deleteUser(user.id, user.name)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium">Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Aucun utilisateur</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

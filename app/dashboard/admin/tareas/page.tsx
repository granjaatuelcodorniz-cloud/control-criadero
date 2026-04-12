'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { Plus, X, Trash2 } from 'lucide-react';
// 1. Integración de Auth y Navegación
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

type Task = {
  id: number;
  description: string;
  type: 'daily' | 'periodic' | 'custom';
  frequency_days: number | null;
  is_urgent: boolean;
  is_active: boolean;
  assigned_to: string | null;
  next_execution: string | null;
};

type Collaborator = { id: string; full_name: string };
type Completion = { task_id: number; date: string };

export default function Tareas() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'daily' | 'periodic' | 'custom'>('custom');
  const [newFreq, setNewFreq] = useState(3);
  const [newAssigned, setNewAssigned] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  // 2. Carga de datos optimizada
  const loadData = async () => {
    setLoading(true);

    const { data: tasksData } = await supabase
      .from('tasks').select('*')
      .eq('is_active', true)
      .order('type').order('id');
    if (tasksData) setTasks(tasksData);

    const { data: collabData } = await supabase
      .from('profiles').select('id, full_name')
      .eq('role', 'collaborator');
    if (collabData) {
      setCollaborators(collabData);
      if (collabData.length > 0) setNewAssigned(collabData[0].id);
    }

    const { data: compData } = await supabase
      .from('task_completions').select('task_id, date')
      .eq('date', today);
    if (compData) setCompletions(compData);

    setLoading(false);
  };

  // 3. Guardián de acceso y trigger de carga
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }

    loadData();
  }, [authLoading, user, profile]);

  const handleSave = async () => {
    if (!newDesc.trim() || !user) return;
    setSaving(true);

    await supabase.from('tasks').insert({
      description: newDesc.trim(),
      type: newType,
      is_active: true,
      frequency_days: newType === 'periodic' ? newFreq : null,
      next_execution: newType === 'periodic' ? today : null,
      assigned_to: newType === 'custom' && newAssigned ? newAssigned : null,
      created_by: user.id,
    });

    setNewDesc('');
    setNewType('custom');
    setNewFreq(3);
    setShowForm(false);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta tarea?')) return;
    await supabase.from('tasks').update({ is_active: false }).eq('id', id);
    await loadData();
  };

  const toggleUrgent = async (task: Task) => {
    await supabase.from('tasks')
      .update({ is_urgent: !task.is_urgent })
      .eq('id', task.id);
    await loadData();
  };

  const isDoneToday = (taskId: number) =>
    completions.some(c => c.task_id === taskId);

  const typeLabel = (type: string) => {
    if (type === 'daily') return 'Diaria';
    if (type === 'periodic') return 'Periódica';
    return 'Asignada';
  };

  const typeColor = (type: string) => {
    if (type === 'daily') return 'bg-yellow-50 text-yellow-700';
    if (type === 'periodic') return 'bg-orange-50 text-orange-700';
    return 'bg-blue-50 text-blue-700';
  };

  const groups = [
    { label: 'Diarias', tasks: tasks.filter(t => t.type === 'daily') },
    { label: 'Periódicas', tasks: tasks.filter(t => t.type === 'periodic') },
    { label: 'Asignadas', tasks: tasks.filter(t => t.type === 'custom') },
  ];

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role}
        backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Tareas</h2>
          {saved && <span className="text-green-600 text-sm font-medium">✓ Guardado</span>}
        </div>

        {/* Nueva tarea */}
        {!showForm ? (
          <button onClick={() => setShowForm(true)} className="btn-primary w-full py-3 text-sm">
            <Plus className="w-4 h-4" /> Nueva tarea
          </button>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Nueva tarea</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Descripción</label>
              <input className="input-base" placeholder="Ej: Revisar jaula 3..."
                value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-2 block">Tipo</label>
              <div className="grid grid-cols-3 gap-2">
                {(['daily', 'periodic', 'custom'] as const).map(t => (
                  <button key={t} onClick={() => setNewType(t)}
                    className={`py-2 rounded-xl border text-sm font-medium transition-all
                      ${newType === t
                        ? 'bg-yellow-400 border-yellow-400 text-gray-900'
                        : 'bg-white border-gray-200 text-gray-600'}`}>
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            {newType === 'periodic' && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Repetir cada (días)</label>
                <input className="input-base" type="number" min="1"
                  value={newFreq} onChange={e => setNewFreq(Number(e.target.value))} />
              </div>
            )}

            {newType === 'custom' && collaborators.length > 0 && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Asignar a</label>
                <select className="input-base" value={newAssigned}
                  onChange={e => setNewAssigned(e.target.value)}>
                  {collaborators.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>
            )}

            <button onClick={handleSave} disabled={saving}
              className="btn-primary w-full py-3 text-sm">
              {saving ? 'Guardando...' : 'Guardar tarea'}
            </button>
          </div>
        )}

        {/* Grupos de tareas */}
        {groups.map(group => group.tasks.length > 0 && (
          <div key={group.label}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.tasks.map(task => {
                const done = isDoneToday(task.id);
                const collab = collaborators.find(c => c.id === task.assigned_to);
                return (
                  <div key={task.id}
                    className={`bg-white rounded-2xl border p-4 transition-all
                      ${done ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${typeColor(task.type)}`}>
                            {typeLabel(task.type)}
                          </span>
                          {task.is_urgent && (
                            <span className="badge-urgent">Urgente</span>
                          )}
                          {done && (
                            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-lg">
                              ✓ Hecha hoy
                            </span>
                          )}
                        </div>
                        <p className={`text-sm ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {task.description}
                        </p>
                        {task.frequency_days && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Cada {task.frequency_days} días
                          </p>
                        )}
                        {collab && (
                          <p className="text-xs text-blue-500 mt-0.5">
                            → {collab.full_name}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {task.type === 'periodic' && (
                          <button
                            onClick={() => toggleUrgent(task)}
                            className={`text-xs px-2 py-1 rounded-lg border transition-all
                              ${task.is_urgent
                                ? 'bg-red-50 border-red-100 text-red-600'
                                : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-orange-200 hover:text-orange-500'}`}
                            title={task.is_urgent ? 'Quitar urgente' : 'Marcar urgente'}
                          >
                            {task.is_urgent ? '! Urgente' : 'Urgente'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                          title="Eliminar tarea"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
            Sin tareas activas todavía
          </div>
        )}

      </div>
    </div>
  );
}
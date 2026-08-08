'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { Plus, X, Trash2, Calendar, Clock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibilityReload } from '@/lib/visibility-reload';
import { useRouter } from 'next/navigation';
import { ConfirmDialog, ToastViewport, useToast } from '@/components/Feedback';
import { assertSupabaseOk, getErrorMessage } from '@/lib/supabase-ops';

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: number;
  description: string;
  type: 'daily' | 'periodic' | 'custom';
  frequency_days: number | null;
  next_execution: string | null;
  is_urgent: boolean;
  is_active: boolean;
  assigned_to: string | null;
};

type Collaborator = { id: string; full_name: string };
type Completion = { task_id: number; date: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(task: Task, today: string): boolean {
  if (!task.next_execution) return false;
  return task.next_execution < today;
}

function daysUntilNext(task: Task, today: string): number | null {
  if (!task.next_execution) return null;
  const diff = new Date(task.next_execution).getTime() - new Date(today).getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Tareas() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'daily' | 'periodic' | 'custom'>('daily');
  const [newFreq, setNewFreq] = useState(3);
  const [newAssigned, setNewAssigned] = useState('');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const { toast, showToast, hideToast } = useToast();

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    try {
      const [tasksRes, collabRes, compRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('is_active', true).order('type').order('id'),
        supabase.from('profiles').select('id, full_name').eq('role', 'collaborator'),
        supabase.from('task_completions').select('task_id, date').eq('date', today),
      ]);

      if (tasksRes.data) setTasks(tasksRes.data);
      if (collabRes.data) {
        setCollaborators(collabRes.data);
        if (collabRes.data.length > 0) setNewAssigned(prev => prev || collabRes.data[0].id);
      }
      if (compRes.data) setCompletions(compRes.data);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }
    loadData();
  }, [authLoading, user, profile, router, loadData]);

  useVisibilityReload(loadData);

  // ── Crear tarea ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!newDesc.trim() || !user) return;
    setSaving(true);
    try {
      assertSupabaseOk(await supabase.from('tasks').insert({
        description: newDesc.trim(),
        type: newType,
        is_active: true,
        frequency_days: newType === 'periodic' ? newFreq : null,
        // Periódicas arranca con next_execution = hoy (aparece de inmediato)
        next_execution: newType === 'periodic' ? today : null,
        assigned_to: newType === 'custom' && newAssigned ? newAssigned : null,
        created_by: user.id,
        is_urgent: false,
      }));
      setNewDesc('');
      setShowForm(false);
      showToast('Tarea creada');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo crear la tarea.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Eliminar tarea ──────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    if (pendingDeleteId === null) return;
    setSaving(true);
    try {
      assertSupabaseOk(await supabase.from('tasks').update({ is_active: false }).eq('id', pendingDeleteId));
      setPendingDeleteId(null);
      showToast('Tarea eliminada');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo eliminar la tarea.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers de vista ────────────────────────────────────────────────────────
  const isDoneToday = (taskId: number) => completions.some(c => c.task_id === taskId);

  const groups = [
    { label: 'Diarias', type: 'daily', icon: <Clock className="w-3 h-3" /> },
    { label: 'Periódicas', type: 'periodic', icon: <Calendar className="w-3 h-3" /> },
    { label: 'Asignadas / Únicas', type: 'custom', icon: <User className="w-3 h-3" /> },
  ];

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 font-medium">Cargando tareas...</p>
    </div>
  );

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastViewport toast={toast} onClose={hideToast} />
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Eliminar tarea"
        description="La tarea dejará de aparecer para el equipo. Podés volver a crearla si la necesitás más adelante."
        confirmLabel="Eliminar"
        danger
        busy={saving}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Gestión de Tareas</h2>
        </div>

        {/* Formulario nueva tarea */}
        {!showForm ? (
          <button onClick={() => setShowForm(true)}
            className="w-full py-4 bg-gray-900 text-white rounded-3xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-gray-200 active:scale-[0.98] transition-all">
            <Plus className="w-5 h-5" /> Nueva Tarea
          </button>
        ) : (
          <div className="bg-white rounded-3xl border-2 border-yellow-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest">Configurar Tarea</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <input className="input-base" placeholder="¿Qué hay que hacer?"
              value={newDesc} onChange={e => setNewDesc(e.target.value)} />

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'daily', label: 'Diaria', desc: 'Cada día' },
                { id: 'periodic', label: 'Periódica', desc: 'Cada X días' },
                { id: 'custom', label: 'Única vez', desc: 'Se hace y desaparece' },
              ].map(t => (
                <button key={t.id} onClick={() => setNewType(t.id as typeof newType)}
                  className={`py-3 px-2 rounded-2xl border-2 text-center transition-all
                    ${newType === t.id ? 'bg-yellow-400 border-yellow-400 text-yellow-950' : 'bg-white border-gray-100 text-gray-400'}`}>
                  <p className="text-[11px] font-black uppercase">{t.label}</p>
                  <p className="text-[9px] mt-0.5 opacity-60">{t.desc}</p>
                </button>
              ))}
            </div>

            {newType === 'periodic' && (
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Repetir cada (días)</label>
                <input className="input-base mt-1" type="number" min={1}
                  value={newFreq} onChange={e => setNewFreq(Number(e.target.value))} />
                <p className="text-[10px] text-gray-400 mt-1 ml-1">
                  Aparecerá hoy y luego cada {newFreq} días desde que se complete.
                </p>
              </div>
            )}

            {newType === 'custom' && collaborators.length > 0 && (
              <div>
                <label className="text-[10px] font-bold text-blue-500 uppercase ml-1">Asignar colaborador</label>
                <select className="input-base mt-1 border-blue-100"
                  value={newAssigned} onChange={e => setNewAssigned(e.target.value)}>
                  {collaborators.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1 ml-1">
                  Desaparecerá automáticamente al día siguiente de completarse.
                </p>
              </div>
            )}

            <button onClick={handleSave} disabled={saving}
              className="btn-primary w-full py-4 rounded-2xl shadow-md">
              {saving ? 'Guardando...' : 'CREAR TAREA'}
            </button>
          </div>
        )}

        {/* Lista de tareas */}
        <div className="space-y-8">
          {groups.map(group => {
            const groupTasks = tasks.filter(t => t.type === group.type);
            if (groupTasks.length === 0) return null;

            return (
              <section key={group.label} className="space-y-3">
                <div className="flex items-center gap-2 text-gray-400 ml-1">
                  {group.icon}
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">{group.label}</h3>
                </div>

                <div className="space-y-3">
                  {groupTasks.map(task => {
                    const done = isDoneToday(task.id);
                    const overdue = task.type === 'periodic' && isOverdue(task, today);
                    const daysLeft = task.type === 'periodic' ? daysUntilNext(task, today) : null;
                    const collab = collaborators.find(c => c.id === task.assigned_to);

                    return (
                      <div key={task.id}
                        className={`bg-white rounded-3xl border-2 p-4 transition-all shadow-sm
                          ${done ? 'opacity-50 border-gray-50'
                            : overdue ? 'border-red-100 bg-red-50/30'
                            : 'border-white'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">

                            {/* Badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {overdue && !done && (
                                <span className="bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> Vencida
                                </span>
                              )}
                              {done && (
                                <span className="bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Completada hoy
                                </span>
                              )}
                              {task.type === 'custom' && (
                                <span className="bg-blue-50 text-blue-500 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                                  Única vez
                                </span>
                              )}
                            </div>

                            {/* Descripción */}
                            <p className={`font-bold leading-tight ${done ? 'line-through text-gray-400' : overdue ? 'text-red-700' : 'text-gray-800'}`}>
                              {task.description}
                            </p>

                            {/* Meta info */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {task.type === 'periodic' && task.frequency_days && (
                                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                                  Cada {task.frequency_days} días
                                </span>
                              )}
                              {task.type === 'periodic' && task.next_execution && !done && (
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg
                                  ${overdue
                                    ? 'bg-red-100 text-red-600'
                                    : daysLeft === 0
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-gray-50 text-gray-400'}`}>
                                  {overdue
                                    ? `Venció hace ${Math.abs(daysLeft ?? 0)} día${Math.abs(daysLeft ?? 0) !== 1 ? 's' : ''}`
                                    : daysLeft === 0
                                      ? 'Toca hoy'
                                      : `Próxima en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}`}
                                </span>
                              )}
                              {collab && (
                                <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg flex items-center gap-1">
                                  <User className="w-3 h-3" /> {collab.full_name}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Acciones */}
                          <div className="flex flex-col gap-2">
                            <button onClick={() => handleDelete(task.id)}
                              className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {tasks.length === 0 && (
          <div className="py-20 text-center space-y-2 opacity-30">
            <CheckCircle2 className="w-10 h-10 mx-auto text-gray-400" />
            <p className="font-bold text-sm uppercase tracking-widest">Sin tareas activas</p>
          </div>
        )}
      </div>
    </div>
  );
}

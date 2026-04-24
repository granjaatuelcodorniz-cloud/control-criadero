'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import Header from '@/components/Header';
import { Plus, X, Trash2, Calendar, Clock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
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
  const supabase = useRef(createClient()).current;

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, collabRes, compRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('is_active', true).order('type').order('id'),
        supabase.from('profiles').select('id, full_name').eq('role', 'collaborator'),
        supabase.from('task_completions').select('task_id, date').eq('date', today),
      ]);

      if (tasksRes.data) setTasks(tasksRes.data);
      if (collabRes.data) {
        setCollaborators(collabRes.data);
        // Solo setear el asignado si no hay ninguno seleccionado aún
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
  }, [authLoading, user, profile]);

  const handleSave = async () => {
    if (!newDesc.trim() || !user) return;
    setSaving(true);
    try {
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
      setShowForm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    await supabase.from('tasks').update({ is_active: false }).eq('id', id);
    await loadData();
  };

  const toggleUrgent = async (task: Task) => {
    await supabase.from('tasks').update({ is_urgent: !task.is_urgent }).eq('id', task.id);
    await loadData();
  };

  const isDoneToday = (taskId: number) => completions.some(c => c.task_id === taskId);

  const groups = [
    { label: 'Diarias', type: 'daily', icon: <Clock className="w-3 h-3" /> },
    { label: 'Periódicas', type: 'periodic', icon: <Calendar className="w-3 h-3" /> },
    { label: 'Asignadas', type: 'custom', icon: <User className="w-3 h-3" /> },
  ];

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 font-medium">Cargando tareas...</p>
    </div>
  );

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Gestión de Tareas</h2>
          {saved && <span className="text-green-600 text-xs font-bold animate-bounce">✓ Guardado</span>}
        </div>

        {!showForm ? (
          <button onClick={() => setShowForm(true)}
            className="w-full py-4 bg-gray-900 text-white rounded-3xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-gray-200 active:scale-[0.98] transition-all">
            <Plus className="w-5 h-5" /> Nueva Tarea
          </button>
        ) : (
          <div className="bg-white rounded-3xl border-2 border-yellow-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest">Configurar Tarea</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <input className="input-base" placeholder="¿Qué hay que hacer?" value={newDesc} onChange={e => setNewDesc(e.target.value)} />

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'daily', label: 'Diaria' },
                { id: 'periodic', label: 'Cada X' },
                { id: 'custom', label: 'Asignada' },
              ].map(t => (
                <button key={t.id} onClick={() => setNewType(t.id as 'daily' | 'periodic' | 'custom')}
                  className={`py-3 rounded-2xl border-2 text-[11px] font-black uppercase transition-all
                    ${newType === t.id ? 'bg-yellow-400 border-yellow-400 text-yellow-950' : 'bg-white border-gray-100 text-gray-400'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {newType === 'periodic' && (
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Repetir cada (días)</label>
                <input className="input-base mt-1" type="number" value={newFreq} onChange={e => setNewFreq(Number(e.target.value))} />
              </div>
            )}

            {newType === 'custom' && collaborators.length > 0 && (
              <div>
                <label className="text-[10px] font-bold text-blue-500 uppercase ml-1">Asignar colaborador</label>
                <select className="input-base mt-1 border-blue-100" value={newAssigned} onChange={e => setNewAssigned(e.target.value)}>
                  {collaborators.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
            )}

            <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-4 rounded-2xl shadow-md">
              {saving ? 'Guardando...' : 'CREAR TAREA'}
            </button>
          </div>
        )}

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
                    const collab = collaborators.find(c => c.id === task.assigned_to);
                    return (
                      <div key={task.id} className={`bg-white rounded-3xl border-2 p-4 transition-all shadow-sm ${done ? 'opacity-50 border-gray-50' : 'border-white'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {task.is_urgent && !done && (
                                <span className="bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> Urgente
                                </span>
                              )}
                              {done && (
                                <span className="bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Completada
                                </span>
                              )}
                            </div>
                            <p className={`font-bold leading-tight ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {task.description}
                            </p>
                            <div className="flex items-center gap-3">
                              {task.type === 'periodic' && (
                                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                                  Cada {task.frequency_days} días
                                </span>
                              )}
                              {collab && (
                                <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg flex items-center gap-1">
                                  <User className="w-3 h-3" /> {collab.full_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button onClick={() => handleDelete(task.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                              <Trash2 className="w-5 h-5" />
                            </button>
                            {task.type === 'periodic' && !done && (
                              <button onClick={() => toggleUrgent(task)}
                                className={`p-2 rounded-xl border transition-all ${task.is_urgent ? 'bg-red-50 border-red-100 text-red-500' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                                <AlertCircle className="w-5 h-5" />
                              </button>
                            )}
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
            <p className="font-bold text-sm uppercase tracking-widest">Todo al día</p>
          </div>
        )}
      </div>
    </div>
  );
}
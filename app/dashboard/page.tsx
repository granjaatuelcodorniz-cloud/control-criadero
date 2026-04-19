'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { useRouter } from 'next/navigation';
import { Egg, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function DashboardPro() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tasks, setTasks] = useState<any[]>([]);
  const [completed, setCompleted] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.push('/');
      return;
    }
    load();
  }, [authLoading, user, profile]);

  const load = async () => {
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_active', true)
      .order('type');

    const { data: done } = await supabase
      .from('task_completions')
      .select('task_id')
      .eq('user_id', user?.id)
      .eq('date', today);

    setTasks(tasksData || []);
    setCompleted(done?.map(d => d.task_id) || []);
    setLoading(false);
  };

  const toggleTask = async (id: number) => {
    const isDone = completed.includes(id);

    if (isDone) {
      await supabase
        .from('task_completions')
        .delete()
        .eq('task_id', id)
        .eq('user_id', user?.id)
        .eq('date', today);

      setCompleted(prev => prev.filter(t => t !== id));
    } else {
      await supabase.from('task_completions').insert({
        task_id: id,
        user_id: user?.id,
        date: today
      });

      setCompleted(prev => [...prev, id]);
    }
  };

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = completed.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [tasks, completed]);

  if (authLoading || loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile?.full_name || ''} role={profile?.role || ''} />

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold">Hola, {profile.full_name} 👋</h2>
          <p className="text-gray-500 text-sm">
            {new Date().toLocaleDateString('es-AR', {
              weekday: 'long', day: 'numeric', month: 'long'
            })}
          </p>
        </div>

        {/* KPI */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-gray-500">Progreso</span>
            <span className="font-semibold">{stats.done}/{stats.total}</span>
          </div>

          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-400 transition-all"
              style={{ width: `${stats.pct}%` }}
            />
          </div>

          <p className="text-right text-xs text-gray-400 mt-1">
            {stats.pct}% completado
          </p>
        </div>

        {/* CTA */}
        <button className="btn-primary w-full py-4 flex items-center justify-center gap-2">
          <Egg className="w-5 h-5" />
          Registrar huevos
        </button>

        {/* TASKS */}
        <div className="space-y-2">
          {tasks.map(task => {
            const isDone = completed.includes(task.id);

            return (
              <div
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className={`p-4 rounded-2xl border flex items-center gap-3 cursor-pointer transition
                ${isDone ? 'bg-gray-50' : 'bg-white hover:border-yellow-300'}`}
              >
                {isDone
                  ? <CheckCircle2 className="text-yellow-500" />
                  : <div className="w-5 h-5 border rounded-full" />}

                <div className="flex-1">
                  <p className={`${isDone ? 'line-through text-gray-400' : ''}`}>
                    {task.description}
                  </p>
                </div>

                {task.is_urgent && !isDone && (
                  <AlertTriangle className="text-red-500 w-4 h-4" />
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

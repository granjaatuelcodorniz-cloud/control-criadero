'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// Agregamos todos los íconos necesarios para que no den error
import { Egg, CheckSquare, AlertTriangle, ClipboardList, Plus, X, ArrowRight, Loader2 } from 'lucide-react';

// 1. Definición del tipo Task (esto quita los errores de "Cannot find name 'Task'")
type Task = {
  id: number;
  description: string;
  type: 'daily' | 'periodic' | 'custom';
  frequency_days?: number;
  is_urgent?: boolean;
};

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  // Estados para las tareas
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // 2. Lógica de Redirección para el Dueño
  useEffect(() => {
    if (!authLoading && profile?.role === 'owner') {
      router.replace('/dashboard/admin');
    }
  }, [profile, authLoading, router]);

  // 3. Carga de tareas (Solo para colaboradores)
  const fetchTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('is_urgent', { ascending: false });

      if (!error) setTasks(data || []);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    if (user && profile?.role === 'collaborator') {
      fetchTasks();
    }
  }, [user, profile, fetchTasks]);

  // Pantalla de carga inicial
  if (authLoading || (profile?.role === 'owner')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-yellow-500 animate-spin mb-2" />
        <p className="text-gray-500 font-medium">Cargando panel...</p>
      </div>
    );
  }

  // 4. VISTA PARA COLABORADORES (Antonella)
  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        userName={profile?.full_name ?? ''} 
        role="collaborator" 
        backHref="/" 
        backLabel="Salir" 
      />

      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Acceso Directo a Registro de Huevos */}
        <Link href="/dashboard/huevos" 
          className="flex items-center justify-between bg-yellow-400 p-6 rounded-3xl shadow-lg shadow-yellow-100 active:scale-95 transition-all group">
          <div className="flex items-center gap-4">
            <div className="bg-white/30 p-3 rounded-2xl group-hover:bg-white/50 transition-colors">
              <Egg className="w-8 h-8 text-yellow-900" />
            </div>
            <div>
              <h3 className="text-xl font-black text-yellow-900 tracking-tight">REGISTRAR HUEVOS</h3>
              <p className="text-yellow-800 text-sm font-medium">Producción y empaque diario</p>
            </div>
          </div>
          <ArrowRight className="w-6 h-6 text-yellow-900" />
        </Link>

        {/* Lista de Tareas */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-gray-400">
              <ClipboardList className="w-4 h-4" />
              <h3 className="text-xs font-black uppercase tracking-widest">Tareas pendientes</h3>
            </div>
          </div>
          
          <div className="bg-white rounded-3xl p-2 border border-gray-100 shadow-sm min-h-[200px]">
            {loadingTasks ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 text-gray-200 animate-spin" />
              </div>
            ) : tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-yellow-200 transition-all">
                    <div className={`p-2 rounded-xl ${task.is_urgent ? 'bg-red-100' : 'bg-blue-100'}`}>
                      {task.is_urgent ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <CheckSquare className="w-4 h-4 text-blue-600" />}
                    </div>
                    <span className="flex-1 text-gray-700 font-medium">{task.description}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="bg-gray-50 p-4 rounded-full mb-3">
                  <CheckSquare className="w-8 h-8 text-gray-200" />
                </div>
                <p className="text-gray-400 text-sm font-medium">¡Todo al día!<br/>No hay tareas pendientes.</p>
              </div>
            )}
          </div>
        </section>

        {/* Botón secundario para otras acciones si hiciera falta */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-3xl border border-gray-100 flex flex-col gap-2 shadow-sm opacity-50">
            <Plus className="w-5 h-5 text-gray-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-tight">Próximamente</span>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-gray-100 flex flex-col gap-2 shadow-sm opacity-50">
            <X className="w-5 h-5 text-gray-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-tight">Reportar Problema</span>
          </div>
        </div>
      </main>
    </div>
  );
}
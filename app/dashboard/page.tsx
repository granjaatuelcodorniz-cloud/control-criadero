'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Egg, CheckSquare, AlertTriangle, ClipboardList,
  Plus, X, Bird, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: number;
  description: string;
  type: 'daily' | 'periodic' | 'custom';
  frequency_days?: number;
  is_urgent?: boolean;
};

type StockItem = {
  id: number;
  name: string;
  unit: string;
  current_quantity: number;
  is_feed?: boolean;
  bolsas_restantes?: number | null;
  kg_por_bolsa?: number | null;
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [periodicTasks, setPeriodicTasks] = useState<Task[]>([]);
  const [customTasks, setCustomTasks] = useState<Task[]>([]);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [totalAvesActivas, setTotalAvesActivas] = useState(0);

  const [stockSaved, setStockSaved] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [confirmStock, setConfirmStock] = useState<number | null>(null);
  const [showExtraTask, setShowExtraTask] = useState(false);
  const [extraTaskDesc, setExtraTaskDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [tasksRes, completionsRes, slotsRes, stockRes] = await Promise.all([
        supabase.from('tasks').select('id, description, type, frequency_days, is_urgent')
          .eq('is_active', true)
          .or(`assigned_to.is.null,assigned_to.eq.${user.id}`)
          .order('type'),
        supabase.from('task_completions').select('task_id').eq('user_id', user.id).eq('date', today),
        supabase.from('cage_slots').select('quantity'),
        supabase.from('stock_items').select('id, name, unit, current_quantity, is_feed, bolsas_restantes, kg_por_bolsa').order('name'),
      ]);

      if (tasksRes.data) {
        setDailyTasks(tasksRes.data.filter(t => t.type === 'daily'));
        setPeriodicTasks(tasksRes.data.filter(t => t.type === 'periodic'));
        setCustomTasks(tasksRes.data.filter(t => t.type === 'custom'));
      }
      if (completionsRes.data) setCompletedIds(completionsRes.data.map(c => c.task_id));
      if (slotsRes.data) setTotalAvesActivas(slotsRes.data.reduce((s, sl) => s + sl.quantity, 0));
      if (stockRes.data) setStockItems(stockRes.data);
    } catch (error) {
      console.error('Error cargando dashboard colaborador:', error);
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role === 'owner') { router.push('/dashboard/admin'); return; }
    loadData();
  }, [authLoading, user, profile]);

  const toggleTask = async (taskId: number) => {
    if (!user) return;
    const isDone = completedIds.includes(taskId);
    if (isDone) {
      await supabase.from('task_completions').delete().eq('task_id', taskId).eq('user_id', user.id).eq('date', today);
      setCompletedIds(prev => prev.filter(id => id !== taskId));
    } else {
      await supabase.from('task_completions').insert({ task_id: taskId, user_id: user.id, completed: true, date: today });
      setCompletedIds(prev => [...prev, taskId]);
    }
  };

  const handleAddExtraTask = async () => {
    if (!extraTaskDesc.trim() || !user) return;
    await supabase.from('tasks').insert({
      description: extraTaskDesc.trim(), type: 'custom',
      is_active: true, created_by: user.id, assigned_to: user.id,
    });
    setExtraTaskDesc('');
    setShowExtraTask(false);
    await loadData();
  };

  const handleOpenBolsa = async (feedItem: StockItem) => {
    if (!feedItem?.kg_por_bolsa || !feedItem?.bolsas_restantes || !user) return;
    setSavingStock(true);
    setConfirmStock(null);
    try {
      await Promise.all([
        supabase.from('stock_items').update({
          current_quantity: Math.max(0, feedItem.current_quantity - feedItem.kg_por_bolsa),
          bolsas_restantes: Math.max(0, feedItem.bolsas_restantes - 1),
        }).eq('id', feedItem.id),
        supabase.from('stock_movements').insert({
          stock_item_id: feedItem.id, quantity: feedItem.kg_por_bolsa,
          movement_type: 'salida', notes: 'Bolsa abierta', user_id: user.id, date: today,
        }),
      ]);
      setStockSaved(true);
      setTimeout(() => setStockSaved(false), 3000);
      await loadData();
    } finally {
      setSavingStock(false);
    }
  };

  const handleUseItem = async (item: StockItem) => {
    if (!user) return;
    setSavingStock(true);
    setConfirmStock(null);
    try {
      await Promise.all([
        supabase.from('stock_movements').insert({
          stock_item_id: item.id, quantity: 1,
          movement_type: 'salida', user_id: user.id, date: today,
        }),
        supabase.from('stock_items').update({ current_quantity: Math.max(0, item.current_quantity - 1) }).eq('id', item.id),
      ]);
      setStockSaved(true);
      setTimeout(() => setStockSaved(false), 3000);
      await loadData();
    } finally {
      setSavingStock(false);
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 font-medium">Cargando...</p>
      </div>
    </div>
  );

  if (!profile) return null;

  const totalTasks = dailyTasks.length + periodicTasks.length + customTasks.length;
  const doneTasks = completedIds.length;
  const feedItems = stockItems.filter(i => i.is_feed);
  const otherItems = stockItems.filter(i => !i.is_feed);

  const TaskItem = ({ task }: { task: Task }) => {
    const isDone = completedIds.includes(task.id);
    return (
      <div onClick={() => toggleTask(task.id)}
        className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all active:scale-[0.99]
          ${isDone ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:border-yellow-300'}`}>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
          ${isDone ? 'bg-yellow-400 border-yellow-400' : 'border-gray-300'}`}>
          {isDone && <svg viewBox="0 0 12 12" className="w-3 h-3"><polyline points="2,6 5,9 10,3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>}
        </div>
        <div className="flex-1">
          <span className={`text-base ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.description}</span>
          {task.frequency_days && <p className="text-xs text-gray-400 mt-0.5">Cada {task.frequency_days} días</p>}
        </div>
        {task.is_urgent && !isDone && <span className="badge-urgent">Urgente</span>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} />

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

        {/* Greeting */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Hola, {profile.full_name} 👋</h2>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <div className="mt-3 bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Progreso del día</span>
              <span className="font-medium">{doneTasks}/{totalTasks} tareas</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-yellow-400 h-2 rounded-full transition-all"
                style={{ width: totalTasks > 0 ? `${Math.round((doneTasks / totalTasks) * 100)}%` : '0%' }} />
            </div>
          </div>
        </div>

        {/* CTAs principales */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/huevos"
            className="btn-primary py-5 rounded-2xl flex flex-col items-center gap-2 text-sm font-bold">
            <Egg className="w-6 h-6" />
            Registrar huevos
          </Link>
          <Link href="/dashboard/lotes"
            className="bg-white border-2 border-gray-200 hover:border-yellow-300 hover:bg-yellow-50/40 transition-all py-5 rounded-2xl flex flex-col items-center gap-2 text-sm font-bold text-gray-600 relative">
            <Bird className="w-6 h-6" />
            Aves
            {totalAvesActivas > 0 && (
              <span className="absolute top-2 right-2 text-[10px] font-black text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded-full">
                {totalAvesActivas}
              </span>
            )}
          </Link>
        </div>

        {/* Tasks */}
        {dailyTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="w-4 h-4 text-yellow-500" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tareas diarias</h3>
            </div>
            <div className="space-y-2">{dailyTasks.map(t => <TaskItem key={t.id} task={t} />)}</div>
          </div>
        )}

        {periodicTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tareas periódicas</h3>
            </div>
            <div className="space-y-2">{periodicTasks.map(t => <TaskItem key={t.id} task={t} />)}</div>
          </div>
        )}

        {customTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-blue-400" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tareas asignadas</h3>
            </div>
            <div className="space-y-2">{customTasks.map(t => <TaskItem key={t.id} task={t} />)}</div>
          </div>
        )}

        {/* Extra task */}
        <div>
          {!showExtraTask ? (
            <button onClick={() => setShowExtraTask(true)}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-yellow-300 hover:text-yellow-500 transition-all flex items-center justify-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Agregar tarea extra
            </button>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <input className="input-base" placeholder="Descripción de la tarea..."
                value={extraTaskDesc} onChange={e => setExtraTaskDesc(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <button onClick={handleAddExtraTask} className="btn-primary flex-1 py-2 text-sm">Agregar</button>
                <button onClick={() => setShowExtraTask(false)} className="btn-secondary px-3 py-2"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>

        {/* Insumos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Insumos</h3>
            {stockSaved && <span className="text-green-600 text-xs font-medium">✓ Guardado</span>}
          </div>
          <div className="space-y-2">
            {feedItems.map(feedItem => (
              <div key={feedItem.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">{feedItem.name}</p>
                  <p className="text-xs text-gray-400">
                    {feedItem.bolsas_restantes != null
                      ? `${feedItem.bolsas_restantes} bolsas · ${feedItem.current_quantity} kg`
                      : `${feedItem.current_quantity} kg`}
                  </p>
                </div>
                {confirmStock === feedItem.id ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleOpenBolsa(feedItem)} disabled={savingStock} className="btn-primary px-4 py-2 text-sm">
                      {savingStock ? '...' : 'Confirmar'}
                    </button>
                    <button onClick={() => setConfirmStock(null)} className="btn-secondary px-3 py-2"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmStock(feedItem.id)} disabled={!feedItem.bolsas_restantes}
                    className="btn-primary px-4 py-2 text-sm">
                    Abrí una bolsa
                  </button>
                )}
              </div>
            ))}
            {otherItems.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.current_quantity} {item.unit}</p>
                </div>
                {confirmStock === item.id ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleUseItem(item)} disabled={savingStock} className="btn-primary px-4 py-2 text-sm">
                      {savingStock ? '...' : 'Confirmar'}
                    </button>
                    <button onClick={() => setConfirmStock(null)} className="btn-secondary px-3 py-2"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmStock(item.id)} className="btn-secondary px-4 py-2 text-sm">Usar</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Link a lotes — acceso alternativo desde el fondo */}
        <Link href="/dashboard/lotes"
          className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-5 py-4 hover:border-yellow-300 transition-colors">
          <div className="flex items-center gap-3">
            <Bird className="w-5 h-5 text-gray-400" />
            <div>
              <p className="font-bold text-gray-700 text-sm">Ver lotes y bocas</p>
              <p className="text-xs text-gray-400">Bajas y reacomodamientos</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </Link>

      </div>
    </div>
  );
}
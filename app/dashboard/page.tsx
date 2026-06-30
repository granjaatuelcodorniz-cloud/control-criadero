'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import BajaRapida from '@/components/BajaRapida';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getToday } from '@/lib/date';
import {
  Egg, CheckSquare, AlertTriangle, ClipboardList,
  Plus, X, Bird, FlaskConical, Check,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: number;
  description: string;
  type: 'daily' | 'periodic' | 'custom';
  frequency_days?: number;
  next_execution?: string | null;
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

type ActiveTreatment = {
  id: number;
  type: string;
  date: string;
  lot_id: number | null;
  dose_applied: number | null;
  water_liters: number | null;
  duration_days: number | null;
  health_product_id: number | null;
  notes: string | null;
};

type HealthProduct = {
  id: number;
  name: string;
  unit: string;
};

type Lot = { id: number; code: string; current_quantity: number };
type CageSlot = { id: number; lot_id: number; slot_code: string; quantity: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(task: Task, today: string): boolean {
  if (!task.next_execution) return false;
  return task.next_execution < today;
}

function getTreatmentDay(treatment: ActiveTreatment, today: string): number | null {
  if (!treatment.duration_days) return null;
  // T12:00:00 evita problemas de timezone — mediodía siempre es el mismo día en cualquier zona
  const start = new Date(treatment.date + 'T12:00:00');
  const current = new Date(today + 'T12:00:00');
  const diff = Math.floor((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0 || diff >= treatment.duration_days) return null;
  return diff + 1;
}

function tipoColor(t: string) {
  switch (t) {
    case 'Antibiótico': return 'bg-red-100 text-red-700 border-red-200';
    case 'Vitaminas': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Limpieza profunda': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Vacuna': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'Antiparasitario': return 'bg-orange-100 text-orange-700 border-orange-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

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
  const [activeTreatments, setActiveTreatments] = useState<ActiveTreatment[]>([]);
  const [confirmedTreatments, setConfirmedTreatments] = useState<number[]>([]); // record_ids confirmed today
  const [products, setProducts] = useState<HealthProduct[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [slots, setSlots] = useState<CageSlot[]>([]);

  const [stockSaved, setStockSaved] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [confirmStock, setConfirmStock] = useState<number | null>(null);
  const [showExtraTask, setShowExtraTask] = useState(false);
  const [extraTaskDesc, setExtraTaskDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmingTreatment, setConfirmingTreatment] = useState<number | null>(null);

  const [today, setToday] = useState(getToday);

  // Detectar cambio de día — recarga si la app quedó abierta de un día al otro
  useEffect(() => {
    const interval = setInterval(() => {
      const newToday = getToday();
      if (newToday !== today) setToday(newToday);
    }, 60000);
    return () => clearInterval(interval);
  }, [today]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      // Limpiar tareas custom completadas en días anteriores
      const { data: oldCustomCompletions } = await supabase
        .from('task_completions')
        .select('task_id')
        .eq('user_id', user.id)
        .lt('date', today);

      if (oldCustomCompletions && oldCustomCompletions.length > 0) {
        const oldIds = oldCustomCompletions.map(c => c.task_id);
        await supabase.from('tasks').update({ is_active: false }).in('id', oldIds).eq('type', 'custom');
      }

      const [tasksRes, completionsRes, slotsRes, stockRes, recordsRes, productsRes, lotsRes, confirmRes] = await Promise.all([
        supabase.from('tasks').select('id, description, type, frequency_days, next_execution, is_urgent')
          .eq('is_active', true)
          .or(`assigned_to.is.null,assigned_to.eq.${user.id}`)
          .or(`type.eq.daily,type.eq.custom,and(type.eq.periodic,next_execution.lte.${today})`)
          .order('type'),
        supabase.from('task_completions').select('task_id').eq('user_id', user.id).eq('date', today),
        supabase.from('cage_slots').select('id, lot_id, slot_code, quantity'),
        supabase.from('stock_items').select('id, name, unit, current_quantity, is_feed, bolsas_restantes, kg_por_bolsa').order('name'),
        supabase.from('health_records').select('id, type, date, lot_id, dose_applied, water_liters, duration_days, health_product_id, notes'),
        supabase.from('health_products').select('id, name, unit'),
        supabase.from('lots').select('id, code, current_quantity').eq('status', 'activo'),
        supabase.from('treatment_confirmations').select('record_id').eq('date', today),
      ]);

      if (tasksRes.data) {
        setDailyTasks(tasksRes.data.filter(t => t.type === 'daily'));
        setPeriodicTasks(tasksRes.data.filter(t => t.type === 'periodic'));
        setCustomTasks(tasksRes.data.filter(t => t.type === 'custom'));
      }
      if (completionsRes.data) setCompletedIds(completionsRes.data.map(c => c.task_id));
      if (slotsRes.data) setTotalAvesActivas(slotsRes.data.reduce((s, sl) => s + sl.quantity, 0));
      if (stockRes.data) setStockItems(stockRes.data);
      if (productsRes.data) setProducts(productsRes.data);
      if (lotsRes.data) setLots(lotsRes.data);
      if (slotsRes.data) setSlots(slotsRes.data);
      if (confirmRes.data) setConfirmedTreatments(confirmRes.data.map(c => c.record_id));

      // Filtrar tratamientos activos hoy — comparacion de strings evita bugs de timezone
      if (recordsRes.data) {
        const active = recordsRes.data.filter(r => {
          if (!r.duration_days) return false;
          // Calcular fecha fin del tratamiento (exclusive)
          const start = new Date(r.date + 'T12:00:00');
          const end = new Date(r.date + 'T12:00:00');
          end.setDate(end.getDate() + r.duration_days);
          const todayMid = new Date(today + 'T12:00:00');
          return todayMid >= start && todayMid < end;
        });
        setActiveTreatments(active);
      }
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
  }, [authLoading, user, profile, router, loadData]);

  // ── Toggle tarea ────────────────────────────────────────────────────────────
  const toggleTask = async (task: Task) => {
    if (!user) return;
    const isDone = completedIds.includes(task.id);
    if (isDone) {
      await supabase.from('task_completions').delete()
        .eq('task_id', task.id).eq('user_id', user.id).eq('date', today);
      setCompletedIds(prev => prev.filter(id => id !== task.id));
    } else {
      await supabase.from('task_completions').insert({ task_id: task.id, user_id: user.id, completed: true, date: today });
      if (task.type === 'periodic' && task.frequency_days) {
        const next = new Date(today);
        next.setDate(next.getDate() + task.frequency_days);
        await supabase.from('tasks').update({ next_execution: next.toISOString().split('T')[0], is_urgent: false }).eq('id', task.id);
      }
      setCompletedIds(prev => [...prev, task.id]);
      if (task.type === 'periodic') await loadData();
    }
  };

  // ── Confirmar tratamiento ───────────────────────────────────────────────────
  const handleConfirmTreatment = async (recordId: number) => {
    if (!user) return;
    setConfirmingTreatment(recordId);
    await supabase.from('treatment_confirmations').insert({ record_id: recordId, date: today, user_id: user.id });
    setConfirmedTreatments(prev => [...prev, recordId]);
    setConfirmingTreatment(null);
  };

  const handleUnconfirmTreatment = async (recordId: number) => {
    if (!user) return;
    await supabase.from('treatment_confirmations').delete().eq('record_id', recordId).eq('date', today);
    setConfirmedTreatments(prev => prev.filter(id => id !== recordId));
  };

  // ── Agregar tarea extra ─────────────────────────────────────────────────────
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

  // ── Insumos ─────────────────────────────────────────────────────────────────
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
          stock_item_id: item.id, quantity: 1, movement_type: 'salida', user_id: user.id, date: today,
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

  // ── Render ──────────────────────────────────────────────────────────────────
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
  const allTreatmentsConfirmed = activeTreatments.length > 0 &&
    activeTreatments.every(t => confirmedTreatments.includes(t.id));

  const TaskItem = ({ task }: { task: Task }) => {
    const isDone = completedIds.includes(task.id);
    const overdue = task.type === 'periodic' && isOverdue(task, today);
    const showUrgent = overdue && !isDone;

    return (
      <div onClick={() => toggleTask(task)}
        className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all active:scale-[0.99]
          ${isDone ? 'bg-gray-50 border-gray-100'
            : showUrgent ? 'bg-red-50 border-red-200 hover:border-red-300'
            : 'bg-white border-gray-200 hover:border-yellow-300'}`}>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
          ${isDone ? 'bg-yellow-400 border-yellow-400' : showUrgent ? 'border-red-400' : 'border-gray-300'}`}>
          {isDone && <svg viewBox="0 0 12 12" className="w-3 h-3"><polyline points="2,6 5,9 10,3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>}
        </div>
        <div className="flex-1">
          <span className={`text-base ${isDone ? 'line-through text-gray-400' : showUrgent ? 'text-red-700 font-semibold' : 'text-gray-800'}`}>
            {task.description}
          </span>
          {task.type === 'periodic' && task.frequency_days && (
            <p className="text-xs text-gray-400 mt-0.5">Cada {task.frequency_days} días</p>
          )}
        </div>
        {showUrgent && <span className="badge-urgent shrink-0">Urgente</span>}
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

        {/* ── Tratamientos activos ── */}
        {activeTreatments.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tratamientos de hoy</h3>
              {allTreatmentsConfirmed && (
                <span className="text-[10px] font-black text-green-600 bg-green-100 px-2 py-0.5 rounded-full">✓ Todos aplicados</span>
              )}
            </div>
            <div className="space-y-3">
              {activeTreatments.map(t => {
                const day = getTreatmentDay(t, today);
                if (!day) return null;
                const product = products.find(p => p.id === t.health_product_id);
                const lot = lots.find(l => l.id === t.lot_id);
                const confirmed = confirmedTreatments.includes(t.id);

                return (
                  <div key={t.id}
                    className={`rounded-2xl border-2 p-4 transition-all
                      ${confirmed ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>

                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex flex-wrap gap-2">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase ${tipoColor(t.type)}`}>
                          {t.type}
                        </span>
                        <span className="text-[10px] font-bold text-blue-600 bg-white border border-blue-100 px-2 py-0.5 rounded-full">
                          Día {day} de {t.duration_days}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500 font-medium">
                        {lot ? lot.code : 'Todo el plantel'}
                      </span>
                    </div>

                    {/* Dosis */}
                    {product && t.dose_applied !== null && (
                      <div className="bg-white rounded-xl px-4 py-3 border border-blue-100 mb-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Dosis a aplicar</p>
                        <p className="text-2xl font-black text-blue-700">
                          {t.dose_applied} <span className="text-base font-bold">{product.unit}</span>
                        </p>
                        {t.water_liters && t.water_liters > 0 && (
                          <p className="text-xs text-blue-500 mt-1 font-medium">
                            {(t.dose_applied / t.water_liters).toFixed(2)} {product.unit} por litro de agua
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{product.name}</p>
                      </div>
                    )}

                    {t.notes && (
                      <p className="text-xs text-gray-500 italic mb-3">{t.notes}</p>
                    )}

                    {/* Confirmación */}
                    {confirmed ? (
                      <button
                        onClick={() => handleUnconfirmTreatment(t.id)}
                        className="w-full py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-green-600 transition-colors"
                      >
                        <Check className="w-4 h-4" /> Aplicado — tocar para desmarcar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConfirmTreatment(t.id)}
                        disabled={confirmingTreatment === t.id}
                        className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                      >
                        <FlaskConical className="w-4 h-4" />
                        {confirmingTreatment === t.id ? 'Confirmando...' : 'Confirmar aplicación'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tareas diarias */}
        {dailyTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="w-4 h-4 text-yellow-500" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tareas diarias</h3>
            </div>
            <div className="space-y-2">{dailyTasks.map(t => <TaskItem key={t.id} task={t} />)}</div>
          </div>
        )}

        {/* Tareas periódicas */}
        {periodicTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tareas periódicas</h3>
            </div>
            <div className="space-y-2">{periodicTasks.map(t => <TaskItem key={t.id} task={t} />)}</div>
          </div>
        )}

        {/* Tareas asignadas */}
        {customTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-blue-400" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tareas asignadas</h3>
            </div>
            <div className="space-y-2">{customTasks.map(t => <TaskItem key={t.id} task={t} />)}</div>
          </div>
        )}

        {/* Agregar tarea extra */}
        <div>
          {!showExtraTask ? (
            <button onClick={() => setShowExtraTask(true)}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-yellow-300 hover:text-yellow-500 transition-all flex items-center justify-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Agregar tarea extra
            </button>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs text-gray-400">Desaparecerá automáticamente al día siguiente de completarse.</p>
              <input className="input-base" placeholder="Descripción de la tarea..."
                value={extraTaskDesc} onChange={e => setExtraTaskDesc(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <button onClick={handleAddExtraTask} className="btn-primary flex-1 py-2 text-sm">Agregar</button>
                <button onClick={() => setShowExtraTask(false)} className="btn-secondary px-3 py-2"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>

        {/* ── Baja rápida (plegada) ── */}
        {user && (
          <BajaRapida slots={slots} lots={lots} userId={user.id} today={today} onSaved={loadData} collapsible />
        )}

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

      </div>
    </div>
  );
}

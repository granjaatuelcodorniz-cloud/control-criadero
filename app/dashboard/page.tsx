'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Egg, CheckSquare, AlertTriangle, ClipboardList, Plus, X } from 'lucide-react';

type Task = {
  id: number;
  description: string;
  type: 'daily' | 'periodic' | 'custom';
  frequency_days?: number;
  is_urgent?: boolean;
};

type Lot = {
  id: number;
  code: string;
  current_quantity: number;
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

export default function Dashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [periodicTasks, setPeriodicTasks] = useState<Task[]>([]);
  const [customTasks, setCustomTasks] = useState<Task[]>([]);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState('');
  const [lossQty, setLossQty] = useState(1);
  const [lossReason, setLossReason] = useState('');
  const [showLossForm, setShowLossForm] = useState(false);
  const [showExtraTask, setShowExtraTask] = useState(false);
  const [extraTaskDesc, setExtraTaskDesc] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingLoss, setSavingLoss] = useState(false);
  const [lossSaved, setLossSaved] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [selectedStock, setSelectedStock] = useState('');
  const [stockQty, setStockQty] = useState(1);
  const [stockNotes, setStockNotes] = useState('');
  const [showStockForm, setShowStockForm] = useState(false);
  const [stockSaved, setStockSaved] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [confirmStock, setConfirmStock] = useState<number | null>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role === 'owner') { router.push('/dashboard/admin'); return; }
    loadData();
  }, [authLoading, user, profile]);

  const loadData = async () => {
    if (!user) return;

    const { data: tasksData } = await supabase
      .from('tasks')
      .select('id, description, type, frequency_days, is_urgent')
      .eq('is_active', true)
      .or(`assigned_to.is.null,assigned_to.eq.${user.id}`)
      .order('type');

    if (tasksData) {
      setDailyTasks(tasksData.filter(t => t.type === 'daily'));
      setPeriodicTasks(tasksData.filter(t => t.type === 'periodic'));
      setCustomTasks(tasksData.filter(t => t.type === 'custom'));
    }

    const { data: completions } = await supabase
      .from('task_completions')
      .select('task_id')
      .eq('user_id', user.id)
      .eq('date', today);
    if (completions) setCompletedIds(completions.map(c => c.task_id));

    const { data: lotsData } = await supabase
      .from('lots')
      .select('id, code, current_quantity')
      .order('start_date', { ascending: false });
    if (lotsData) {
      setLots(lotsData);
      if (lotsData.length > 0) setSelectedLot(String(lotsData[0].id));
    }

    const { data: stockData } = await supabase
      .from('stock_items')
      .select('id, name, unit, current_quantity, is_feed, bolsas_restantes, kg_por_bolsa')
      .order('name');
    if (stockData) {
      setStockItems(stockData);
      const nonFeed = stockData.find(i => !i.is_feed);
      if (nonFeed) setSelectedStock(String(nonFeed.id));
    }

    setLoading(false);
  };

  const toggleTask = async (taskId: number) => {
    if (!user) return;
    const isDone = completedIds.includes(taskId);
    if (isDone) {
      await supabase.from('task_completions').delete()
        .eq('task_id', taskId).eq('user_id', user.id).eq('date', today);
      setCompletedIds(prev => prev.filter(id => id !== taskId));
    } else {
      await supabase.from('task_completions').insert({
        task_id: taskId, user_id: user.id, completed: true, date: today
      });
      setCompletedIds(prev => [...prev, taskId]);
    }
  };

  const handleSaveLoss = async () => {
    if (!selectedLot || !user) return;
    setSavingLoss(true);

    await supabase.from('lot_losses').insert({
      lot_id: Number(selectedLot), quantity: lossQty,
      reason: lossReason.trim() || null, user_id: user.id, date: today
    });

    await supabase.from('lots')
      .update({ current_quantity: (lots.find(l => String(l.id) === selectedLot)?.current_quantity ?? 1) - lossQty })
      .eq('id', Number(selectedLot));

    setSavingLoss(false);
    setLossSaved(true);
    setLossQty(1);
    setLossReason('');
    setShowLossForm(false);
    await loadData();
    setTimeout(() => setLossSaved(false), 3000);
  };

  const handleAddExtraTask = async () => {
    if (!extraTaskDesc.trim() || !user) return;

    await supabase.from('tasks').insert({
      description: extraTaskDesc.trim(),
      type: 'custom', is_active: true,
      created_by: user.id, assigned_to: user.id,
    });

    setExtraTaskDesc('');
    setShowExtraTask(false);
    await loadData();
  };

  const handleStockConsume = async () => {
    if (!selectedStock || stockQty <= 0 || !user) return;
    setSavingStock(true);

    const item = stockItems.find(i => String(i.id) === selectedStock);
    if (!item) { setSavingStock(false); return; }

    const { error: movError } = await supabase.from('stock_movements').insert({
      stock_item_id: Number(selectedStock),
      quantity: stockQty, movement_type: 'salida',
      notes: stockNotes.trim() || null,
      user_id: user.id, date: today,
    });

    if (movError) {
      alert('Error: ' + movError.message);
      setSavingStock(false);
      return;
    }

    await supabase.from('stock_items')
      .update({ current_quantity: Math.max(0, item.current_quantity - stockQty) })
      .eq('id', Number(selectedStock));

    setStockQty(1);
    setStockNotes('');
    setShowStockForm(false);
    setSavingStock(false);
    setStockSaved(true);
    setTimeout(() => setStockSaved(false), 3000);
    await loadData();
  };

  const handleOpenBolsa = async () => {
    const feedItem = stockItems.find(i => i.is_feed);
    if (!feedItem?.kg_por_bolsa || !feedItem?.bolsas_restantes || !user) return;
    setSavingStock(true);

    await supabase.from('stock_items').update({
      current_quantity: Math.max(0, feedItem.current_quantity - feedItem.kg_por_bolsa),
      bolsas_restantes: Math.max(0, feedItem.bolsas_restantes - 1),
    }).eq('id', feedItem.id);

    await supabase.from('stock_movements').insert({
      stock_item_id: feedItem.id,
      quantity: feedItem.kg_por_bolsa,
      movement_type: 'salida',
      notes: 'Bolsa abierta',
      user_id: user.id, date: today,
    });

    setSavingStock(false);
    setStockSaved(true);
    setTimeout(() => setStockSaved(false), 3000);
    await loadData();
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );

  if (!profile) return null;

  const totalTasks = dailyTasks.length + periodicTasks.length + customTasks.length;
  const doneTasks = completedIds.length;
  const feedItem = stockItems.find(i => i.is_feed);
  const otherItems = stockItems.filter(i => !i.is_feed);

  const TaskItem = ({ task }: { task: Task }) => {
    const isDone = completedIds.includes(task.id);
    return (
      <div
        onClick={() => toggleTask(task.id)}
        className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all active:scale-[0.99]
          ${isDone ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:border-yellow-300'}`}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
          ${isDone ? 'bg-yellow-400 border-yellow-400' : 'border-gray-300'}`}>
          {isDone && <svg viewBox="0 0 12 12" className="w-3 h-3"><polyline points="2,6 5,9 10,3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
        </div>
        <div className="flex-1">
          <span className={`text-base ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {task.description}
          </span>
          {task.frequency_days && (
            <p className="text-xs text-gray-400 mt-0.5">Cada {task.frequency_days} días</p>
          )}
        </div>
        {task.is_urgent && !isDone && <span className="badge-urgent">Urgente</span>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} />

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

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
              <div
                className="bg-yellow-400 h-2 rounded-full transition-all"
                style={{ width: totalTasks > 0 ? `${Math.round((doneTasks / totalTasks) * 100)}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        <Link href="/dashboard/huevos" className="btn-primary w-full py-4 text-base rounded-2xl">
          <Egg className="w-5 h-5" />
          Registrar huevos del día
        </Link>

        {dailyTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="w-4 h-4 text-yellow-500" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tareas diarias</h3>
            </div>
            <div className="space-y-2">
              {dailyTasks.map(t => <TaskItem key={t.id} task={t} />)}
            </div>
          </div>
        )}

        {periodicTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tareas periódicas</h3>
            </div>
            <div className="space-y-2">
              {periodicTasks.map(t => <TaskItem key={t.id} task={t} />)}
            </div>
          </div>
        )}

        {customTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-blue-400" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tareas asignadas</h3>
            </div>
            <div className="space-y-2">
              {customTasks.map(t => <TaskItem key={t.id} task={t} />)}
            </div>
          </div>
        )}

        <div>
          {!showExtraTask ? (
            <button
              onClick={() => setShowExtraTask(true)}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-yellow-300 hover:text-yellow-500 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" /> Agregar tarea extra
            </button>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <input
                className="input-base"
                placeholder="Descripción de la tarea..."
                value={extraTaskDesc}
                onChange={e => setExtraTaskDesc(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleAddExtraTask} className="btn-primary flex-1 py-2 text-sm">Agregar</button>
                <button onClick={() => setShowExtraTask(false)} className="btn-secondary px-3 py-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Baja de ave</h3>
            {lossSaved && <span className="text-green-600 text-xs font-medium">✓ Guardado</span>}
          </div>
          {!showLossForm ? (
            <button onClick={() => setShowLossForm(true)}
              className="btn-secondary w-full py-3 text-sm rounded-2xl">
              Registrar baja de ave
            </button>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Lote</label>
                <select className="input-base" value={selectedLot}
                  onChange={e => setSelectedLot(e.target.value)}>
                  {lots.map(l => (
                    <option key={l.id} value={l.id}>{l.code} — {l.current_quantity} aves</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Cantidad</label>
                <input type="number" min="1" className="input-base" value={lossQty}
                  onChange={e => setLossQty(Math.max(1, Number(e.target.value)))} />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Motivo (opcional)</label>
                <input className="input-base" placeholder="Ej: muerte natural..."
                  value={lossReason} onChange={e => setLossReason(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveLoss} disabled={savingLoss}
                  className="btn-primary flex-1 py-3 text-sm">
                  {savingLoss ? 'Guardando...' : 'Confirmar baja'}
                </button>
                <button onClick={() => setShowLossForm(false)} className="btn-secondary px-3">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Insumos</h3>
            {stockSaved && <span className="text-green-600 text-xs font-medium">✓ Guardado</span>}
          </div>

          <div className="space-y-2">
            {feedItem && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">Alimento</p>
                  <p className="text-xs text-gray-400">
                    {feedItem.bolsas_restantes != null
                      ? `${feedItem.bolsas_restantes} bolsas · ${feedItem.current_quantity} kg`
                      : `${feedItem.current_quantity} kg`}
                  </p>
                </div>
                <button
                  onClick={handleOpenBolsa}
                  disabled={savingStock || !feedItem.bolsas_restantes}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  {savingStock ? '...' : 'Abrí una bolsa'}
                </button>
              </div>
            )}

            {otherItems.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.current_quantity} {item.unit}</p>
                </div>
                {confirmStock === item.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedStock(String(item.id));
                        setShowStockForm(true);
                        setConfirmStock(null);
                      }}
                      className="btn-primary px-3 py-2 text-sm"
                    >
                      Confirmar
                    </button>
                    <button onClick={() => setConfirmStock(null)} className="btn-secondary px-3 py-2">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmStock(item.id)}
                    className="btn-secondary px-4 py-2 text-sm"
                  >
                    Usar
                  </button>
                )}
              </div>
            ))}
          </div>

          {showStockForm && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4 mt-2">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Insumo</label>
                <select className="input-base" value={selectedStock}
                  onChange={e => setSelectedStock(e.target.value)}>
                  {otherItems.map(i => (
                    <option key={i.id} value={i.id}>{i.name} — {i.current_quantity} {i.unit}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Cantidad usada</label>
                <input type="number" min="1" className="input-base" value={stockQty}
                  onChange={e => setStockQty(Math.max(1, Number(e.target.value)))} />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Nota (opcional)</label>
                <input className="input-base" placeholder="Ej: limpieza bebederos..."
                  value={stockNotes} onChange={e => setStockNotes(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleStockConsume} disabled={savingStock}
                  className="btn-primary flex-1 py-3 text-sm">
                  {savingStock ? 'Guardando...' : 'Confirmar uso'}
                </button>
                <button onClick={() => setShowStockForm(false)} className="btn-secondary px-3">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Egg, CheckSquare, AlertTriangle, ClipboardList,
  Plus, X, ChevronDown, ChevronUp, Skull, AlertCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type LossType = 'muerte' | 'descarte' | 'venta';

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
  status: string;
};

type CageSlot = {
  id: number;
  lot_id: number;
  slot_code: string;
  quantity: number;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TOTAL_COLS = 42;

const LOSS_TYPE_LABELS: Record<LossType, string> = {
  muerte: 'Muerte',
  descarte: 'Descarte',
  venta: 'Venta',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotColor(qty: number) {
  if (qty === 0) return 'bg-gray-100 text-gray-300 border-gray-200';
  if (qty >= 8) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (qty >= 6) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  return 'bg-red-50 text-red-600 border-red-200';
}

// ─── Slot Grid ────────────────────────────────────────────────────────────────

function SlotGrid({
  slots,
  onSlotPress,
}: {
  slots: CageSlot[];
  onSlotPress: (slot: CageSlot) => void;
}) {
  const slotMap = new Map(slots.map(s => [s.slot_code, s]));

  return (
    <div className="overflow-x-auto -mx-1">
      <div className="inline-block min-w-full px-1">
        <div className="flex gap-1 mb-1 ml-7">
          {Array.from({ length: TOTAL_COLS }, (_, i) => i + 1).map(col => {
            const hasSlot = ROWS.some(r => slotMap.has(`${r}${col}`));
            return (
              <div key={col} className={`w-7 text-center text-[9px] font-bold ${hasSlot ? 'text-gray-500' : 'text-gray-200'}`}>
                {col}
              </div>
            );
          })}
        </div>
        {ROWS.map(row => (
          <div key={row} className="flex items-center gap-1 mb-1">
            <div className="w-6 text-center text-[10px] font-black text-gray-400">{row}</div>
            {Array.from({ length: TOTAL_COLS }, (_, i) => i + 1).map(col => {
              const code = `${row}${col}`;
              const slot = slotMap.get(code);
              if (!slot) return <div key={code} className="w-7 h-7 rounded border border-dashed border-gray-100 bg-gray-50" />;
              return (
                <button key={code}
                  disabled={slot.quantity === 0}
                  onClick={() => onSlotPress(slot)}
                  className={`w-7 h-7 rounded border text-[9px] font-black transition-all
                    ${slotColor(slot.quantity)}
                    ${slot.quantity > 0 ? 'hover:scale-110 hover:shadow-md active:scale-95 cursor-pointer' : 'cursor-default'}`}
                  title={`${code}: ${slot.quantity} aves`}>
                  {slot.quantity}
                </button>
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-3 mt-2 ml-7 flex-wrap">
          {[
            { cls: 'bg-emerald-50 border-emerald-200', label: '8-9 aves' },
            { cls: 'bg-yellow-50 border-yellow-200', label: '6-7 aves' },
            { cls: 'bg-red-50 border-red-200', label: '< 6 aves' },
          ].map(({ cls, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded border ${cls}`} />
              <span className="text-[9px] text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Loss Modal ───────────────────────────────────────────────────────────────

function LossModal({
  slot, lot, onClose, onConfirm,
}: {
  slot: CageSlot;
  lot: Lot;
  onClose: () => void;
  onConfirm: (qty: number, reason: string, lossType: LossType) => Promise<void>;
}) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [lossType, setLossType] = useState<LossType>('muerte');
  const [saving, setSaving] = useState(false);

  const handle = async () => {
    if (qty < 1 || qty > slot.quantity) return;
    setSaving(true);
    await onConfirm(qty, reason, lossType);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900">Registrar Baja</h3>
            <p className="text-sm text-gray-400 mt-0.5">
              Boca <span className="font-bold text-gray-700">{slot.slot_code}</span> — {lot.code}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="bg-gray-50 rounded-2xl p-3 text-center">
          <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Aves actuales en esta boca</p>
          <p className="text-3xl font-black text-gray-800">{slot.quantity}</p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Tipo de baja</label>
          <div className="flex gap-2 mt-2">
            {(['muerte', 'descarte', 'venta'] as LossType[]).map(type => (
              <button key={type} onClick={() => setLossType(type)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all
                  ${lossType === type
                    ? type === 'muerte' ? 'bg-red-50 border-red-400 text-red-600'
                      : type === 'descarte' ? 'bg-orange-50 border-orange-400 text-orange-600'
                      : 'bg-blue-50 border-blue-400 text-blue-600'
                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                {LOSS_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Cantidad</label>
          <div className="flex items-center gap-3 mt-2">
            <button onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors">−</button>
            <input type="number" min={1} max={slot.quantity} value={qty}
              onChange={e => setQty(Math.min(slot.quantity, Math.max(1, Number(e.target.value))))}
              className="input-base text-center text-2xl font-black h-11 py-0" />
            <button onClick={() => setQty(q => Math.min(slot.quantity, q + 1))}
              className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors">+</button>
          </div>
          {qty === slot.quantity && (
            <p className="text-xs text-red-500 mt-1.5 ml-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Esta boca quedará vacía y se liberará
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Motivo (opcional)</label>
          <input className="input-base mt-1"
            placeholder={lossType === 'muerte' ? 'Ej: enfermedad, accidente...' : lossType === 'descarte' ? 'Ej: fin de ciclo...' : 'Ej: venta a terceros...'}
            value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        <button onClick={handle} disabled={saving}
          className="btn-primary w-full py-4 text-base shadow-yellow-200 shadow-lg">
          <Skull className="w-4 h-4" />
          {saving ? 'Guardando...' : `Confirmar ${qty} ${LOSS_TYPE_LABELS[lossType].toLowerCase()}${qty > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ─── Lot Section (grilla por lote) ────────────────────────────────────────────

function LotSection({
  lot, slots, onLoss,
}: {
  lot: Lot;
  slots: CageSlot[];
  onLoss: (slot: CageSlot, lot: Lot) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalAves = slots.reduce((s, sl) => s + sl.quantity, 0);
  const activeSlots = slots.filter(s => s.quantity > 0).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-left">
            <p className="font-bold text-gray-800">{lot.code}</p>
            <p className="text-xs text-gray-400">{totalAves} aves · {activeSlots} bocas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-black text-gray-800">{totalAves}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 font-medium mb-3">Tocá una boca para registrar una baja</p>
          <SlotGrid slots={slots} onSlotPress={slot => onLoss(slot, lot)} />
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [periodicTasks, setPeriodicTasks] = useState<Task[]>([]);
  const [customTasks, setCustomTasks] = useState<Task[]>([]);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [slots, setSlots] = useState<CageSlot[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  const [selectedSlot, setSelectedSlot] = useState<{ slot: CageSlot; lot: Lot } | null>(null);

  const [loading, setLoading] = useState(false);
  const [lossSaved, setLossSaved] = useState(false);
  const [stockSaved, setStockSaved] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [confirmStock, setConfirmStock] = useState<number | null>(null);
  const [showExtraTask, setShowExtraTask] = useState(false);
  const [extraTaskDesc, setExtraTaskDesc] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [tasksRes, completionsRes, lotsRes, slotsRes, stockRes] = await Promise.all([
        supabase.from('tasks').select('id, description, type, frequency_days, is_urgent')
          .eq('is_active', true)
          .or(`assigned_to.is.null,assigned_to.eq.${user.id}`)
          .order('type'),
        supabase.from('task_completions').select('task_id').eq('user_id', user.id).eq('date', today),
        supabase.from('lots').select('id, code, current_quantity, status')
          .eq('status', 'activo')
          .order('start_date', { ascending: false }),
        supabase.from('cage_slots').select('*'),
        supabase.from('stock_items').select('id, name, unit, current_quantity, is_feed, bolsas_restantes, kg_por_bolsa').order('name'),
      ]);

      if (tasksRes.data) {
        setDailyTasks(tasksRes.data.filter(t => t.type === 'daily'));
        setPeriodicTasks(tasksRes.data.filter(t => t.type === 'periodic'));
        setCustomTasks(tasksRes.data.filter(t => t.type === 'custom'));
      }
      if (completionsRes.data) setCompletedIds(completionsRes.data.map(c => c.task_id));
      if (lotsRes.data) setLots(lotsRes.data);
      if (slotsRes.data) setSlots(slotsRes.data);
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

  const handleLoss = async (qty: number, reason: string, lossType: LossType) => {
    if (!selectedSlot || !user) return;
    const { slot, lot } = selectedSlot;
    const newQty = slot.quantity - qty;

    await Promise.all([
      supabase.from('lot_losses').insert({
        lot_id: lot.id, date: today, quantity: qty,
        reason: reason || null, slot_code: slot.slot_code,
        loss_type: lossType, user_id: user.id,
      }),
      supabase.from('lots').update({ current_quantity: lot.current_quantity - qty }).eq('id', lot.id),
      newQty === 0
        ? supabase.from('cage_slots').delete().eq('id', slot.id)
        : supabase.from('cage_slots').update({ quantity: newQty }).eq('id', slot.id),
    ]);

    setSelectedSlot(null);
    setLossSaved(true);
    setTimeout(() => setLossSaved(false), 3000);
    await loadData();
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

        {/* Huevos CTA */}
        <Link href="/dashboard/huevos" className="btn-primary w-full py-4 text-base rounded-2xl">
          <Egg className="w-5 h-5" /> Registrar huevos del día
        </Link>

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

        {/* Bajas por boca */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Skull className="w-4 h-4 text-red-400" />
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Bajas de aves</h3>
            </div>
            {lossSaved && <span className="text-green-600 text-xs font-bold">✓ Guardado</span>}
          </div>
          {lots.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No hay lotes activos</p>
          ) : (
            <div className="space-y-2">
              {lots.map(lot => (
                <LotSection
                  key={lot.id}
                  lot={lot}
                  slots={slots.filter(s => s.lot_id === lot.id && s.quantity > 0)}
                  onLoss={(slot, lot) => setSelectedSlot({ slot, lot })}
                />
              ))}
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

      </div>

      {/* Loss modal */}
      {selectedSlot && (
        <LossModal
          slot={selectedSlot.slot}
          lot={selectedSlot.lot}
          onClose={() => setSelectedSlot(null)}
          onConfirm={handleLoss}
        />
      )}
    </div>
  );
}
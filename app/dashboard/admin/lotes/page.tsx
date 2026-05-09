'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { Plus, X, ChevronDown, ChevronUp, Skull, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

type Lot = {
  id: number;
  code: string;
  start_date: string;
  initial_quantity: number;
  current_quantity: number;
  notes: string | null;
};

type CageSlot = {
  id: number;
  lot_id: number;
  slot_code: string;
  quantity: number;
};

type Loss = {
  id: number;
  date: string;
  quantity: number;
  reason: string | null;
  lot_id: number;
  slot_code: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TOTAL_COLS = 42;
const DEFAULT_QTY_PER_SLOT = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlotCodes(rows: string[], colFrom: number, colTo: number): string[] {
  const codes: string[] = [];
  for (let col = colFrom; col <= colTo; col++) {
    for (const row of rows) {
      codes.push(`${row}${col}`);
    }
  }
  return codes;
}

function slotColor(qty: number) {
  if (qty === 0) return 'bg-gray-100 text-gray-300 border-gray-200';
  if (qty >= 8) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (qty >= 6) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  return 'bg-red-50 text-red-600 border-red-200';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SlotGrid({
  slots,
  onSlotPress,
  interactive = false,
}: {
  slots: CageSlot[];
  onSlotPress?: (slot: CageSlot) => void;
  interactive?: boolean;
}) {
  const slotMap = new Map(slots.map(s => [s.slot_code, s]));

  return (
    <div className="overflow-x-auto -mx-1">
      <div className="inline-block min-w-full px-1">
        {/* Column headers */}
        <div className="flex gap-1 mb-1 ml-7">
          {Array.from({ length: TOTAL_COLS }, (_, i) => i + 1).map(col => {
            const hasSlot = ROWS.some(r => slotMap.has(`${r}${col}`));
            return (
              <div
                key={col}
                className={`w-7 text-center text-[9px] font-bold ${hasSlot ? 'text-gray-500' : 'text-gray-200'}`}
              >
                {col}
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {ROWS.map(row => (
          <div key={row} className="flex items-center gap-1 mb-1">
            <div className="w-6 text-center text-[10px] font-black text-gray-400">{row}</div>
            {Array.from({ length: TOTAL_COLS }, (_, i) => i + 1).map(col => {
              const code = `${row}${col}`;
              const slot = slotMap.get(code);
              if (!slot) {
                return (
                  <div
                    key={code}
                    className="w-7 h-7 rounded border border-dashed border-gray-100 bg-gray-50"
                  />
                );
              }
              return (
                <button
                  key={code}
                  disabled={!interactive || slot.quantity === 0}
                  onClick={() => onSlotPress?.(slot)}
                  className={`w-7 h-7 rounded border text-[9px] font-black transition-all
                    ${slotColor(slot.quantity)}
                    ${interactive && slot.quantity > 0 ? 'hover:scale-110 hover:shadow-md active:scale-95 cursor-pointer' : 'cursor-default'}
                  `}
                  title={`${code}: ${slot.quantity} aves`}
                >
                  {slot.quantity}
                </button>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2 ml-7">
          {[
            { cls: 'bg-emerald-50 border-emerald-200', label: '8-9 aves' },
            { cls: 'bg-yellow-50 border-yellow-200', label: '6-7 aves' },
            { cls: 'bg-red-50 border-red-200', label: '< 6 aves' },
            { cls: 'bg-gray-100 border-gray-200', label: 'Vacía' },
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
  slot,
  lot,
  onClose,
  onConfirm,
}: {
  slot: CageSlot;
  lot: Lot;
  onClose: () => void;
  onConfirm: (qty: number, reason: string) => Promise<void>;
}) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handle = async () => {
    if (qty < 1 || qty > slot.quantity) return;
    setSaving(true);
    await onConfirm(qty, reason);
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
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Cantidad de bajas</label>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors"
            >−</button>
            <input
              type="number"
              min={1}
              max={slot.quantity}
              value={qty}
              onChange={e => setQty(Math.min(slot.quantity, Math.max(1, Number(e.target.value))))}
              className="input-base text-center text-2xl font-black h-11 py-0"
            />
            <button
              onClick={() => setQty(q => Math.min(slot.quantity, q + 1))}
              className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors"
            >+</button>
          </div>
          {qty === slot.quantity && (
            <p className="text-xs text-red-500 mt-1.5 ml-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Esta boca quedará vacía
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Motivo (opcional)</label>
          <input
            className="input-base mt-1"
            placeholder="Ej: enfermedad, accidente..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <button
          onClick={handle}
          disabled={saving}
          className="btn-primary w-full py-4 text-base shadow-yellow-200 shadow-lg"
        >
          <Skull className="w-4 h-4" />
          {saving ? 'Guardando...' : `Confirmar ${qty} baja${qty > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ─── New Lot Form ─────────────────────────────────────────────────────────────

function NewLotForm({
  onSave,
  onCancel,
  occupiedSlots,
}: {
  onSave: (data: {
    code: string;
    start_date: string;
    notes: string;
    slots: { slot_code: string; quantity: number }[];
  }) => Promise<void>;
  onCancel: () => void;
  occupiedSlots: Set<string>;
}) {
  const [code, setCode] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Range selector
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set(ROWS));
  const [colFrom, setColFrom] = useState(1);
  const [colTo, setColTo] = useState(1);
  const [defaultQty, setDefaultQty] = useState(DEFAULT_QTY_PER_SLOT);

  // Extra individual slots
  const [extraSlot, setExtraSlot] = useState('');
  const [extraSlots, setExtraSlots] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);

  const toggleRow = (row: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(row) ? next.delete(row) : next.add(row);
      return next;
    });
  };

  const rangeSlots = generateSlotCodes(
    ROWS.filter(r => selectedRows.has(r)),
    Math.min(colFrom, colTo),
    Math.max(colFrom, colTo)
  );

  const allNewSlots = [...new Set([...rangeSlots, ...extraSlots])];
  const conflicts = allNewSlots.filter(s => occupiedSlots.has(s));
  const validSlots = allNewSlots.filter(s => !occupiedSlots.has(s));

  const addExtraSlot = () => {
    const code = extraSlot.trim().toUpperCase();
    const valid = /^[A-F]([1-9]|[1-3][0-9]|4[0-2])$/.test(code);
    if (!valid || extraSlots.includes(code) || rangeSlots.includes(code)) return;
    setExtraSlots(prev => [...prev, code]);
    setExtraSlot('');
  };

  const totalAves = validSlots.length * defaultQty;

  const handleSave = async () => {
    if (!code.trim() || validSlots.length === 0) return;
    setSaving(true);
    await onSave({
      code: code.trim(),
      start_date: date,
      notes,
      slots: validSlots.map(s => ({ slot_code: s, quantity: defaultQty })),
    });
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-yellow-100 p-6 space-y-6 shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Registrar Nuevo Lote</h3>
        <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nombre / Código del Lote</label>
          <input className="input-base mt-1" placeholder="Ej: Nov-25"
            value={code} onChange={e => setCode(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Fecha Ingreso</label>
            <input className="input-base mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Aves por boca</label>
            <input className="input-base mt-1" type="number" min={1} max={12}
              value={defaultQty} onChange={e => setDefaultQty(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Notas</label>
          <textarea className="input-base mt-1 h-16 py-3" placeholder="Detalles del lote..."
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Range selector */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase">Asignar Bocas — Rango</p>

        <div>
          <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Filas</p>
          <div className="flex gap-2 flex-wrap">
            {ROWS.map(row => (
              <button
                key={row}
                onClick={() => toggleRow(row)}
                className={`w-10 h-10 rounded-xl font-black text-sm border-2 transition-all
                  ${selectedRows.has(row)
                    ? 'bg-yellow-400 border-yellow-400 text-gray-900 shadow-sm'
                    : 'bg-white border-gray-200 text-gray-400 hover:border-yellow-200'
                  }`}
              >
                {row}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Columnas</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 mb-1 block">Desde</label>
              <input className="input-base text-center font-bold" type="number" min={1} max={TOTAL_COLS}
                value={colFrom} onChange={e => setColFrom(Number(e.target.value))} />
            </div>
            <div className="text-gray-300 font-bold mt-4">→</div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 mb-1 block">Hasta</label>
              <input className="input-base text-center font-bold" type="number" min={1} max={TOTAL_COLS}
                value={colTo} onChange={e => setColTo(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Extra slots */}
        <div>
          <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Bocas adicionales sueltas</p>
          <div className="flex gap-2">
            <input
              className="input-base"
              placeholder="Ej: A15"
              value={extraSlot}
              onChange={e => setExtraSlot(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addExtraSlot()}
            />
            <button onClick={addExtraSlot}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-600 transition-colors whitespace-nowrap">
              + Agregar
            </button>
          </div>
          {extraSlots.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {extraSlots.map(s => (
                <span key={s} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-lg text-xs font-bold">
                  {s}
                  <button onClick={() => setExtraSlots(prev => prev.filter(x => x !== s))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Bocas seleccionadas</span>
            <span className="font-bold text-gray-800">{validSlots.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total aves estimadas</span>
            <span className="font-black text-gray-800">{totalAves}</span>
          </div>
          {conflicts.length > 0 && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-2 mt-1">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-600">Bocas ocupadas (se excluyen automáticamente)</p>
                <p className="text-xs text-red-400 mt-0.5">{conflicts.join(', ')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || validSlots.length === 0 || !code.trim()}
        className="btn-primary w-full py-4 text-lg shadow-yellow-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Guardando...' : `Confirmar Ingreso — ${validSlots.length} bocas`}
      </button>
    </div>
  );
}

// ─── Lot Card ─────────────────────────────────────────────────────────────────

function LotCard({
  lot,
  slots,
  losses,
  isOwner,
  onLoss,
}: {
  lot: Lot;
  slots: CageSlot[];
  losses: Loss[];
  isOwner: boolean;
  onLoss: (slot: CageSlot) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const totalSlots = slots.length;
  const emptySlots = slots.filter(s => s.quantity === 0).length;
  const activeSlots = totalSlots - emptySlots;
  const totalAves = slots.reduce((s, sl) => s + sl.quantity, 0);
  const pctSupervivencia = lot.initial_quantity > 0
    ? Math.round((totalAves / lot.initial_quantity) * 100)
    : 100;

  const recentLosses = losses
    .filter(l => l.lot_id === lot.id)
    .slice(0, 3);

  const survivalColor = pctSupervivencia > 90
    ? 'bg-emerald-400'
    : pctSupervivencia > 75
      ? 'bg-yellow-400'
      : 'bg-red-400';

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-gray-900">{lot.code}</h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Desde {new Date(lot.start_date + 'T12:00:00').toLocaleDateString('es-AR', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-gray-900">{totalAves}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase">aves activas</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Inicial', value: lot.initial_quantity, cls: 'bg-gray-50 text-gray-700' },
            { label: 'Bocas activas', value: `${activeSlots}/${totalSlots}`, cls: 'bg-blue-50 text-blue-700 border border-blue-100' },
            { label: 'Bajas total', value: lot.initial_quantity - totalAves, cls: 'bg-red-50 text-red-600 border border-red-100' },
          ].map((m, i) => (
            <div key={i} className={`rounded-2xl p-3 text-center ${m.cls}`}>
              <p className="text-[9px] font-bold uppercase mb-1 opacity-60 leading-tight">{m.label}</p>
              <p className="text-lg font-black leading-none">{m.value}</p>
            </div>
          ))}
        </div>

        {/* Survival bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase">
            <span>Supervivencia</span>
            <span>{pctSupervivencia}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${survivalColor}`}
              style={{ width: `${pctSupervivencia}%` }}
            />
          </div>
        </div>
      </div>

      {/* Recent losses */}
      {recentLosses.length > 0 && (
        <div className="mx-5 mb-4 bg-gray-50 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <Skull className="w-3 h-3" />
            <p className="text-[10px] font-bold uppercase">Bajas recientes</p>
          </div>
          <div className="space-y-1.5">
            {recentLosses.map(b => (
              <div key={b.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-400">
                  {new Date(b.date + 'T12:00:00').toLocaleDateString('es-AR')}
                </span>
                {b.slot_code && (
                  <span className="font-bold text-gray-500 bg-gray-200 px-1.5 rounded text-[10px]">
                    {b.slot_code}
                  </span>
                )}
                <span className="font-bold text-red-500">−{b.quantity}</span>
                <span className="text-gray-300 italic truncate max-w-[80px]">
                  {b.reason || 'Sin motivo'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toggle grid */}
      {totalSlots > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span>{expanded ? 'Ocultar' : 'Ver'} grilla de bocas</span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {expanded && (
            <div className="px-5 pb-5 pt-2">
              {isOwner || true /* collaborators can also register losses */ ? (
                <p className="text-[10px] text-gray-400 mb-3 font-medium">
                  Tocá una boca para registrar una baja
                </p>
              ) : null}
              <SlotGrid
                slots={slots}
                onSlotPress={onLoss}
                interactive
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Lotes() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [lots, setLots] = useState<Lot[]>([]);
  const [slots, setSlots] = useState<CageSlot[]>([]);
  const [losses, setLosses] = useState<Loss[]>([]);

  const [showNewLot, setShowNewLot] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ slot: CageSlot; lot: Lot } | null>(null);

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [lotsRes, slotsRes, lossesRes] = await Promise.all([
        supabase.from('lots').select('*').order('start_date', { ascending: false }),
        supabase.from('cage_slots').select('*'),
        supabase.from('lot_losses').select('*').order('date', { ascending: false }),
      ]);
      if (lotsRes.data) setLots(lotsRes.data);
      if (slotsRes.data) setSlots(slotsRes.data);
      if (lossesRes.data) setLosses(lossesRes.data);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }
    loadData();
  }, [authLoading, user, profile]);

  // ── Create lot + slots ──────────────────────────────────────────────────────
  const handleNewLot = async (data: {
    code: string;
    start_date: string;
    notes: string;
    slots: { slot_code: string; quantity: number }[];
  }) => {
    if (!user) return;
    const totalQty = data.slots.reduce((s, sl) => s + sl.quantity, 0);

    const { data: lotData, error: lotError } = await supabase
      .from('lots')
      .insert({
        code: data.code,
        start_date: data.start_date,
        initial_quantity: totalQty,
        current_quantity: totalQty,
        notes: data.notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (lotError || !lotData) {
      console.error('Error creando lote:', lotError);
      return;
    }

    const slotRows = data.slots.map(s => ({
      lot_id: lotData.id,
      slot_code: s.slot_code,
      quantity: s.quantity,
    }));

    const { error: slotsError } = await supabase.from('cage_slots').insert(slotRows);
    if (slotsError) {
      console.error('Error creando bocas:', slotsError);
      return;
    }

    setShowNewLot(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadData();
  };

  // ── Register loss ───────────────────────────────────────────────────────────
  const handleLoss = async (qty: number, reason: string) => {
    if (!selectedSlot || !user) return;
    const { slot, lot } = selectedSlot;

    const newQty = slot.quantity - qty;
    const today = new Date().toISOString().split('T')[0];

    await Promise.all([
      supabase.from('cage_slots').update({ quantity: newQty }).eq('id', slot.id),
      supabase.from('lot_losses').insert({
        lot_id: lot.id,
        date: today,
        quantity: qty,
        reason: reason || null,
        slot_code: slot.slot_code,
        user_id: user.id,
      }),
      supabase.from('lots').update({
        current_quantity: lot.current_quantity - qty,
      }).eq('id', lot.id),
    ]);

    setSelectedSlot(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadData();
  };

  // ── Derived data ────────────────────────────────────────────────────────────
  const occupiedSlots = new Set(slots.filter(s => s.quantity > 0).map(s => s.slot_code));

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 font-medium">Cargando lotes...</p>
      </div>
    </div>
  );

  if (!profile) return null;

  const isOwner = profile.role === 'owner';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        userName={profile.full_name}
        role={profile.role}
        backHref="/dashboard/admin"
        backLabel="Dashboard"
      />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Title row */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-gray-900">Gestión de Lotes</h2>
          {saved && (
            <span className="text-green-600 text-sm font-bold animate-pulse">✓ Guardado</span>
          )}
        </div>

        {/* Summary chips */}
        {lots.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {[
              {
                label: 'Lotes activos',
                value: lots.length,
                cls: 'bg-white border border-gray-100',
              },
              {
                label: 'Total aves',
                value: slots.reduce((s, sl) => s + sl.quantity, 0),
                cls: 'bg-yellow-50 border border-yellow-100 text-yellow-800',
              },
              {
                label: 'Bocas ocupadas',
                value: occupiedSlots.size,
                cls: 'bg-blue-50 border border-blue-100 text-blue-800',
              },
            ].map(chip => (
              <div key={chip.label} className={`rounded-2xl px-4 py-2 shadow-sm ${chip.cls}`}>
                <p className="text-[10px] font-bold uppercase opacity-60">{chip.label}</p>
                <p className="text-xl font-black leading-tight">{chip.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Lot cards */}
        <div className="space-y-4">
          {lots.map(lot => (
            <LotCard
              key={lot.id}
              lot={lot}
              slots={slots.filter(s => s.lot_id === lot.id)}
              losses={losses}
              isOwner={isOwner}
              onLoss={slot => setSelectedSlot({ slot, lot })}
            />
          ))}
        </div>

        {/* New lot */}
        {isOwner && (
          !showNewLot ? (
            <button
              onClick={() => setShowNewLot(true)}
              className="w-full py-5 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400
                hover:border-yellow-400 hover:text-yellow-600 hover:bg-yellow-50/50
                transition-all flex items-center justify-center gap-3 font-bold"
            >
              <Plus className="w-5 h-5" /> Agregar Nuevo Lote
            </button>
          ) : (
            <NewLotForm
              onSave={handleNewLot}
              onCancel={() => setShowNewLot(false)}
              occupiedSlots={occupiedSlots}
            />
          )
        )}
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
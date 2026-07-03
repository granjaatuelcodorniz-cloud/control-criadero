'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import {
  Plus, X, ChevronDown, ChevronUp, Skull,
  AlertCircle, ArrowLeftRight, Archive,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ToastViewport, useToast } from '@/components/Feedback';
import { assertSupabaseAllOk, assertSupabaseOk, getErrorMessage } from '@/lib/supabase-ops';
import ReorderModal from '@/components/ReorderModal';
import AgregarTandaModal from '@/components/AgregarTandaModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type LotStatus = 'activo' | 'en_retiro' | 'cerrado';
type LossType = 'muerte' | 'descarte' | 'venta';

type Lot = {
  id: number;
  code: string;
  start_date: string;
  initial_quantity: number;
  current_quantity: number;
  notes: string | null;
  status: LotStatus;
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
  loss_type: LossType;
  lot_id: number;
  slot_code: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TOTAL_COLS = 42;
const DEFAULT_QTY_PER_SLOT = 8;

const LOSS_TYPE_LABELS: Record<LossType, string> = {
  muerte: 'Muerte',
  descarte: 'Descarte',
  venta: 'Venta',
};

const LOSS_TYPE_COLORS: Record<LossType, string> = {
  muerte: 'text-red-500',
  descarte: 'text-orange-500',
  venta: 'text-blue-500',
};

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

// ─── SlotGrid ─────────────────────────────────────────────────────────────────

function SlotGrid({
  slots,
  onSlotPress,
  interactive = false,
  reorderMode = false,
  selectedOrigin = null,
  allLotSlots = [],
  freeSlots = [],
}: {
  slots: CageSlot[];
  onSlotPress?: (slot: CageSlot) => void;
  interactive?: boolean;
  reorderMode?: boolean;
  selectedOrigin?: CageSlot | null;
  allLotSlots?: CageSlot[];
  freeSlots?: string[];
}) {
  const slotMap = new Map(slots.map(s => [s.slot_code, s]));
  const allSlotMap = new Map(allLotSlots.map(s => [s.slot_code, s]));
  const freeSet = new Set(freeSlots);

  const getSlotStyle = (slot: CageSlot) => {
    if (reorderMode) {
      if (selectedOrigin?.id === slot.id)
        return 'bg-blue-500 text-white border-blue-500 scale-110 shadow-lg shadow-blue-200 ring-2 ring-blue-300';
      if (selectedOrigin && slot.quantity < 9)
        return 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 cursor-pointer';
      if (!selectedOrigin && slot.quantity > 0)
        return `${slotColor(slot.quantity)} hover:scale-110 hover:shadow-md cursor-pointer`;
      return `${slotColor(slot.quantity)} opacity-40 cursor-default`;
    }
    return `${slotColor(slot.quantity)} ${interactive && slot.quantity > 0 ? 'hover:scale-110 hover:shadow-md active:scale-95 cursor-pointer' : 'cursor-default'}`;
  };

  return (
    <div className="overflow-x-auto -mx-1">
      <div className="inline-block min-w-full px-1">
        <div className="flex gap-1 mb-1 ml-7">
          {Array.from({ length: TOTAL_COLS }, (_, i) => i + 1).map(col => {
            const hasSlot = ROWS.some(r =>
              slotMap.has(`${r}${col}`) ||
              allSlotMap.has(`${r}${col}`) ||
              (reorderMode && selectedOrigin && freeSet.has(`${r}${col}`))
            );
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
              const allSlot = allSlotMap.get(code);
              const isFree = freeSet.has(code);

              if (!slot && !allSlot) {
                if (reorderMode && selectedOrigin && isFree) {
                  return (
                    <button key={code}
                      onClick={() => onSlotPress?.({ id: -1, lot_id: selectedOrigin.lot_id, slot_code: code, quantity: 0 })}
                      className="w-7 h-7 rounded border-2 border-dashed border-emerald-300 bg-emerald-50 hover:bg-emerald-100 transition-all"
                      title={`${code}: libre`} />
                  );
                }
                return <div key={code} className="w-7 h-7 rounded border border-dashed border-gray-100 bg-gray-50" />;
              }

              if (!slot && allSlot && allSlot.quantity === 0) {
                if (reorderMode && selectedOrigin) {
                  return (
                    <button key={code}
                      onClick={() => onSlotPress?.(allSlot)}
                      className="w-7 h-7 rounded border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 transition-all"
                      title={`${code}: vacía`} />
                  );
                }
                return <div key={code} className="w-7 h-7 rounded border border-dashed border-gray-100 bg-gray-50" />;
              }

              if (!slot) return <div key={code} className="w-7 h-7 rounded border border-dashed border-gray-100 bg-gray-50" />;

              const isDisabled = reorderMode
                ? !selectedOrigin && slot.quantity === 0
                : !interactive || slot.quantity === 0;

              return (
                <button key={code} disabled={isDisabled} onClick={() => onSlotPress?.(slot)}
                  className={`w-7 h-7 rounded border text-[9px] font-black transition-all ${getSlotStyle(slot)}`}
                  title={`${code}: ${slot.quantity} aves`}>
                  {slot.quantity}
                </button>
              );
            })}
          </div>
        ))}

        {(() => {
          const items = reorderMode
            ? [
                { cls: 'bg-blue-500 border-blue-500', label: 'Origen' },
                { cls: 'bg-blue-50 border-blue-300', label: 'Destino (mismo lote)' },
                { cls: 'bg-emerald-50 border-emerald-300', label: 'Boca libre (traslado)' },
              ]
            : [
                { cls: 'bg-emerald-50 border-emerald-200', label: '8-9 aves' },
                { cls: 'bg-yellow-50 border-yellow-200', label: '6-7 aves' },
                { cls: 'bg-red-50 border-red-200', label: '< 6 aves' },
              ];
          return (
            <div className="flex items-center gap-3 mt-2 ml-7 flex-wrap">
              {items.map(({ cls, label }) => (
                <div key={label} className="flex items-center gap-1">
                  <div className={`w-3 h-3 rounded border ${cls}`} />
                  <span className="text-[9px] text-gray-400">{label}</span>
                </div>
              ))}
            </div>
          );
        })()}
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
            placeholder={lossType === 'muerte' ? 'Ej: enfermedad, accidente...' : lossType === 'descarte' ? 'Ej: fin de ciclo productivo...' : 'Ej: venta a terceros...'}
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

// ─── Retire Lot Modal ─────────────────────────────────────────────────────────

function RetireLotModal({
  lot, totalAves, onClose, onConfirm,
}: {
  lot: Lot;
  totalAves: number;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900">Retirar Lote</h3>
            <p className="text-sm text-gray-400 mt-0.5">{lot.code}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 space-y-1">
          <p className="text-xs font-bold text-orange-600 uppercase">Esto va a:</p>
          <p className="text-sm text-orange-700">• Registrar {totalAves} aves como descarte</p>
          <p className="text-sm text-orange-700">• Liberar todas las bocas del lote</p>
          <p className="text-sm text-orange-700">• Marcar el lote como cerrado</p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Motivo del retiro</label>
          <input className="input-base mt-1" placeholder="Ej: fin de ciclo productivo, venta..."
            value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        <button
          onClick={async () => { setSaving(true); await onConfirm(reason); setSaving(false); }}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-base transition-colors flex items-center justify-center gap-2"
        >
          <Archive className="w-4 h-4" />
          {saving ? 'Procesando...' : `Confirmar retiro — ${totalAves} aves`}
        </button>
      </div>
    </div>
  );
}

// ─── New Lot Form ─────────────────────────────────────────────────────────────

function NewLotForm({
  onSave, onCancel, occupiedSlots,
}: {
  onSave: (data: { code: string; start_date: string; notes: string; slots: { slot_code: string; quantity: number }[] }) => Promise<void>;
  onCancel: () => void;
  occupiedSlots: Set<string>;
}) {
  const [code, setCode] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set(ROWS));
  const [colFrom, setColFrom] = useState(1);
  const [colTo, setColTo] = useState(1);
  const [defaultQty, setDefaultQty] = useState(DEFAULT_QTY_PER_SLOT);
  const [extraSlot, setExtraSlot] = useState('');
  const [extraSlots, setExtraSlots] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleRow = (row: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  };

  const rangeSlots = generateSlotCodes(ROWS.filter(r => selectedRows.has(r)), Math.min(colFrom, colTo), Math.max(colFrom, colTo));
  const allNewSlots = [...new Set([...rangeSlots, ...extraSlots])];
  const conflicts = allNewSlots.filter(s => occupiedSlots.has(s));
  const validSlots = allNewSlots.filter(s => !occupiedSlots.has(s));
  const totalAves = validSlots.length * defaultQty;

  const addExtraSlot = () => {
    const val = extraSlot.trim().toUpperCase();
    const valid = /^[A-F]([1-9]|[1-3][0-9]|4[0-2])$/.test(val);
    if (!valid || extraSlots.includes(val) || rangeSlots.includes(val)) return;
    setExtraSlots(prev => [...prev, val]);
    setExtraSlot('');
  };

  const handleSave = async () => {
    if (!code.trim() || validSlots.length === 0) return;
    setSaving(true);
    await onSave({ code: code.trim(), start_date: date, notes, slots: validSlots.map(s => ({ slot_code: s, quantity: defaultQty })) });
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

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nombre / Código</label>
          <input className="input-base mt-1" placeholder="Ej: Nov-25" value={code} onChange={e => setCode(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Fecha Ingreso</label>
            <input className="input-base mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Aves por boca</label>
            <input className="input-base mt-1" type="number" min={1} max={12} value={defaultQty} onChange={e => setDefaultQty(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Notas</label>
          <textarea className="input-base mt-1 h-16 py-3" placeholder="Detalles del lote..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs font-bold text-gray-500 uppercase">Asignar Bocas — Rango</p>
        <div>
          <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Filas</p>
          <div className="flex gap-2 flex-wrap">
            {ROWS.map(row => (
              <button key={row} onClick={() => toggleRow(row)}
                className={`w-10 h-10 rounded-xl font-black text-sm border-2 transition-all
                  ${selectedRows.has(row) ? 'bg-yellow-400 border-yellow-400 text-gray-900 shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:border-yellow-200'}`}>
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
              <input className="input-base text-center font-bold" type="number" min={1} max={TOTAL_COLS} value={colFrom} onChange={e => setColFrom(Number(e.target.value))} />
            </div>
            <div className="text-gray-300 font-bold mt-4">→</div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 mb-1 block">Hasta</label>
              <input className="input-base text-center font-bold" type="number" min={1} max={TOTAL_COLS} value={colTo} onChange={e => setColTo(Number(e.target.value))} />
            </div>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Bocas adicionales sueltas</p>
          <div className="flex gap-2">
            <input className="input-base" placeholder="Ej: A15" value={extraSlot}
              onChange={e => setExtraSlot(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExtraSlot()} />
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
                  <button onClick={() => setExtraSlots(prev => prev.filter(x => x !== s))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
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
                <p className="text-xs font-bold text-red-600">Bocas ocupadas (se excluyen)</p>
                <p className="text-xs text-red-400 mt-0.5">{conflicts.join(', ')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={handleSave} disabled={saving || validSlots.length === 0 || !code.trim()}
        className="btn-primary w-full py-4 text-lg shadow-yellow-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? 'Guardando...' : `Confirmar Ingreso — ${validSlots.length} bocas`}
      </button>
    </div>
  );
}

// ─── Lot Card ─────────────────────────────────────────────────────────────────

function LotCard({
  lot, slots, losses, isOwner, freeSlots, onLoss, onReorder, onRetire, onAddTanda,
}: {
  lot: Lot;
  slots: CageSlot[];
  losses: Loss[];
  isOwner: boolean;
  freeSlots: string[];
  onLoss: (slot: CageSlot) => void;
  onReorder: (origin: CageSlot, destination: CageSlot, isNewSlot: boolean) => void;
  onRetire: (lot: Lot) => void;
  onAddTanda?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [originSlot, setOriginSlot] = useState<CageSlot | null>(null);

  const isClosed = lot.status === 'cerrado';
  const totalSlots = slots.length;
  const activeSlots = slots.filter(s => s.quantity > 0).length;
  const totalAves = slots.reduce((s, sl) => s + sl.quantity, 0);
  const pctSupervivencia = lot.initial_quantity > 0 ? Math.round((totalAves / lot.initial_quantity) * 100) : 100;
  const recentLosses = losses.filter(l => l.lot_id === lot.id).slice(0, 3);
  const survivalColor = pctSupervivencia > 90 ? 'bg-emerald-400' : pctSupervivencia > 75 ? 'bg-yellow-400' : 'bg-red-400';

  const handleSlotPressReorder = (slot: CageSlot) => {
    if (slot.id === -1) {
      if (originSlot) { onReorder(originSlot, slot, true); setOriginSlot(null); }
      return;
    }
    if (!originSlot) { if (slot.quantity > 0) setOriginSlot(slot); return; }
    if (originSlot.id === slot.id) { setOriginSlot(null); return; }
    if (slot.quantity >= 9) return;
    onReorder(originSlot, slot, false);
    setOriginSlot(null);
  };

  const exitReorder = () => { setReorderMode(false); setOriginSlot(null); };

  if (isClosed) {
    return (
      <div className="bg-gray-50 rounded-3xl border border-gray-200 p-4 flex items-center justify-between opacity-60">
        <div>
          <p className="font-bold text-gray-500">{lot.code}</p>
          <p className="text-xs text-gray-400">{lot.initial_quantity} aves iniciales · Cerrado</p>
        </div>
        <span className="text-[10px] font-bold uppercase bg-gray-200 text-gray-500 px-2 py-1 rounded-full">Cerrado</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-gray-900">{lot.code}</h3>
              {lot.status === 'en_retiro' && (
                <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">En retiro</span>
              )}
            </div>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Desde {new Date(lot.start_date + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-gray-900">{totalAves}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase">aves activas</p>
          </div>
        </div>

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

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase">
            <span>Supervivencia</span><span>{pctSupervivencia}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className={`h-2 rounded-full transition-all duration-700 ${survivalColor}`} style={{ width: `${pctSupervivencia}%` }} />
          </div>
        </div>

        {onAddTanda && (
          <button onClick={onAddTanda}
            className="mt-4 w-full py-2.5 rounded-xl border-2 border-dashed border-yellow-200 text-yellow-600 hover:bg-yellow-50 text-sm font-bold flex items-center justify-center gap-2 transition-all">
            <Plus className="w-4 h-4" /> Agregar tanda
          </button>
        )}
      </div>

      {recentLosses.length > 0 && (
        <div className="mx-5 mb-4 bg-gray-50 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <Skull className="w-3 h-3" />
            <p className="text-[10px] font-bold uppercase">Bajas recientes</p>
          </div>
          <div className="space-y-1.5">
            {recentLosses.map(b => (
              <div key={b.id} className="flex items-center justify-between text-xs gap-2">
                <span className="text-gray-400 shrink-0">{new Date(b.date + 'T12:00:00').toLocaleDateString('es-AR')}</span>
                {b.slot_code && <span className="font-bold text-gray-500 bg-gray-200 px-1.5 rounded text-[10px] shrink-0">{b.slot_code}</span>}
                <span className={`text-[10px] font-bold shrink-0 ${LOSS_TYPE_COLORS[b.loss_type]}`}>{LOSS_TYPE_LABELS[b.loss_type]}</span>
                <span className="font-bold text-red-500 shrink-0">−{b.quantity}</span>
                <span className="text-gray-300 italic truncate">{b.reason || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex border-t border-gray-100">
        {totalSlots > 0 && (
          <button onClick={() => { setExpanded(e => !e); if (expanded) exitReorder(); }}
            className="flex-1 flex items-center justify-between px-5 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors">
            <span>{expanded ? 'Ocultar' : 'Ver'} bocas</span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
        {isOwner && totalAves > 0 && (
          <button onClick={() => onRetire(lot)}
            className="flex items-center gap-1.5 px-4 py-3 text-xs font-bold text-orange-500 hover:bg-orange-50 transition-colors border-l border-gray-100">
            <Archive className="w-3.5 h-3.5" /> Retirar
          </button>
        )}
      </div>

      {expanded && totalSlots > 0 && (
        <div className="px-5 pb-5 pt-2">
          <div className="flex items-center justify-between mb-3">
            {reorderMode ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-blue-600 uppercase">
                  {originSlot ? `Origen: ${originSlot.slot_code} — tocá destino` : 'Tocá la boca origen'}
                </span>
                {originSlot && <button onClick={() => setOriginSlot(null)} className="text-[10px] text-gray-400 underline">cancelar</button>}
              </div>
            ) : (
              <p className="text-[10px] text-gray-400 font-medium">Tocá una boca para registrar una baja</p>
            )}
            {isOwner && (
              <button onClick={() => reorderMode ? exitReorder() : setReorderMode(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                  ${reorderMode ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                <ArrowLeftRight className="w-3 h-3" />
                {reorderMode ? 'Salir' : 'Reacomodar'}
              </button>
            )}
          </div>

          <SlotGrid
            slots={slots}
            onSlotPress={reorderMode ? handleSlotPressReorder : onLoss}
            interactive={!reorderMode}
            reorderMode={reorderMode}
            selectedOrigin={originSlot}
            allLotSlots={slots}
            freeSlots={reorderMode && originSlot ? freeSlots : []}
          />
        </div>
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
  const [reorderPair, setReorderPair] = useState<{ origin: CageSlot; destination: CageSlot; isNewSlot: boolean } | null>(null);
  const [retireLot, setRetireLot] = useState<Lot | null>(null);
  const [tandaLot, setTandaLot] = useState<Lot | null>(null);

  const [loading, setLoading] = useState(false);
  const { toast, showToast, hideToast } = useToast();

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
  }, [authLoading, user, profile, router, loadData]);

  const flash = (message: string) => showToast(message);

  const handleNewLot = async (data: { code: string; start_date: string; notes: string; slots: { slot_code: string; quantity: number }[] }) => {
    if (!user) return;
    const totalQty = data.slots.reduce((s, sl) => s + sl.quantity, 0);
    try {
      const { data: lotData } = assertSupabaseOk(await supabase.from('lots')
        .insert({ code: data.code, start_date: data.start_date, initial_quantity: totalQty, current_quantity: totalQty, notes: data.notes || null, created_by: user.id })
        .select().single());
      if (!lotData) throw new Error('No se pudo crear el lote.');
      assertSupabaseOk(await supabase.from('cage_slots').insert(data.slots.map(s => ({ lot_id: lotData.id, slot_code: s.slot_code, quantity: s.quantity }))));
      setShowNewLot(false);
      flash('Lote creado');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo crear el lote.'), 'error');
    }
  };

  const handleLoss = async (qty: number, reason: string, lossType: LossType) => {
    if (!selectedSlot || !user) return;
    const { slot, lot } = selectedSlot;
    const newQty = slot.quantity - qty;
    const today = new Date().toISOString().split('T')[0];

    try {
      const results = await Promise.all([
        supabase.from('lot_losses').insert({ lot_id: lot.id, date: today, quantity: qty, reason: reason || null, slot_code: slot.slot_code, loss_type: lossType, user_id: user.id }),
        supabase.from('lots').update({ current_quantity: lot.current_quantity - qty }).eq('id', lot.id),
        newQty === 0
          ? supabase.from('cage_slots').delete().eq('id', slot.id)
          : supabase.from('cage_slots').update({ quantity: newQty }).eq('id', slot.id),
      ]);
      assertSupabaseAllOk(results, 'No se pudo registrar la baja.');
      setSelectedSlot(null);
      flash('Baja registrada');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo registrar la baja.'), 'error');
    }
  };

  const handleReorder = async (qty: number) => {
    if (!reorderPair) return;
    const { origin, destination, isNewSlot } = reorderPair;
    const newOriginQty = origin.quantity - qty;

    try {
      const results = await Promise.all([
        newOriginQty === 0
          ? supabase.from('cage_slots').delete().eq('id', origin.id)
          : supabase.from('cage_slots').update({ quantity: newOriginQty }).eq('id', origin.id),
        isNewSlot || destination.id === -1
          ? supabase.from('cage_slots').insert({ lot_id: origin.lot_id, slot_code: destination.slot_code, quantity: qty })
          : supabase.from('cage_slots').update({ quantity: destination.quantity + qty }).eq('id', destination.id),
      ]);
      assertSupabaseAllOk(results, 'No se pudo mover las aves.');
      setReorderPair(null);
      flash('Aves movidas');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo mover las aves.'), 'error');
    }
  };

  const handleRetire = async (reason: string) => {
    if (!retireLot || !user) return;
    const lotSlots = slots.filter(s => s.lot_id === retireLot.id);
    const totalAves = lotSlots.reduce((s, sl) => s + sl.quantity, 0);
    const today = new Date().toISOString().split('T')[0];

    try {
      const results = await Promise.all([
        supabase.from('lot_losses').insert({ lot_id: retireLot.id, date: today, quantity: totalAves, reason: reason || 'Retiro de lote', loss_type: 'descarte', user_id: user.id, slot_code: null }),
        supabase.from('cage_slots').delete().eq('lot_id', retireLot.id),
        supabase.from('lots').update({ status: 'cerrado', current_quantity: 0 }).eq('id', retireLot.id),
      ]);
      assertSupabaseAllOk(results, 'No se pudo retirar el lote.');
      setRetireLot(null);
      flash('Lote retirado');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo retirar el lote.'), 'error');
    }
  };

  // Agregar una tanda a un lote existente (misma partida en dos entregas):
  // crea las bocas y suma las aves al inicial y al actual.
  const handleAgregarTanda = async (lot: Lot, nuevos: { slot_code: string; quantity: number }[]) => {
    if (!user || nuevos.length === 0) return;
    const total = nuevos.reduce((s, x) => s + x.quantity, 0);
    try {
      assertSupabaseOk(await supabase.from('cage_slots').insert(nuevos.map(s => ({ lot_id: lot.id, slot_code: s.slot_code, quantity: s.quantity }))));
      assertSupabaseOk(await supabase.from('lots').update({
        current_quantity: lot.current_quantity + total,
        initial_quantity: lot.initial_quantity + total,
      }).eq('id', lot.id));
      setTandaLot(null);
      flash(`Tanda agregada · ${total} aves`);
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo agregar la tanda.'), 'error');
    }
  };

  const occupiedSlotCodes = new Set(slots.filter(s => s.quantity > 0).map(s => s.slot_code));
  const allPossibleCodes = ROWS.flatMap(r => Array.from({ length: TOTAL_COLS }, (_, i) => `${r}${i + 1}`));
  const freeSlotCodes = allPossibleCodes.filter(c => !occupiedSlotCodes.has(c));
  const activeLots = lots.filter(l => l.status !== 'cerrado');
  const closedLots = lots.filter(l => l.status === 'cerrado');

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
      <ToastViewport toast={toast} onClose={hideToast} />
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-gray-900">Gestión de Lotes</h2>
        </div>

        {activeLots.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Lotes activos', value: activeLots.length, cls: 'bg-white border border-gray-100' },
              { label: 'Total aves', value: slots.reduce((s, sl) => s + sl.quantity, 0), cls: 'bg-yellow-50 border border-yellow-100 text-yellow-800' },
              { label: 'Bocas ocupadas', value: occupiedSlotCodes.size, cls: 'bg-blue-50 border border-blue-100 text-blue-800' },
              { label: 'Bocas libres', value: freeSlotCodes.length, cls: 'bg-emerald-50 border border-emerald-100 text-emerald-800' },
            ].map(chip => (
              <div key={chip.label} className={`rounded-2xl px-4 py-2 shadow-sm ${chip.cls}`}>
                <p className="text-[10px] font-bold uppercase opacity-60">{chip.label}</p>
                <p className="text-xl font-black leading-tight">{chip.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {activeLots.map(lot => (
            <LotCard key={lot.id} lot={lot}
              slots={slots.filter(s => s.lot_id === lot.id)}
              losses={losses} isOwner={isOwner} freeSlots={freeSlotCodes}
              onLoss={slot => setSelectedSlot({ slot, lot })}
              onReorder={(origin, destination, isNewSlot) => setReorderPair({ origin, destination, isNewSlot })}
              onRetire={setRetireLot}
              onAddTanda={() => setTandaLot(lot)}
            />
          ))}
        </div>

        {isOwner && (
          !showNewLot ? (
            <button onClick={() => setShowNewLot(true)}
              className="w-full py-5 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-yellow-400 hover:text-yellow-600 hover:bg-yellow-50/50 transition-all flex items-center justify-center gap-3 font-bold">
              <Plus className="w-5 h-5" /> Agregar Nuevo Lote
            </button>
          ) : (
            <NewLotForm onSave={handleNewLot} onCancel={() => setShowNewLot(false)} occupiedSlots={occupiedSlotCodes} />
          )
        )}

        {closedLots.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Lotes cerrados</p>
            {closedLots.map(lot => (
              <LotCard key={lot.id} lot={lot} slots={[]} losses={losses} isOwner={isOwner}
                freeSlots={[]} onLoss={() => {}} onReorder={() => {}} onRetire={() => {}} />
            ))}
          </div>
        )}
      </div>

      {selectedSlot && (
        <LossModal slot={selectedSlot.slot} lot={selectedSlot.lot}
          onClose={() => setSelectedSlot(null)} onConfirm={handleLoss} />
      )}

      {reorderPair && (
        <ReorderModal origin={reorderPair.origin} destination={reorderPair.destination}
          isNewSlot={reorderPair.isNewSlot} onClose={() => setReorderPair(null)} onConfirm={handleReorder} />
      )}

      {retireLot && (
        <RetireLotModal lot={retireLot}
          totalAves={slots.filter(s => s.lot_id === retireLot.id).reduce((s, sl) => s + sl.quantity, 0)}
          onClose={() => setRetireLot(null)} onConfirm={handleRetire} />
      )}

      {tandaLot && (
        <AgregarTandaModal lot={tandaLot} occupiedSlots={occupiedSlotCodes}
          onClose={() => setTandaLot(null)} onConfirm={slots => handleAgregarTanda(tandaLot, slots)} />
      )}
    </div>
  );
}

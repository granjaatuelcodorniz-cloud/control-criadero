'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import { useRouter } from 'next/navigation';
import {
  X, ChevronDown, ChevronUp, Skull,
  AlertCircle, ArrowLeftRight, MoveRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type LossType = 'muerte' | 'descarte' | 'venta';

type Lot = {
  id: number;
  code: string;
  start_date: string;
  initial_quantity: number;
  current_quantity: number;
  status: string;
};

type CageSlot = {
  id: number;
  lot_id: number;
  slot_code: string;
  quantity: number;
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

// ─── SlotGrid ─────────────────────────────────────────────────────────────────

function SlotGrid({
  slots,
  onSlotPress,
  interactive = false,
  reorderMode = false,
  selectedOrigin = null,
  freeSlots = [],
}: {
  slots: CageSlot[];
  onSlotPress?: (slot: CageSlot) => void;
  interactive?: boolean;
  reorderMode?: boolean;
  selectedOrigin?: CageSlot | null;
  freeSlots?: string[];
}) {
  const slotMap = new Map(slots.map(s => [s.slot_code, s]));
  const freeSet = new Set(freeSlots);

  const getSlotStyle = (slot: CageSlot) => {
    if (reorderMode) {
      if (selectedOrigin?.id === slot.id)
        return 'bg-blue-500 text-white border-blue-500 scale-110 shadow-lg ring-2 ring-blue-300';
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
            const hasSlot = ROWS.some(r => slotMap.has(`${r}${col}`) || (reorderMode && selectedOrigin && freeSet.has(`${r}${col}`)));
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
              const isFree = freeSet.has(code);

              if (!slot) {
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

// ─── Reorder Modal ────────────────────────────────────────────────────────────

function ReorderModal({
  origin, destination, isNewSlot, onClose, onConfirm,
}: {
  origin: CageSlot;
  destination: CageSlot;
  isNewSlot: boolean;
  onClose: () => void;
  onConfirm: (qty: number) => Promise<void>;
}) {
  const maxMovable = isNewSlot ? origin.quantity : Math.min(origin.quantity, 9 - destination.quantity);
  const [qty, setQty] = useState(isNewSlot ? origin.quantity : Math.min(maxMovable, 1));
  const [saving, setSaving] = useState(false);

  const handle = async () => {
    if (qty < 1 || qty > maxMovable) return;
    setSaving(true);
    await onConfirm(qty);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900">{isNewSlot ? 'Trasladar Boca' : 'Mover Aves'}</h3>
            <p className="text-sm text-gray-400 mt-0.5">{isNewSlot ? 'La boca origen se liberará' : 'Reacomodamiento entre bocas'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-blue-400 mb-1">Origen</p>
            <p className="text-xl font-black text-blue-700">{origin.slot_code}</p>
            <p className="text-xs text-blue-400 mt-0.5">{origin.quantity} aves</p>
          </div>
          <MoveRight className="w-5 h-5 text-gray-300 shrink-0" />
          <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-emerald-400 mb-1">{isNewSlot ? 'Nueva boca' : 'Destino'}</p>
            <p className="text-xl font-black text-emerald-700">{destination.slot_code}</p>
            <p className="text-xs text-emerald-400 mt-0.5">
              {isNewSlot ? `${origin.quantity} aves` : `${destination.quantity} → ${destination.quantity + qty}`}
            </p>
          </div>
        </div>

        {!isNewSlot && (
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase ml-1">
              Cantidad a mover <span className="text-gray-300 font-normal">(máx. {maxMovable})</span>
            </label>
            <div className="flex items-center gap-3 mt-2">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors">−</button>
              <input type="number" min={1} max={maxMovable} value={qty}
                onChange={e => setQty(Math.min(maxMovable, Math.max(1, Number(e.target.value))))}
                className="input-base text-center text-2xl font-black h-11 py-0" />
              <button onClick={() => setQty(q => Math.min(maxMovable, q + 1))}
                className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors">+</button>
            </div>
            {qty === origin.quantity && (
              <p className="text-xs text-amber-500 mt-1.5 ml-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> La boca origen quedará vacía y se liberará
              </p>
            )}
          </div>
        )}

        {isNewSlot && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
            <p className="text-xs text-amber-700 font-medium">
              Se moverán todas las aves ({origin.quantity}) a la boca {destination.slot_code}. La boca {origin.slot_code} quedará libre.
            </p>
          </div>
        )}

        <button onClick={handle} disabled={saving}
          className="btn-primary w-full py-4 text-base shadow-yellow-200 shadow-lg">
          <ArrowLeftRight className="w-4 h-4" />
          {saving ? 'Moviendo...' : isNewSlot ? `Trasladar ${origin.quantity} aves` : `Mover ${qty} ave${qty > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ─── Lot Card ─────────────────────────────────────────────────────────────────

function LotCard({
  lot, slots, freeSlots, onLoss, onReorder,
}: {
  lot: Lot;
  slots: CageSlot[];
  freeSlots: string[];
  onLoss: (slot: CageSlot) => void;
  onReorder: (origin: CageSlot, destination: CageSlot, isNewSlot: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [originSlot, setOriginSlot] = useState<CageSlot | null>(null);

  const totalAves = slots.reduce((s, sl) => s + sl.quantity, 0);
  const activeSlots = slots.filter(s => s.quantity > 0).length;
  const pctSupervivencia = lot.initial_quantity > 0 ? Math.round((totalAves / lot.initial_quantity) * 100) : 100;
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

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-gray-900">{lot.code}</h3>
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
            { label: 'Bocas activas', value: `${activeSlots}/${slots.length}`, cls: 'bg-blue-50 text-blue-700 border border-blue-100' },
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
      </div>

      {slots.length > 0 && (
        <>
          <button onClick={() => { setExpanded(e => !e); if (expanded) exitReorder(); }}
            className="w-full flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors">
            <span>{expanded ? 'Ocultar' : 'Ver'} bocas</span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {expanded && (
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
                <button onClick={() => reorderMode ? exitReorder() : setReorderMode(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                    ${reorderMode ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <ArrowLeftRight className="w-3 h-3" />
                  {reorderMode ? 'Salir' : 'Reacomodar'}
                </button>
              </div>

              <SlotGrid
                slots={slots}
                onSlotPress={reorderMode ? handleSlotPressReorder : onLoss}
                interactive={!reorderMode}
                reorderMode={reorderMode}
                selectedOrigin={originSlot}
                freeSlots={reorderMode && originSlot ? freeSlots : []}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LotesColaboradora() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [lots, setLots] = useState<Lot[]>([]);
  const [slots, setSlots] = useState<CageSlot[]>([]);

  const [selectedSlot, setSelectedSlot] = useState<{ slot: CageSlot; lot: Lot } | null>(null);
  const [reorderPair, setReorderPair] = useState<{ origin: CageSlot; destination: CageSlot; isNewSlot: boolean } | null>(null);

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [lotsRes, slotsRes] = await Promise.all([
        supabase.from('lots').select('*').eq('status', 'activo').order('start_date', { ascending: false }),
        supabase.from('cage_slots').select('*'),
      ]);
      if (lotsRes.data) setLots(lotsRes.data);
      if (slotsRes.data) setSlots(slotsRes.data);
    } catch (error) {
      console.error('Error cargando lotes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role === 'owner') { router.push('/dashboard/admin'); return; }
    loadData();
  }, [authLoading, user, profile, router, loadData]);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 3000); };

  const handleLoss = async (qty: number, reason: string, lossType: LossType) => {
    if (!selectedSlot || !user) return;
    const { slot, lot } = selectedSlot;
    const newQty = slot.quantity - qty;
    const today = new Date().toISOString().split('T')[0];

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
    flash();
    await loadData();
  };

  const handleReorder = async (qty: number) => {
    if (!reorderPair) return;
    const { origin, destination, isNewSlot } = reorderPair;
    const newOriginQty = origin.quantity - qty;

    await Promise.all([
      newOriginQty === 0
        ? supabase.from('cage_slots').delete().eq('id', origin.id)
        : supabase.from('cage_slots').update({ quantity: newOriginQty }).eq('id', origin.id),
      isNewSlot || destination.id === -1
        ? supabase.from('cage_slots').insert({ lot_id: origin.lot_id, slot_code: destination.slot_code, quantity: qty })
        : supabase.from('cage_slots').update({ quantity: destination.quantity + qty }).eq('id', destination.id),
    ]);

    setReorderPair(null);
    flash();
    await loadData();
  };

  const occupiedSlotCodes = new Set(slots.filter(s => s.quantity > 0).map(s => s.slot_code));
  const allPossibleCodes = ROWS.flatMap(r => Array.from({ length: TOTAL_COLS }, (_, i) => `${r}${i + 1}`));
  const freeSlotCodes = allPossibleCodes.filter(c => !occupiedSlotCodes.has(c));
  const totalAves = slots.reduce((s, sl) => s + sl.quantity, 0);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 font-medium">Cargando lotes...</p>
      </div>
    </div>
  );

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard" backLabel="Inicio" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-gray-900">Aves</h2>
          {saved && <span className="text-green-600 text-sm font-bold animate-pulse">✓ Guardado</span>}
        </div>

        {/* Resumen */}
        {lots.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Lotes activos', value: lots.length, cls: 'bg-white border border-gray-100' },
              { label: 'Total aves', value: totalAves, cls: 'bg-yellow-50 border border-yellow-100 text-yellow-800' },
              { label: 'Bocas ocupadas', value: occupiedSlotCodes.size, cls: 'bg-blue-50 border border-blue-100 text-blue-800' },
            ].map(chip => (
              <div key={chip.label} className={`rounded-2xl px-4 py-2 shadow-sm ${chip.cls}`}>
                <p className="text-[10px] font-bold uppercase opacity-60">{chip.label}</p>
                <p className="text-xl font-black leading-tight">{chip.value}</p>
              </div>
            ))}
          </div>
        )}

        {lots.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="font-medium">No hay lotes activos</p>
          </div>
        ) : (
          <div className="space-y-4">
            {lots.map(lot => (
              <LotCard
                key={lot.id}
                lot={lot}
                slots={slots.filter(s => s.lot_id === lot.id)}
                freeSlots={freeSlotCodes}
                onLoss={slot => setSelectedSlot({ slot, lot })}
                onReorder={(origin, destination, isNewSlot) => setReorderPair({ origin, destination, isNewSlot })}
              />
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
    </div>
  );
}

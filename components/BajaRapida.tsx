'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { assertSupabaseAllOk, getErrorMessage } from '@/lib/supabase-ops';
import {
  ROWS,
  LOSS_TYPE_LABELS,
  type LossType,
  type QuickLot,
  type QuickSlot,
} from '@/lib/domain';

type Props = {
  slots: QuickSlot[];
  lots: QuickLot[];
  userId: string;
  today: string;
  /** Se llama tras guardar una baja, para que la página recargue sus datos. */
  onSaved: () => void | Promise<void>;
  /** Si es true, arranca plegada y la cabecera funciona como botón para abrir/cerrar. */
  collapsible?: boolean;
};

export default function BajaRapida({ slots, lots, userId, today, onSaved, collapsible = false }: Props) {
  const [open, setOpen] = useState(!collapsible);
  const [quickRow, setQuickRow] = useState('');
  const [quickNum, setQuickNum] = useState('');
  const [quickSlot, setQuickSlot] = useState<QuickSlot | null>(null);
  const [quickLot, setQuickLot] = useState<QuickLot | null>(null);
  const [quickError, setQuickError] = useState('');
  const [quickLossType, setQuickLossType] = useState<LossType>('muerte');
  const [quickQty, setQuickQty] = useState(1);
  const [quickReason, setQuickReason] = useState('');
  const [savingQuick, setSavingQuick] = useState(false);
  const [quickSaved, setQuickSaved] = useState(false);

  const handleQuickLookup = () => {
    setQuickError('');
    setQuickSlot(null);
    setQuickLot(null);
    if (!quickRow || !quickNum) { setQuickError('Completá fila y número'); return; }
    const code = quickRow + quickNum;
    const slot = slots.find(s => s.slot_code === code);
    if (!slot) { setQuickError(`La boca ${code} no existe o no tiene aves`); return; }
    if (slot.quantity === 0) { setQuickError(`La boca ${code} está vacía`); return; }
    const lot = lots.find(l => l.id === slot.lot_id) || null;
    setQuickSlot(slot);
    setQuickLot(lot);
    setQuickQty(1);
    setQuickLossType('muerte');
    setQuickReason('');
  };

  const handleQuickLoss = async () => {
    if (!quickSlot || !quickLot) return;
    setSavingQuick(true);
    setQuickError('');
    const newQty = quickSlot.quantity - quickQty;
    let ok = false;
    try {
      assertSupabaseAllOk(await Promise.all([
        supabase.from('lot_losses').insert({
          lot_id: quickLot.id, date: today, quantity: quickQty,
          reason: quickReason || null, slot_code: quickSlot.slot_code,
          loss_type: quickLossType, user_id: userId,
        }),
        supabase.from('lots').update({ current_quantity: quickLot.current_quantity - quickQty }).eq('id', quickLot.id),
        newQty === 0
          ? supabase.from('cage_slots').delete().eq('id', quickSlot.id)
          : supabase.from('cage_slots').update({ quantity: newQty }).eq('id', quickSlot.id),
      ]));
      ok = true;
    } catch (error) {
      setQuickError(getErrorMessage(error, 'No se pudo guardar la baja. Probá de nuevo.'));
    } finally {
      setSavingQuick(false);
    }
    if (!ok) return;
    setQuickSlot(null);
    setQuickLot(null);
    setQuickRow('');
    setQuickNum('');
    setQuickReason('');
    setQuickQty(1);
    setQuickSaved(true);
    setTimeout(() => setQuickSaved(false), 3000);
    await onSaved();
  };

  const resetQuick = () => {
    setQuickSlot(null); setQuickLot(null);
    setQuickRow(''); setQuickNum('');
    setQuickError(''); setQuickReason('');
    setQuickQty(1);
  };

  const Title = (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold text-gray-700">Registrar baja rápida</span>
      {quickSaved && <span className="text-[10px] font-black text-green-600 bg-green-100 px-2 py-0.5 rounded-full">✓ Guardado</span>}
    </div>
  );

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      {collapsible ? (
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full px-5 pt-4 pb-3 flex items-center justify-between text-left"
        >
          {Title}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          {Title}
          {quickSlot && (
            <button onClick={resetQuick} className="text-xs text-gray-400 underline">limpiar</button>
          )}
        </div>
      )}

      {open && (
      <div className="px-5 pb-5 space-y-3">
        {collapsible && quickSlot && (
          <div className="flex justify-end -mt-1">
            <button onClick={resetQuick} className="text-xs text-gray-400 underline">limpiar</button>
          </div>
        )}
        {!quickSlot ? (
          <>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Fila</p>
              <div className="flex gap-2">
                {ROWS.map(row => (
                  <button key={row} onClick={() => { setQuickRow(row); setQuickError(''); }}
                    className={`flex-1 h-11 rounded-xl font-black text-sm border-2 transition-all
                      ${quickRow === row
                        ? 'bg-yellow-400 border-yellow-400 text-gray-900'
                        : 'bg-white border-gray-200 text-gray-400 hover:border-yellow-200'}`}>
                    {row}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Número de boca</p>
              <div className="flex gap-2">
                <input
                  type="number" min={1} max={42}
                  placeholder="Ej: 7"
                  value={quickNum}
                  onChange={e => { setQuickNum(e.target.value); setQuickError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleQuickLookup()}
                  className="input-base text-center text-xl font-black flex-1"
                />
                <button onClick={handleQuickLookup}
                  className="px-5 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 transition-colors">
                  Buscar
                </button>
              </div>
            </div>
            {quickError && (
              <p className="text-xs text-red-500 font-medium">{quickError}</p>
            )}
          </>
        ) : (
          <>
            <div className="bg-gray-50 rounded-2xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase">Boca {quickSlot.slot_code}</p>
                <p className="text-sm font-bold text-gray-700">{quickLot?.code || 'Sin lote'}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-gray-800">{quickSlot.quantity}</p>
                <p className="text-[10px] text-gray-400">aves</p>
              </div>
            </div>

            <div className="flex gap-2">
              {(['muerte','descarte','venta'] as LossType[]).map(type => (
                <button key={type} onClick={() => setQuickLossType(type)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all
                    ${quickLossType === type
                      ? type === 'muerte' ? 'bg-red-50 border-red-400 text-red-600'
                        : type === 'descarte' ? 'bg-orange-50 border-orange-400 text-orange-600'
                        : 'bg-blue-50 border-blue-400 text-blue-600'
                      : 'bg-white border-gray-200 text-gray-400'}`}>
                  {LOSS_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setQuickQty(q => Math.max(1, q - 1))}
                className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors">−</button>
              <input type="number" min={1} max={quickSlot.quantity} value={quickQty}
                onChange={e => setQuickQty(Math.min(quickSlot.quantity, Math.max(1, Number(e.target.value))))}
                className="input-base text-center text-2xl font-black h-11 py-0" />
              <button onClick={() => setQuickQty(q => Math.min(quickSlot.quantity, q + 1))}
                className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors">+</button>
            </div>

            <input className="input-base" placeholder="Motivo (opcional)"
              value={quickReason} onChange={e => setQuickReason(e.target.value)} />

            {quickQty === quickSlot.quantity && (
              <p className="text-xs text-red-500">⚠ Esta boca quedará vacía y se liberará</p>
            )}

            {quickError && (
              <p className="text-xs text-red-500 font-medium">{quickError}</p>
            )}

            <button onClick={handleQuickLoss} disabled={savingQuick}
              className="btn-primary w-full py-4 text-base shadow-yellow-200 shadow-lg">
              {savingQuick ? 'Guardando...' : `Confirmar ${quickQty} ${LOSS_TYPE_LABELS[quickLossType].toLowerCase()}${quickQty > 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
      )}
    </div>
  );
}

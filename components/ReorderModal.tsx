'use client';

import { useState } from 'react';
import { X, MoveRight, ArrowLeftRight, AlertCircle } from 'lucide-react';

// Estructura mínima de una boca para mover aves.
export type MoveSlot = { id: number; lot_id: number; slot_code: string; quantity: number };

// Capacidad máxima de aves por boca.
const SLOT_CAP = 9;

export default function ReorderModal({
  origin, destination, isNewSlot, onClose, onConfirm,
}: {
  origin: MoveSlot;
  destination: MoveSlot;
  isNewSlot: boolean;
  onClose: () => void;
  onConfirm: (qty: number) => Promise<void>;
}) {
  // A una boca vacía se puede mover cualquier parte (hasta lo que hay en el origen);
  // a una boca con aves, hasta lo que entra sin pasar la capacidad.
  const maxMovable = isNewSlot
    ? origin.quantity
    : Math.min(origin.quantity, SLOT_CAP - destination.quantity);
  // Por defecto propone mover todo (el caso más común); se puede bajar para parcial.
  const [qty, setQty] = useState(isNewSlot ? origin.quantity : Math.min(maxMovable, 1));
  const [saving, setSaving] = useState(false);

  const vaciaOrigen = qty === origin.quantity;

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
            <h3 className="text-lg font-black text-gray-900">{isNewSlot ? 'Mover a boca vacía' : 'Mover Aves'}</h3>
            <p className="text-sm text-gray-400 mt-0.5">
              {isNewSlot ? 'Elegí cuántas mover' : 'Reacomodamiento entre bocas'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-blue-400 mb-1">Origen</p>
            <p className="text-xl font-black text-blue-700">{origin.slot_code}</p>
            <p className="text-xs text-blue-400 mt-0.5">{origin.quantity} → {origin.quantity - qty} aves</p>
          </div>
          <MoveRight className="w-5 h-5 text-gray-300 shrink-0" />
          <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-emerald-400 mb-1">{isNewSlot ? 'Nueva boca' : 'Destino'}</p>
            <p className="text-xl font-black text-emerald-700">{destination.slot_code}</p>
            <p className="text-xs text-emerald-400 mt-0.5">
              {isNewSlot ? `${qty} ave${qty > 1 ? 's' : ''}` : `${destination.quantity} → ${destination.quantity + qty}`}
            </p>
          </div>
        </div>

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
          {vaciaOrigen && (
            <p className="text-xs text-amber-500 mt-1.5 ml-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> La boca origen quedará vacía y se liberará
            </p>
          )}
        </div>

        <button onClick={handle} disabled={saving}
          className="btn-primary w-full py-4 text-base shadow-yellow-200 shadow-lg">
          <ArrowLeftRight className="w-4 h-4" />
          {saving ? 'Moviendo...' : `Mover ${qty} ave${qty > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { ROWS } from '@/lib/domain';

const TOTAL_COLS = 42;
const DEFAULT_QTY = 8;
const SLOT_CAP = 9;

type TandaLot = { id: number; code: string; current_quantity: number; initial_quantity: number };

function generarCodigos(rows: string[], from: number, to: number): string[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const out: string[] = [];
  for (const r of rows) for (let c = lo; c <= hi; c++) out.push(`${r}${c}`);
  return out;
}

export default function AgregarTandaModal({
  lot, occupiedSlots, onClose, onConfirm,
}: {
  lot: TandaLot;
  occupiedSlots: Set<string>;
  onClose: () => void;
  onConfirm: (slots: { slot_code: string; quantity: number }[]) => Promise<void>;
}) {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set(ROWS));
  const [colFrom, setColFrom] = useState(1);
  const [colTo, setColTo] = useState(1);
  const [qty, setQty] = useState(DEFAULT_QTY);
  const [saving, setSaving] = useState(false);

  const toggleRow = (r: string) => setSelectedRows(prev => {
    const n = new Set(prev);
    if (n.has(r)) n.delete(r); else n.add(r);
    return n;
  });

  const rangeCodes = generarCodigos(ROWS.filter(r => selectedRows.has(r)), colFrom, colTo);
  const validSlots = rangeCodes.filter(c => !occupiedSlots.has(c));
  const ocupadas = rangeCodes.length - validSlots.length;
  const totalAves = validSlots.length * qty;

  const handle = async () => {
    if (validSlots.length === 0 || qty < 1) return;
    setSaving(true);
    await onConfirm(validSlots.map(c => ({ slot_code: c, quantity: qty })));
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5 shadow-2xl my-8">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900">Agregar tanda</h3>
            <p className="text-sm text-gray-400 mt-0.5">Lote {lot.code} · suma aves a bocas libres</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div>
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Filas</p>
          <div className="flex gap-2">
            {ROWS.map(r => (
              <button key={r} onClick={() => toggleRow(r)}
                className={`flex-1 h-10 rounded-xl font-black text-sm border-2 transition-all
                  ${selectedRows.has(r) ? 'bg-yellow-400 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-400'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Desde col.</p>
            <input type="number" min={1} max={TOTAL_COLS} value={colFrom}
              onChange={e => setColFrom(Math.min(TOTAL_COLS, Math.max(1, Number(e.target.value))))}
              className="input-base text-center font-bold" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Hasta col.</p>
            <input type="number" min={1} max={TOTAL_COLS} value={colTo}
              onChange={e => setColTo(Math.min(TOTAL_COLS, Math.max(1, Number(e.target.value))))}
              className="input-base text-center font-bold" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Aves/boca</p>
            <input type="number" min={1} max={SLOT_CAP} value={qty}
              onChange={e => setQty(Math.min(SLOT_CAP, Math.max(1, Number(e.target.value))))}
              className="input-base text-center font-bold" />
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-3 text-center">
          <p className="text-sm text-gray-600">
            <span className="font-black text-gray-900">{validSlots.length}</span> bocas libres × {qty} ={' '}
            <span className="font-black text-yellow-700">{totalAves} aves</span>
          </p>
          {ocupadas > 0 && (
            <p className="text-[11px] text-amber-500 mt-1">{ocupadas} boca{ocupadas > 1 ? 's' : ''} ya ocupada{ocupadas > 1 ? 's' : ''} se omiten</p>
          )}
        </div>

        <button onClick={handle} disabled={saving || validSlots.length === 0}
          className="btn-primary w-full py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" />
          {saving ? 'Guardando...' : `Agregar ${totalAves} ave${totalAves !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

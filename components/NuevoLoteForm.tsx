'use client';

import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { ROWS } from '@/lib/domain';

const TOTAL_COLS = 42;
const DEFAULT_QTY_PER_SLOT = 8;

function generateSlotCodes(rows: string[], colFrom: number, colTo: number): string[] {
  const codes: string[] = [];
  for (let col = colFrom; col <= colTo; col++) {
    for (const row of rows) codes.push(`${row}${col}`);
  }
  return codes;
}

export default function NuevoLoteForm({
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

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

// ─── Counter ──────────────────────────────────────────────────────────────────

function Counter({
  label,
  value,
  onChange,
  sublabel,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  sublabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const handleFocus = () => {
    setFocused(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || val === '-') return;
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) onChange(parsed);
  };

  const handleBlur = () => {
    setFocused(false);
    if (value === null) onChange(0);
  };

  const displayValue = value === null ? '0' : String(value);

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <label className="text-sm font-medium text-gray-600">{label}</label>
        {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
      <div className={`bg-gray-50 rounded-2xl border flex items-center px-2 py-2 gap-2 transition-colors overflow-hidden
        ${focused ? 'border-yellow-400 bg-white' : 'border-gray-200'}`}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
          className="w-10 h-10 shrink-0 rounded-xl bg-white border border-gray-200 text-2xl font-light text-gray-500 active:scale-95 active:bg-gray-100 transition-all flex items-center justify-center select-none"
        >−</button>

        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={0}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === 'Enter') inputRef.current?.blur(); }}
          className="flex-1 min-w-0 text-center text-4xl font-bold text-gray-900 outline-none bg-transparent
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />

        <button
          type="button"
          onClick={() => onChange((value ?? 0) + 1)}
          className="w-10 h-10 shrink-0 rounded-xl bg-yellow-400 text-2xl font-bold text-gray-900 active:scale-95 active:bg-yellow-500 transition-all flex items-center justify-center select-none"
        >+</button>
      </div>
    </div>
  );
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const isToday = value === today;
  const label = isToday
    ? 'Hoy'
    : new Date(value + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long',
      });

  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <span className="font-medium text-gray-800">{label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2">
          <input type="date" className="input-base text-sm" value={value} max={today}
            onChange={e => { onChange(e.target.value); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

// Posicionado debajo del header (top-16) para no quedar cortado por el sticky header
function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 px-4 w-full max-w-sm
      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
      <div className="bg-green-500 text-white px-5 py-3 rounded-2xl shadow-lg font-medium text-sm flex items-center justify-center gap-2">
        ✓ {message}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RegistroHuevos() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'consumo' | 'fertiles'>('consumo');

  // Bandejas fértiles pendientes (owner)
  type FertileBatch = { id: number; date: string; status: string };
  const [pendingBatches, setPendingBatches] = useState<FertileBatch[]>([]);
  const [processingBatch, setProcessingBatch] = useState<number | null>(null);
  const [batchDocenas, setBatchDocenas] = useState('');
  const [batchDescarte, setBatchDescarte] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);

  // Consumo
  const [dateConsumo, setDateConsumo] = useState(new Date().toISOString().split('T')[0]);
  const [bandejas, setBandejas] = useState<number | null>(null);
  const [bandFertiles, setBandFertiles] = useState<number | null>(null);
  const [docenas, setDocenas] = useState<number | null>(null);
  const [rotos, setRotos] = useState<number | null>(null);
  const [notasConsumo, setNotasConsumo] = useState('');
  const [existeConsumo, setExisteConsumo] = useState(false);

  // Fértiles
  const [dateFertiles, setDateFertiles] = useState(new Date().toISOString().split('T')[0]);
  const [bandProcesadas, setBandProcesadas] = useState<number | null>(null);
  const [docenasFertiles, setDocenasFertiles] = useState<number | null>(null);
  const [descarte, setDescarte] = useState<number | null>(null);
  const [notasFertiles, setNotasFertiles] = useState('');
  const [existeFertiles, setExisteFertiles] = useState(false);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const checkExistingConsumo = useCallback(async (date: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('daily_records')
      .select('id')
      .eq('date', date)
      .eq('user_id', user.id)
      .maybeSingle();
    setExisteConsumo(!!data);
  }, [user]);

  const checkExistingFertiles = useCallback(async (date: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('fertile_records')
      .select('id')
      .eq('date', date)
      .eq('user_id', user.id)
      .maybeSingle();
    setExisteFertiles(!!data);
  }, [user]);

  const loadPendingBatches = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('fertile_batches')
      .select('id, date, status')
      .eq('status', 'pendiente')
      .order('date');
    if (data) setPendingBatches(data);
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    checkExistingConsumo(dateConsumo);
  }, [dateConsumo, checkExistingConsumo]);

  useEffect(() => {
    if (activeTab === 'fertiles' && user) loadPendingBatches();
  }, [activeTab, user]);

  useEffect(() => {
    checkExistingFertiles(dateFertiles);
  }, [dateFertiles, checkExistingFertiles]);

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user || !profile) return null;

  const isOwner = profile.role === 'owner';

  const consumoValido = (bandejas ?? 0) > 0 || (bandFertiles ?? 0) > 0 || (docenas ?? 0) > 0 || (rotos ?? 0) > 0;
  const fertilesValido = (bandProcesadas ?? 0) > 0 || (docenasFertiles ?? 0) > 0 || (descarte ?? 0) > 0;

  const handleSubmitConsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumoValido || !user) return;
    setLoading(true);
    const now = new Date();
    const { error } = await supabase.from('daily_records').insert({
      date: dateConsumo,
      user_id: user.id,
      bandejas_consumo: bandejas ?? 0,
      bandejas_fertiles: bandFertiles ?? 0,
      docenas_armadas: docenas ?? 0,
      huevos_rotos: rotos ?? 0,
      notas: notasConsumo.trim() || null,
      registered_at: now.toTimeString().split(' ')[0],
    });

    if (!error) {
      // Si hay bandejas fértiles, crearlas en fertile_batches (una por bandeja)
      const numBandejasFertiles = bandFertiles ?? 0;
      if (numBandejasFertiles > 0) {
        const batches = Array.from({ length: numBandejasFertiles }, () => ({
          date: dateConsumo,
          user_id: user.id,
          status: 'pendiente',
        }));
        await supabase.from('fertile_batches').insert(batches);
      }
      showToast('Registro guardado' + (numBandejasFertiles > 0 ? ` · ${numBandejasFertiles} bandeja${numBandejasFertiles > 1 ? 's' : ''} fértil${numBandejasFertiles > 1 ? 'es' : ''} pendiente${numBandejasFertiles > 1 ? 's' : ''}` : ''));
      setBandejas(null);
      setBandFertiles(null);
      setDocenas(null);
      setRotos(null);
      setNotasConsumo('');
      setDateConsumo(new Date().toISOString().split('T')[0]);
      setExisteConsumo(true);
    } else {
      alert('Error al guardar: ' + error.message);
    }
    setLoading(false);
  };

  const handleSubmitFertiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fertilesValido || !user) return;
    setLoading(true);
    const now = new Date();
    const { error } = await supabase.from('fertile_records').insert({
      date: dateFertiles,
      user_id: user.id,
      bandejas_procesadas: bandProcesadas ?? 0,
      docenas_seleccionadas: docenasFertiles ?? 0,
      descarte: descarte ?? 0,
      notas: notasFertiles.trim() || null,
      registered_at: now.toTimeString().split(' ')[0],
    });

    if (!error) {
      showToast('Registro de fértiles guardado');
      setBandProcesadas(null);
      setDocenasFertiles(null);
      setDescarte(null);
      setNotasFertiles('');
      setDateFertiles(new Date().toISOString().split('T')[0]);
      setExisteFertiles(true);
    } else {
      alert('Error al guardar: ' + error.message);
    }
    setLoading(false);
  };

  const handleProcessBatch = async (batch: FertileBatch) => {
    if (!batchDocenas || !user) return;
    setSavingBatch(true);
    await supabase.from('fertile_batches').update({
      status: 'procesada',
      docenas_seleccionadas: Number(batchDocenas),
      descarte: Number(batchDescarte) || 0,
      processed_at: new Date().toISOString().split('T')[0],
      processed_by: user.id,
    }).eq('id', batch.id);
    await supabase.from('fertile_records').insert({
      date: batch.date,
      user_id: user.id,
      bandejas_procesadas: 1,
      docenas_seleccionadas: Number(batchDocenas),
      descarte: Number(batchDescarte) || 0,
      registered_at: new Date().toTimeString().split(' ')[0],
    });
    setProcessingBatch(null);
    setBatchDocenas('');
    setBatchDescarte('');
    setSavingBatch(false);
    showToast('Bandeja procesada');
    await loadPendingBatches();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast message={toast} visible={toastVisible} />

      <Header
        userName={profile.full_name}
        role={profile.role}
        backHref={isOwner ? '/dashboard/admin' : '/dashboard'}
        backLabel="Volver"
      />

      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Registro de huevos</h2>
        </div>

        {isOwner && (
          <div className="flex gap-2 mb-6">
            {(['consumo', 'fertiles'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border
                  ${activeTab === tab
                    ? 'bg-yellow-400 border-yellow-400 text-gray-900'
                    : 'bg-white border-gray-200 text-gray-500'}`}>
                {tab === 'consumo' ? 'Consumo' : 'Fértiles'}
              </button>
            ))}
          </div>
        )}

        {/* ── Formulario Consumo ── */}
        {(activeTab === 'consumo' || !isOwner) && (
          <form onSubmit={handleSubmitConsumo} className="space-y-4">

            <div className="card">
              <DatePicker value={dateConsumo} onChange={setDateConsumo} />
            </div>

            {existeConsumo && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  Ya existe un registro para este día. Podés igualmente guardar otro.
                </p>
              </div>
            )}

            <div className="card space-y-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recolección</p>
              <Counter label="Bandejas de consumo" value={bandejas} onChange={setBandejas} />
              <Counter label="Bandejas de fértiles" value={bandFertiles} onChange={setBandFertiles} />
            </div>

            <div className="card space-y-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Empaque consumo</p>
              <Counter label="Docenas armadas" value={docenas} onChange={setDocenas} />
              <Counter label="Huevos rotos / descartados" sublabel="Unidades" value={rotos} onChange={setRotos} />
            </div>

            <div className="card">
              <label className="text-sm font-medium text-gray-500 mb-2 block">Notas opcionales</label>
              <textarea
                value={notasConsumo}
                onChange={e => setNotasConsumo(e.target.value)}
                rows={3}
                className="input-base resize-none"
                placeholder="Alguna observación del día..."
              />
            </div>

            <button
              type="submit"
              disabled={loading || !consumoValido}
              className="btn-primary w-full py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : 'Guardar registro'}
            </button>
          </form>
        )}

        {/* ── Tab Fértiles (solo owner) — bandejas pendientes ── */}
        {isOwner && activeTab === 'fertiles' && (
          <div className="space-y-4">
            {pendingBatches.length === 0 ? (
              <div className="card text-center py-10">
                <p className="text-gray-400 font-medium">No hay bandejas fértiles pendientes</p>
                <p className="text-xs text-gray-300 mt-1">Se agregan al registrar huevos con bandejas de fértiles</p>
              </div>
            ) : (
              pendingBatches.map(batch => (
                <div key={batch.id} className="card space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-800">
                        {new Date(batch.date + 'T12:00:00').toLocaleDateString('es-AR', {
                          weekday: 'long', day: 'numeric', month: 'long'
                        })}
                      </p>
                      <p className="text-xs text-amber-600 font-medium mt-0.5">Pendiente de procesar</p>
                    </div>
                    {processingBatch !== batch.id && (
                      <button
                        onClick={() => { setProcessingBatch(batch.id); setBatchDocenas(''); setBatchDescarte(''); }}
                        className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold text-sm rounded-xl transition-colors">
                        Procesar
                      </button>
                    )}
                  </div>

                  {processingBatch === batch.id && (
                    <div className="space-y-4 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Resultado del proceso</p>
                      <Counter
                        label="Docenas seleccionadas"
                        sublabel="Las que quedaron aptas"
                        value={batchDocenas === '' ? null : Number(batchDocenas)}
                        onChange={v => setBatchDocenas(String(v))}
                      />
                      <Counter
                        label="Descarte"
                        sublabel="Rotos + no seleccionados (unidades)"
                        value={batchDescarte === '' ? null : Number(batchDescarte)}
                        onChange={v => setBatchDescarte(String(v))}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleProcessBatch(batch)}
                          disabled={savingBatch || !batchDocenas}
                          className="btn-primary flex-1 py-3 text-sm disabled:opacity-40">
                          {savingBatch ? 'Guardando...' : 'Confirmar proceso'}
                        </button>
                        <button
                          onClick={() => setProcessingBatch(null)}
                          className="btn-secondary px-4 py-3 text-sm">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
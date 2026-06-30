'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { ChevronDown, AlertCircle, Egg, PackageCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ToastViewport, useToast } from '@/components/Feedback';
import { assertSupabaseOk, getErrorMessage } from '@/lib/supabase-ops';
import { getToday } from '@/lib/date';

// ─── Counter ──────────────────────────────────────────────────────────────────

function Counter({
  label,
  value,
  onChange,
  sublabel,
  max,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  sublabel?: string;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const clamp = (v: number) => {
    const low = Math.max(0, v);
    return max != null ? Math.min(max, low) : low;
  };

  const handleFocus = () => {
    setFocused(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || val === '-') return;
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) onChange(clamp(parsed));
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
          onClick={() => onChange(clamp((value ?? 0) - 1))}
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
          onClick={() => onChange(clamp((value ?? 0) + 1))}
          className="w-10 h-10 shrink-0 rounded-xl bg-yellow-400 text-2xl font-bold text-gray-900 active:scale-95 active:bg-yellow-500 transition-all flex items-center justify-center select-none"
        >+</button>
      </div>
    </div>
  );
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const today = getToday();
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

// ─── Types ────────────────────────────────────────────────────────────────────

type FertileBatch = { id: number; date: string; status: string };

// Una jornada de consumo: lo recolectado vs. lo empacado, para saber qué falta.
type ConsumoDay = {
  date: string;
  recolectadas: number; // bandejas de consumo juntadas ese día
  empacadas: number;    // bandejas ya empacadas
  docenas: number;      // docenas armadas acumuladas
  rotos: number;        // rotos acumulados
};

function fechaLarga(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

// ─── Tarjeta de empaque de un día ──────────────────────────────────────────────

function EmpaqueCard({
  day,
  onSaved,
  showToast,
}: {
  day: ConsumoDay;
  onSaved: () => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const { user } = useAuth();
  const restantes = day.recolectadas - day.empacadas;
  const enProgreso = day.empacadas > 0;
  const today = getToday();

  const [bandejas, setBandejas] = useState<number | null>(restantes);
  const [docenas, setDocenas] = useState<number | null>(null);
  const [rotos, setRotos] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const valido = (bandejas ?? 0) > 0 || (docenas ?? 0) > 0 || (rotos ?? 0) > 0;
  const pct = day.recolectadas > 0 ? Math.round((day.empacadas / day.recolectadas) * 100) : 0;

  const handleSave = async () => {
    if (!valido || !user) return;
    setSaving(true);
    try {
      const now = new Date();
      assertSupabaseOk(await supabase.from('consumo_empaque').insert({
        date: day.date,
        user_id: user.id,
        bandejas: bandejas ?? 0,
        docenas: docenas ?? 0,
        rotos: rotos ?? 0,
        registered_at: now.toTimeString().split(' ')[0],
      }));
      const quedan = restantes - (bandejas ?? 0);
      showToast(quedan <= 0 ? 'Empaque del día completo' : `Empaque guardado · faltan ${quedan} bandejas`);
      await onSaved();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo guardar el empaque.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div>
        <div className="flex items-start justify-between">
          <p className="font-bold text-gray-800 capitalize">
            {day.date === today ? 'Hoy' : fechaLarga(day.date)}
          </p>
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase
            ${enProgreso ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {enProgreso ? 'Parcial' : 'Sin empacar'}
          </span>
        </div>
        <p className="text-sm text-amber-600 font-medium mt-0.5">
          {enProgreso ? `Faltan ${restantes} de ${day.recolectadas} bandejas` : `${day.recolectadas} bandejas para empacar`}
        </p>
        {enProgreso && (
          <>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div className="bg-yellow-400 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Llevás {day.docenas} docenas · {day.rotos} rotos</p>
          </>
        )}
      </div>

      <div className="space-y-4 pt-3 border-t border-gray-100">
        <Counter
          label="¿Cuántas bandejas empacaste?"
          sublabel={`Vienen las ${restantes} que faltan; bajá el número si hiciste menos`}
          value={bandejas}
          onChange={setBandejas}
          max={restantes}
        />
        <div className="grid grid-cols-2 gap-3">
          <Counter label="Docenas armadas" value={docenas} onChange={setDocenas} />
          <Counter label="Rotos" sublabel="Unidades" value={rotos} onChange={setRotos} />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !valido}
          className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? 'Guardando...' : 'Guardar empaque'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RegistroHuevos() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'recoleccion' | 'empaque' | 'fertiles'>('recoleccion');

  // ── Recolección ──
  const [dateRec, setDateRec] = useState(getToday);
  const [bandConsumo, setBandConsumo] = useState<number | null>(null);
  const [bandFertiles, setBandFertiles] = useState<number | null>(null);
  const [notasRec, setNotasRec] = useState('');
  const [yaHayRec, setYaHayRec] = useState(false);

  // ── Empaque de consumo ──
  const [consumoDays, setConsumoDays] = useState<ConsumoDay[]>([]);

  // ── Fértiles (owner) ──
  const [pendingBatches, setPendingBatches] = useState<FertileBatch[]>([]);
  const [processingBatch, setProcessingBatch] = useState<number | null>(null);
  const [batchDocenas, setBatchDocenas] = useState('');
  const [batchDescarte, setBatchDescarte] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);

  const [loading, setLoading] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  const checkExistingRec = useCallback(async (date: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('daily_records')
      .select('id')
      .eq('date', date)
      .limit(1)
      .maybeSingle();
    setYaHayRec(!!data);
  }, [user]);

  // Agrupa recolecciones y empaques por día para saber qué falta empacar.
  const loadConsumoDays = useCallback(async () => {
    if (!user) return;
    const desde = new Date();
    desde.setDate(desde.getDate() - 14);
    const desdeStr = desde.toISOString().split('T')[0];

    const [recRes, empRes] = await Promise.all([
      supabase.from('daily_records').select('date, bandejas_consumo').gte('date', desdeStr),
      supabase.from('consumo_empaque').select('date, bandejas, docenas, rotos').gte('date', desdeStr),
    ]);

    const map = new Map<string, ConsumoDay>();
    const get = (date: string) => {
      let d = map.get(date);
      if (!d) { d = { date, recolectadas: 0, empacadas: 0, docenas: 0, rotos: 0 }; map.set(date, d); }
      return d;
    };
    (recRes.data ?? []).forEach(r => { get(r.date).recolectadas += r.bandejas_consumo ?? 0; });
    (empRes.data ?? []).forEach(e => {
      const d = get(e.date);
      d.empacadas += e.bandejas ?? 0;
      d.docenas += e.docenas ?? 0;
      d.rotos += e.rotos ?? 0;
    });

    // Solo días con bandejas todavía sin empacar, más reciente primero.
    const pend = [...map.values()]
      .filter(d => d.recolectadas - d.empacadas > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
    setConsumoDays(pend);
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

  useEffect(() => { checkExistingRec(dateRec); }, [dateRec, checkExistingRec]);
  useEffect(() => { if (activeTab === 'empaque' && user) loadConsumoDays(); }, [activeTab, user, loadConsumoDays]);
  useEffect(() => { if (activeTab === 'fertiles' && user) loadPendingBatches(); }, [activeTab, user, loadPendingBatches]);

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user || !profile) return null;

  const isOwner = profile.role === 'owner';
  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: 'recoleccion', label: 'Recolección' },
    { id: 'empaque', label: 'Empaque' },
    ...(isOwner ? [{ id: 'fertiles' as const, label: 'Fértiles' }] : []),
  ];

  // ── Guardar recolección ──
  const recValido = (bandConsumo ?? 0) > 0 || (bandFertiles ?? 0) > 0;
  const handleSubmitRec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recValido || !user) return;
    setLoading(true);
    try {
      const now = new Date();
      assertSupabaseOk(await supabase.from('daily_records').insert({
        date: dateRec,
        user_id: user.id,
        bandejas_consumo: bandConsumo ?? 0,
        bandejas_fertiles: bandFertiles ?? 0,
        docenas_armadas: 0,
        huevos_rotos: 0,
        notas: notasRec.trim() || null,
        registered_at: now.toTimeString().split(' ')[0],
      }));

      // Cada bandeja de fértiles queda pendiente de procesar (la trabaja el owner).
      const nFert = bandFertiles ?? 0;
      if (nFert > 0) {
        const batches = Array.from({ length: nFert }, () => ({
          date: dateRec, user_id: user.id, status: 'pendiente',
        }));
        assertSupabaseOk(await supabase.from('fertile_batches').insert(batches));
      }
      showToast('Recolección guardada' + (nFert > 0 ? ` · ${nFert} bandeja${nFert > 1 ? 's' : ''} fértil${nFert > 1 ? 'es' : ''} pendiente${nFert > 1 ? 's' : ''}` : ''));
      setBandConsumo(null);
      setBandFertiles(null);
      setNotasRec('');
      setDateRec(getToday());
      setYaHayRec(true);
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo guardar la recolección.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Procesar bandeja fértil ──
  const handleProcessBatch = async (batch: FertileBatch) => {
    if (!batchDocenas || !user) return;
    setSavingBatch(true);
    try {
      assertSupabaseOk(await supabase.from('fertile_batches').update({
        status: 'procesada',
        docenas_seleccionadas: Number(batchDocenas),
        descarte: Number(batchDescarte) || 0,
        processed_at: getToday(),
        processed_by: user.id,
      }).eq('id', batch.id));

      assertSupabaseOk(await supabase.from('fertile_records').insert({
        date: batch.date,
        user_id: user.id,
        bandejas_procesadas: 1,
        docenas_seleccionadas: Number(batchDocenas),
        descarte: Number(batchDescarte) || 0,
        registered_at: new Date().toTimeString().split(' ')[0],
      }));

      setProcessingBatch(null);
      setBatchDocenas('');
      setBatchDescarte('');
      showToast('Bandeja procesada');
      await loadPendingBatches();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo procesar la bandeja.'), 'error');
    } finally {
      setSavingBatch(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastViewport toast={toast} onClose={hideToast} />

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

        <div className="flex gap-2 mb-6">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border
                ${activeTab === tab.id
                  ? 'bg-yellow-400 border-yellow-400 text-gray-900'
                  : 'bg-white border-gray-200 text-gray-500'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Recolección ── */}
        {activeTab === 'recoleccion' && (
          <form onSubmit={handleSubmitRec} className="space-y-4">
            <div className="card">
              <DatePicker value={dateRec} onChange={setDateRec} />
            </div>

            {yaHayRec && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  Ya hay una recolección hoy. Podés sumar otra si juntaste más.
                </p>
              </div>
            )}

            <div className="card space-y-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bandejas juntadas</p>
              <Counter label="Bandejas de consumo" value={bandConsumo} onChange={setBandConsumo} />
              <Counter label="Bandejas de fértiles" value={bandFertiles} onChange={setBandFertiles} />
            </div>

            <div className="card">
              <label className="text-sm font-medium text-gray-500 mb-2 block">Notas opcionales</label>
              <textarea
                value={notasRec}
                onChange={e => setNotasRec(e.target.value)}
                rows={3}
                className="input-base resize-none"
                placeholder="Alguna observación del día..."
              />
            </div>

            <button
              type="submit"
              disabled={loading || !recValido}
              className="btn-primary w-full py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? 'Guardando...' : 'Guardar recolección'}
            </button>
          </form>
        )}

        {/* ── Empaque de consumo ── */}
        {activeTab === 'empaque' && (
          <div className="space-y-4">
            {consumoDays.length === 0 ? (
              <div className="card text-center py-10">
                <PackageCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 font-medium">No hay bandejas para empacar</p>
                <p className="text-xs text-gray-300 mt-1">Aparecen acá después de cargar la recolección</p>
              </div>
            ) : (
              consumoDays.map(day => (
                <EmpaqueCard key={day.date} day={day} onSaved={loadConsumoDays} showToast={showToast} />
              ))
            )}
          </div>
        )}

        {/* ── Fértiles (owner) — bandejas pendientes ── */}
        {activeTab === 'fertiles' && (
          <div className="space-y-4">
            {pendingBatches.length === 0 ? (
              <div className="card text-center py-10">
                <Egg className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 font-medium">No hay bandejas fértiles pendientes</p>
                <p className="text-xs text-gray-300 mt-1">Se agregan al registrar la recolección con bandejas de fértiles</p>
              </div>
            ) : (
              pendingBatches.map(batch => (
                <div key={batch.id} className="card space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-800 capitalize">{fechaLarga(batch.date)}</p>
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

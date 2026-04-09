'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');

  const display = value === null ? '' : String(value);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-500">{label}</label>
      <div className="bg-white rounded-2xl border border-gray-200 flex items-center justify-between px-3 py-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
          className="w-14 h-14 rounded-xl bg-gray-100 text-3xl font-bold text-gray-600 active:scale-95 transition-all flex items-center justify-center select-none"
        >
          −
        </button>

        {editing ? (
          <input
            type="number"
            className="flex-1 text-center text-5xl font-bold text-gray-900 outline-none bg-transparent"
            value={raw}
            autoFocus
            onChange={e => setRaw(e.target.value)}
            onBlur={() => {
              const parsed = parseInt(raw);
              onChange(isNaN(parsed) || parsed < 0 ? 0 : parsed);
              setEditing(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const parsed = parseInt(raw);
                onChange(isNaN(parsed) || parsed < 0 ? 0 : parsed);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            className="flex-1 text-center text-5xl font-bold text-gray-900 cursor-pointer py-3"
            onClick={() => { setRaw(display); setEditing(true); }}
          >
            {value === null ? <span className="text-gray-300">—</span> : value}
          </span>
        )}

        <button
          type="button"
          onClick={() => onChange((value ?? 0) + 1)}
          className="w-14 h-14 rounded-xl bg-yellow-400 text-3xl font-bold text-gray-900 active:scale-95 transition-all flex items-center justify-center select-none"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function RegistroHuevos() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [bandejas, setBandejas] = useState<number | null>(null);
  const [bandFertiles, setBandFertiles] = useState<number | null>(null);
  const [docenas, setDocenas] = useState<number | null>(null);
  const [rotos, setRotos] = useState<number | null>(null);
  const [docenasFertiles, setDocenasFertiles] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }

      const { data } = await supabase.from('profiles')
        .select('full_name, role').eq('id', user.id).single();
      if (data) setProfile(data);

      // Si es owner, buscar si hay registro de hoy con fértiles pendientes
      if (data?.role === 'owner') {
        const today = new Date().toISOString().split('T')[0];
        const { data: rec } = await supabase.from('daily_records')
          .select('id, docenas_fertiles')
          .eq('date', today)
          .is('docenas_fertiles', null)
          .limit(1).single();
        if (rec) setPendingRecord(rec.id);
      }

      setLoaded(true);
    };
    load();
  }, []);

  const isOwner = profile?.role === 'owner';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date();

    const { error } = await supabase.from('daily_records').insert({
      date: now.toISOString().split('T')[0],
      user_id: user.id,
      bandejas_consumo: bandejas ?? 0,
      bandejas_fertiles: bandFertiles ?? 0,
      docenas_armadas: docenas ?? 0,
      huevos_rotos: rotos ?? 0,
      docenas_fertiles: null, // pendiente para que el owner complete
      notas: notas.trim() || null,
      registered_at: now.toTimeString().split(' ')[0],
    });

    if (!error) {
      setSuccess(true);
      setBandejas(null);
      setBandFertiles(null);
      setDocenas(null);
      setRotos(null);
      setNotas('');
      setTimeout(() => setSuccess(false), 3000);
    } else {
      alert('Error al guardar: ' + error.message);
    }
    setLoading(false);
  };

  const handleCompletarFertiles = async () => {
    if (!pendingRecord || docenasFertiles === null) return;
    setLoading(true);

    await supabase.from('daily_records')
      .update({ docenas_fertiles: docenasFertiles })
      .eq('id', pendingRecord);

    setDocenasFertiles(null);
    setPendingRecord(null);
    setLoading(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  if (!loaded) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        userName={profile?.full_name ?? ''}
        role={profile?.role ?? 'collaborator'}
        backHref={isOwner ? '/dashboard/admin' : '/dashboard'}
        backLabel="Volver"
      />

      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Registro de huevos</h2>
          <p className="text-sm text-gray-400 mt-1">
            {new Date().toLocaleDateString('es-AR', {
              weekday: 'long', day: 'numeric', month: 'long'
            })}
          </p>
        </div>

        {/* Panel owner: completar fértiles pendientes */}
        {isOwner && pendingRecord && (
          <div className="card mb-4 border-yellow-200 bg-yellow-50 space-y-4">
            <div>
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">
                Fértiles pendientes de hoy
              </p>
              <p className="text-sm text-yellow-600">
                Hay un registro de hoy sin docenas de fértiles seleccionadas. Completalo acá.
              </p>
            </div>
            <Counter
              label="Docenas de fértiles seleccionadas"
              value={docenasFertiles}
              onChange={setDocenasFertiles}
            />
            <button
              onClick={handleCompletarFertiles}
              disabled={loading || docenasFertiles === null}
              className="btn-primary w-full py-3 text-sm"
            >
              {loading ? 'Guardando...' : 'Confirmar fértiles'}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="card space-y-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Recolección
            </p>
            <Counter label="Bandejas de consumo" value={bandejas} onChange={setBandejas} />
            <Counter label="Bandejas de fértiles" value={bandFertiles} onChange={setBandFertiles} />
          </div>

          <div className="card space-y-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Empaque
            </p>
            <Counter label="Docenas armadas" value={docenas} onChange={setDocenas} />
            <Counter label="Huevos rotos / descartados" value={rotos} onChange={setRotos} />
          </div>

          <div className="card">
            <label className="text-sm font-medium text-gray-500 mb-2 block">
              Notas opcionales
            </label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={3}
              className="input-base resize-none"
              placeholder="Alguna observación del día..."
            />
          </div>

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-center text-sm font-medium">
              ✓ Registro guardado correctamente
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-4 text-base"
          >
            {loading ? 'Guardando...' : 'Guardar registro'}
          </button>

        </form>
      </div>
    </div>
  );
}
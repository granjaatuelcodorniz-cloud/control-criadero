'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-500">{label}</label>
      <div className="bg-white rounded-2xl border border-gray-200 flex items-center justify-between px-3 py-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-12 h-12 rounded-xl bg-gray-100 text-2xl font-bold text-gray-600 active:scale-95 transition-all flex items-center justify-center select-none"
        >
          −
        </button>

        {editing ? (
          <input
            type="number"
            className="flex-1 text-center text-4xl font-bold text-gray-900 outline-none bg-transparent"
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
            className="flex-1 text-center text-4xl font-bold text-gray-900 cursor-pointer py-2"
            onClick={() => { setRaw(String(value)); setEditing(true); }}
          >
            {value}
          </span>
        )}

        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-12 h-12 rounded-xl bg-yellow-400 text-2xl font-bold text-gray-900 active:scale-95 transition-all flex items-center justify-center select-none"
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
  const [bandejas, setBandejas] = useState(0);
  const [bandFertiles, setBandFertiles] = useState(0);
  const [docenas, setDocenas] = useState(0);
  const [rotos, setRotos] = useState(0);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!loaded) {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { window.location.href = '/'; return; }
      supabase.from('profiles').select('full_name, role')
        .eq('id', user.id).single()
        .then(({ data }) => { if (data) setProfile(data); setLoaded(true); });
    });
  }

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
      bandejas_consumo: bandejas,
      bandejas_fertiles: isOwner ? bandFertiles : 0,
      docenas_armadas: docenas,
      huevos_rotos: rotos,
      notas: notas.trim() || null,
      registered_at: now.toTimeString().split(' ')[0],
    });

    if (!error) {
      setSuccess(true);
      setBandejas(0);
      setBandFertiles(0);
      setDocenas(0);
      setRotos(0);
      setNotas('');
      setTimeout(() => setSuccess(false), 3000);
    } else {
      alert('Error al guardar: ' + error.message);
    }
    setLoading(false);
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

          {isOwner && (
            <div className="card space-y-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Fértiles — solo admin
              </p>
              <Counter
                label="Bandejas fértiles seleccionadas"
                value={bandFertiles}
                onChange={setBandFertiles}
              />
            </div>
          )}

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
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { ChevronDown } from 'lucide-react';
// 1. Agregamos las herramientas del contexto y navegación
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };

// --- TUS COMPONENTES (SE MANTIENEN IGUAL) ---

function Counter({ label, value, onChange, sublabel }: { label: string; value: number | null; onChange: (v: number) => void; sublabel?: string; }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <label className="text-sm font-medium text-gray-600">{label}</label>
        {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      </div>
      <div className="bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between px-2 py-2 gap-2">
        <button type="button" onClick={() => onChange(Math.max(0, (value ?? 0) - 1))} className="w-14 h-14 rounded-xl bg-white border border-gray-200 text-3xl font-light text-gray-500 active:scale-95 active:bg-gray-100 transition-all flex items-center justify-center select-none">−</button>
        {editing ? (
          <input type="number" inputMode="numeric" className="flex-1 text-center text-5xl font-bold text-gray-900 outline-none bg-transparent" value={raw} autoFocus onChange={e => setRaw(e.target.value)}
            onBlur={() => { const parsed = parseInt(raw); onChange(isNaN(parsed) || parsed < 0 ? 0 : parsed); setEditing(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { const parsed = parseInt(raw); onChange(isNaN(parsed) || parsed < 0 ? 0 : parsed); setEditing(false); } }} />
        ) : (
          <span className="flex-1 text-center text-5xl font-bold text-gray-900 cursor-pointer py-2 select-none" onClick={() => { setRaw(value === null ? '' : String(value)); setEditing(true); }}>
            {value === null ? <span className="text-gray-300 text-4xl">—</span> : value}
          </span>
        )}
        <button type="button" onClick={() => onChange((value ?? 0) + 1)} className="w-14 h-14 rounded-xl bg-yellow-400 text-3xl font-bold text-gray-900 active:scale-95 active:bg-yellow-500 transition-all flex items-center justify-center select-none">+</button>
      </div>
    </div>
  );
}

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const isToday = value === today;
  const label = isToday ? 'Hoy' : new Date(value + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <span className="font-medium text-gray-800">{label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2">
          <input type="date" className="input-base text-sm" value={value} max={today} onChange={e => { onChange(e.target.value); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

// --- TU COMPONENTE PRINCIPAL ---

export default function RegistroHuevos() {
  // 2. Usamos el contexto global (authLoading reemplaza a tu antiguo 'loaded')
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'consumo' | 'fertiles'>('consumo');

  // Estados de Consumo (Tus originales)
  const [dateConsumo, setDateConsumo] = useState(new Date().toISOString().split('T')[0]);
  const [bandejas, setBandejas] = useState<number | null>(null);
  const [bandFertiles, setBandFertiles] = useState<number | null>(null);
  const [docenas, setDocenas] = useState<number | null>(null);
  const [rotos, setRotos] = useState<number | null>(null);
  const [notasConsumo, setNotasConsumo] = useState('');

  // Estados de Fértiles (Tus originales)
  const [dateFertiles, setDateFertiles] = useState(new Date().toISOString().split('T')[0]);
  const [bandProcesadas, setBandProcesadas] = useState<number | null>(null);
  const [docenasFertiles, setDocenasFertiles] = useState<number | null>(null);
  const [descarte, setDescarte] = useState<number | null>(null);
  const [notasFertiles, setNotasFertiles] = useState('');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  // 3. Este useEffect solo se encarga de que nadie entre sin permiso
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const isOwner = profile?.role === 'owner';

  const handleSubmitConsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return; // Usamos el 'user' que viene del contexto arriba

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
      setSuccess('consumo');
      setBandejas(null); setBandFertiles(null); setDocenas(null); setRotos(null); setNotasConsumo('');
      setDateConsumo(new Date().toISOString().split('T')[0]);
      setTimeout(() => setSuccess(''), 3000);
    } else {
      alert('Error al guardar: ' + error.message);
    }
    setLoading(false);
  };

  const handleSubmitFertiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return; // Usamos el 'user' del contexto

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
      setSuccess('fertiles');
      setBandProcesadas(null); setDocenasFertiles(null); setDescarte(null); setNotasFertiles('');
      setDateFertiles(new Date().toISOString().split('T')[0]);
      setTimeout(() => setSuccess(''), 3000);
    } else {
      alert('Error al guardar: ' + error.message);
    }
    setLoading(false);
  };

  // 4. Pantalla de carga mientras el contexto verifica quién sos
  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Cargando datos de Granja Atuel...</p>
    </div>
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        userName={profile?.full_name ?? ''}
        role={(profile?.role as 'owner' | 'collaborator') ?? 'collaborator'}
        backHref={isOwner ? '/dashboard/admin' : '/dashboard'}
        backLabel="Volver"
      />

      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Registro de huevos</h2>
        </div>

        {/* TUS TABS Y FORMULARIOS (TODOS IGUAL QUE ANTES) */}
        {isOwner && (
          <div className="flex gap-2 mb-6">
            {(['consumo', 'fertiles'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border
                  ${activeTab === tab ? 'bg-yellow-400 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-500'}`}>
                {tab === 'consumo' ? 'Consumo' : 'Fértiles'}
              </button>
            ))}
          </div>
        )}

        {(activeTab === 'consumo' || !isOwner) && (
          <form onSubmit={handleSubmitConsumo} className="space-y-4">
            <div className="card"><DatePicker value={dateConsumo} onChange={setDateConsumo} /></div>
            <div className="card space-y-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recolección</p>
              <Counter label="Bandejas de consumo" value={bandejas} onChange={setBandejas} />
              <Counter label="Bandejas de fértiles" sublabel="Recolectadas — el empaque lo completás vos" value={bandFertiles} onChange={setBandFertiles} />
            </div>
            <div className="card space-y-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Empaque consumo</p>
              <Counter label="Docenas armadas" value={docenas} onChange={setDocenas} />
              <Counter label="Huevos rotos / descartados" sublabel="Unidades" value={rotos} onChange={setRotos} />
            </div>
            <div className="card">
              <label className="text-sm font-medium text-gray-500 mb-2 block">Notas opcionales</label>
              <textarea value={notasConsumo} onChange={e => setNotasConsumo(e.target.value)} rows={3} className="input-base resize-none" placeholder="Alguna observación del día..." />
            </div>
            {success === 'consumo' && (<div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-center text-sm font-medium">✓ Registro guardado correctamente</div>)}
            <button type="submit" disabled={loading} className="btn-primary w-full py-4 text-base">{loading ? 'Guardando...' : 'Guardar registro'}</button>
          </form>
        )}

        {isOwner && activeTab === 'fertiles' && (
          <form onSubmit={handleSubmitFertiles} className="space-y-4">
            <div className="card"><DatePicker value={dateFertiles} onChange={setDateFertiles} /></div>
            <div className="card space-y-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Empaque fértiles</p>
              <Counter label="Bandejas procesadas" sublabel="Las que entraron al proceso de selección" value={bandProcesadas} onChange={setBandProcesadas} />
              <Counter label="Docenas seleccionadas" sublabel="Las que quedaron aptas" value={docenasFertiles} onChange={setDocenasFertiles} />
              <Counter label="Descarte" sublabel="Rotos + no seleccionados (unidades)" value={descarte} onChange={setDescarte} />
            </div>
            <div className="card">
              <label className="text-sm font-medium text-gray-500 mb-2 block">Notas opcionales</label>
              <textarea value={notasFertiles} onChange={e => setNotasFertiles(e.target.value)} rows={3} className="input-base resize-none" placeholder="Observaciones del empaque..." />
            </div>
            {success === 'fertiles' && (<div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-center text-sm font-medium">✓ Registro guardado correctamente</div>)}
            <button type="submit" disabled={loading} className="btn-primary w-full py-4 text-base">{loading ? 'Guardando...' : 'Guardar empaque fértiles'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
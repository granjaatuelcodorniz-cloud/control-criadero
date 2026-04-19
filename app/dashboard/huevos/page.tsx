'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { ChevronDown, CheckCircle2, History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

// --- COMPONENTES AUXILIARES ---

function Counter({ label, value, onChange, sublabel }: { label: string; value: number | null; onChange: (v: number) => void; sublabel?: string; }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <label className="text-sm font-bold text-gray-700">{label}</label>
        {sublabel && <p className="text-[11px] text-gray-400 leading-tight">{sublabel}</p>}
      </div>
      <div className="bg-white rounded-3xl border-2 border-gray-100 flex items-center justify-between px-2 py-2 gap-2 shadow-sm">
        <button type="button" onClick={() => onChange(Math.max(0, (value ?? 0) - 1))} 
          className="w-14 h-14 rounded-2xl bg-gray-50 text-3xl font-light text-gray-400 active:scale-95 transition-all flex items-center justify-center select-none">−</button>
        
        {editing ? (
          <input type="number" inputMode="numeric" className="flex-1 text-center text-5xl font-black text-gray-900 outline-none bg-transparent" 
            value={raw} autoFocus onChange={e => setRaw(e.target.value)}
            onBlur={() => { const parsed = parseInt(raw); onChange(isNaN(parsed) || parsed < 0 ? 0 : parsed); setEditing(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { const parsed = parseInt(raw); onChange(isNaN(parsed) || parsed < 0 ? 0 : parsed); setEditing(false); } }} />
        ) : (
          <span className="flex-1 text-center text-5xl font-black text-gray-900 cursor-pointer py-2 select-none tracking-tighter" 
            onClick={() => { setRaw(value === null ? '' : String(value)); setEditing(true); }}>
            {value === null ? <span className="text-gray-200">—</span> : value}
          </span>
        )}
        
        <button type="button" onClick={() => onChange((value ?? 0) + 1)} 
          className="w-14 h-14 rounded-2xl bg-yellow-400 text-3xl font-bold text-yellow-950 active:scale-95 transition-all flex items-center justify-center select-none">+</button>
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
    <div className="flex items-center justify-between">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 py-1">
        <span className="font-bold text-gray-800 text-sm uppercase tracking-wider">{label}</span>
        <ChevronDown className={`w-4 h-4 text-yellow-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute mt-10 z-10 bg-white shadow-xl border border-gray-100 rounded-2xl p-2">
          <input type="date" className="input-base text-sm" value={value} max={today} 
            onChange={e => { onChange(e.target.value); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

// --- COMPONENTE PRINCIPAL ---

export default function RegistroHuevos() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'consumo' | 'fertiles'>('consumo');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  // Estados de Consumo
  const [dateConsumo, setDateConsumo] = useState(new Date().toISOString().split('T')[0]);
  const [bandejas, setBandejas] = useState<number | null>(null);
  const [bandFertiles, setBandFertiles] = useState<number | null>(null);
  const [docenas, setDocenas] = useState<number | null>(null);
  const [rotos, setRotos] = useState<number | null>(null);
  const [notasConsumo, setNotasConsumo] = useState('');

  // Estados de Fértiles
  const [dateFertiles, setDateFertiles] = useState(new Date().toISOString().split('T')[0]);
  const [bandProcesadas, setBandProcesadas] = useState<number | null>(null);
  const [docenasFertiles, setDocenasFertiles] = useState<number | null>(null);
  const [descarte, setDescarte] = useState<number | null>(null);
  const [notasFertiles, setNotasFertiles] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/');
  }, [user, authLoading, router]);

  const isOwner = profile?.role === 'owner';

  const handleSubmitConsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    const { error } = await supabase.from('daily_records').insert({
      date: dateConsumo,
      user_id: user.id,
      bandejas_consumo: bandejas ?? 0,
      bandejas_fertiles: bandFertiles ?? 0,
      docenas_armadas: docenas ?? 0,
      huevos_rotos: rotos ?? 0,
      notas: notasConsumo.trim() || null,
      registered_at: new Date().toTimeString().split(' ')[0],
    });

    if (!error) {
      setSuccess('consumo');
      setBandejas(null); setBandFertiles(null); setDocenas(null); setRotos(null); setNotasConsumo('');
      setTimeout(() => setSuccess(''), 3000);
    } else {
      alert('Error: ' + error.message);
    }
    setLoading(false);
  };

  const handleSubmitFertiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    const { error } = await supabase.from('fertile_records').insert({
      date: dateFertiles,
      user_id: user.id,
      bandejas_procesadas: bandProcesadas ?? 0,
      docenas_seleccionadas: docenasFertiles ?? 0,
      descarte: descarte ?? 0,
      notas: notasFertiles.trim() || null,
      registered_at: new Date().toTimeString().split(' ')[0],
    });

    if (!error) {
      setSuccess('fertiles');
      setBandProcesadas(null); setDocenasFertiles(null); setDescarte(null); setNotasFertiles('');
      setTimeout(() => setSuccess(''), 3000);
    } else {
      alert('Error: ' + error.message);
    }
    setLoading(false);
  };

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center font-medium text-gray-400">
      Cargando registro...
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        userName={profile?.full_name ?? ''}
        role={(profile?.role as 'owner' | 'collaborator') ?? 'collaborator'}
        backHref={isOwner ? '/dashboard/admin' : '/dashboard'}
        backLabel="Volver"
      />

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Registro Diario</h2>
          <History className="w-5 h-5 text-gray-300" />
        </div>

        {isOwner && (
          <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
            {(['consumo', 'fertiles'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                  ${activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>
                {tab === 'consumo' ? 'Consumo' : 'Fértiles'}
              </button>
            ))}
          </div>
        )}

        {/* Formulario Consumo / Recolección General */}
        {(activeTab === 'consumo' || !isOwner) && (
          <form onSubmit={handleSubmitConsumo} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
              <DatePicker value={dateConsumo} onChange={setDateConsumo} />
            </div>

            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-6">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Recolección de hoy</h3>
              <Counter label="Bandejas de consumo" value={bandejas} onChange={setBandejas} />
              <Counter label="Bandejas de fértiles" sublabel="Solo las recolectadas sin procesar" value={bandFertiles} onChange={setBandFertiles} />
            </div>

            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-6">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Empaque consumo</h3>
              <Counter label="Docenas armadas" value={docenas} onChange={setDocenas} />
              <Counter label="Huevos rotos / descartados" sublabel="Cantidad de unidades" value={rotos} onChange={setRotos} />
            </div>

            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Notas del día</label>
              <textarea value={notasConsumo} onChange={e => setNotasConsumo(e.target.value)} rows={3} 
                className="input-base resize-none border-none bg-gray-50 rounded-2xl" placeholder="Alguna novedad de las jaulas..." />
            </div>

            {success === 'consumo' && (
              <div className="flex items-center justify-center gap-2 text-green-600 font-bold animate-bounce py-2">
                <CheckCircle2 className="w-5 h-5" /> Registro guardado
              </div>
            )}
            
            <button type="submit" disabled={loading} className="btn-primary w-full py-5 text-lg shadow-xl shadow-yellow-100">
              {loading ? 'Guardando...' : 'FINALIZAR REGISTRO'}
            </button>
          </form>
        )}

        {/* Formulario Fértiles (Solo Admin) */}
        {isOwner && activeTab === 'fertiles' && (
          <form onSubmit={handleSubmitFertiles} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
              <DatePicker value={dateFertiles} onChange={setDateFertiles} />
            </div>

            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-6">
              <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em]">Selección Fértiles</h3>
              <Counter label="Bandejas procesadas" sublabel="Total que entró a selección" value={bandProcesadas} onChange={setBandProcesadas} />
              <Counter label="Docenas seleccionadas" sublabel="Aptas para incubar / venta" value={docenasFertiles} onChange={setDocenasFertiles} />
              <Counter label="Descarte" sublabel="Rotos o no aptos (unidades)" value={descarte} onChange={setDescarte} />
            </div>

            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Notas de selección</label>
              <textarea value={notasFertiles} onChange={e => setNotasFertiles(e.target.value)} rows={3} 
                className="input-base resize-none border-none bg-gray-50 rounded-2xl" placeholder="Detalles de la calidad..." />
            </div>

            {success === 'fertiles' && (
              <div className="flex items-center justify-center gap-2 text-green-600 font-bold animate-bounce py-2">
                <CheckCircle2 className="w-5 h-5" /> Empaque guardado
              </div>
            )}
            
            <button type="submit" disabled={loading} className="btn-primary w-full py-5 text-lg shadow-xl shadow-yellow-100 bg-gray-900 border-gray-900 text-white">
              {loading ? 'Guardando...' : 'GUARDAR SELECCIÓN'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
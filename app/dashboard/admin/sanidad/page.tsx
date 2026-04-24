'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import Header from '@/components/Header';
import { Plus, X, Calendar, ClipboardList, Beaker } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

type HealthRecord = {
  id: number;
  date: string;
  type: string;
  lot_id: number | null;
  dosis: string | null;
  notes: string | null;
  next_application: string | null;
};

type Lot = { id: number; code: string };

const TIPOS = ['Vitaminas', 'Antibiótico', 'Tratamiento', 'Limpieza profunda', 'Vacuna', 'Antiparasitario', 'Otro'];

export default function Sanidad() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [lotId, setLotId] = useState('');
  const [dosis, setDosis] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [nextApp, setNextApp] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [recordsRes, lotsRes] = await Promise.all([
        supabase.from('health_records').select('*').order('date', { ascending: false }),
        supabase.from('lots').select('id, code').order('start_date', { ascending: false }),
      ]);
      if (recordsRes.data) setRecords(recordsRes.data);
      if (lotsRes.data) setLots(lotsRes.data);
    } catch (error) {
      console.error('Error cargando sanidad:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }
    loadData();
  }, [authLoading, user, profile]);

  const handleSave = async () => {
    if (!tipo || !date || !user) return;
    setSaving(true);
    try {
      await supabase.from('health_records').insert({
        date,
        type: tipo,
        lot_id: lotId ? Number(lotId) : null,
        dosis: dosis.trim() || null,
        notes: notes.trim() || null,
        next_application: nextApp || null,
        user_id: user.id,
      });
      setTipo(TIPOS[0]);
      setLotId('');
      setDosis('');
      setNotes('');
      setNextApp('');
      setDate(new Date().toISOString().split('T')[0]);
      setShowForm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadData();
    } catch (error) {
      console.error('Error al guardar:', error);
    } finally {
      setSaving(false);
    }
  };

  const tipoColor = (t: string) => {
    switch (t) {
      case 'Antibiótico': return 'bg-red-100 text-red-700 border-red-200';
      case 'Vitaminas': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Limpieza profunda': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Vacuna': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Antiparasitario': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 font-medium text-sm">Cargando historial sanitario...</p>
      </div>
    </div>
  );

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        userName={profile.full_name}
        role={profile.role}
        backHref="/dashboard/admin"
        backLabel="Dashboard"
      />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Sanidad</h2>
          {saved && <span className="text-green-600 text-sm font-bold animate-pulse">✓ Guardado</span>}
        </div>

        {!showForm ? (
          <button onClick={() => setShowForm(true)}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-yellow-200 transition-all active:scale-95">
            <Plus className="w-5 h-5" /> Registrar evento sanitario
          </button>
        ) : (
          <div className="bg-white rounded-3xl border-2 border-yellow-100 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-800">Nuevo Registro</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Tipo</label>
                <select className="input-base mt-1" value={tipo} onChange={e => setTipo(e.target.value)}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Fecha</label>
                <input className="input-base mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Lote Destino</label>
              <select className="input-base mt-1" value={lotId} onChange={e => setLotId(e.target.value)}>
                <option value="">Todo el plantel</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.code}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Dosis</label>
                <input className="input-base mt-1" placeholder="Ej: 2ml / litro" value={dosis} onChange={e => setDosis(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Próx. Aplicación</label>
                <input className="input-base mt-1" type="date" value={nextApp} onChange={e => setNextApp(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Notas</label>
              <textarea className="input-base mt-1 h-20 py-3" placeholder="Observaciones..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-4 text-lg">
              {saving ? 'Guardando...' : 'Guardar Registro'}
            </button>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Historial Reciente</h3>
          {records.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-10 text-center">
              <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm font-medium">No hay registros cargados</p>
            </div>
          ) : (
            records.map(r => {
              const lot = lots.find(l => l.id === r.lot_id);
              return (
                <div key={r.id} className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex flex-wrap gap-2">
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-tighter ${tipoColor(r.type)}`}>
                        {r.type}
                      </span>
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full border border-gray-100 bg-gray-50 text-gray-500 uppercase tracking-tighter">
                        {lot ? lot.code : 'Todo el plantel'}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                      {new Date(r.date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {r.dosis && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Beaker className="w-4 h-4 text-gray-300" />
                        <span className="font-medium">{r.dosis}</span>
                      </div>
                    )}
                    {r.notes && (
                      <p className="text-sm text-gray-600 leading-relaxed bg-gray-50/50 p-3 rounded-2xl italic">"{r.notes}"</p>
                    )}
                    {r.next_application && (
                      <div className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 p-3 rounded-2xl border border-blue-100">
                        <Calendar className="w-4 h-4" />
                        Próxima aplicación: {new Date(r.next_application + 'T12:00:00').toLocaleDateString('es-AR')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
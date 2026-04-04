'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { Plus, X } from 'lucide-react';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };
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
  const [profile, setProfile] = useState<Profile | null>(null);
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

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/'; return; }

    const { data: profileData } = await supabase
      .from('profiles').select('full_name, role')
      .eq('id', user.id).single();
    if (!profileData || profileData.role !== 'owner') {
      window.location.href = '/dashboard'; return;
    }
    setProfile(profileData);

    const { data: recordsData } = await supabase
      .from('health_records').select('*')
      .order('date', { ascending: false });
    if (recordsData) setRecords(recordsData);

    const { data: lotsData } = await supabase
      .from('lots').select('id, code')
      .order('start_date', { ascending: false });
    if (lotsData) setLots(lotsData);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async () => {
    if (!tipo || !date) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadData();
  };

  const tipoColor = (t: string) => {
    if (t === 'Antibiótico') return 'bg-red-50 text-red-700';
    if (t === 'Vitaminas') return 'bg-green-50 text-green-700';
    if (t === 'Limpieza profunda') return 'bg-blue-50 text-blue-700';
    if (t === 'Vacuna') return 'bg-purple-50 text-purple-700';
    if (t === 'Antiparasitario') return 'bg-orange-50 text-orange-700';
    return 'bg-gray-50 text-gray-700';
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role}
        backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Sanidad</h2>
          {saved && <span className="text-green-600 text-sm font-medium">✓ Guardado</span>}
        </div>

        {/* Botón agregar */}
        {!showForm ? (
          <button onClick={() => setShowForm(true)} className="btn-primary w-full py-3 text-sm">
            <Plus className="w-4 h-4" /> Registrar evento sanitario
          </button>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Nuevo registro</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Tipo</label>
              <select className="input-base" value={tipo} onChange={e => setTipo(e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Fecha</label>
              <input className="input-base" type="date"
                value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Lote (opcional — vacío = todo el plantel)</label>
              <select className="input-base" value={lotId} onChange={e => setLotId(e.target.value)}>
                <option value="">Todo el plantel</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.code}</option>)}
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Dosis (opcional)</label>
              <input className="input-base" placeholder="Ej: 2ml por litro de agua"
                value={dosis} onChange={e => setDosis(e.target.value)} />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Próxima aplicación (opcional)</label>
              <input className="input-base" type="date"
                value={nextApp} onChange={e => setNextApp(e.target.value)} />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Notas (opcional)</label>
              <textarea className="input-base" rows={3}
                placeholder="Observaciones del tratamiento..."
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <button onClick={handleSave} disabled={saving}
              className="btn-primary w-full py-3 text-sm">
              {saving ? 'Guardando...' : 'Guardar registro'}
            </button>
          </div>
        )}

        {/* Historial */}
        {records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
            Sin registros sanitarios todavía
          </div>
        ) : (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Historial</h3>
            <div className="space-y-3">
              {records.map(r => {
                const lot = lots.find(l => l.id === r.lot_id);
                return (
                  <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${tipoColor(r.type)}`}>
                          {r.type}
                        </span>
                        {lot && (
                          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                            {lot.code}
                          </span>
                        )}
                        {!r.lot_id && (
                          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                            Todo el plantel
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('es-AR', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </span>
                    </div>

                    {r.dosis && (
                      <p className="text-sm text-gray-600 mb-1">
                        <span className="text-gray-400">Dosis:</span> {r.dosis}
                      </p>
                    )}
                    {r.notes && (
                      <p className="text-sm text-gray-600 mb-1">{r.notes}</p>
                    )}
                    {r.next_application && (
                      <p className="text-xs text-blue-600 mt-2 bg-blue-50 px-2 py-1 rounded-lg inline-block">
                        Próxima: {new Date(r.next_application + 'T12:00:00').toLocaleDateString('es-AR', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
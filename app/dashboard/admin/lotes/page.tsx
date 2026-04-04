'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };
type Lot = {
  id: number;
  code: string;
  start_date: string;
  initial_quantity: number;
  current_quantity: number;
  notes: string | null;
};
type Loss = {
  id: number;
  date: string;
  quantity: number;
  reason: string | null;
  lot_id: number;
};

export default function Lotes() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [losses, setLosses] = useState<Loss[]>([]);
  const [weekRecords, setWeekRecords] = useState<{ date: string; huevos_recolectados: number }[]>([]);
  const [showNewLot, setShowNewLot] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newQty, setNewQty] = useState(0);
  const [newNotes, setNewNotes] = useState('');
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

    const { data: lotsData } = await supabase
      .from('lots').select('*').order('start_date', { ascending: false });
    if (lotsData) setLots(lotsData);

    const { data: lossesData } = await supabase
      .from('lot_losses').select('*').order('date', { ascending: false });
    if (lossesData) setLosses(lossesData);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const { data: records } = await supabase
      .from('daily_records')
      .select('date, huevos_recolectados')
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
      .order('date');
    if (records) setWeekRecords(records);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleNewLot = async () => {
    if (!newCode.trim() || newQty <= 0) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('lots').insert({
      code: newCode.trim(),
      start_date: newDate,
      initial_quantity: newQty,
      current_quantity: newQty,
      notes: newNotes.trim() || null,
      created_by: user.id,
    });

    setNewCode('');
    setNewQty(0);
    setNewNotes('');
    setShowNewLot(false);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadData();
  };

  const posturaColor = (pct: number) => {
    if (pct >= 75) return 'bg-green-50 text-green-700 border-green-100';
    if (pct >= 50) return 'bg-yellow-50 text-yellow-700 border-yellow-100';
    return 'bg-red-50 text-red-700 border-red-100';
  };

  const calcPostura = (lot: Lot) => {
    if (lot.current_quantity === 0 || weekRecords.length === 0) return null;
    const totalHuevos = weekRecords.reduce((s, r) => s + r.huevos_recolectados, 0);
    const totalAves = lots.reduce((s, l) => s + l.current_quantity, 0);
    if (totalAves === 0) return null;
    const promedioTotal = totalHuevos / (weekRecords.length * totalAves);
    return Math.round(promedioTotal * 100);
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
          <h2 className="text-2xl font-bold text-gray-900">Lotes</h2>
          {saved && <span className="text-green-600 text-sm font-medium">✓ Guardado</span>}
        </div>

        {/* Lista de lotes */}
        <div className="space-y-3">
          {lots.map(lot => {
            const bajas = losses.filter(l => l.lot_id === lot.id);
            const postura = calcPostura(lot);
            return (
              <div key={lot.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{lot.code}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Ingreso: {new Date(lot.start_date + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  {postura !== null && (
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${posturaColor(postura)}`}>
                      {postura}% postura
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: 'Ingreso', value: lot.initial_quantity },
                    { label: 'Activas', value: lot.current_quantity },
                    { label: 'Bajas', value: lot.initial_quantity - lot.current_quantity },
                  ].map((m, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-2 text-center">
                      <p className="text-xs text-gray-400">{m.label}</p>
                      <p className="text-lg font-bold text-gray-900">{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* Barra de estado */}
                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                  <div
                    className="bg-yellow-400 h-1.5 rounded-full"
                    style={{ width: `${Math.round((lot.current_quantity / lot.initial_quantity) * 100)}%` }}
                  />
                </div>

                {/* Últimas bajas */}
                {bajas.length > 0 && (
                  <div className="border-t border-gray-50 pt-3">
                    <p className="text-xs text-gray-400 mb-2">Últimas bajas</p>
                    <div className="space-y-1">
                      {bajas.slice(0, 3).map(b => (
                        <div key={b.id} className="flex items-center justify-between text-xs text-gray-600">
                          <span>{new Date(b.date + 'T12:00:00').toLocaleDateString('es-AR')}</span>
                          <span className="font-medium">-{b.quantity} ave{b.quantity > 1 ? 's' : ''}</span>
                          {b.reason && <span className="text-gray-400 truncate max-w-32">{b.reason}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Nuevo lote */}
        {!showNewLot ? (
          <button
            onClick={() => setShowNewLot(true)}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-yellow-300 hover:text-yellow-500 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Agregar nuevo lote
          </button>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Nuevo lote</h3>
              <button onClick={() => setShowNewLot(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Nombre del lote</label>
              <input className="input-base" placeholder="Ej: Lote Sep-2025"
                value={newCode} onChange={e => setNewCode(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Fecha de ingreso</label>
              <input className="input-base" type="date"
                value={newDate} onChange={e => setNewDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Cantidad de aves</label>
              <input className="input-base" type="number" min="1"
                value={newQty} onChange={e => setNewQty(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Notas (opcional)</label>
              <input className="input-base" placeholder="Observaciones..."
                value={newNotes} onChange={e => setNewNotes(e.target.value)} />
            </div>
            <button onClick={handleNewLot} disabled={saving}
              className="btn-primary w-full py-3 text-sm">
              {saving ? 'Guardando...' : 'Guardar lote'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
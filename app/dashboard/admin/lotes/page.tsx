'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import Header from '@/components/Header';
import { Plus, X, TrendingUp, Skull } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

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
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [lots, setLots] = useState<Lot[]>([]);
  const [losses, setLosses] = useState<Loss[]>([]);
  const [weekRecords, setWeekRecords] = useState<{ date: string; docenas_armadas: number; huevos_rotos: number }[]>([]);
  const [showNewLot, setShowNewLot] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newQty, setNewQty] = useState(0);
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const [lotsRes, lossesRes, recordsRes] = await Promise.all([
        supabase.from('lots').select('*').order('start_date', { ascending: false }),
        supabase.from('lot_losses').select('*').order('date', { ascending: false }),
        supabase.from('daily_records')
          .select('date, docenas_armadas, huevos_rotos')
          .gte('date', sevenDaysAgo.toISOString().split('T')[0])
          .order('date'),
      ]);

      if (lotsRes.data) setLots(lotsRes.data);
      if (lossesRes.data) setLosses(lossesRes.data);
      if (recordsRes.data) setWeekRecords(recordsRes.data);
    } catch (error) {
      console.error('Error cargando datos:', error);
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

  const handleNewLot = async () => {
    if (!newCode.trim() || newQty <= 0 || !user) return;
    setSaving(true);
    try {
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
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadData();
    } catch (error) {
      console.error('Error al guardar lote:', error);
    } finally {
      setSaving(false);
    }
  };

  const posturaColor = (pct: number) => {
    if (pct >= 75) return 'bg-green-50 text-green-700 border-green-100';
    if (pct >= 50) return 'bg-yellow-50 text-yellow-700 border-yellow-100';
    return 'bg-red-50 text-red-700 border-red-100';
  };

  const calcPostura = (lot: Lot) => {
    if (lot.current_quantity === 0 || weekRecords.length === 0) return null;
    const totalHuevos = weekRecords.reduce((s, r) => s + (r.docenas_armadas * 12) + r.huevos_rotos, 0);
    const totalAvesActivas = lots.reduce((s, l) => s + l.current_quantity, 0);
    if (totalAvesActivas === 0) return null;
    const promedioDiario = totalHuevos / (weekRecords.length * totalAvesActivas);
    return Math.round(promedioDiario * 100);
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 font-medium">Cargando lotes...</p>
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
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Lotes</h2>
          {saved && <span className="text-green-600 text-sm font-medium animate-pulse">✓ Guardado</span>}
        </div>

        <div className="space-y-4">
          {lots.map(lot => {
            const bajasRelacionadas = losses.filter(l => l.lot_id === lot.id);
            const postura = calcPostura(lot);
            const pctActivas = Math.round((lot.current_quantity / lot.initial_quantity) * 100);

            return (
              <div key={lot.id} className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{lot.code}</h3>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Desde: {new Date(lot.start_date + 'T12:00:00').toLocaleDateString('es-AR', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                  {postura !== null && (
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${posturaColor(postura)}`}>
                      <TrendingUp className="w-3 h-3" />
                      {postura}% Postura
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Inicial', value: lot.initial_quantity, cls: 'bg-gray-50' },
                    { label: 'Activas', value: lot.current_quantity, cls: 'bg-blue-50 border border-blue-100 text-blue-700' },
                    { label: 'Bajas', value: lot.initial_quantity - lot.current_quantity, cls: 'bg-red-50 border border-red-100 text-red-700' },
                  ].map((m, i) => (
                    <div key={i} className={`rounded-2xl p-3 text-center ${m.cls}`}>
                      <p className="text-[10px] font-bold uppercase mb-1 opacity-60">{m.label}</p>
                      <p className="text-xl font-black">{m.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase">
                    <span>Supervivencia</span>
                    <span>{pctActivas}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-1000 ${pctActivas > 90 ? 'bg-green-400' : 'bg-yellow-400'}`}
                      style={{ width: `${pctActivas}%` }}
                    />
                  </div>
                </div>

                {bajasRelacionadas.length > 0 && (
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <div className="flex items-center gap-2 mb-2 text-gray-500">
                      <Skull className="w-3 h-3" />
                      <p className="text-[10px] font-bold uppercase tracking-tight">Bajas recientes</p>
                    </div>
                    <div className="space-y-2">
                      {bajasRelacionadas.slice(0, 2).map(b => (
                        <div key={b.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">{new Date(b.date + 'T12:00:00').toLocaleDateString('es-AR')}</span>
                          <span className="font-bold text-red-600">-{b.quantity}</span>
                          <span className="text-gray-400 italic truncate max-w-[100px]">{b.reason || 'Sin motivo'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!showNewLot ? (
          <button onClick={() => setShowNewLot(true)}
            className="w-full py-5 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-yellow-400 hover:text-yellow-600 hover:bg-yellow-50/50 transition-all flex items-center justify-center gap-3 font-bold">
            <Plus className="w-5 h-5" /> Agregar Nuevo Lote
          </button>
        ) : (
          <div className="bg-white rounded-3xl border-2 border-yellow-100 p-6 space-y-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Registrar Lote</h3>
              <button onClick={() => setShowNewLot(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nombre / Código</label>
                <input className="input-base mt-1" placeholder="Ej: Septiembre 2025"
                  value={newCode} onChange={e => setNewCode(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase ml-1">Fecha Ingreso</label>
                  <input className="input-base mt-1" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase ml-1">Cant. Aves</label>
                  <input className="input-base mt-1" type="number" value={newQty} onChange={e => setNewQty(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Notas</label>
                <textarea className="input-base mt-1 h-20 py-3" placeholder="Detalles del lote..."
                  value={newNotes} onChange={e => setNewNotes(e.target.value)} />
              </div>
            </div>
            <button onClick={handleNewLot} disabled={saving} className="btn-primary w-full py-4 text-lg shadow-yellow-200 shadow-lg">
              {saving ? 'Guardando...' : 'Confirmar Ingreso'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
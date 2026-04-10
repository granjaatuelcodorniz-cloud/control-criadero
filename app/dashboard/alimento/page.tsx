'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };
type Delivery = {
  id: number;
  date: string;
  total_kg: number;
  num_bolsas: number;
  kg_por_bolsa: number;
  proveedor: string | null;
  notas: string | null;
};
type Consumption = {
  id: number;
  date: string;
  delivery_id: number;
};

export default function Alimento() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  // Form nueva entrega (solo owner)
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [delDate, setDelDate] = useState(new Date().toISOString().split('T')[0]);
  const [delKg, setDelKg] = useState('');
  const [delBolsas, setDelBolsas] = useState('');
  const [delProveedor, setDelProveedor] = useState('');
  const [delNotas, setDelNotas] = useState('');

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/'; return; }

    const { data: profileData } = await supabase
      .from('profiles').select('full_name, role')
      .eq('id', user.id).single();
    if (!profileData) return;
    setProfile(profileData);

    const { data: deliveriesData } = await supabase
      .from('feed_deliveries').select('*')
      .order('date', { ascending: false });
    if (deliveriesData) setDeliveries(deliveriesData);

    const { data: consumptionsData } = await supabase
      .from('feed_consumptions').select('*')
      .order('date', { ascending: false });
    if (consumptionsData) setConsumptions(consumptionsData);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleOpenBolsa = async (delivery: Delivery) => {
    const consumed = consumptions.filter(c => c.delivery_id === delivery.id).length;
    if (consumed >= delivery.num_bolsas) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('feed_consumptions').insert({
      delivery_id: delivery.id,
      user_id: user.id,
      date: new Date().toISOString().split('T')[0],
    });

    setSuccess('bolsa');
    setTimeout(() => setSuccess(''), 3000);
    setSaving(false);
    await loadData();
  };

  const handleNewDelivery = async () => {
    if (!delKg || !delBolsas) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('feed_deliveries').insert({
      date: delDate,
      total_kg: Number(delKg),
      num_bolsas: Number(delBolsas),
      proveedor: delProveedor.trim() || null,
      notas: delNotas.trim() || null,
      user_id: user.id,
    });

    setDelKg('');
    setDelBolsas('');
    setDelProveedor('');
    setDelNotas('');
    setShowDeliveryForm(false);
    setSaving(false);
    setSuccess('entrega');
    setTimeout(() => setSuccess(''), 3000);
    await loadData();
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );
  if (!profile) return null;

  const isOwner = profile.role === 'owner';

  // Stock actual — última entrega activa
  const activeDelivery = deliveries.find(d => {
    const consumed = consumptions.filter(c => c.delivery_id === d.id).length;
    return consumed < d.num_bolsas;
  });

  const consumedInActive = activeDelivery
    ? consumptions.filter(c => c.delivery_id === activeDelivery.id).length
    : 0;
  const remainingBolsas = activeDelivery
    ? activeDelivery.num_bolsas - consumedInActive
    : 0;
  const remainingKg = activeDelivery
    ? Math.round((remainingBolsas * activeDelivery.kg_por_bolsa) * 10) / 10
    : 0;

  const stockPct = activeDelivery
    ? Math.round((remainingBolsas / activeDelivery.num_bolsas) * 100)
    : 0;

  const stockBarColor = stockPct > 50 ? 'bg-green-400' : stockPct > 20 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        userName={profile.full_name}
        role={profile.role}
        backHref={isOwner ? '/dashboard/admin' : '/dashboard'}
        backLabel="Volver"
      />

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Alimento</h2>
          {success === 'bolsa' && <span className="text-green-600 text-sm font-medium">✓ Bolsa registrada</span>}
          {success === 'entrega' && <span className="text-green-600 text-sm font-medium">✓ Entrega guardada</span>}
        </div>

        {/* Stock actual */}
        {activeDelivery ? (
          <div className="card space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Stock actual</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-2xl p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Bolsas restantes</p>
                <p className="text-3xl font-bold text-gray-900">{remainingBolsas}</p>
                <p className="text-xs text-gray-400 mt-1">de {activeDelivery.num_bolsas}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Kilos restantes</p>
                <p className="text-3xl font-bold text-gray-900">{remainingKg}</p>
                <p className="text-xs text-gray-400 mt-1">kg</p>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Stock</span>
                <span>{stockPct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${stockBarColor}`}
                  style={{ width: `${stockPct}%` }}
                />
              </div>
            </div>

            <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
              {activeDelivery.kg_por_bolsa} kg por bolsa ·{' '}
              {new Date(activeDelivery.date + 'T12:00:00').toLocaleDateString('es-AR', {
                day: 'numeric', month: 'long'
              })}
            </div>

            {/* Botón abrir bolsa */}
            <button
              onClick={() => handleOpenBolsa(activeDelivery)}
              disabled={saving || remainingBolsas === 0}
              className="btn-primary w-full py-5 text-lg"
            >
              {saving ? 'Registrando...' : '+ Abrí una bolsa'}
            </button>
          </div>
        ) : (
          <div className="card text-center text-gray-400 text-sm py-8">
            Sin stock de alimento registrado
          </div>
        )}

        {/* Nueva entrega — solo owner */}
        {isOwner && (
          <div>
            {!showDeliveryForm ? (
              <button
                onClick={() => setShowDeliveryForm(true)}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-yellow-300 hover:text-yellow-500 transition-all flex items-center justify-center gap-2 text-sm"
              >
                + Registrar nueva entrega de alimento
              </button>
            ) : (
              <div className="card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">Nueva entrega</h3>
                  <button onClick={() => setShowDeliveryForm(false)}
                    className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>

                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Fecha</label>
                  <input className="input-base" type="date"
                    value={delDate} onChange={e => setDelDate(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Total kg</label>
                    <input className="input-base" type="number" min="0" step="0.5"
                      placeholder="Ej: 250"
                      value={delKg} onChange={e => setDelKg(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">N° bolsas</label>
                    <input className="input-base" type="number" min="1"
                      placeholder="Ej: 10"
                      value={delBolsas} onChange={e => setDelBolsas(e.target.value)} />
                  </div>
                </div>

                {delKg && delBolsas && Number(delBolsas) > 0 && (
                  <div className="bg-yellow-50 rounded-xl px-3 py-2 text-sm text-yellow-800">
                    {Math.round((Number(delKg) / Number(delBolsas)) * 10) / 10} kg por bolsa
                  </div>
                )}

                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Proveedor (opcional)</label>
                  <input className="input-base" placeholder="Nombre del proveedor"
                    value={delProveedor} onChange={e => setDelProveedor(e.target.value)} />
                </div>

                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Notas (opcional)</label>
                  <textarea className="input-base resize-none" rows={2}
                    placeholder="Observaciones..."
                    value={delNotas} onChange={e => setDelNotas(e.target.value)} />
                </div>

                <button onClick={handleNewDelivery} disabled={saving}
                  className="btn-primary w-full py-3 text-sm">
                  {saving ? 'Guardando...' : 'Guardar entrega'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Historial entregas — solo owner */}
        {isOwner && deliveries.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Historial de entregas
            </h3>
            <div className="space-y-3">
              {deliveries.map(d => {
                const consumed = consumptions.filter(c => c.delivery_id === d.id).length;
                const remaining = d.num_bolsas - consumed;
                const pct = Math.round((remaining / d.num_bolsas) * 100);
                const isActive = remaining > 0;
                return (
                  <div key={d.id} className={`card ${isActive ? 'border-yellow-200' : ''}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium text-gray-800">
                          {new Date(d.date + 'T12:00:00').toLocaleDateString('es-AR', {
                            day: 'numeric', month: 'long', year: 'numeric'
                          })}
                        </p>
                        {d.proveedor && (
                          <p className="text-xs text-gray-400">{d.proveedor}</p>
                        )}
                      </div>
                      {isActive
                        ? <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-lg font-medium">Activa</span>
                        : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">Consumida</span>
                      }
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { label: 'Total kg', value: `${d.total_kg} kg` },
                        { label: 'Bolsas', value: `${consumed}/${d.num_bolsas}` },
                        { label: 'Restante', value: `${Math.round(remaining * d.kg_por_bolsa * 10) / 10} kg` },
                      ].map((m, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-2 text-center">
                          <p className="text-xs text-gray-400">{m.label}</p>
                          <p className="text-sm font-bold text-gray-900">{m.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${pct > 50 ? 'bg-green-400' : pct > 20 ? 'bg-yellow-400' : 'bg-red-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
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
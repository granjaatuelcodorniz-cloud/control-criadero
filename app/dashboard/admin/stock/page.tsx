'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Plus, X, Pencil, History, ArrowDownCircle, ArrowUpCircle, ClipboardList, Package, AlertTriangle } from 'lucide-react';

type StockItem = {
  id: number;
  name: string;
  unit: string;
  current_quantity: number;
  alert_threshold: number;
  is_feed: boolean;
  kg_por_bolsa: number | null;
  bolsas_restantes: number | null;
};

type Movement = {
  id: number;
  date: string;
  quantity: number;
  movement_type: 'entrada' | 'salida';
  notes: string | null;
  stock_item_id: number;
};

export default function Stock() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  const [showNewItem, setShowNewItem] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newQty, setNewQty] = useState(0);
  const [newThreshold, setNewThreshold] = useState(0);

  const [showFeedForm, setShowFeedForm] = useState<number | null>(null);
  const [feedKg, setFeedKg] = useState('');
  const [feedBolsas, setFeedBolsas] = useState('');
  const [feedDate, setFeedDate] = useState(new Date().toISOString().split('T')[0]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [itemsRes, movRes] = await Promise.all([
        supabase.from('stock_items').select('*').order('name'),
        supabase.from('stock_movements').select('*').order('date', { ascending: false }).limit(20),
      ]);
      if (itemsRes.data) setItems(itemsRes.data);
      if (movRes.data) setMovements(movRes.data);
    } catch (error) {
      console.error('Error cargando stock:', error);
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

  const handleOpenBolsa = async (feedItem: StockItem) => {
    if (!feedItem.kg_por_bolsa || !feedItem.bolsas_restantes || !user) return;
    setSaving(true);
    try {
      await Promise.all([
        supabase.from('stock_items').update({
          current_quantity: Math.max(0, feedItem.current_quantity - feedItem.kg_por_bolsa),
          bolsas_restantes: Math.max(0, feedItem.bolsas_restantes - 1),
        }).eq('id', feedItem.id),
        supabase.from('stock_movements').insert({
          stock_item_id: feedItem.id,
          quantity: feedItem.kg_por_bolsa,
          movement_type: 'salida',
          notes: 'Bolsa abierta',
          user_id: user.id,
          date: new Date().toISOString().split('T')[0],
        }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleFeedDelivery = async (feedItemId: number) => {
    if (!feedKg || !feedBolsas || !user) return;
    setSaving(true);
    const feedItem = items.find(i => i.id === feedItemId);
    if (!feedItem) { setSaving(false); return; }

    try {
      const totalKg = Number(feedKg);
      const numBolsas = Number(feedBolsas);
      const kgPorBolsa = Math.round((totalKg / numBolsas) * 100) / 100;

      await Promise.all([
        supabase.from('stock_items').update({
          current_quantity: feedItem.current_quantity + totalKg,
          kg_por_bolsa: kgPorBolsa,
          bolsas_restantes: (feedItem.bolsas_restantes ?? 0) + numBolsas,
        }).eq('id', feedItem.id),
        supabase.from('stock_movements').insert({
          stock_item_id: feedItem.id,
          quantity: totalKg,
          movement_type: 'entrada',
          notes: `${numBolsas} bolsas · ${kgPorBolsa} kg/bolsa`,
          user_id: user.id,
          date: feedDate,
        }),
      ]);
      setFeedKg('');
      setFeedBolsas('');
      setShowFeedForm(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleNewItem = async () => {
    if (!newName.trim() || !newUnit.trim()) return;
    setSaving(true);
    try {
      await supabase.from('stock_items').insert({
        name: newName.trim(),
        unit: newUnit.trim(),
        current_quantity: newQty,
        alert_threshold: newThreshold,
        is_feed: false,
      });
      setNewName('');
      setNewUnit('');
      setNewQty(0);
      setNewThreshold(0);
      setShowNewItem(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 font-medium text-sm">Cargando inventario...</p>
      </div>
    </div>
  );

  if (!profile) return null;

  const feedItems = items.filter(i => i.is_feed);
  const otherItems = items.filter(i => !i.is_feed);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Stock</h2>
          {saved && <span className="text-green-600 text-sm font-bold animate-pulse">✓ Actualizado</span>}
        </div>

        {/* ALIMENTOS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-gray-400 ml-1">
            <Package className="w-4 h-4" />
            <h3 className="text-xs font-black uppercase tracking-widest">Alimentos</h3>
          </div>

          {feedItems.map(item => {
            const isLow = item.current_quantity <= item.alert_threshold;
            return (
              <div key={item.id} className={`rounded-3xl border-2 p-5 transition-all ${isLow ? 'bg-orange-50 border-orange-200' : 'bg-white border-white shadow-sm'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{item.name}</h3>
                    {isLow && (
                      <div className="flex items-center gap-1 text-orange-600 font-bold text-[10px] uppercase mt-1">
                        <AlertTriangle className="w-3 h-3" /> Stock Crítico
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-gray-900">{item.current_quantity.toLocaleString('es-AR')}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">kg disponibles</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-white/50 rounded-2xl p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Bolsas Cerradas</p>
                    <p className="text-xl font-bold text-gray-800">{item.bolsas_restantes || 0}</p>
                  </div>
                  <div className="bg-white/50 rounded-2xl p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Peso p/ Bolsa</p>
                    <p className="text-xl font-bold text-gray-800">{item.kg_por_bolsa || 0} <span className="text-xs">kg</span></p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    disabled={saving || !item.bolsas_restantes}
                    onClick={() => handleOpenBolsa(item)}
                    className="flex-[2] py-4 bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-200 disabled:text-gray-400 text-yellow-950 rounded-2xl font-black text-sm transition-all active:scale-95 shadow-md shadow-yellow-200"
                  >
                    ABRIR BOLSA
                  </button>
                  <button
                    onClick={() => setShowFeedForm(showFeedForm === item.id ? null : item.id)}
                    className="flex-1 py-4 bg-gray-900 text-white rounded-2xl font-bold text-sm transition-all"
                  >
                    {showFeedForm === item.id ? 'CERRAR' : 'RECIBIR'}
                  </button>
                </div>

                {showFeedForm === item.id && (
                  <div className="mt-5 pt-5 border-t border-orange-100 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Peso Total (kg)</label>
                        <input type="number" className="input-base mt-1" placeholder="Ej: 1000" value={feedKg} onChange={e => setFeedKg(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Cant. Bolsas</label>
                        <input type="number" className="input-base mt-1" placeholder="Ej: 40" value={feedBolsas} onChange={e => setFeedBolsas(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Fecha recepción</label>
                      <input type="date" className="input-base mt-1" value={feedDate} onChange={e => setFeedDate(e.target.value)} />
                    </div>
                    <button onClick={() => handleFeedDelivery(item.id)} disabled={saving} className="btn-primary w-full py-4 rounded-2xl">
                      {saving ? 'Procesando...' : 'Confirmar Ingreso'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* INSUMOS GENERALES */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-gray-400 ml-1">
            <ClipboardList className="w-4 h-4" />
            <h3 className="text-xs font-black uppercase tracking-widest">Insumos Generales</h3>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {otherItems.map(item => (
              <div key={item.id} className="bg-white rounded-3xl border border-gray-100 p-4 flex items-center justify-between shadow-sm">
                <div>
                  <h4 className="font-bold text-gray-800">{item.name}</h4>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">
                    {item.current_quantity} {item.unit}
                    {item.current_quantity <= item.alert_threshold && <span className="text-orange-500 ml-1">⚠️ Bajo</span>}
                  </p>
                </div>
                <button className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-gray-600">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            ))}

            {!showNewItem ? (
              <button onClick={() => setShowNewItem(true)}
                className="w-full py-4 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-white transition-all">
                + Nuevo Insumo
              </button>
            ) : (
              <div className="bg-white rounded-3xl border-2 border-yellow-100 p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-black text-gray-800 uppercase text-xs">Registrar Insumo</h4>
                  <button onClick={() => setShowNewItem(false)}>
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <input className="input-base" placeholder="Nombre (ej: Viruta)" value={newName} onChange={e => setNewName(e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <input className="input-base" placeholder="Unidad (kg, lts)" value={newUnit} onChange={e => setNewUnit(e.target.value)} />
                  <input className="input-base" type="number" placeholder="Alerta mín." value={newThreshold} onChange={e => setNewThreshold(Number(e.target.value))} />
                </div>
                <button onClick={handleNewItem} disabled={saving} className="btn-primary w-full py-4">
                  {saving ? 'Guardando...' : 'Guardar Insumo'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* MOVIMIENTOS RECIENTES */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-gray-400 ml-1">
            <History className="w-4 h-4" />
            <h3 className="text-xs font-black uppercase tracking-widest">Últimos Movimientos</h3>
          </div>
          <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-50">
            {movements.map(m => {
              const item = items.find(i => i.id === m.stock_item_id);
              return (
                <div key={m.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {m.movement_type === 'entrada'
                      ? <ArrowUpCircle className="text-green-500 w-5 h-5" />
                      : <ArrowDownCircle className="text-red-500 w-5 h-5" />}
                    <div>
                      <p className="text-sm font-bold text-gray-800">{item?.name || 'Insumo'}</p>
                      <p className="text-[10px] text-gray-400 font-medium">{m.notes}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black ${m.movement_type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.movement_type === 'entrada' ? '+' : '-'}{m.quantity}
                    </p>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">
                      {new Date(m.date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
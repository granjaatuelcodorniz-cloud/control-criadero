'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Plus, X, Pencil, Check, Trash2 } from 'lucide-react';

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
  const [selectedItem, setSelectedItem] = useState('');
  const [movType, setMovType] = useState<'entrada' | 'salida'>('entrada');
  const [movQty, setMovQty] = useState(0);
  const [movNotes, setMovNotes] = useState('');
  const [showMovForm, setShowMovForm] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editThreshold, setEditThreshold] = useState(0);
  const [editUnit, setEditUnit] = useState('');

  // Formulario de entrega de alimento (múltiples)
  const [showFeedForm, setShowFeedForm] = useState<number | null>(null);
  const [feedKg, setFeedKg] = useState('');
  const [feedBolsas, setFeedBolsas] = useState('');
  const [feedDate, setFeedDate] = useState(new Date().toISOString().split('T')[0]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);

    const { data: itemsData } = await supabase
      .from('stock_items')
      .select('*')
      .order('name');

    if (itemsData) setItems(itemsData);

    const { data: movData } = await supabase
      .from('stock_movements')
      .select('*')
      .order('date', { ascending: false })
      .limit(30);

    if (movData) setMovements(movData);

    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }

    loadData();
  }, [authLoading, user, profile]);

  // === ABRIR BOLSA (para cualquier alimento) ===
  const handleOpenBolsa = async (feedItem: StockItem) => {
    if (!feedItem.kg_por_bolsa || !feedItem.bolsas_restantes || !user) return;
    setSaving(true);

    const newKg = Math.max(0, feedItem.current_quantity - feedItem.kg_por_bolsa);
    const newBolsas = Math.max(0, feedItem.bolsas_restantes - 1);

    await supabase.from('stock_items').update({
      current_quantity: newKg,
      bolsas_restantes: newBolsas,
    }).eq('id', feedItem.id);

    await supabase.from('stock_movements').insert({
      stock_item_id: feedItem.id,
      quantity: feedItem.kg_por_bolsa,
      movement_type: 'salida',
      notes: 'Bolsa abierta',
      user_id: user.id,
      date: new Date().toISOString().split('T')[0],
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await loadData();
  };

  // === NUEVA ENTREGA DE ALIMENTO (múltiples) ===
  const handleFeedDelivery = async (feedItemId: number) => {
    if (!feedKg || !feedBolsas || !user) return;
    setSaving(true);

    const feedItem = items.find(i => i.id === feedItemId);
    if (!feedItem) return;

    const totalKg = Number(feedKg);
    const numBolsas = Number(feedBolsas);
    const kgPorBolsa = Math.round((totalKg / numBolsas) * 100) / 100;

    await supabase.from('stock_items').update({
      current_quantity: feedItem.current_quantity + totalKg,
      kg_por_bolsa: kgPorBolsa,
      bolsas_restantes: (feedItem.bolsas_restantes ?? 0) + numBolsas,
    }).eq('id', feedItem.id);

    await supabase.from('stock_movements').insert({
      stock_item_id: feedItem.id,
      quantity: totalKg,
      movement_type: 'entrada',
      notes: `${numBolsas} bolsas · ${kgPorBolsa} kg/bolsa`,
      user_id: user.id,
      date: feedDate,
    });

    setFeedKg('');
    setFeedBolsas('');
    setShowFeedForm(null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await loadData();
  };

  // Resto de funciones (mantengo las tuyas)
  const handleMovement = async () => { /* tu código actual */ };
  const handleNewItem = async () => { /* tu código actual */ };
  const handleSaveEdit = async (item: StockItem) => { /* tu código actual */ };
  const handleDeleteItem = async (id: number) => { /* tu código actual */ };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Cargando stock...</div>;
  }

  if (!profile) return null;

  // Separar alimentos y otros insumos
  const feedItems = items.filter(i => i.is_feed === true);
  const otherItems = items.filter(i => i.is_feed !== true);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Stock</h2>
          {saved && <span className="text-green-600 text-sm font-medium">✓ Guardado</span>}
        </div>

        {/* ALIMENTOS - Soporte múltiple */}
        {feedItems.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Alimentos</h3>
            <div className="space-y-4">
              {feedItems.map((feedItem) => (
                <div key={feedItem.id} className={`rounded-2xl border p-5 ${feedItem.current_quantity <= feedItem.alert_threshold ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">{feedItem.name}</h3>
                    <div className="text-right">
                      <span className="text-2xl font-bold">{feedItem.current_quantity}</span>
                      <span className="text-sm text-gray-400 ml-1">kg</span>
                    </div>
                  </div>

                  {feedItem.bolsas_restantes !== null && feedItem.kg_por_bolsa && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-white rounded-xl p-3 text-center border">
                        <p className="text-xs text-gray-400">Bolsas restantes</p>
                        <p className="text-xl font-bold">{feedItem.bolsas_restantes}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 text-center border">
                        <p className="text-xs text-gray-400">Kg por bolsa</p>
                        <p className="text-xl font-bold">{feedItem.kg_por_bolsa}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenBolsa(feedItem)}
                      disabled={saving || !feedItem.bolsas_restantes}
                      className="btn-primary flex-1 py-3 text-sm"
                    >
                      + Abrir una bolsa
                    </button>
                    <button
                      onClick={() => setShowFeedForm(feedItem.id)}
                      className="btn-secondary px-5 py-3 text-sm"
                    >
                      Nueva entrega
                    </button>
                  </div>

                  {/* Formulario de entrega */}
                  {showFeedForm === feedItem.id && (
                    <div className="mt-5 pt-5 border-t space-y-4">
                      <div>
                        <label className="text-sm text-gray-600 mb-1 block">Fecha</label>
                        <input 
                          type="date" 
                          className="input-base" 
                          value={feedDate} 
                          onChange={e => setFeedDate(e.target.value)} 
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm text-gray-600 mb-1 block">Total kg</label>
                          <input 
                            type="number" 
                            className="input-base" 
                            placeholder="1200" 
                            value={feedKg} 
                            onChange={e => setFeedKg(e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-sm text-gray-600 mb-1 block">N° de bolsas</label>
                          <input 
                            type="number" 
                            className="input-base" 
                            placeholder="48" 
                            value={feedBolsas} 
                            onChange={e => setFeedBolsas(e.target.value)} 
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => handleFeedDelivery(feedItem.id)} 
                        disabled={saving}
                        className="btn-primary w-full py-3"
                      >
                        {saving ? 'Guardando...' : 'Confirmar entrega'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resto de tu código (otros insumos, movimientos, historial, agregar nuevo insumo) se mantiene igual */}

        {/* ... (pegá aquí el resto de tu código original para otros insumos, movimientos, etc.) ... */}

      </div>
    </div>
  );
}
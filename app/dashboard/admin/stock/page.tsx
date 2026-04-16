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

  // Formulario movimiento
  const [selectedItem, setSelectedItem] = useState('');
  const [movType, setMovType] = useState<'entrada' | 'salida'>('entrada');
  const [movQty, setMovQty] = useState(0);
  const [movNotes, setMovNotes] = useState('');
  const [showMovForm, setShowMovForm] = useState(false);

  // Formulario nuevo insumo
  const [showNewItem, setShowNewItem] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newQty, setNewQty] = useState(0);
  const [newThreshold, setNewThreshold] = useState(0);

  // Edición
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editThreshold, setEditThreshold] = useState(0);
  const [editUnit, setEditUnit] = useState('');

  // Entrega de alimento
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

  // Abrir bolsa
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

  // Nueva entrega de alimento
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

  const handleMovement = async () => {
    if (!selectedItem || movQty <= 0 || !user) return;
    setSaving(true);

    const item = items.find(i => String(i.id) === selectedItem);
    if (!item) return;

    const newQtyCalc = movType === 'entrada'
      ? item.current_quantity + movQty
      : Math.max(0, item.current_quantity - movQty);

    await supabase.from('stock_movements').insert({
      stock_item_id: Number(selectedItem),
      quantity: movQty,
      movement_type: movType,
      notes: movNotes.trim() || null,
      user_id: user.id,
      date: new Date().toISOString().split('T')[0],
    });

    await supabase.from('stock_items')
      .update({ current_quantity: newQtyCalc })
      .eq('id', Number(selectedItem));

    setMovQty(0);
    setMovNotes('');
    setShowMovForm(false);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadData();
  };

  const handleNewItem = async () => {
    if (!newName.trim() || !newUnit.trim()) return;
    setSaving(true);

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
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadData();
  };

  const handleSaveEdit = async (item: StockItem) => {
    await supabase.from('stock_items').update({
      alert_threshold: editThreshold,
      unit: editUnit,
    }).eq('id', item.id);
    setEditingId(null);
    await loadData();
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('¿Eliminar este insumo? Se perderá el historial de movimientos.')) return;
    await supabase.from('stock_movements').delete().eq('stock_item_id', id);
    await supabase.from('stock_items').delete().eq('id', id);
    await loadData();
  };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Cargando stock...</div>;
  }

  if (!profile) return null;

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

        {/* ==================== ALIMENTOS ==================== */}
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

                  {showFeedForm === feedItem.id && (
                    <div className="mt-5 pt-5 border-t space-y-4">
                      <div>
                        <label className="text-sm text-gray-600 mb-1 block">Fecha</label>
                        <input type="date" className="input-base" value={feedDate} onChange={e => setFeedDate(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm text-gray-600 mb-1 block">Total kg</label>
                          <input type="number" className="input-base" placeholder="1200" value={feedKg} onChange={e => setFeedKg(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-sm text-gray-600 mb-1 block">N° de bolsas</label>
                          <input type="number" className="input-base" placeholder="48" value={feedBolsas} onChange={e => setFeedBolsas(e.target.value)} />
                        </div>
                      </div>
                      <button 
                        onClick={() => handleFeedDelivery(feedItem.id)} 
                        disabled={saving}
                        className="btn-primary w-full py-3 text-sm"
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

        {/* ==================== OTROS INSUMOS ==================== */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Otros Insumos</h3>
          <div className="space-y-3">
            {otherItems.map(item => (
              <div key={item.id} className={`rounded-2xl border p-4 ${item.current_quantity <= item.alert_threshold ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
                {editingId === item.id ? (
                  <div className="space-y-3">
                    <p className="font-semibold">{item.name}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">Unidad</label>
                        <input className="input-base text-sm" value={editUnit} onChange={e => setEditUnit(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Mínimo alerta</label>
                        <input className="input-base text-sm" type="number" value={editThreshold} onChange={e => setEditThreshold(Number(e.target.value))} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEdit(item)} className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-1">
                        <Check className="w-4 h-4" /> Guardar
                      </button>
                      <button onClick={() => setEditingId(null)} className="btn-secondary px-3 py-2">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-500">{item.current_quantity} {item.unit}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingId(item.id);
                            setEditThreshold(item.alert_threshold);
                            setEditUnit(item.unit);
                          }} 
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Agregar nuevo insumo */}
        {!showNewItem ? (
          <button 
            onClick={() => setShowNewItem(true)}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-yellow-300 hover:text-yellow-500 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Agregar nuevo insumo
          </button>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Nuevo insumo</h3>
              <button onClick={() => setShowNewItem(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Nombre</label>
              <input className="input-base" placeholder="Ej: Desinfectante" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Unidad</label>
              <input className="input-base" placeholder="Ej: litros, kg, unidades" value={newUnit} onChange={e => setNewUnit(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Stock inicial</label>
              <input className="input-base" type="number" min="0" value={newQty} onChange={e => setNewQty(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Mínimo para alerta</label>
              <input className="input-base" type="number" min="0" value={newThreshold} onChange={e => setNewThreshold(Number(e.target.value))} />
            </div>
            <button onClick={handleNewItem} disabled={saving} className="btn-primary w-full py-3 text-sm">
              {saving ? 'Guardando...' : 'Guardar insumo'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
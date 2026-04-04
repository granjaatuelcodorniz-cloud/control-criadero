'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { Plus, X } from 'lucide-react';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };
type StockItem = {
  id: number;
  name: string;
  unit: string;
  current_quantity: number;
  alert_threshold: number;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [movType, setMovType] = useState<'entrada' | 'salida'>('entrada');
  const [movQty, setMovQty] = useState(0);
  const [movNotes, setMovNotes] = useState('');
  const [showNewItem, setShowNewItem] = useState(false);
  const [showMovForm, setShowMovForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newQty, setNewQty] = useState(0);
  const [newThreshold, setNewThreshold] = useState(0);
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

    const { data: itemsData } = await supabase
      .from('stock_items').select('*').order('name');
    if (itemsData) {
      setItems(itemsData);
      if (itemsData.length > 0) setSelectedItem(String(itemsData[0].id));
    }

    const { data: movData } = await supabase
      .from('stock_movements').select('*')
      .order('date', { ascending: false }).limit(20);
    if (movData) setMovements(movData);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleMovement = async () => {
    if (!selectedItem || movQty <= 0) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

  const stockColor = (item: StockItem) => {
    if (item.current_quantity <= 0) return 'bg-red-50 border-red-100';
    if (item.current_quantity <= item.alert_threshold) return 'bg-yellow-50 border-yellow-100';
    return 'bg-white border-gray-100';
  };

  const stockBarColor = (item: StockItem) => {
    if (item.current_quantity <= 0) return 'bg-red-400';
    if (item.current_quantity <= item.alert_threshold) return 'bg-yellow-400';
    return 'bg-green-400';
  };

  const stockPct = (item: StockItem) => {
    if (item.alert_threshold === 0) return 100;
    const max = item.alert_threshold * 4;
    return Math.min(100, Math.round((item.current_quantity / max) * 100));
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
          <h2 className="text-2xl font-bold text-gray-900">Stock</h2>
          {saved && <span className="text-green-600 text-sm font-medium">✓ Guardado</span>}
        </div>

        {/* Insumos */}
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className={`rounded-2xl border p-4 ${stockColor(item)}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{item.name}</h3>
                <div className="text-right">
                  <span className="text-xl font-bold text-gray-900">{item.current_quantity}</span>
                  <span className="text-sm text-gray-400 ml-1">{item.unit}</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
                <div
                  className={`h-1.5 rounded-full transition-all ${stockBarColor(item)}`}
                  style={{ width: `${stockPct(item)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">Mínimo: {item.alert_threshold} {item.unit}</p>
            </div>
          ))}
        </div>

        {/* Registrar movimiento */}
        {!showMovForm ? (
          <button
            onClick={() => setShowMovForm(true)}
            className="btn-primary w-full py-3 text-sm"
          >
            Registrar movimiento de stock
          </button>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Nuevo movimiento</h3>
              <button onClick={() => setShowMovForm(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Insumo</label>
              <select className="input-base" value={selectedItem}
                onChange={e => setSelectedItem(e.target.value)}>
                {items.map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {(['entrada', 'salida'] as const).map(t => (
                  <button key={t} onClick={() => setMovType(t)}
                    className={`py-2 rounded-xl border text-sm font-medium transition-all
                      ${movType === t ? 'bg-yellow-400 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-600'}`}>
                    {t === 'entrada' ? '+ Entrada' : '- Salida'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Cantidad</label>
              <input className="input-base" type="number" min="0"
                value={movQty} onChange={e => setMovQty(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Nota (opcional)</label>
              <input className="input-base" placeholder="Ej: compra mensual..."
                value={movNotes} onChange={e => setMovNotes(e.target.value)} />
            </div>
            <button onClick={handleMovement} disabled={saving}
              className="btn-primary w-full py-3 text-sm">
              {saving ? 'Guardando...' : 'Confirmar movimiento'}
            </button>
          </div>
        )}

        {/* Historial reciente */}
        {movements.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Últimos movimientos</h3>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              {movements.slice(0, 8).map(m => {
                const item = items.find(i => i.id === m.stock_item_id);
                return (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(m.date + 'T12:00:00').toLocaleDateString('es-AR')}
                        {m.notes && ` · ${m.notes}`}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${m.movement_type === 'entrada' ? 'text-green-600' : 'text-red-500'}`}>
                      {m.movement_type === 'entrada' ? '+' : '-'}{m.quantity}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Nuevo insumo */}
        {!showNewItem ? (
          <button
            onClick={() => setShowNewItem(true)}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-yellow-300 hover:text-yellow-500 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Agregar insumo
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
              <input className="input-base" placeholder="Ej: Desinfectante"
                value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Unidad</label>
              <input className="input-base" placeholder="Ej: litros, kg, unidades"
                value={newUnit} onChange={e => setNewUnit(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Stock inicial</label>
              <input className="input-base" type="number" min="0"
                value={newQty} onChange={e => setNewQty(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Alerta mínimo</label>
              <input className="input-base" type="number" min="0"
                value={newThreshold} onChange={e => setNewThreshold(Number(e.target.value))} />
            </div>
            <button onClick={handleNewItem} disabled={saving}
              className="btn-primary w-full py-3 text-sm">
              {saving ? 'Guardando...' : 'Guardar insumo'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
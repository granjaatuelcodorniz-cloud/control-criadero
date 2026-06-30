'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import {
  Plus, X, Pencil, History, ArrowDownCircle, ArrowUpCircle,
  ClipboardList, Package, AlertTriangle, Check,
} from 'lucide-react';
import { ToastViewport, useToast } from '@/components/Feedback';
import { assertSupabaseAllOk, assertSupabaseOk, getErrorMessage } from '@/lib/supabase-ops';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Inline Edit Card (insumos generales) ─────────────────────────────────────

function InsumoCard({
  item,
  onSave,
  onAdjust,
}: {
  item: StockItem;
  onSave: (id: number, name: string, threshold: number) => Promise<void>;
  onAdjust: (item: StockItem, qty: number, type: 'entrada' | 'salida', notes: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState<'entrada' | 'salida' | null>(null);
  const [editName, setEditName] = useState(item.name);
  const [editThreshold, setEditThreshold] = useState(item.alert_threshold);
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustNotes, setAdjustNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isLow = item.current_quantity <= item.alert_threshold;

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await onSave(item.id, editName.trim(), editThreshold);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async () => {
    if (adjustQty <= 0) return;
    setSaving(true);
    try {
      await onAdjust(item, adjustQty, adjusting!, adjustNotes);
      setAdjusting(null);
      setAdjustQty(1);
      setAdjustNotes('');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="bg-white rounded-3xl border-2 border-yellow-200 p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-black text-gray-400 uppercase">Editar insumo</p>
          <button onClick={() => setEditing(false)}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <input className="input-base" placeholder="Nombre" value={editName} onChange={e => setEditName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Unidad</label>
            <div className="input-base mt-1 bg-gray-50 text-gray-400 cursor-not-allowed">{item.unit}</div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Alerta mín.</label>
            <input className="input-base mt-1" type="number" min={0}
              value={editThreshold} onChange={e => setEditThreshold(Number(e.target.value))} />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="btn-primary w-full py-3 text-sm">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-3xl border p-4 shadow-sm transition-all
      ${isLow ? 'border-orange-200 bg-orange-50/40' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-bold text-gray-800">{item.name}</h4>
          <p className={`text-xs font-bold uppercase tracking-tighter mt-0.5
            ${isLow ? 'text-orange-500' : 'text-gray-400'}`}>
            {item.current_quantity} {item.unit}
            {isLow && <span className="ml-1">⚠ Bajo</span>}
          </p>
        </div>
        <button onClick={() => setEditing(true)} className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-gray-600 transition-colors">
          <Pencil className="w-4 h-4" />
        </button>
      </div>

      {/* Botones ajuste */}
      {adjusting === null ? (
        <div className="flex gap-2">
          <button onClick={() => setAdjusting('entrada')}
            className="flex-1 py-2 rounded-xl bg-green-50 border border-green-100 text-green-700 text-xs font-bold hover:bg-green-100 transition-colors flex items-center justify-center gap-1">
            <ArrowUpCircle className="w-3.5 h-3.5" /> Entrada
          </button>
          <button onClick={() => setAdjusting('salida')}
            className="flex-1 py-2 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-1">
            <ArrowDownCircle className="w-3.5 h-3.5" /> Salida
          </button>
        </div>
      ) : (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <p className="text-[10px] font-bold uppercase text-gray-400">
            {adjusting === 'entrada' ? '+ Entrada de stock' : '− Salida de stock'}
          </p>
          <div className="flex gap-2">
            <input type="number" min={1} className="input-base text-center font-bold"
              value={adjustQty} onChange={e => setAdjustQty(Number(e.target.value))}
              placeholder={`Cant. (${item.unit})`} />
            <input className="input-base flex-[2]" placeholder="Motivo (opcional)"
              value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdjust} disabled={saving}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1
                ${adjusting === 'entrada'
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'}`}>
              <Check className="w-4 h-4" />
              {saving ? '...' : 'Confirmar'}
            </button>
            <button onClick={() => { setAdjusting(null); setAdjustQty(1); setAdjustNotes(''); }}
              className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold hover:bg-gray-200 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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

  const [filterItemId, setFilterItemId] = useState<number | 'all'>('all');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  const flash = (message = 'Stock actualizado') => showToast(message);

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, movRes] = await Promise.all([
        supabase.from('stock_items').select('*').order('name'),
        supabase.from('stock_movements').select('*').order('date', { ascending: false }).limit(40),
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
  }, [authLoading, user, profile, router, loadData]);

  // ── Alimento: abrir bolsa ───────────────────────────────────────────────────
  const handleOpenBolsa = async (feedItem: StockItem) => {
    if (!feedItem.kg_por_bolsa || !feedItem.bolsas_restantes || !user) return;
    setSaving(true);
    try {
      const results = await Promise.all([
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
      assertSupabaseAllOk(results, 'No se pudo abrir la bolsa.');
      flash('Bolsa abierta y stock actualizado');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo abrir la bolsa.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Alimento: recibir entrega ───────────────────────────────────────────────
  const handleFeedDelivery = async (feedItemId: number) => {
    if (!feedKg || !feedBolsas || !user) return;
    setSaving(true);
    const feedItem = items.find(i => i.id === feedItemId);
    if (!feedItem) { setSaving(false); return; }
    try {
      const totalKg = Number(feedKg);
      const numBolsas = Number(feedBolsas);
      const kgPorBolsa = Math.round((totalKg / numBolsas) * 100) / 100;
      const results = await Promise.all([
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
      assertSupabaseAllOk(results, 'No se pudo registrar la entrega.');
      setFeedKg('');
      setFeedBolsas('');
      setShowFeedForm(null);
      flash('Entrega registrada');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo registrar la entrega.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Insumo general: nuevo ───────────────────────────────────────────────────
  const handleNewItem = async () => {
    if (!newName.trim() || !newUnit.trim()) return;
    setSaving(true);
    try {
      assertSupabaseOk(await supabase.from('stock_items').insert({
        name: newName.trim(),
        unit: newUnit.trim(),
        current_quantity: newQty,
        alert_threshold: newThreshold,
        is_feed: false,
      }));
      setNewName('');
      setNewUnit('');
      setNewQty(0);
      setNewThreshold(0);
      setShowNewItem(false);
      flash('Insumo creado');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo crear el insumo.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Insumo general: editar ──────────────────────────────────────────────────
  const handleEditItem = async (id: number, name: string, threshold: number) => {
    try {
      assertSupabaseOk(await supabase.from('stock_items').update({ name, alert_threshold: threshold }).eq('id', id));
      flash('Insumo actualizado');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo actualizar el insumo.'), 'error');
      throw error;
    }
  };

  // ── Insumo general: ajuste entrada/salida ───────────────────────────────────
  const handleAdjust = async (
    item: StockItem,
    qty: number,
    type: 'entrada' | 'salida',
    notes: string,
  ) => {
    if (!user) return;
    const newQtyVal = type === 'entrada'
      ? item.current_quantity + qty
      : Math.max(0, item.current_quantity - qty);
    try {
      const results = await Promise.all([
        supabase.from('stock_items').update({ current_quantity: newQtyVal }).eq('id', item.id),
        supabase.from('stock_movements').insert({
          stock_item_id: item.id,
          quantity: qty,
          movement_type: type,
          notes: notes || null,
          user_id: user.id,
          date: new Date().toISOString().split('T')[0],
        }),
      ]);
      assertSupabaseAllOk(results, 'No se pudo ajustar el stock.');
      flash(type === 'entrada' ? 'Entrada registrada' : 'Salida registrada');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo ajustar el stock.'), 'error');
      throw error;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
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

  const filteredMovements = filterItemId === 'all'
    ? movements
    : movements.filter(m => m.stock_item_id === filterItemId);

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastViewport toast={toast} onClose={hideToast} />
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Stock</h2>
        </div>

        {/* ── ALIMENTOS ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-gray-400 ml-1">
            <Package className="w-4 h-4" />
            <h3 className="text-xs font-black uppercase tracking-widest">Alimentos</h3>
          </div>

          {feedItems.map(item => {
            const isLow = item.current_quantity <= item.alert_threshold;
            return (
              <div key={item.id} className={`rounded-3xl border-2 p-5 transition-all
                ${isLow ? 'bg-orange-50 border-orange-200' : 'bg-white border-white shadow-sm'}`}>

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
                    <p className="text-xl font-bold text-gray-800">
                      {item.kg_por_bolsa || 0} <span className="text-xs">kg</span>
                    </p>
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
                    className="flex-1 py-4 bg-gray-900 text-white rounded-2xl font-bold text-sm transition-all active:scale-95"
                  >
                    {showFeedForm === item.id ? 'CERRAR' : 'RECIBIR'}
                  </button>
                </div>

                {showFeedForm === item.id && (
                  <div className="mt-5 pt-5 border-t border-orange-100 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Peso Total (kg)</label>
                        <input type="number" className="input-base mt-1" placeholder="Ej: 1000"
                          value={feedKg} onChange={e => setFeedKg(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Cant. Bolsas</label>
                        <input type="number" className="input-base mt-1" placeholder="Ej: 40"
                          value={feedBolsas} onChange={e => setFeedBolsas(e.target.value)} />
                      </div>
                    </div>
                    {feedKg && feedBolsas && Number(feedBolsas) > 0 && (
                      <div className="bg-yellow-50 border border-yellow-100 rounded-2xl px-4 py-2 text-sm text-yellow-800 font-medium">
                        {Number(feedKg) / Number(feedBolsas) % 1 === 0
                          ? Math.round(Number(feedKg) / Number(feedBolsas))
                          : (Number(feedKg) / Number(feedBolsas)).toFixed(2)} kg por bolsa
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Fecha recepción</label>
                      <input type="date" className="input-base mt-1"
                        value={feedDate} onChange={e => setFeedDate(e.target.value)} />
                    </div>
                    <button onClick={() => handleFeedDelivery(item.id)} disabled={saving || !feedKg || !feedBolsas}
                      className="btn-primary w-full py-4 rounded-2xl disabled:opacity-40">
                      {saving ? 'Procesando...' : 'Confirmar Ingreso'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* ── INSUMOS GENERALES ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-gray-400 ml-1">
            <ClipboardList className="w-4 h-4" />
            <h3 className="text-xs font-black uppercase tracking-widest">Insumos Generales</h3>
          </div>

          <div className="space-y-3">
            {otherItems.map(item => (
              <InsumoCard
                key={item.id}
                item={item}
                onSave={handleEditItem}
                onAdjust={handleAdjust}
              />
            ))}

            {!showNewItem ? (
              <button onClick={() => setShowNewItem(true)}
                className="w-full py-4 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-white hover:border-yellow-300 hover:text-yellow-500 transition-all flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Nuevo Insumo
              </button>
            ) : (
              <div className="bg-white rounded-3xl border-2 border-yellow-100 p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-black text-gray-800 uppercase text-xs">Registrar Insumo</h4>
                  <button onClick={() => setShowNewItem(false)}>
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <input className="input-base" placeholder="Nombre (ej: Viruta)"
                  value={newName} onChange={e => setNewName(e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <input className="input-base" placeholder="Unidad (kg, lts, u)"
                    value={newUnit} onChange={e => setNewUnit(e.target.value)} />
                  <input className="input-base" type="number" placeholder="Alerta mín."
                    value={newThreshold} onChange={e => setNewThreshold(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Cantidad inicial</label>
                  <input className="input-base mt-1" type="number" min={0} placeholder="0"
                    value={newQty} onChange={e => setNewQty(Number(e.target.value))} />
                </div>
                <button onClick={handleNewItem} disabled={saving || !newName.trim() || !newUnit.trim()}
                  className="btn-primary w-full py-4 disabled:opacity-40">
                  {saving ? 'Guardando...' : 'Guardar Insumo'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── MOVIMIENTOS RECIENTES ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <div className="flex items-center gap-2 text-gray-400">
              <History className="w-4 h-4" />
              <h3 className="text-xs font-black uppercase tracking-widest">Últimos Movimientos</h3>
            </div>
            {/* Filtro por insumo */}
            <select
              value={filterItemId}
              onChange={e => setFilterItemId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-yellow-400"
            >
              <option value="all">Todos</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-50">
            {filteredMovements.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Sin movimientos</p>
            )}
            {filteredMovements.map(m => {
              const item = items.find(i => i.id === m.stock_item_id);
              return (
                <div key={m.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {m.movement_type === 'entrada'
                      ? <ArrowUpCircle className="text-green-500 w-5 h-5 shrink-0" />
                      : <ArrowDownCircle className="text-red-500 w-5 h-5 shrink-0" />}
                    <div>
                      <p className="text-sm font-bold text-gray-800">{item?.name || 'Insumo'}</p>
                      <p className="text-[10px] text-gray-400 font-medium">{m.notes || '—'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black ${m.movement_type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.movement_type === 'entrada' ? '+' : '−'}{m.quantity} {item?.unit || ''}
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

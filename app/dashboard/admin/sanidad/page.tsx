'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import {
  Plus, X, Calendar, ClipboardList, Beaker,
  AlertTriangle, ChevronDown, ChevronUp, Trash2, FlaskConical, Pencil, Check,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

type HealthRecord = {
  id: number;
  date: string;
  type: string;
  lot_id: number | null;
  dosis: string | null;
  notes: string | null;
  next_application: string | null;
  health_product_id: number | null;
  dose_calculated: number | null;
  dose_applied: number | null;
  water_liters: number | null;
};

type HealthProduct = {
  id: number;
  name: string;
  type: string;
  dose_per_bird: number;
  unit: string;
  notes: string | null;
};

type Lot = { id: number; code: string; status: string };
type CageSlot = { lot_id: number; quantity: number };

const TIPOS = ['Vitaminas', 'Antibiótico', 'Tratamiento', 'Limpieza profunda', 'Vacuna', 'Antiparasitario', 'Otro'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tipoColor(t: string) {
  switch (t) {
    case 'Antibiótico': return 'bg-red-100 text-red-700 border-red-200';
    case 'Vitaminas': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Limpieza profunda': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Vacuna': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'Antiparasitario': return 'bg-orange-100 text-orange-700 border-orange-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function nextAppStatus(dateStr: string, today: string): 'overdue' | 'soon' | 'ok' {
  const diff = Math.ceil((new Date(dateStr).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff <= 3) return 'soon';
  return 'ok';
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onSave,
  onDelete,
}: {
  product: HealthProduct;
  onSave: (id: number, data: Partial<HealthProduct>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [type, setType] = useState(product.type);
  const [dosePerBird, setDosePerBird] = useState(product.dose_per_bird);
  const [unit, setUnit] = useState(product.unit);
  const [notes, setNotes] = useState(product.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(product.id, { name: name.trim(), type, dose_per_bird: dosePerBird, unit, notes: notes.trim() || null });
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="bg-white rounded-2xl border-2 border-yellow-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase">Editar producto</p>
          <button onClick={() => setEditing(false)}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <input className="input-base" placeholder="Nombre del producto" value={name} onChange={e => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Tipo</label>
            <select className="input-base mt-1" value={type} onChange={e => setType(e.target.value)}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Unidad</label>
            <input className="input-base mt-1" placeholder="ml, g, cc" value={unit} onChange={e => setUnit(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Dosis por ave ({unit})</label>
          <input className="input-base mt-1" type="number" min={0} step={0.001}
            value={dosePerBird} onChange={e => setDosePerBird(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Notas</label>
          <input className="input-base mt-1" placeholder="Observaciones del producto"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-3 text-sm">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between shadow-sm">
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-gray-800">{product.name}</p>
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${tipoColor(product.type)}`}>
            {product.type}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {product.dose_per_bird} {product.unit} por ave
        </p>
        {product.notes && <p className="text-xs text-gray-400 italic mt-0.5">{product.notes}</p>}
      </div>
      <div className="flex gap-1 ml-3">
        <button onClick={() => setEditing(true)} className="p-2 text-gray-300 hover:text-gray-600 transition-colors">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={() => onDelete(product.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Sanidad() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [slots, setSlots] = useState<CageSlot[]>([]);
  const [products, setProducts] = useState<HealthProduct[]>([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [lotId, setLotId] = useState('');
  const [productId, setProductId] = useState('');
  const [dosis, setDosis] = useState('');
  const [doseCalculated, setDoseCalculated] = useState<number | null>(null);
  const [doseApplied, setDoseApplied] = useState<string>('');
  const [waterLiters, setWaterLiters] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [nextApp, setNextApp] = useState('');
  const [nextAppDays, setNextAppDays] = useState('');

  // Products management
  const [showProducts, setShowProducts] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdType, setNewProdType] = useState(TIPOS[0]);
  const [newProdDose, setNewProdDose] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('ml');
  const [newProdNotes, setNewProdNotes] = useState('');

  // Filter
  const [filterTipo, setFilterTipo] = useState<string>('all');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    try {
      const [recordsRes, lotsRes, slotsRes, productsRes] = await Promise.all([
        supabase.from('health_records').select('*').order('date', { ascending: false }),
        supabase.from('lots').select('id, code, status').eq('status', 'activo').order('start_date', { ascending: false }),
        supabase.from('cage_slots').select('lot_id, quantity'),
        supabase.from('health_products').select('*').order('name'),
      ]);
      if (recordsRes.data) setRecords(recordsRes.data);
      if (lotsRes.data) setLots(lotsRes.data);
      if (slotsRes.data) setSlots(slotsRes.data);
      if (productsRes.data) setProducts(productsRes.data);
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

  // ── Calculadora de dosis ────────────────────────────────────────────────────
  useEffect(() => {
    const product = products.find(p => String(p.id) === productId);
    if (!product) { setDoseCalculated(null); setDoseApplied(''); return; }

    let aves = 0;
    if (lotId) {
      aves = slots.filter(s => s.lot_id === Number(lotId)).reduce((s, sl) => s + sl.quantity, 0);
    } else {
      aves = slots.reduce((s, sl) => s + sl.quantity, 0);
    }

    const calc = Math.round(product.dose_per_bird * aves * 100) / 100;
    setDoseCalculated(calc);
    setDoseApplied(String(calc));
  }, [productId, lotId, products, slots]);

  // Calcular próxima aplicación desde días
  useEffect(() => {
    if (!nextAppDays || isNaN(Number(nextAppDays))) return;
    const d = new Date(date);
    d.setDate(d.getDate() + Number(nextAppDays));
    setNextApp(d.toISOString().split('T')[0]);
  }, [nextAppDays, date]);

  const getAvesCount = (lotId: string) => {
    if (lotId) return slots.filter(s => s.lot_id === Number(lotId)).reduce((s, sl) => s + sl.quantity, 0);
    return slots.reduce((s, sl) => s + sl.quantity, 0);
  };

  const selectedProduct = products.find(p => String(p.id) === productId);

  // ── Guardar registro ────────────────────────────────────────────────────────
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
        health_product_id: productId ? Number(productId) : null,
        dose_calculated: doseCalculated,
        dose_applied: doseApplied ? Number(doseApplied) : null,
        water_liters: waterLiters ? Number(waterLiters) : null,
      });
      // Reset form
      setTipo(TIPOS[0]);
      setLotId('');
      setProductId('');
      setDosis('');
      setDoseCalculated(null);
      setDoseApplied('');
      setWaterLiters('');
      setNotes('');
      setNextApp('');
      setNextAppDays('');
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

  // ── Eliminar registro ───────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return;
    await supabase.from('health_records').delete().eq('id', id);
    await loadData();
  };

  // ── Productos ───────────────────────────────────────────────────────────────
  const handleSaveProduct = async (id: number, data: Partial<HealthProduct>) => {
    await supabase.from('health_products').update(data).eq('id', id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await loadData();
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('¿Eliminar este producto?')) return;
    await supabase.from('health_products').update({ id }).eq('id', id);
    await supabase.from('health_products').delete().eq('id', id);
    await loadData();
  };

  const handleNewProduct = async () => {
    if (!newProdName.trim() || !newProdDose) return;
    setSaving(true);
    try {
      await supabase.from('health_products').insert({
        name: newProdName.trim(),
        type: newProdType,
        dose_per_bird: Number(newProdDose),
        unit: newProdUnit,
        notes: newProdNotes.trim() || null,
      });
      setNewProdName('');
      setNewProdDose('');
      setNewProdUnit('ml');
      setNewProdNotes('');
      setShowNewProduct(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 font-medium text-sm">Cargando sanidad...</p>
      </div>
    </div>
  );

  if (!profile) return null;

  // Alertas — próximas aplicaciones vencidas o en ≤3 días
  const pendingAlerts = records.filter(r =>
    r.next_application && nextAppStatus(r.next_application, today) !== 'ok'
  );

  const filteredRecords = filterTipo === 'all'
    ? records
    : records.filter(r => r.type === filterTipo);

  const avesTotal = slots.reduce((s, sl) => s + sl.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Sanidad</h2>
          {saved && <span className="text-green-600 text-sm font-bold animate-pulse">✓ Guardado</span>}
        </div>

        {/* ── Banner de alertas ── */}
        {pendingAlerts.length > 0 && (
          <div className="space-y-2">
            {pendingAlerts.map(r => {
              const status = nextAppStatus(r.next_application!, today);
              const lot = lots.find(l => l.id === r.lot_id);
              return (
                <div key={r.id}
                  className={`flex items-start gap-3 rounded-2xl px-4 py-3 border
                    ${status === 'overdue'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-200'}`}>
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${status === 'overdue' ? 'text-red-500' : 'text-amber-500'}`} />
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${status === 'overdue' ? 'text-red-700' : 'text-amber-700'}`}>
                      {status === 'overdue' ? 'Aplicación vencida' : 'Aplicación próxima'} — {r.type}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {lot ? lot.code : 'Todo el plantel'} ·{' '}
                      {new Date(r.next_application! + 'T12:00:00').toLocaleDateString('es-AR')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Botón nuevo registro ── */}
        {!showForm ? (
          <button onClick={() => setShowForm(true)}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-yellow-200 transition-all active:scale-95">
            <Plus className="w-5 h-5" /> Registrar evento sanitario
          </button>
        ) : (
          <div className="bg-white rounded-3xl border-2 border-yellow-100 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
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
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Lote destino</label>
              <select className="input-base mt-1" value={lotId} onChange={e => setLotId(e.target.value)}>
                <option value="">Todo el plantel ({avesTotal} aves)</option>
                {lots.map(l => {
                  const aves = slots.filter(s => s.lot_id === l.id).reduce((s, sl) => s + sl.quantity, 0);
                  return <option key={l.id} value={l.id}>{l.code} — {aves} aves</option>;
                })}
              </select>
            </div>

            {/* Calculadora de dosis */}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Producto</label>
                <select className="input-base mt-1" value={productId} onChange={e => setProductId(e.target.value)}>
                  <option value="">Sin producto registrado</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.dose_per_bird} {p.unit}/ave)</option>)}
                </select>
              </div>

              {selectedProduct && doseCalculated !== null && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-blue-500" />
                    <p className="text-xs font-bold text-blue-700 uppercase">Calculadora de dosis</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white rounded-xl p-2 border border-blue-100">
                      <p className="text-[9px] text-blue-400 font-bold uppercase">Aves</p>
                      <p className="text-lg font-black text-blue-700">{getAvesCount(lotId)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-2 border border-blue-100">
                      <p className="text-[9px] text-blue-400 font-bold uppercase">Por ave</p>
                      <p className="text-lg font-black text-blue-700">{selectedProduct.dose_per_bird}{selectedProduct.unit}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-2 border border-yellow-200">
                      <p className="text-[9px] text-yellow-600 font-bold uppercase">Total</p>
                      <p className="text-lg font-black text-yellow-700">{doseCalculated}{selectedProduct.unit}</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-blue-600 uppercase ml-1">
                      Dosis a aplicar (editable)
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <input className="input-base text-center font-bold" type="number" min={0} step={0.01}
                        value={doseApplied} onChange={e => setDoseApplied(e.target.value)} />
                      <span className="text-sm font-bold text-gray-500 shrink-0">{selectedProduct.unit}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-blue-600 uppercase ml-1">
                      Litros de agua (opcional)
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <input className="input-base text-center font-bold" type="number" min={0} step={0.5}
                        placeholder="0"
                        value={waterLiters} onChange={e => setWaterLiters(e.target.value)} />
                      <span className="text-sm font-bold text-gray-500 shrink-0">litros</span>
                    </div>
                    {waterLiters && Number(waterLiters) > 0 && doseApplied && (
                      <div className="mt-2 bg-white border border-blue-100 rounded-xl px-3 py-2 text-center">
                        <p className="text-xs font-bold text-blue-700">
                          {(Number(doseApplied) / Number(waterLiters)).toFixed(2)} {selectedProduct.unit} por litro de agua
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dosis libre si no hay producto */}
              {!selectedProduct && (
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Dosis (texto libre)</label>
                  <input className="input-base mt-1" placeholder="Ej: 2ml / litro"
                    value={dosis} onChange={e => setDosis(e.target.value)} />
                </div>
              )}
            </div>

            {/* Próxima aplicación */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                  Próx. aplicación en días
                </label>
                <input className="input-base mt-1" type="number" min={1} placeholder="Ej: 7"
                  value={nextAppDays} onChange={e => setNextAppDays(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                  Fecha calculada
                </label>
                <input className="input-base mt-1" type="date"
                  value={nextApp} onChange={e => setNextApp(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Notas</label>
              <textarea className="input-base mt-1 h-20 py-3" placeholder="Observaciones..."
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-4 text-lg">
              {saving ? 'Guardando...' : 'Guardar Registro'}
            </button>
          </div>
        )}

        {/* ── Gestión de productos ── */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowProducts(p => !p)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-bold text-gray-600">Productos registrados</span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">{products.length}</span>
            </div>
            {showProducts ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showProducts && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
              {products.map(p => (
                <ProductCard key={p.id} product={p} onSave={handleSaveProduct} onDelete={handleDeleteProduct} />
              ))}

              {!showNewProduct ? (
                <button onClick={() => setShowNewProduct(true)}
                  className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 text-xs font-bold uppercase hover:border-yellow-300 hover:text-yellow-500 transition-all flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Nuevo producto
                </button>
              ) : (
                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-gray-400 uppercase">Nuevo producto</p>
                    <button onClick={() => setShowNewProduct(false)}><X className="w-4 h-4 text-gray-400" /></button>
                  </div>
                  <input className="input-base" placeholder="Nombre del producto"
                    value={newProdName} onChange={e => setNewProdName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Tipo</label>
                      <select className="input-base mt-1" value={newProdType} onChange={e => setNewProdType(e.target.value)}>
                        {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Unidad</label>
                      <input className="input-base mt-1" placeholder="ml, g, cc"
                        value={newProdUnit} onChange={e => setNewProdUnit(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                      Dosis por ave ({newProdUnit})
                    </label>
                    <input className="input-base mt-1" type="number" min={0} step={0.001} placeholder="0.02"
                      value={newProdDose} onChange={e => setNewProdDose(e.target.value)} />
                  </div>
                  <input className="input-base" placeholder="Notas del producto (opcional)"
                    value={newProdNotes} onChange={e => setNewProdNotes(e.target.value)} />
                  <button onClick={handleNewProduct} disabled={saving || !newProdName.trim() || !newProdDose}
                    className="btn-primary w-full py-3 text-sm disabled:opacity-40">
                    {saving ? 'Guardando...' : 'Guardar producto'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Historial ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Historial</h3>
            <select
              value={filterTipo}
              onChange={e => setFilterTipo(e.target.value)}
              className="text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-yellow-400"
            >
              <option value="all">Todos los tipos</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-10 text-center">
              <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm font-medium">No hay registros</p>
            </div>
          ) : (
            filteredRecords.map(r => {
              const lot = lots.find(l => l.id === r.lot_id);
              const product = products.find(p => p.id === r.health_product_id);
              const alertStatus = r.next_application ? nextAppStatus(r.next_application, today) : null;

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
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                      <button onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-gray-200 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {/* Producto y dosis aplicada */}
                    {product && r.dose_applied !== null && (
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-3 py-2">
                        <FlaskConical className="w-4 h-4 text-blue-400 shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-bold text-blue-700">{product.name}</p>
                          <p className="text-xs text-blue-500">
                            {r.dose_applied} {product.unit} aplicados
                            {r.water_liters ? ` · ${(r.dose_applied / r.water_liters).toFixed(2)} ${product.unit}/litro` : ''}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Dosis texto libre */}
                    {!product && r.dosis && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Beaker className="w-4 h-4 text-gray-300" />
                        <span className="font-medium">{r.dosis}</span>
                      </div>
                    )}

                    {r.notes && (
                      <p className="text-sm text-gray-600 leading-relaxed bg-gray-50/50 p-3 rounded-2xl italic">"{r.notes}"</p>
                    )}

                    {r.next_application && (
                      <div className={`flex items-center gap-2 text-xs font-bold p-3 rounded-2xl border
                        ${alertStatus === 'overdue'
                          ? 'bg-red-50 border-red-200 text-red-600'
                          : alertStatus === 'soon'
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                        <Calendar className="w-4 h-4 shrink-0" />
                        <span>
                          {alertStatus === 'overdue' && '⚠ Vencida — '}
                          {alertStatus === 'soon' && '⏰ Próxima — '}
                          Próxima aplicación: {new Date(r.next_application + 'T12:00:00').toLocaleDateString('es-AR')}
                        </span>
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
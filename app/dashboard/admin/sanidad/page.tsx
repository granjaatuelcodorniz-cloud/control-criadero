'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import {
  Plus, X, Calendar, ClipboardList, Beaker,
  AlertTriangle, ChevronDown, ChevronUp, Trash2,
  FlaskConical, Pencil, SkipForward,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibilityReload } from '@/lib/visibility-reload';
import { useRouter } from 'next/navigation';
import { ConfirmDialog, ToastViewport, useToast } from '@/components/Feedback';
import { assertSupabaseOk, getErrorMessage } from '@/lib/supabase-ops';
import { getToday, toDateStr } from '@/lib/date';

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
  duration_days: number | null;
};

type HealthProduct = {
  id: number;
  name: string;
  type: string;
  dose_per_bird: number;
  unit: string;
  notes: string | null;
};

type TreatmentConfirmation = {
  record_id: number;
  date: string;
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
  const diff = Math.ceil((new Date(dateStr + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff <= 3) return 'soon';
  return 'ok';
}

// Devuelve el día actual dentro del ciclo (1-based), o null si no está en ciclo
function getTreatmentDay(record: HealthRecord, today: string): number | null {
  if (!record.duration_days) return null;
  const start = new Date(record.date + 'T12:00:00');
  const current = new Date(today + 'T12:00:00');
  const diff = Math.floor((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0 || diff >= record.duration_days) return null;
  return diff + 1;
}

function isActiveTreatment(record: HealthRecord, today: string): boolean {
  return getTreatmentDay(record, today) !== null;
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product, onSave, onDelete,
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
    try {
      await onSave(product.id, { name: name.trim(), type, dose_per_bird: dosePerBird, unit, notes: notes.trim() || null });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="bg-white rounded-2xl border-2 border-yellow-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase">Editar producto</p>
          <button onClick={() => setEditing(false)}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <input className="input-base" placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} />
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
        <input className="input-base" placeholder="Notas (opcional)" value={notes} onChange={e => setNotes(e.target.value)} />
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
        <p className="text-xs text-gray-400 mt-0.5">{product.dose_per_bird} {product.unit} por ave</p>
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
  const [confirmations, setConfirmations] = useState<TreatmentConfirmation[]>([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [lotId, setLotId] = useState('');
  const [productId, setProductId] = useState('');
  const [dosis, setDosis] = useState('');
  const [doseCalculated, setDoseCalculated] = useState<number | null>(null);
  const [doseApplied, setDoseApplied] = useState('');
  const [waterLiters, setWaterLiters] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(getToday);
  const [nextApp, setNextApp] = useState('');
  const [nextAppDays, setNextAppDays] = useState('');
  const [durationDays, setDurationDays] = useState('');

  // Products panel
  const [showProducts, setShowProducts] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdType, setNewProdType] = useState(TIPOS[0]);
  const [newProdDose, setNewProdDose] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('ml');
  const [newProdNotes, setNewProdNotes] = useState('');

  // Postpone
  const [postponeId, setPostponeId] = useState<number | null>(null);
  const [postponeDays, setPostponeDays] = useState('3');

  // Filter
  const [filterTipo, setFilterTipo] = useState('all');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ type: 'record' | 'product'; id: number } | null>(null);
  const { toast, showToast, hideToast } = useToast();

  const today = getToday();
  const flash = (message: string) => showToast(message);

  const loadData = useCallback(async () => {
    try {
      const [recordsRes, lotsRes, slotsRes, productsRes, confirmRes] = await Promise.all([
        supabase.from('health_records').select('*').order('date', { ascending: false }),
        supabase.from('lots').select('id, code, status').eq('status', 'activo').order('start_date', { ascending: false }),
        supabase.from('cage_slots').select('lot_id, quantity'),
        supabase.from('health_products').select('*').order('name'),
        supabase.from('treatment_confirmations').select('record_id, date'),
      ]);
      if (recordsRes.data) setRecords(recordsRes.data);
      if (lotsRes.data) setLots(lotsRes.data);
      if (slotsRes.data) setSlots(slotsRes.data);
      if (productsRes.data) setProducts(productsRes.data);
      if (confirmRes.data) setConfirmations(confirmRes.data);
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
  }, [authLoading, user, profile, router, loadData]);

  useVisibilityReload(loadData);

  // ── Calculadora de dosis ────────────────────────────────────────────────────
  useEffect(() => {
    const product = products.find(p => String(p.id) === productId);
    if (!product) { setDoseCalculated(null); setDoseApplied(''); return; }
    const aves = lotId
      ? slots.filter(s => s.lot_id === Number(lotId)).reduce((s, sl) => s + sl.quantity, 0)
      : slots.reduce((s, sl) => s + sl.quantity, 0);
    const calc = Math.round(product.dose_per_bird * aves * 100) / 100;
    setDoseCalculated(calc);
    setDoseApplied(String(calc));
  }, [productId, lotId, products, slots]);

  // Próxima aplicación desde días
  useEffect(() => {
    if (!nextAppDays || isNaN(Number(nextAppDays))) return;
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + Number(nextAppDays));
    setNextApp(toDateStr(d));
  }, [nextAppDays, date]);

  const getAvesCount = (lotId: string) =>
    lotId
      ? slots.filter(s => s.lot_id === Number(lotId)).reduce((s, sl) => s + sl.quantity, 0)
      : slots.reduce((s, sl) => s + sl.quantity, 0);

  const selectedProduct = products.find(p => String(p.id) === productId);
  const avesTotal = slots.reduce((s, sl) => s + sl.quantity, 0);

  // ── Guardar registro ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!tipo || !date || !user) return;
    setSaving(true);
    try {
      assertSupabaseOk(await supabase.from('health_records').insert({
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
        duration_days: durationDays ? Number(durationDays) : null,
      }));
      setTipo(TIPOS[0]); setLotId(''); setProductId(''); setDosis('');
      setDoseCalculated(null); setDoseApplied(''); setWaterLiters('');
      setNotes(''); setNextApp(''); setNextAppDays(''); setDurationDays('');
      setDate(getToday());
      setShowForm(false);
      flash('Registro sanitario guardado');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo guardar el registro sanitario.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Eliminar registro ───────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    setPendingDelete({ type: 'record', id });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      if (pendingDelete.type === 'record') {
        assertSupabaseOk(await supabase.from('health_records').delete().eq('id', pendingDelete.id));
        showToast('Registro eliminado');
      } else {
        assertSupabaseOk(await supabase.from('health_products').delete().eq('id', pendingDelete.id));
        showToast('Producto eliminado');
      }
      setPendingDelete(null);
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo eliminar.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Posponer next_application ───────────────────────────────────────────────
  const handlePostpone = async (record: HealthRecord) => {
    if (!record.next_application || !postponeDays) return;
    setSaving(true);
    try {
      const d = new Date(record.next_application + 'T12:00:00');
      d.setDate(d.getDate() + Number(postponeDays));
      assertSupabaseOk(await supabase.from('health_records')
        .update({ next_application: toDateStr(d) })
        .eq('id', record.id));
      setPostponeId(null);
      flash('Aplicación pospuesta');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo posponer la aplicación.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Productos ───────────────────────────────────────────────────────────────
  const handleSaveProduct = async (id: number, data: Partial<HealthProduct>) => {
    try {
      assertSupabaseOk(await supabase.from('health_products').update(data).eq('id', id));
      flash('Producto actualizado');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo actualizar el producto.'), 'error');
      throw error;
    }
  };

  const handleDeleteProduct = async (id: number) => {
    setPendingDelete({ type: 'product', id });
  };

  const handleNewProduct = async () => {
    if (!newProdName.trim() || !newProdDose) return;
    setSaving(true);
    try {
      assertSupabaseOk(await supabase.from('health_products').insert({
        name: newProdName.trim(), type: newProdType,
        dose_per_bird: Number(newProdDose), unit: newProdUnit,
        notes: newProdNotes.trim() || null,
      }));
      setNewProdName(''); setNewProdDose(''); setNewProdUnit('ml'); setNewProdNotes('');
      setShowNewProduct(false);
      flash('Producto creado');
      await loadData();
    } catch (error) {
      showToast(getErrorMessage(error, 'No se pudo crear el producto.'), 'error');
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

  const pendingAlerts = records.filter(r =>
    r.next_application && nextAppStatus(r.next_application, today) !== 'ok'
  );

  const activeTreatments = records.filter(r => isActiveTreatment(r, today));

  const filteredRecords = filterTipo === 'all'
    ? records
    : records.filter(r => r.type === filterTipo);

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastViewport toast={toast} onClose={hideToast} />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.type === 'product' ? 'Eliminar producto' : 'Eliminar registro'}
        description={pendingDelete?.type === 'product'
          ? 'El producto dejará de estar disponible para nuevos registros sanitarios.'
          : 'El registro sanitario se eliminará del historial. Esta acción no se puede deshacer.'}
        confirmLabel="Eliminar"
        danger
        busy={saving}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Sanidad</h2>
        </div>

        {/* ── Tratamientos activos ── */}
        {activeTreatments.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tratamientos en curso</p>
            {activeTreatments.map(r => {
              const day = getTreatmentDay(r, today)!;
              const product = products.find(p => p.id === r.health_product_id);
              const lot = lots.find(l => l.id === r.lot_id);
              const confirmedToday = confirmations.some(c => c.record_id === r.id && c.date === today);
              return (
                <div key={r.id} className={`rounded-2xl border-2 p-4 transition-all
                  ${confirmedToday ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase ${tipoColor(r.type)}`}>
                          {r.type}
                        </span>
                        <span className="text-[10px] font-bold text-blue-600 bg-white border border-blue-100 px-2 py-0.5 rounded-full">
                          Día {day} de {r.duration_days}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{lot ? lot.code : 'Todo el plantel'}</p>
                    </div>
                    {confirmedToday
                      ? <span className="text-[10px] font-black text-green-600 bg-green-100 px-2 py-1 rounded-full">✓ Aplicado</span>
                      : <span className="text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-1 rounded-full">Pendiente</span>
                    }
                  </div>
                  {product && r.dose_applied !== null && (
                    <div className="bg-white rounded-xl px-3 py-2 text-xs text-blue-700 font-medium border border-blue-100">
                      <span className="font-black">{r.dose_applied} {product.unit}</span>
                      {r.water_liters ? ` · ${(r.dose_applied / r.water_liters).toFixed(2)} ${product.unit}/litro` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Banner alertas próximas aplicaciones ── */}
        {pendingAlerts.length > 0 && (
          <div className="space-y-2">
            {pendingAlerts.map(r => {
              const status = nextAppStatus(r.next_application!, today);
              const lot = lots.find(l => l.id === r.lot_id);
              return (
                <div key={r.id}
                  className={`rounded-2xl px-4 py-3 border
                    ${status === 'overdue' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1">
                      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${status === 'overdue' ? 'text-red-500' : 'text-amber-500'}`} />
                      <div>
                        <p className={`text-sm font-bold ${status === 'overdue' ? 'text-red-700' : 'text-amber-700'}`}>
                          {status === 'overdue' ? 'Aplicación vencida' : 'Aplicación próxima'} — {r.type}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {lot ? lot.code : 'Todo el plantel'} · {new Date(r.next_application! + 'T12:00:00').toLocaleDateString('es-AR')}
                        </p>
                      </div>
                    </div>
                    {/* Posponer */}
                    {postponeId === r.id ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <input type="number" min={1} max={30}
                          className="w-14 text-center input-base py-1 text-sm"
                          value={postponeDays} onChange={e => setPostponeDays(e.target.value)} />
                        <span className="text-xs text-gray-400">días</span>
                        <button onClick={() => handlePostpone(r)} disabled={saving}
                          className="text-xs font-bold bg-amber-500 text-white px-3 py-1.5 rounded-xl hover:bg-amber-600 transition-colors">
                          OK
                        </button>
                        <button onClick={() => setPostponeId(null)}>
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setPostponeId(r.id)}
                        className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-xl hover:border-amber-300 transition-colors shrink-0">
                        <SkipForward className="w-3.5 h-3.5" /> Posponer
                      </button>
                    )}
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
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Fecha inicio</label>
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

            {/* Días de tratamiento */}
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                Duración del tratamiento (días) — opcional
              </label>
              <input className="input-base mt-1" type="number" min={1} max={30}
                placeholder="Ej: 5 — dejá vacío si es aplicación única"
                value={durationDays} onChange={e => setDurationDays(e.target.value)} />
              {durationDays && Number(durationDays) > 0 && (
                <p className="text-[10px] text-blue-500 mt-1 ml-1">
                  Aparecerá en el dashboard de la colaboradora del {new Date(date + 'T12:00:00').toLocaleDateString('es-AR')} al{' '}
                  {(() => {
                    const end = new Date(date + 'T12:00:00');
                    end.setDate(end.getDate() + Number(durationDays) - 1);
                    return end.toLocaleDateString('es-AR');
                  })()}
                </p>
              )}
            </div>

            {/* Producto y calculadora */}
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
                  <label className="text-[10px] font-bold text-blue-600 uppercase ml-1">Dosis a aplicar (editable)</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input className="input-base text-center font-bold" type="number" min={0} step={0.01}
                      value={doseApplied} onChange={e => setDoseApplied(e.target.value)} />
                    <span className="text-sm font-bold text-gray-500 shrink-0">{selectedProduct.unit}</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-600 uppercase ml-1">Litros de agua (opcional)</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input className="input-base text-center font-bold" type="number" min={0} step={0.5}
                      placeholder="0" value={waterLiters} onChange={e => setWaterLiters(e.target.value)} />
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

            {!selectedProduct && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Dosis (texto libre)</label>
                <input className="input-base mt-1" placeholder="Ej: 2ml / litro"
                  value={dosis} onChange={e => setDosis(e.target.value)} />
              </div>
            )}

            {/* Próxima aplicación */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Próx. aplicación en días</label>
                <input className="input-base mt-1" type="number" min={1} placeholder="Ej: 14"
                  value={nextAppDays} onChange={e => setNextAppDays(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Fecha calculada</label>
                <input className="input-base mt-1" type="date" value={nextApp} onChange={e => setNextApp(e.target.value)} />
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

        {/* ── Productos registrados ── */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <button onClick={() => setShowProducts(p => !p)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
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
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Dosis por ave ({newProdUnit})</label>
                    <input className="input-base mt-1" type="number" min={0} step={0.001} placeholder="0.02"
                      value={newProdDose} onChange={e => setNewProdDose(e.target.value)} />
                  </div>
                  <input className="input-base" placeholder="Notas (opcional)"
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
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
              className="text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-yellow-400">
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
              const treatmentDay = getTreatmentDay(r, today);

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
                      {r.duration_days && (
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase
                          ${treatmentDay ? 'bg-blue-100 border-blue-200 text-blue-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                          {treatmentDay ? `Día ${treatmentDay}/${r.duration_days}` : `${r.duration_days} días`}
                        </span>
                      )}
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
                    {product && r.dose_applied !== null && (
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-3 py-2">
                        <FlaskConical className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-blue-700">{product.name}</p>
                          <p className="text-xs text-blue-500">
                            {r.dose_applied} {product.unit}
                            {r.water_liters ? ` · ${(r.dose_applied / r.water_liters).toFixed(2)} ${product.unit}/litro` : ''}
                          </p>
                        </div>
                      </div>
                    )}
                    {!product && r.dosis && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Beaker className="w-4 h-4 text-gray-300" />
                        <span className="font-medium">{r.dosis}</span>
                      </div>
                    )}
                    {r.notes && (
                      <p className="text-sm text-gray-600 leading-relaxed bg-gray-50/50 p-3 rounded-2xl italic">&ldquo;{r.notes}&rdquo;</p>
                    )}
                    {r.next_application && (
                      <div className={`flex items-center justify-between gap-2 text-xs font-bold p-3 rounded-2xl border
                        ${alertStatus === 'overdue' ? 'bg-red-50 border-red-200 text-red-600'
                          : alertStatus === 'soon' ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 shrink-0" />
                          <span>
                            {alertStatus === 'overdue' && '⚠ Vencida — '}
                            {alertStatus === 'soon' && '⏰ Próxima — '}
                            {new Date(r.next_application + 'T12:00:00').toLocaleDateString('es-AR')}
                          </span>
                        </div>
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

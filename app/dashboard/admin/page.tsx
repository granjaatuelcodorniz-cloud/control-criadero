'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Link from 'next/link';
import {
  TrendingUp, Package, Heart, ClipboardList, BarChart2,
  AlertTriangle, CheckCircle, Clock, Egg, Activity,
} from 'lucide-react';

type DailyRecord = {
  date: string;
  registered_at: string | null;
  bandejas_consumo: number;
  bandejas_fertiles: number;
  docenas_armadas: number;
  huevos_rotos: number;
  notas: string | null;
};

type FertileRecord = {
  date: string;
  registered_at: string | null;
  bandejas_procesadas: number;
  docenas_seleccionadas: number;
  descarte: number;
};

type Alert = { type: 'danger' | 'warning' | 'ok'; message: string };
type CageSlot = { id: number; lot_id: number; slot_code: string; quantity: number };
type Lot = { id: number; code: string; current_quantity: number };
type LossType = 'muerte' | 'descarte' | 'venta';
const LOSS_TYPE_LABELS: Record<LossType, string> = { muerte: 'Muerte', descarte: 'Descarte', venta: 'Venta' };
const ROWS = ['A','B','C','D','E','F'];

export default function AdminDashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [todayRecord, setTodayRecord] = useState<DailyRecord | null>(null);
  const [todayFertile, setTodayFertile] = useState<FertileRecord | null>(null);
  const [weekRecords, setWeekRecords] = useState<DailyRecord[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [totalAves, setTotalAves] = useState(0);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<CageSlot[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [quickRow, setQuickRow] = useState('');
  const [quickNum, setQuickNum] = useState('');
  const [quickSlot, setQuickSlot] = useState<CageSlot | null>(null);
  const [quickLot, setQuickLot] = useState<Lot | null>(null);
  const [quickError, setQuickError] = useState('');
  const [quickLossType, setQuickLossType] = useState<LossType>('muerte');
  const [quickQty, setQuickQty] = useState(1);
  const [quickReason, setQuickReason] = useState('');
  const [savingQuick, setSavingQuick] = useState(false);
  const [quickSaved, setQuickSaved] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const load = async () => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const [todayRes, fertileRes, weekRes, slotsRes, lotsRes, stockRes, tasksRes, healthRes] = await Promise.all([
        supabase.from('daily_records').select('*').eq('date', today).order('created_at', { ascending: false }).limit(1),
        supabase.from('fertile_records').select('*').eq('date', today).order('created_at', { ascending: false }).limit(1),
        supabase.from('daily_records').select('date, registered_at, bandejas_consumo, bandejas_fertiles, docenas_armadas, huevos_rotos, notas').gte('date', sevenDaysAgo.toISOString().split('T')[0]).order('date'),
        supabase.from('cage_slots').select('id, lot_id, slot_code, quantity'),
        supabase.from('lots').select('id, code, current_quantity').eq('status', 'activo'),
        supabase.from('stock_items').select('name, unit, current_quantity, alert_threshold'),
        supabase.from('tasks').select('description').eq('is_urgent', true).eq('is_active', true),
        // Alertas de sanidad: próximas aplicaciones vencidas
        supabase.from('health_records').select('type, next_application').not('next_application', 'is', null),
      ]);

      if (todayRes.data?.[0]) setTodayRecord(todayRes.data[0]);
      if (fertileRes.data?.[0]) setTodayFertile(fertileRes.data[0]);
      if (weekRes.data) setWeekRecords(weekRes.data);
      if (slotsRes.data) setTotalAves(slotsRes.data.reduce((s, sl) => s + sl.quantity, 0));

      const newAlerts: Alert[] = [];

      // Alertas de stock
      if (stockRes.data) {
        stockRes.data.forEach(item => {
          if (item.current_quantity <= item.alert_threshold) {
            newAlerts.push({
              type: item.current_quantity === 0 ? 'danger' : 'warning',
              message: `Stock de ${item.name} bajo mínimo (${item.current_quantity} ${item.unit ?? ''})`,
            });
          }
        });
      }

      // Alertas de tareas urgentes
      if (tasksRes.data) {
        tasksRes.data.forEach(t => {
          newAlerts.push({ type: 'danger', message: `Tarea urgente: ${t.description}` });
        });
      }

      // Alertas de sanidad vencidas
      if (healthRes.data) {
        healthRes.data.forEach(r => {
          if (r.next_application && r.next_application < today) {
            newAlerts.push({ type: 'warning', message: `Aplicación vencida: ${r.type}` });
          }
        });
      }

      if (newAlerts.length === 0) newAlerts.push({ type: 'ok', message: 'Todo en orden por ahora' });
      setAlerts(newAlerts);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }
    load();
    const handleVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [authLoading, user, profile]);

  // ── Baja rápida ─────────────────────────────────────────────────────────────
  const handleQuickLookup = () => {
    setQuickError('');
    setQuickSlot(null);
    setQuickLot(null);
    if (!quickRow || !quickNum) { setQuickError('Completá fila y número'); return; }
    const code = quickRow + quickNum;
    const slot = slots.find(s => s.slot_code === code);
    if (!slot) { setQuickError(`La boca ${code} no existe o no tiene aves`); return; }
    if (slot.quantity === 0) { setQuickError(`La boca ${code} está vacía`); return; }
    const lot = lots.find(l => l.id === slot.lot_id) || null;
    setQuickSlot(slot);
    setQuickLot(lot);
    setQuickQty(1);
    setQuickLossType('muerte');
    setQuickReason('');
  };

  const handleQuickLoss = async () => {
    if (!quickSlot || !quickLot || !user) return;
    setSavingQuick(true);
    const newQty = quickSlot.quantity - quickQty;
    await Promise.all([
      supabase.from('lot_losses').insert({
        lot_id: quickLot.id, date: today, quantity: quickQty,
        reason: quickReason || null, slot_code: quickSlot.slot_code,
        loss_type: quickLossType, user_id: user.id,
      }),
      supabase.from('lots').update({ current_quantity: quickLot.current_quantity - quickQty }).eq('id', quickLot.id),
      newQty === 0
        ? supabase.from('cage_slots').delete().eq('id', quickSlot.id)
        : supabase.from('cage_slots').update({ quantity: newQty }).eq('id', quickSlot.id),
    ]);
    setQuickSlot(null); setQuickLot(null);
    setQuickRow(''); setQuickNum('');
    setQuickReason(''); setQuickQty(1);
    setSavingQuick(false);
    setQuickSaved(true);
    setTimeout(() => setQuickSaved(false), 3000);
    await load();
  };

  const resetQuick = () => {
    setQuickSlot(null); setQuickLot(null);
    setQuickRow(''); setQuickNum('');
    setQuickError(''); setQuickReason(''); setQuickQty(1);
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );

  if (!profile) return null;

  const totalHuevosConsumo = todayRecord ? (todayRecord.docenas_armadas * 12) + todayRecord.huevos_rotos : 0;
  const pctPosturaConsumo = totalAves > 0 && totalHuevosConsumo > 0 ? Math.round((totalHuevosConsumo / totalAves) * 100) : null;
  const pctRotos = totalHuevosConsumo > 0 && todayRecord ? Math.round((todayRecord.huevos_rotos / totalHuevosConsumo) * 100) : null;
  const pctEmpletado = totalHuevosConsumo > 0 && todayRecord ? Math.round(((todayRecord.docenas_armadas * 12) / totalHuevosConsumo) * 100) : null;

  const totalHuevosFertiles = todayFertile ? (todayFertile.docenas_seleccionadas * 12) + todayFertile.descarte : 0;
  const pctPosturaFertiles = totalAves > 0 && totalHuevosFertiles > 0 ? Math.round((totalHuevosFertiles / totalAves) * 100) : null;
  const pctDescarte = totalHuevosFertiles > 0 && todayFertile ? Math.round((todayFertile.descarte / totalHuevosFertiles) * 100) : null;
  const pctPosturaTotal = totalAves > 0 && (totalHuevosConsumo + totalHuevosFertiles) > 0
    ? Math.round(((totalHuevosConsumo + totalHuevosFertiles) / totalAves) * 100) : null;

  const formatTime = (t: string | null) => t ? t.slice(0, 5) : null;
  const maxHuevos = weekRecords.length > 0 ? Math.max(...weekRecords.map(r => (r.docenas_armadas * 12) + r.huevos_rotos), 1) : 1;
  const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  const navCards = [
    { href: '/dashboard/admin/lotes', icon: TrendingUp, label: 'Lotes', color: 'text-green-600', bg: 'bg-green-50' },
    { href: '/dashboard/admin/stock', icon: Package, label: 'Stock', color: 'text-blue-600', bg: 'bg-blue-50' },
    { href: '/dashboard/admin/sanidad', icon: Heart, label: 'Sanidad', color: 'text-red-500', bg: 'bg-red-50' },
    { href: '/dashboard/admin/tareas', icon: ClipboardList, label: 'Tareas', color: 'text-purple-600', bg: 'bg-purple-50' },
    { href: '/dashboard/admin/analisis', icon: BarChart2, label: 'Análisis', color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { href: '/dashboard/admin/actividad', icon: Activity, label: 'Actividad', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div>
          <h2 className="text-2xl font-bold text-gray-900">Hola, {profile.full_name} 👋</h2>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Consumo hoy */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Consumo — hoy</h3>
            {todayRecord?.registered_at && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Registrado {formatTime(todayRecord.registered_at)}
              </span>
            )}
          </div>
          {todayRecord ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Docenas armadas', value: todayRecord.docenas_armadas },
                  { label: 'Huevos rotos', value: todayRecord.huevos_rotos },
                  { label: 'Bandejas consumo', value: todayRecord.bandejas_consumo },
                  { label: 'Bandejas fértiles', value: todayRecord.bandejas_fertiles },
                ].map((m, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-xs text-gray-400 mb-3">Indicadores consumo</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: '% postura', value: pctPosturaConsumo },
                    { label: '% empletado', value: pctEmpletado },
                    { label: '% rotos', value: pctRotos },
                  ].map((m, i) => (
                    <div key={i} className="text-center">
                      <p className="text-xl font-bold text-gray-900">{m.value !== null ? `${m.value}%` : '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {todayRecord.notas && (
                <div className="bg-yellow-50 rounded-2xl border border-yellow-100 px-4 py-3">
                  <p className="text-xs text-yellow-600 font-medium mb-1">Nota de hoy</p>
                  <p className="text-sm text-yellow-800">{todayRecord.notas}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 text-gray-400">
              <Clock className="w-5 h-5" />
              <span className="text-sm">Sin registro de consumo hoy</span>
            </div>
          )}
        </div>

        {/* Fértiles hoy */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fértiles — hoy</h3>
            {todayFertile?.registered_at && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Registrado {formatTime(todayFertile.registered_at)}
              </span>
            )}
          </div>
          {todayFertile ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Bandejas procesadas', value: todayFertile.bandejas_procesadas },
                  { label: 'Docenas seleccionadas', value: todayFertile.docenas_seleccionadas },
                  { label: 'Descarte', value: todayFertile.descarte },
                ].map((m, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-xs text-gray-400 mb-3">Indicadores fértiles</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: '% postura fértiles', value: pctPosturaFertiles },
                    { label: '% descarte', value: pctDescarte },
                  ].map((m, i) => (
                    <div key={i} className="text-center">
                      <p className="text-xl font-bold text-gray-900">{m.value !== null ? `${m.value}%` : '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 text-gray-400">
              <Clock className="w-5 h-5" />
              <span className="text-sm">Sin registro de fértiles hoy</span>
            </div>
          )}
        </div>

        {/* Postura total */}
        {pctPosturaTotal !== null && (
          <div className="bg-yellow-400 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-900">Postura total hoy</p>
              <p className="text-xs text-yellow-800 mt-0.5">{totalAves} aves activas</p>
            </div>
            <p className="text-4xl font-bold text-yellow-900">{pctPosturaTotal}%</p>
          </div>
        )}

        {/* Gráfico semanal */}
        {weekRecords.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Producción — últimos 7 días</h3>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-end gap-2 h-28">
                {weekRecords.map((r, i) => {
                  const total = (r.docenas_armadas * 12) + r.huevos_rotos;
                  const h = Math.round((total / maxHuevos) * 96);
                  const isToday = r.date === today;
                  const dayIdx = new Date(r.date + 'T12:00:00').getDay();
                  const dayLabel = dias[dayIdx === 0 ? 6 : dayIdx - 1];
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-xs text-gray-400">{total > 0 ? total : ''}</span>
                      <div className={`w-full rounded-t-lg transition-all ${isToday ? 'bg-yellow-400' : 'bg-yellow-100'}`}
                        style={{ height: `${Math.max(h, 4)}px` }} />
                      <span className="text-xs text-gray-400">{dayLabel}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-xs text-gray-400">
                <span>Total semana: {weekRecords.reduce((s, r) => s + (r.docenas_armadas * 12) + r.huevos_rotos, 0)} huevos</span>
                <span>{totalAves} aves activas</span>
              </div>
            </div>
          </div>
        )}

        {/* Alertas */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Alertas</h3>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl border text-sm
                ${a.type === 'danger' ? 'bg-red-50 border-red-100 text-red-700' :
                  a.type === 'warning' ? 'bg-yellow-50 border-yellow-100 text-yellow-700' :
                  'bg-green-50 border-green-100 text-green-700'}`}>
                {a.type === 'ok'
                  ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                {a.message}
              </div>
            ))}
          </div>
        </div>

        {/* Módulos */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Módulos</h3>
          <div className="grid grid-cols-2 gap-3">
            {navCards.map((card, i) => (
              <Link key={i} href={card.href}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:border-yellow-300 transition-all">
                <div className={`${card.bg} p-2 rounded-xl`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <span className="font-medium text-gray-800">{card.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <Link href="/dashboard/huevos" className="btn-primary w-full py-4 text-base rounded-2xl">
          <Egg className="w-5 h-5" /> Registrar huevos
        </Link>

        {/* ── Baja rápida ── */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-700">Registrar baja rápida</span>
              {quickSaved && <span className="text-[10px] font-black text-green-600 bg-green-100 px-2 py-0.5 rounded-full">✓ Guardado</span>}
            </div>
            {quickSlot && (
              <button onClick={resetQuick} className="text-xs text-gray-400 underline">limpiar</button>
            )}
          </div>

          <div className="px-5 pb-5 space-y-3">
            {!quickSlot ? (
              <>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Fila</p>
                  <div className="flex gap-2">
                    {ROWS.map(row => (
                      <button key={row} onClick={() => { setQuickRow(row); setQuickError(''); }}
                        className={`flex-1 h-11 rounded-xl font-black text-sm border-2 transition-all
                          ${quickRow === row
                            ? 'bg-yellow-400 border-yellow-400 text-gray-900'
                            : 'bg-white border-gray-200 text-gray-400 hover:border-yellow-200'}`}>
                        {row}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Número de boca</p>
                  <div className="flex gap-2">
                    <input
                      type="number" min={1} max={42}
                      placeholder="Ej: 7"
                      value={quickNum}
                      onChange={e => { setQuickNum(e.target.value); setQuickError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleQuickLookup()}
                      className="input-base text-center text-xl font-black flex-1"
                    />
                    <button onClick={handleQuickLookup}
                      className="px-5 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 transition-colors">
                      Buscar
                    </button>
                  </div>
                </div>
                {quickError && (
                  <p className="text-xs text-red-500 font-medium">{quickError}</p>
                )}
              </>
            ) : (
              <>
                <div className="bg-gray-50 rounded-2xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase">Boca {quickSlot.slot_code}</p>
                    <p className="text-sm font-bold text-gray-700">{quickLot?.code || 'Sin lote'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-gray-800">{quickSlot.quantity}</p>
                    <p className="text-[10px] text-gray-400">aves</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {(['muerte','descarte','venta'] as LossType[]).map(type => (
                    <button key={type} onClick={() => setQuickLossType(type)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all
                        ${quickLossType === type
                          ? type === 'muerte' ? 'bg-red-50 border-red-400 text-red-600'
                            : type === 'descarte' ? 'bg-orange-50 border-orange-400 text-orange-600'
                            : 'bg-blue-50 border-blue-400 text-blue-600'
                          : 'bg-white border-gray-200 text-gray-400'}`}>
                      {LOSS_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => setQuickQty(q => Math.max(1, q - 1))}
                    className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors">−</button>
                  <input type="number" min={1} max={quickSlot.quantity} value={quickQty}
                    onChange={e => setQuickQty(Math.min(quickSlot.quantity, Math.max(1, Number(e.target.value))))}
                    className="input-base text-center text-2xl font-black h-11 py-0" />
                  <button onClick={() => setQuickQty(q => Math.min(quickSlot.quantity, q + 1))}
                    className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition-colors">+</button>
                </div>

                <input className="input-base" placeholder="Motivo (opcional)"
                  value={quickReason} onChange={e => setQuickReason(e.target.value)} />

                {quickQty === quickSlot.quantity && (
                  <p className="text-xs text-red-500">⚠ Esta boca quedará vacía y se liberará</p>
                )}

                <button onClick={handleQuickLoss} disabled={savingQuick}
                  className="btn-primary w-full py-4 text-base shadow-yellow-200 shadow-lg">
                  {savingQuick ? 'Guardando...' : `Confirmar ${quickQty} ${LOSS_TYPE_LABELS[quickLossType].toLowerCase()}${quickQty > 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
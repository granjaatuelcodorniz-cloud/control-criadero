'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibilityReload } from '@/lib/visibility-reload';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import BajaRapida from '@/components/BajaRapida';
import Link from 'next/link';
import { getToday, toDateStr } from '@/lib/date';
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
type FertileBatch = { id: number; date: string; status: string; docenas_seleccionadas: number | null; descarte: number | null };
type CageSlot = { id: number; lot_id: number; slot_code: string; quantity: number };
type Lot = { id: number; code: string; current_quantity: number };
type StockItem = {
  id: number;
  name: string;
  unit: string | null;
  current_quantity: number;
  alert_threshold: number;
  is_feed: boolean;
};
type StockMovement = { stock_item_id: number; quantity: number };

function isProductionFeed(item: StockItem): boolean {
  const name = item.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/\b(bb|bebe|baby|iniciador|recria|cria)\b/.test(name)) return false;
  return /\b(ponedora|postura|adulto|adultas|produccion)\b/.test(name);
}

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

  const today = getToday();
  const [pendingBatches, setPendingBatches] = useState<FertileBatch[]>([]);
  const [processingBatch, setProcessingBatch] = useState<number | null>(null);
  const [batchDocenas, setBatchDocenas] = useState('');
  const [batchDescarte, setBatchDescarte] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);

  const load = useCallback(async () => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const sevenDaysAgoStr = toDateStr(sevenDaysAgo);

      const [weekRes, empRes, fertileRes, slotsRes, lotsRes, stockRes, tasksRes, healthRes, batchesRes, weekFeedRes] = await Promise.all([
        supabase.from('daily_records').select('date, registered_at, bandejas_consumo, bandejas_fertiles, notas').gte('date', sevenDaysAgoStr).order('date'),
        supabase.from('consumo_empaque').select('date, bandejas, docenas, rotos').gte('date', sevenDaysAgoStr),
        supabase.from('fertile_records').select('*').eq('date', today).order('created_at', { ascending: false }).limit(1),
        supabase.from('cage_slots').select('id, lot_id, slot_code, quantity'),
        supabase.from('lots').select('id, code, current_quantity').eq('status', 'activo'),
        supabase.from('stock_items').select('id, name, unit, current_quantity, alert_threshold, is_feed'),
        supabase.from('tasks').select('description').eq('is_urgent', true).eq('is_active', true),
        // Alertas de sanidad: próximas aplicaciones vencidas
        supabase.from('health_records').select('type, next_application').not('next_application', 'is', null),
        supabase.from('fertile_batches').select('*').eq('status', 'pendiente').order('date'),
        supabase.from('stock_movements').select('stock_item_id, quantity')
          .eq('movement_type', 'salida').gte('date', sevenDaysAgoStr).lte('date', today),
      ]);

      if (fertileRes.data?.[0]) setTodayFertile(fertileRes.data[0]);

      // docenas/rotos ahora viven en consumo_empaque; las sumamos por fecha.
      const empByDate = new Map<string, { docenas: number; rotos: number }>();
      (empRes.data ?? []).forEach(e => {
        const cur = empByDate.get(e.date) ?? { docenas: 0, rotos: 0 };
        cur.docenas += e.docenas ?? 0;
        cur.rotos += e.rotos ?? 0;
        empByDate.set(e.date, cur);
      });
      // Puede haber varias recolecciones por día: sumamos daily_records por fecha.
      const byDate = new Map<string, DailyRecord>();
      (weekRes.data ?? []).forEach(r => {
        const cur = byDate.get(r.date) ?? {
          date: r.date, registered_at: r.registered_at,
          bandejas_consumo: 0, bandejas_fertiles: 0,
          docenas_armadas: 0, huevos_rotos: 0, notas: r.notas,
        };
        cur.bandejas_consumo += r.bandejas_consumo ?? 0;
        cur.bandejas_fertiles += r.bandejas_fertiles ?? 0;
        if (!cur.notas && r.notas) cur.notas = r.notas;
        if (r.registered_at && (!cur.registered_at || r.registered_at < cur.registered_at)) cur.registered_at = r.registered_at;
        byDate.set(r.date, cur);
      });
      byDate.forEach((rec, date) => {
        const emp = empByDate.get(date);
        if (emp) { rec.docenas_armadas = emp.docenas; rec.huevos_rotos = emp.rotos; }
      });
      setWeekRecords([...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
      setTodayRecord(byDate.get(today) ?? null);
      if (slotsRes.data) {
        setSlots(slotsRes.data);
        setTotalAves(slotsRes.data.reduce((s, sl) => s + sl.quantity, 0));
      }
      if (lotsRes.data) setLots(lotsRes.data);

      const newAlerts: Alert[] = [];

      // Alertas de stock
      if (stockRes.data) {
        const stockItems = stockRes.data as StockItem[];
        stockItems.forEach(item => {
          if (item.current_quantity <= item.alert_threshold) {
            newAlerts.push({
              type: item.current_quantity === 0 ? 'danger' : 'warning',
              message: `Stock de ${item.name} bajo mínimo (${item.current_quantity} ${item.unit ?? ''})`,
            });
          }
        });

        const feedItems = stockItems.filter(item => item.is_feed && isProductionFeed(item));
        const feedIds = new Set(feedItems.map(item => item.id));
        const weeklyFeedKg = ((weekFeedRes.data || []) as StockMovement[])
          .filter(m => feedIds.has(m.stock_item_id))
          .reduce((s, m) => s + (m.quantity ?? 0), 0);
        const dailyFeedKg = weeklyFeedKg / 7;
        const feedStockKg = feedItems.reduce((s, item) => s + (item.current_quantity ?? 0), 0);
        const estimatedDays = dailyFeedKg > 0 ? Math.floor(feedStockKg / dailyFeedKg) : null;

        if (estimatedDays !== null && estimatedDays <= 10) {
          newAlerts.push({
            type: estimatedDays <= 3 ? 'danger' : 'warning',
            message: `Alimento estimado para ${estimatedDays} día${estimatedDays !== 1 ? 's' : ''}`,
          });
        }
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
      if (batchesRes.data) setPendingBatches(batchesRes.data);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }
    load();
  }, [authLoading, user, profile, router, load]);

  useVisibilityReload(load);

  // ── Procesar bandeja fértil ─────────────────────────────────────────────────
  const handleProcessBatch = async (batch: FertileBatch) => {
    if (!batchDocenas || !user) return;
    setSavingBatch(true);
    const processedDate = today;
    await supabase.from('fertile_batches').update({
      status: 'procesada',
      docenas_seleccionadas: Number(batchDocenas),
      descarte: Number(batchDescarte) || 0,
      processed_at: processedDate,
      processed_by: user.id,
    }).eq('id', batch.id);
    // También insertar en fertile_records para mantener compatibilidad con análisis
    await supabase.from('fertile_records').insert({
      date: batch.date,
      user_id: user.id,
      bandejas_procesadas: 1,
      docenas_seleccionadas: Number(batchDocenas),
      descarte: Number(batchDescarte) || 0,
      registered_at: new Date().toTimeString().split(' ')[0],
    });
    setProcessingBatch(null);
    setBatchDocenas('');
    setBatchDescarte('');
    setSavingBatch(false);
    await load();
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

        {/* ── Bandejas fértiles pendientes ── */}
        {pendingBatches.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Bandejas fértiles pendientes
            </h3>
            <div className="space-y-3">
              {pendingBatches.map(batch => (
                <div key={batch.id} className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">
                        Bandeja del {new Date(batch.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                      <p className="text-xs text-amber-600 font-medium mt-0.5">Pendiente de procesar</p>
                    </div>
                    {processingBatch !== batch.id && (
                      <button
                        onClick={() => { setProcessingBatch(batch.id); setBatchDocenas(''); setBatchDescarte(''); }}
                        className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold text-xs rounded-xl transition-colors">
                        Procesar
                      </button>
                    )}
                  </div>

                  {processingBatch === batch.id && (
                    <div className="px-4 pb-4 space-y-3 border-t border-amber-100 pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Docenas seleccionadas</label>
                          <input type="number" min={0} className="input-base mt-1 text-center font-bold"
                            placeholder="0" value={batchDocenas}
                            onChange={e => setBatchDocenas(e.target.value)} autoFocus />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Descarte (unidades)</label>
                          <input type="number" min={0} className="input-base mt-1 text-center font-bold"
                            placeholder="0" value={batchDescarte}
                            onChange={e => setBatchDescarte(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleProcessBatch(batch)}
                          disabled={savingBatch || !batchDocenas}
                          className="btn-primary flex-1 py-3 text-sm disabled:opacity-40">
                          {savingBatch ? 'Guardando...' : 'Confirmar proceso'}
                        </button>
                        <button onClick={() => setProcessingBatch(null)}
                          className="btn-secondary px-4 py-3 text-sm">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Baja rápida ── */}
        {user && (
          <BajaRapida slots={slots} lots={lots} userId={user.id} today={today} onSaved={load} />
        )}

      </div>
    </div>
  );
}

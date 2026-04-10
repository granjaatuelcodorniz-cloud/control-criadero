'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import Link from 'next/link';
import {
  TrendingUp, Package, Heart, ClipboardList,
  AlertTriangle, CheckCircle, Clock, Egg,
} from 'lucide-react';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };
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

export default function AdminDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayRecord, setTodayRecord] = useState<DailyRecord | null>(null);
  const [todayFertile, setTodayFertile] = useState<FertileRecord | null>(null);
  const [weekRecords, setWeekRecords] = useState<DailyRecord[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [totalAves, setTotalAves] = useState(0);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }

      const { data: profileData } = await supabase
        .from('profiles').select('full_name, role')
        .eq('id', user.id).single();
      if (!profileData || profileData.role !== 'owner') {
        window.location.href = '/dashboard'; return;
      }
      setProfile(profileData);

      // Registro consumo hoy
      const { data: todayData } = await supabase
       .from('daily_records').select('*')     .eq('date', today)
       .order('created_at', { ascending: false })
       .limit(1);
      if (todayData && todayData.length > 0) setTodayRecord(todayData[0]);

      // Registro fértiles hoy
      const { data: fertileData } = await supabase
        .from('fertile_records').select('*')
        .eq('date', today)
        .order('created_at', { ascending: false })
        .limit(1);
      if (fertileData && fertileData.length > 0) setTodayFertile(fertileData[0]);

      // Últimos 7 días
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const { data: weekData } = await supabase
        .from('daily_records')
        .select('date, registered_at, bandejas_consumo, bandejas_fertiles, docenas_armadas, huevos_rotos, notas')
        .gte('date', sevenDaysAgo.toISOString().split('T')[0])
        .order('date');
      if (weekData) setWeekRecords(weekData);

      // Total aves activas
      const { data: lotsData } = await supabase
        .from('lots').select('current_quantity');
      if (lotsData) setTotalAves(lotsData.reduce((s, l) => s + l.current_quantity, 0));

      // Alertas
      const newAlerts: Alert[] = [];

      const { data: stockData } = await supabase
        .from('stock_items').select('name, unit, current_quantity, alert_threshold');
      if (stockData) {
        stockData.forEach(item => {
          if (item.current_quantity <= item.alert_threshold) {
            newAlerts.push({
              type: item.current_quantity === 0 ? 'danger' : 'warning',
              message: `Stock de ${item.name} bajo mínimo (${item.current_quantity} ${item.unit ?? ''})`
            });
          }
        });
      }

      const { data: urgentTasks } = await supabase
        .from('tasks').select('description')
        .eq('is_urgent', true).eq('is_active', true);
      if (urgentTasks) {
        urgentTasks.forEach(t => {
          newAlerts.push({ type: 'danger', message: `Tarea urgente: ${t.description}` });
        });
      }

      if (newAlerts.length === 0) {
        newAlerts.push({ type: 'ok', message: 'Todo en orden por ahora' });
      }
      setAlerts(newAlerts);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );
  if (!profile) return null;

  // Cálculos consumo
  const totalHuevosConsumo = todayRecord
    ? (todayRecord.docenas_armadas * 12) + todayRecord.huevos_rotos
    : 0;
  const pctPosturaConsumo = totalAves > 0 && totalHuevosConsumo > 0
    ? Math.round((totalHuevosConsumo / totalAves) * 100)
    : null;
  const pctRotos = totalHuevosConsumo > 0 && todayRecord
    ? Math.round((todayRecord.huevos_rotos / totalHuevosConsumo) * 100)
    : null;
  const pctEmpletado = totalHuevosConsumo > 0 && todayRecord
    ? Math.round(((todayRecord.docenas_armadas * 12) / totalHuevosConsumo) * 100)
    : null;

  // Cálculos fértiles
  const totalHuevosFertiles = todayFertile
    ? (todayFertile.docenas_seleccionadas * 12) + todayFertile.descarte
    : 0;
  const pctPosturaFertiles = totalAves > 0 && totalHuevosFertiles > 0
    ? Math.round((totalHuevosFertiles / totalAves) * 100)
    : null;
  const pctDescarte = totalHuevosFertiles > 0 && todayFertile
    ? Math.round((todayFertile.descarte / totalHuevosFertiles) * 100)
    : null;

  // Postura total
  const pctPosturaTotal = totalAves > 0 && (totalHuevosConsumo + totalHuevosFertiles) > 0
    ? Math.round(((totalHuevosConsumo + totalHuevosFertiles) / totalAves) * 100)
    : null;

  const formatTime = (t: string | null) => {
    if (!t) return null;
    return t.slice(0, 5);
  };

  const maxHuevos = weekRecords.length > 0
    ? Math.max(...weekRecords.map(r => (r.docenas_armadas * 12) + r.huevos_rotos), 1)
    : 1;

  const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

 const navCards = [
    { href: '/dashboard/admin/lotes', icon: TrendingUp, label: 'Lotes', color: 'text-green-600', bg: 'bg-green-50' },
    { href: '/dashboard/admin/stock', icon: Package, label: 'Stock', color: 'text-blue-600', bg: 'bg-blue-50' },
    { href: '/dashboard/admin/sanidad', icon: Heart, label: 'Sanidad', color: 'text-red-500', bg: 'bg-red-50' },
    { href: '/dashboard/admin/tareas', icon: ClipboardList, label: 'Tareas', color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Bienvenida */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Hola, {profile.full_name} 👋</h2>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Registro consumo hoy */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Consumo — hoy
            </h3>
            {todayRecord?.registered_at && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Registrado {formatTime(todayRecord.registered_at)}
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

              {/* Porcentajes consumo */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-xs text-gray-400 mb-3">Indicadores consumo</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: '% postura', value: pctPosturaConsumo },
                    { label: '% empletado', value: pctEmpletado },
                    { label: '% rotos', value: pctRotos },
                  ].map((m, i) => (
                    <div key={i} className="text-center">
                      <p className="text-xl font-bold text-gray-900">
                        {m.value !== null ? `${m.value}%` : '—'}
                      </p>
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

        {/* Registro fértiles hoy */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Fértiles — hoy
            </h3>
            {todayFertile?.registered_at && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Registrado {formatTime(todayFertile.registered_at)}
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
                      <p className="text-xl font-bold text-gray-900">
                        {m.value !== null ? `${m.value}%` : '—'}
                      </p>
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
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Producción — últimos 7 días
            </h3>
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
                      <div
                        className={`w-full rounded-t-lg transition-all ${isToday ? 'bg-yellow-400' : 'bg-yellow-100'}`}
                        style={{ height: `${Math.max(h, 4)}px` }}
                      />
                      <span className="text-xs text-gray-400">{dayLabel}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-xs text-gray-400">
                <span>
                  Total semana: {weekRecords.reduce((s, r) => s + (r.docenas_armadas * 12) + r.huevos_rotos, 0)} huevos
                </span>
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

        {/* Acceso registro */}
        <Link href="/dashboard/huevos" className="btn-primary w-full py-4 text-base rounded-2xl">
          <Egg className="w-5 h-5" />
          Registrar huevos
        </Link>

      </div>
    </div>
  );
}
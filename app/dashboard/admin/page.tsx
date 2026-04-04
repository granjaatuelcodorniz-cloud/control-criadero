'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import Link from 'next/link';
import {
  Egg, Package, Heart, ClipboardList, TrendingUp,
  AlertTriangle, CheckCircle, Clock
} from 'lucide-react';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };
type DailyRecord = {
  date: string;
  huevos_recolectados: number;
  huevos_fertiles: number;
  docenas_armadas: number;
  huevos_rotos: number;
};
type Alert = { type: 'danger' | 'warning' | 'ok'; message: string };

export default function AdminDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayRecord, setTodayRecord] = useState<DailyRecord | null>(null);
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

      // Registro de hoy
      const { data: todayData } = await supabase
        .from('daily_records').select('*')
        .eq('date', today).order('created_at', { ascending: false }).limit(1).single();
      if (todayData) setTodayRecord(todayData);

      // Últimos 7 días
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const { data: weekData } = await supabase
        .from('daily_records').select('date, huevos_recolectados, huevos_fertiles, docenas_armadas, huevos_rotos')
        .gte('date', sevenDaysAgo.toISOString().split('T')[0])
        .order('date');
      if (weekData) setWeekRecords(weekData);

      // Total aves activas
      const { data: lotsData } = await supabase
        .from('lots').select('current_quantity');
      if (lotsData) setTotalAves(lotsData.reduce((sum, l) => sum + l.current_quantity, 0));

      // Alertas
      const newAlerts: Alert[] = [];

      // Stock bajo
      const { data: stockData } = await supabase
        .from('stock_items').select('name, current_quantity, alert_threshold');
      if (stockData) {
        stockData.forEach(item => {
          if (item.current_quantity <= item.alert_threshold) {
            newAlerts.push({
              type: item.current_quantity === 0 ? 'danger' : 'warning',
              message: `Stock de ${item.name} bajo mínimo (${item.current_quantity} ${item.current_quantity === 1 ? 'unidad' : 'unidades'})`
            });
          }
        });
      }

      // Tareas periódicas urgentes
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

  const fertilidad = todayRecord && todayRecord.huevos_recolectados > 0
    ? Math.round((todayRecord.huevos_fertiles / todayRecord.huevos_recolectados) * 100)
    : null;

  const maxHuevos = weekRecords.length > 0
    ? Math.max(...weekRecords.map(r => r.huevos_recolectados), 1)
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

        {/* Métricas del día */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Registro de hoy</h3>
          {todayRecord ? (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Huevos recolectados', value: todayRecord.huevos_recolectados, unit: '' },
                { label: 'Fertilidad', value: fertilidad !== null ? `${fertilidad}%` : '—', unit: '' },
                { label: 'Docenas armadas', value: todayRecord.docenas_armadas, unit: '' },
                { label: 'Rotos', value: todayRecord.huevos_rotos, unit: '' },
              ].map((m, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 text-gray-400">
              <Clock className="w-5 h-5" />
              <span className="text-sm">Sin registro hoy todavía</span>
            </div>
          )}
        </div>

        {/* Gráfico semanal */}
        {weekRecords.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Producción — últimos 7 días</h3>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-end gap-2 h-24">
                {weekRecords.map((r, i) => {
                  const h = Math.round((r.huevos_recolectados / maxHuevos) * 80);
                  const isToday = r.date === today;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-xs text-gray-400">{r.huevos_recolectados}</span>
                      <div
                        className={`w-full rounded-t-lg transition-all ${isToday ? 'bg-yellow-400' : 'bg-yellow-100'}`}
                        style={{ height: `${h}px` }}
                      />
                      <span className="text-xs text-gray-400">
                        {dias[new Date(r.date + 'T12:00:00').getDay() === 0 ? 6 : new Date(r.date + 'T12:00:00').getDay() - 1]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-xs text-gray-400">
                <span>Total semana: {weekRecords.reduce((s, r) => s + r.huevos_recolectados, 0)} huevos</span>
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
                {a.type === 'danger' ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> :
                 a.type === 'warning' ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> :
                 <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                {a.message}
              </div>
            ))}
          </div>
        </div>

        {/* Navegación */}
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

        {/* Acceso rápido al registro de huevos */}
        <Link href="/dashboard/huevos"
          className="btn-primary w-full py-4 text-base rounded-2xl">
          <Egg className="w-5 h-5" />
          Ver registro de huevos
        </Link>

      </div>
    </div>
  );
}
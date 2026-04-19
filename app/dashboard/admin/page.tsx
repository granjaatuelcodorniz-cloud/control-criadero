'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Link from 'next/link';
import {
  TrendingUp, Package, Heart, ClipboardList, BarChart2,
  Clock, CheckCircle, AlertTriangle, Egg
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

type Alert = {
  type: 'danger' | 'warning' | 'ok';
  message: string;
};

export default function AdminDashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<DailyRecord | null>(null);
  const [todayFertile, setTodayFertile] = useState<FertileRecord | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [totalAves, setTotalAves] = useState(0);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (authLoading) return;

    if (!user || !profile) {
      router.push('/');
      return;
    }

    if (profile.role !== 'owner') {
      router.push('/dashboard');
      return;
    }

    loadData();
  }, [authLoading, user, profile]);

  const loadData = async () => {
    setLoading(true);

    const { data: todayData } = await supabase
      .from('daily_records')
      .select('*')
      .eq('date', today)
      .limit(1)
      .maybeSingle();

    setTodayRecord(todayData);

    const { data: fertileData } = await supabase
      .from('fertile_records')
      .select('*')
      .eq('date', today)
      .limit(1)
      .maybeSingle();

    setTodayFertile(fertileData);

    const { data: lots } = await supabase
      .from('lots')
      .select('current_quantity');

    if (lots) {
      setTotalAves(lots.reduce((s, l) => s + l.current_quantity, 0));
    }

    const newAlerts: Alert[] = [];

    const { data: stock } = await supabase
      .from('stock_items')
      .select('*');

    if (stock) {
      stock.forEach(item => {
        if (item.current_quantity <= item.alert_threshold) {
          newAlerts.push({
            type: 'warning',
            message: `Stock bajo: ${item.name}`
          });
        }
      });
    }

    if (newAlerts.length === 0) {
      newAlerts.push({ type: 'ok', message: 'Todo en orden' });
    }

    setAlerts(newAlerts);
    setLoading(false);
  };

  if (authLoading || loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  // cálculos seguros
  const totalHuevos =
    (todayRecord?.docenas_armadas ?? 0) * 12 +
    (todayRecord?.huevos_rotos ?? 0) +
    (todayFertile?.docenas_seleccionadas ?? 0) * 12;

  const postura =
    totalAves > 0 ? Math.round((totalHuevos / totalAves) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* 🔒 CLAVE: seguro contra null */}
      <Header
        userName={profile?.full_name || 'Usuario'}
        role={profile?.role || ''}
      />

      <div className="max-w-2xl mx-auto p-4 space-y-6">

        <h2 className="text-xl font-bold">
          Hola, {profile?.full_name}
        </h2>

        {/* POSTURA */}
        <div className="bg-yellow-400 p-4 rounded-xl flex justify-between">
          <span>Postura total</span>
          <span className="text-2xl font-bold">{postura}%</span>
        </div>

        {/* CONSUMO */}
        <div className="bg-white p-4 rounded-xl">
          <h3 className="text-sm text-gray-400 mb-2">Consumo hoy</h3>

          {todayRecord ? (
            <div className="grid grid-cols-2 gap-3">
              <div>Docenas: {todayRecord.docenas_armadas}</div>
              <div>Rotos: {todayRecord.huevos_rotos}</div>
              <div>Bandejas: {todayRecord.bandejas_consumo}</div>
              <div>Fértiles: {todayRecord.bandejas_fertiles}</div>
            </div>
          ) : (
            <p className="text-gray-400">Sin datos</p>
          )}
        </div>

        {/* FERTILES */}
        <div className="bg-white p-4 rounded-xl">
          <h3 className="text-sm text-gray-400 mb-2">Fértiles hoy</h3>

          {todayFertile ? (
            <div className="grid grid-cols-2 gap-3">
              <div>Procesadas: {todayFertile.bandejas_procesadas}</div>
              <div>Seleccionadas: {todayFertile.docenas_seleccionadas}</div>
              <div>Descarte: {todayFertile.descarte}</div>
            </div>
          ) : (
            <p className="text-gray-400">Sin datos</p>
          )}
        </div>

        {/* ALERTAS */}
        <div>
          <h3 className="text-sm text-gray-400 mb-2">Alertas</h3>

          {alerts.map((a, i) => (
            <div key={i} className="bg-gray-100 p-2 rounded mb-2">
              {a.message}
            </div>
          ))}
        </div>

        {/* MODULOS */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/admin/lotes">Lotes</Link>
          <Link href="/dashboard/admin/stock">Stock</Link>
          <Link href="/dashboard/admin/tareas">Tareas</Link>
          <Link href="/dashboard/admin/analisis">Análisis</Link>
        </div>

        <Link
          href="/dashboard/huevos"
          className="bg-yellow-400 p-4 rounded-xl flex justify-center"
        >
          <Egg className="mr-2" />
          Registrar huevos
        </Link>

      </div>
    </div>
  );
}
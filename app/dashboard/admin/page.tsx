'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Link from 'next/link';
import { TrendingUp, Package, Heart, ClipboardList, BarChart2, Clock, CheckCircle, AlertTriangle, Egg, Plus } from 'lucide-react';

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
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [todayRecord, setTodayRecord] = useState<DailyRecord | null>(null);
  const [todayFertile, setTodayFertile] = useState<FertileRecord | null>(null);
  const [weekRecords, setWeekRecords] = useState<DailyRecord[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [totalAves, setTotalAves] = useState(0);
  const [stockSummary, setStockSummary] = useState<any[]>([]); // Para mostrar stock rápido
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  const load = async () => {
    if (!user) return;

    // Registro de consumo hoy
    const { data: todayData } = await supabase
      .from('daily_records')
      .select('*')
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1);
    if (todayData?.length) setTodayRecord(todayData[0]);

    // Registro de fértiles hoy
    const { data: fertileData } = await supabase
      .from('fertile_records')
      .select('*')
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1);
    if (fertileData?.length) setTodayFertile(fertileData[0]);

    // Últimos 7 días
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const { data: weekData } = await supabase
      .from('daily_records')
      .select('date, registered_at, bandejas_consumo, bandejas_fertiles, docenas_armadas, huevos_rotos, notas')
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
      .order('date');
    if (weekData) setWeekRecords(weekData);

    // Total aves
    const { data: lotsData } = await supabase
      .from('lots')
      .select('current_quantity');
    if (lotsData) {
      setTotalAves(lotsData.reduce((sum, l) => sum + (l.current_quantity || 0), 0));
    }

    // Stock summary (para alertas y vista rápida)
    const { data: stockData } = await supabase
      .from('stock_items')
      .select('id, name, current_quantity, unit, alert_threshold, is_feed');
    if (stockData) setStockSummary(stockData);

    // Alertas
    const newAlerts: Alert[] = [];

    stockData?.forEach(item => {
      if (item.current_quantity <= (item.alert_threshold || 0)) {
        newAlerts.push({
          type: item.current_quantity === 0 ? 'danger' : 'warning',
          message: `Stock bajo: ${item.name} (${item.current_quantity} ${item.unit || ''})`
        });
      }
    });

    const { data: urgentTasks } = await supabase
      .from('tasks')
      .select('description')
      .eq('is_urgent', true)
      .eq('is_active', true);

    urgentTasks?.forEach(t => {
      newAlerts.push({ type: 'danger', message: `Tarea urgente: ${t.description}` });
    });

    if (newAlerts.length === 0) {
      newAlerts.push({ type: 'ok', message: 'Todo en orden por ahora ✓' });
    }

    setAlerts(newAlerts);
    setLoading(false);
  };

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
    load();
  }, [authLoading, user, profile]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Cargando dashboard...</p>
      </div>
    );
  }

  if (!profile) return null;

  // Cálculos (mantengo los tuyos)
  const totalHuevosConsumo = todayRecord 
    ? (todayRecord.docenas_armadas * 12) + todayRecord.huevos_rotos 
    : 0;

  const pctPosturaTotal = totalAves > 0 && (totalHuevosConsumo + (todayFertile ? (todayFertile.docenas_seleccionadas * 12) + todayFertile.descarte : 0)) > 0
    ? Math.round(((totalHuevosConsumo + (todayFertile ? (todayFertile.docenas_seleccionadas * 12) + todayFertile.descarte : 0)) / totalAves) * 100)
    : null;

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

        {/* Acceso rápido a módulos */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/admin/stock" className="bg-white rounded-2xl border p-6 hover:border-yellow-300 transition-all flex flex-col items-center text-center">
            <Package className="w-10 h-10 text-blue-600 mb-3" />
            <span className="font-semibold">Gestión de Stock</span>
            <span className="text-xs text-gray-500 mt-1">Agregar alimento y otros insumos</span>
          </Link>

          <Link href="/dashboard/huevos" className="bg-white rounded-2xl border p-6 hover:border-yellow-300 transition-all flex flex-col items-center text-center">
            <Egg className="w-10 h-10 text-yellow-600 mb-3" />
            <span className="font-semibold">Registrar Huevos</span>
          </Link>
        </div>

        {/* Consumo y Fértiles hoy (mantengo tu diseño) */}
        {/* ... (podes pegar aquí las secciones de consumo y fértiles que ya tenías) ... */}

        {/* Alertas */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Alertas</h3>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl border text-sm
                ${a.type === 'danger' ? 'bg-red-50 border-red-200 text-red-700' : 
                  a.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 
                  'bg-green-50 border-green-200 text-green-700'}`}>
                {a.type === 'ok' ? <CheckCircle className="w-5 h-5 mt-0.5" /> : <AlertTriangle className="w-5 h-5 mt-0.5" />}
                <span>{a.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stock rápido */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">Stock actual</h3>
            <Link href="/dashboard/admin/stock" className="text-yellow-600 text-sm font-medium flex items-center gap-1">
              Gestionar stock <Plus className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {stockSummary.slice(0, 4).map((item) => (
              <div key={item.id} className="bg-white rounded-2xl border p-4 flex justify-between items-center">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-500">{item.current_quantity} {item.unit}</p>
                </div>
                {item.current_quantity <= (item.alert_threshold || 0) && (
                  <span className="text-red-600 text-xs font-medium">¡Bajo!</span>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
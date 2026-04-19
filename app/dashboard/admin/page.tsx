'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Link from 'next/link';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  CheckCircle,
  Egg
} from 'lucide-react';

export default function AdminDashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [totalAves, setTotalAves] = useState(0);
  const [huevosHoy, setHuevosHoy] = useState(0);
  const [alertas, setAlertas] = useState<string[]>([]);

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

    load();
  }, [authLoading, user, profile]);

  const load = async () => {
    try {
      // 🐦 Total aves
      const { data: lots } = await supabase
        .from('lots')
        .select('current_quantity');

      if (lots) {
        const total = lots.reduce((acc, l) => acc + l.current_quantity, 0);
        setTotalAves(total);
      }

      // 🥚 Producción hoy
      const { data: todayData } = await supabase
        .from('daily_records')
        .select('docenas_armadas, huevos_rotos')
        .eq('date', today)
        .limit(1);

      if (todayData && todayData.length > 0) {
        const r = todayData[0];
        const total = (r.docenas_armadas * 12) + r.huevos_rotos;
        setHuevosHoy(total);
      }

      // ⚠️ Alertas stock
      const { data: stock } = await supabase
        .from('stock_items')
        .select('name, current_quantity, alert_threshold');

      const alerts: string[] = [];

      if (stock) {
        stock.forEach(item => {
          if (item.current_quantity <= item.alert_threshold) {
            alerts.push(`Stock bajo: ${item.name}`);
          }
        });
      }

      setAlertas(alerts);
      setLoading(false);

    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  // 📊 KPI
  const postura = useMemo(() => {
    if (totalAves === 0 || huevosHoy === 0) return null;
    return Math.round((huevosHoy / totalAves) * 100);
  }, [totalAves, huevosHoy]);

  // 🛑 PROTECCIÓN TOTAL (evita TODOS los errores)
  if (authLoading || loading || !user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <Header
        userName={profile?.full_name || ''}
        role={profile?.role || ''}
      />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* SALUDO */}
        <div>
          <h2 className="text-2xl font-bold">
            Hola, {profile.full_name} 👋
          </h2>
          <p className="text-gray-500 text-sm">
            {new Date().toLocaleDateString('es-AR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </p>
        </div>

        {/* KPI PRINCIPAL */}
        <div className="bg-yellow-400 rounded-2xl p-5 flex justify-between items-center">
          <div>
            <p className="text-sm text-yellow-900">Postura hoy</p>
            <p className="text-xs text-yellow-800">{totalAves} aves</p>
          </div>
          <p className="text-4xl font-bold text-yellow-900">
            {postura !== null ? `${postura}%` : '—'}
          </p>
        </div>

        {/* METRICAS */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-2xl border">
            <p className="text-xs text-gray-400">Huevos hoy</p>
            <p className="text-2xl font-bold">{huevosHoy}</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border">
            <p className="text-xs text-gray-400">Aves activas</p>
            <p className="text-2xl font-bold">{totalAves}</p>
          </div>
        </div>

        {/* ALERTAS */}
        <div>
          <h3 className="text-xs text-gray-400 uppercase mb-2">Alertas</h3>

          {alertas.length === 0 ? (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-3 flex items-center gap-2 text-green-700">
              <CheckCircle className="w-4 h-4" />
              Todo en orden
            </div>
          ) : (
            alertas.map((a, i) => (
              <div key={i} className="bg-red-50 border border-red-100 rounded-2xl p-3 flex items-center gap-2 text-red-700 mb-2">
                <AlertTriangle className="w-4 h-4" />
                {a}
              </div>
            ))
          )}
        </div>

        {/* MODULOS */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/admin/lotes" className="card">
            <TrendingUp /> Lotes
          </Link>

          <Link href="/dashboard/admin/stock" className="card">
            <Package /> Stock
          </Link>
        </div>

        {/* CTA */}
        <Link
          href="/dashboard/huevos"
          className="btn-primary w-full py-4 flex items-center justify-center gap-2"
        >
          <Egg className="w-5 h-5" />
          Registrar huevos
        </Link>

      </div>
    </div>
  );
}
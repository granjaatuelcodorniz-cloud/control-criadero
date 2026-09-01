'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibilityReload } from '@/lib/visibility-reload';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Search, Calendar, TrendingUp, Skull, Wheat } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Loss = {
  date: string;
  quantity: number;
};

// Lote con su fecha de inicio y aves iniciales (para no afectar % anteriores a su carga).
type LotInicio = {
  start_date: string;
  initial_quantity: number;
};

type FeedItem = {
  id: number;
  name: string;
  current_quantity: number;
  kg_por_bolsa: number | null;
  bolsas_restantes: number | null;
};

type FeedMovement = {
  date: string;
  quantity: number;
  stock_item_id: number;
};

// Registro enriquecido por día — consumo + fértiles integrados
type DayFull = {
  date: string;
  // consumo
  docenas: number;
  rotos: number;
  huevosConsumo: number;   // docenas*12 + rotos
  // fértiles
  docenasFertiles: number;
  descarteFertiles: number;
  huevosFertiles: number;  // docenasFertiles*12 + descarteFertiles
  // totales
  huevosTotal: number;     // huevosConsumo + huevosFertiles
  aves: number;            // aves que había ese día
  pctPostura: number | null;
  pctRotos: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function dayLabel(dateStr: string): string {
  return DIAS[new Date(dateStr + 'T12:00:00').getDay()];
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetweenInclusive(from: string, to: string): number {
  const start = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function sumFeedKg(movements: FeedMovement[], feedItemIds: Set<number>): number {
  return Math.round(
    movements
      .filter(m => feedItemIds.has(m.stock_item_id))
      .reduce((s, m) => s + (m.quantity ?? 0), 0) * 100
  ) / 100;
}

function formatKg(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function formatDecimal(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

// Calcula cuántas aves había en una fecha dada:
//   aves_actuales
//   + bajas registradas DESPUÉS de esa fecha (estaban vivas ese día)
//   - aves iniciales de lotes cargados DESPUÉS de esa fecha (todavía no existían)
// Así un lote nuevo solo afecta los % desde su fecha de carga en adelante, no para atrás.
function avesEnFecha(fecha: string, avesActuales: number, losses: Loss[], lots: LotInicio[]): number {
  const bajasPosteriores = losses
    .filter(l => l.date > fecha)
    .reduce((s, l) => s + l.quantity, 0);
  const avesDeLotesPosteriores = lots
    .filter(l => l.start_date > fecha)
    .reduce((s, l) => s + l.initial_quantity, 0);
  return Math.max(0, avesActuales + bajasPosteriores - avesDeLotesPosteriores);
}

// Agrupa los empaques de consumo (consumo_empaque) por fecha sumando valores
function groupConsumo(
  records: { date: string; docenas: number; rotos: number }[]
): Map<string, { docenas: number; rotos: number }> {
  const map = new Map<string, { docenas: number; rotos: number }>();
  for (const r of records) {
    const ex = map.get(r.date);
    if (ex) {
      ex.docenas += r.docenas;
      ex.rotos += r.rotos;
    } else {
      map.set(r.date, { docenas: r.docenas, rotos: r.rotos });
    }
  }
  return map;
}

// Agrupa fertile_records por fecha sumando valores
function groupFertiles(
  records: { date: string; docenas_seleccionadas: number; descarte: number }[]
): Map<string, { docenas: number; descarte: number }> {
  const map = new Map<string, { docenas: number; descarte: number }>();
  for (const r of records) {
    const ex = map.get(r.date);
    if (ex) {
      ex.docenas += r.docenas_seleccionadas;
      ex.descarte += r.descarte;
    } else {
      map.set(r.date, { docenas: r.docenas_seleccionadas, descarte: r.descarte });
    }
  }
  return map;
}

// Construye DayFull integrando consumo + fértiles + aves del día
function buildDaysFull(
  consumoMap: Map<string, { docenas: number; rotos: number }>,
  fertilesMap: Map<string, { docenas: number; descarte: number }>,
  avesActuales: number,
  losses: Loss[],
  lots: LotInicio[],
): DayFull[] {
  const allDates = new Set([...consumoMap.keys(), ...fertilesMap.keys()]);
  const result: DayFull[] = [];

  for (const date of allDates) {
    const c = consumoMap.get(date) || { docenas: 0, rotos: 0 };
    const f = fertilesMap.get(date) || { docenas: 0, descarte: 0 };

    const huevosConsumo = (c.docenas * 12) + c.rotos;
    const huevosFertiles = (f.docenas * 12) + f.descarte;
    const huevosTotal = huevosConsumo + huevosFertiles;

    const aves = avesEnFecha(date, avesActuales, losses, lots);
    const pctPostura = aves > 0 && huevosTotal > 0
      ? Math.round((huevosTotal / aves) * 100)
      : null;
    const pctRotos = huevosTotal > 0 && c.rotos > 0
      ? Math.round((c.rotos / huevosTotal) * 100)
      : null;

    result.push({
      date,
      docenas: c.docenas,
      rotos: c.rotos,
      huevosConsumo,
      docenasFertiles: f.docenas,
      descarteFertiles: f.descarte,
      huevosFertiles,
      huevosTotal,
      aves,
      pctPostura,
      pctRotos,
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// Promedio de porcentajes (solo días con valor)
function avgPct(days: DayFull[], key: 'pctPostura' | 'pctRotos'): number | null {
  const vals = days.map(d => d[key]).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function BarChart({ days, today }: { days: DayFull[]; today: string }) {
  const max = Math.max(...days.map(d => d.huevosTotal), 1);
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-end gap-1 pt-6" style={{ minHeight: '120px' }}>
        {days.map((d, i) => {
          const h = Math.max(Math.round((d.huevosTotal / max) * 88), 4);
          const isToday = d.date === today;
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0 relative"
              style={{ minWidth: '28px' }}>
              {/* Número arriba — posicionado absolutamente para no cortar */}
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-gray-400 whitespace-nowrap">
                {d.huevosTotal > 0 ? d.huevosTotal : ''}
              </span>
              <div
                className={`w-full rounded-t-lg transition-all ${isToday ? 'bg-yellow-400' : 'bg-yellow-200'}`}
                style={{ height: `${h}px` }}
              />
              <span className="text-[9px] text-gray-400">{dayLabel(d.date)}</span>
              {/* % postura debajo del día */}
              {d.pctPostura !== null && (
                <span className="text-[8px] text-gray-300">{d.pctPostura}%</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: 'red' | 'orange';
}) {
  return (
    <div className={`rounded-2xl p-3 ${highlight === 'red' ? 'bg-red-50' : highlight === 'orange' ? 'bg-orange-50' : 'bg-gray-50'}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight === 'red' ? 'text-red-600' : highlight === 'orange' ? 'text-orange-600' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Analisis() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const today = getToday();

  // Global
  const [avesActuales, setAvesActuales] = useState(0);
  const [allLosses, setAllLosses] = useState<Loss[]>([]);
  const [allLots, setAllLots] = useState<LotInicio[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [weekFeedKg, setWeekFeedKg] = useState(0);

  // Búsqueda por día
  const [searchDate, setSearchDate] = useState(today);
  const [dayData, setDayData] = useState<DayFull | null>(null);
  const [daySearched, setDaySearched] = useState(false);
  const [dayNotes, setDayNotes] = useState<string[]>([]);

  // Rango
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [dateTo, setDateTo] = useState(today);
  const [rangeDays, setRangeDays] = useState<DayFull[]>([]);
  const [rangeSearched, setRangeSearched] = useState(false);
  const [rangeFeedKg, setRangeFeedKg] = useState(0);

  // Mes
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthDays, setMonthDays] = useState<DayFull[]>([]);
  const [monthLosses, setMonthLosses] = useState(0);
  const [monthFeedKg, setMonthFeedKg] = useState(0);
  const [baseDataReady, setBaseDataReady] = useState(false);

  const [loading, setLoading] = useState(false);

  // ── Cargar mes ──────────────────────────────────────────────────────────────
  const loadMonth = useCallback(async (month: string, aves: number, losses: Loss[], lots: LotInicio[]) => {
    const [year, mon] = month.split('-');
    const from = `${year}-${mon}-01`;
    const lastDay = new Date(Number(year), Number(mon), 0).getDate();
    const to = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`;

    const [consumoRes, fertilesRes, lossesMonthRes, feedMovRes] = await Promise.all([
      supabase.from('consumo_empaque').select('date, docenas, rotos')
        .gte('date', from).lte('date', to),
      supabase.from('fertile_records').select('date, docenas_seleccionadas, descarte')
        .gte('date', from).lte('date', to),
      supabase.from('lot_losses').select('quantity').eq('loss_type', 'muerte')
        .gte('date', from).lte('date', to),
      supabase.from('stock_movements').select('date, quantity, stock_item_id')
        .eq('movement_type', 'salida').gte('date', from).lte('date', to),
    ]);

    const consumoMap = groupConsumo(consumoRes.data || []);
    const fertilesMap = groupFertiles(fertilesRes.data || []);
    const days = buildDaysFull(consumoMap, fertilesMap, aves, losses, lots);
    const feedItemIds = new Set(feedItems.map(item => item.id));
    setMonthDays(days);
    setMonthLosses(lossesMonthRes.data?.reduce((s, l) => s + l.quantity, 0) || 0);
    setMonthFeedKg(sumFeedKg(feedMovRes.data || [], feedItemIds));
  }, [feedItems]);

  // ── Init ────────────────────────────────────────────────────────────────────
  // Carga los datos base (aves actuales, bajas, lotes). Se ejecuta al entrar y
  // también al volver de segundo plano, para no quedar con datos viejos.
  const loadBase = useCallback(async () => {
    const weekFrom = addDays(today, -6);
    const [slotsRes, lossesRes, lotsRes, feedItemsRes, weekFeedRes] = await Promise.all([
      supabase.from('cage_slots').select('quantity'),
      supabase.from('lot_losses').select('date, quantity'),
      supabase.from('lots').select('start_date, initial_quantity').neq('status', 'cerrado'),
      supabase.from('stock_items').select('id, name, current_quantity, kg_por_bolsa, bolsas_restantes')
        .eq('is_feed', true).order('name'),
      supabase.from('stock_movements').select('date, quantity, stock_item_id')
        .eq('movement_type', 'salida').gte('date', weekFrom).lte('date', today),
    ]);
    const aves = slotsRes.data?.reduce((s, sl) => s + sl.quantity, 0) || 0;
    const feedData = feedItemsRes.data || [];
    const feedItemIds = new Set(feedData.map(item => item.id));
    setAvesActuales(aves);
    setAllLosses(lossesRes.data || []);
    setAllLots(lotsRes.data || []);
    setFeedItems(feedData);
    setWeekFeedKg(sumFeedKg(weekFeedRes.data || [], feedItemIds));
    setBaseDataReady(true);
  }, [today]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }
    void loadBase();
  }, [authLoading, user, profile, router, loadBase]);

  // Al volver a primer plano, refrescamos los datos base; eso reengancha el
  // efecto de abajo y recarga el mes visible (el bug del video).
  useVisibilityReload(loadBase);

  useEffect(() => {
    if (!baseDataReady) return;
    void loadMonth(selectedMonth, avesActuales, allLosses, allLots);
  }, [baseDataReady, selectedMonth, avesActuales, allLosses, allLots, loadMonth]);

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
  };

  // ── Búsqueda día ────────────────────────────────────────────────────────────
  const handleSearchDay = async () => {
    setLoading(true);
    setDaySearched(true);

    const [consumoRes, fertilesRes, notasRes] = await Promise.all([
      supabase.from('consumo_empaque').select('date, docenas, rotos')
        .eq('date', searchDate),
      supabase.from('fertile_records').select('date, docenas_seleccionadas, descarte')
        .eq('date', searchDate),
      supabase.from('daily_records').select('notas').eq('date', searchDate),
    ]);

    const consumoMap = groupConsumo(consumoRes.data || []);
    const fertilesMap = groupFertiles(fertilesRes.data || []);

    if (consumoMap.size === 0 && fertilesMap.size === 0) {
      setDayData(null);
      setDayNotes([]);
    } else {
      const days = buildDaysFull(consumoMap, fertilesMap, avesActuales, allLosses, allLots);
      setDayData(days[0] || null);
      setDayNotes(
        (notasRes.data || []).map(r => r.notas).filter((n): n is string => !!n)
      );
    }
    setLoading(false);
  };

  // ── Búsqueda rango ──────────────────────────────────────────────────────────
  const handleSearchRange = async () => {
    setLoading(true);
    setRangeSearched(true);

    const [consumoRes, fertilesRes, feedMovRes] = await Promise.all([
      supabase.from('consumo_empaque').select('date, docenas, rotos')
        .gte('date', dateFrom).lte('date', dateTo),
      supabase.from('fertile_records').select('date, docenas_seleccionadas, descarte')
        .gte('date', dateFrom).lte('date', dateTo),
      supabase.from('stock_movements').select('date, quantity, stock_item_id')
        .eq('movement_type', 'salida').gte('date', dateFrom).lte('date', dateTo),
    ]);

    const consumoMap = groupConsumo(consumoRes.data || []);
    const fertilesMap = groupFertiles(fertilesRes.data || []);
    const days = buildDaysFull(consumoMap, fertilesMap, avesActuales, allLosses, allLots);
    const feedItemIds = new Set(feedItems.map(item => item.id));
    setRangeDays(days);
    setRangeFeedKg(sumFeedKg(feedMovRes.data || [], feedItemIds));
    setLoading(false);
  };

  // ── Cálculos mes ────────────────────────────────────────────────────────────
  const monthTotalHuevos = monthDays.reduce((s, d) => s + d.huevosTotal, 0);
  const monthTotalDocenas = monthDays.reduce((s, d) => s + d.docenas, 0);
  const monthTotalRotos = monthDays.reduce((s, d) => s + d.rotos, 0);
  const monthTotalFertiles = monthDays.reduce((s, d) => s + d.docenasFertiles, 0);
  const monthPromPostura = avgPct(monthDays, 'pctPostura');
  const monthPromRotos = avgPct(monthDays, 'pctRotos');
  const monthDiasConReg = monthDays.length;
  const [monthYear, monthNumber] = selectedMonth.split('-').map(Number);
  const monthStart = `${selectedMonth}-01`;
  const monthLastDay = new Date(monthYear, monthNumber, 0).getDate();
  const monthEnd = selectedMonth === today.slice(0, 7)
    ? today
    : `${selectedMonth}-${String(monthLastDay).padStart(2, '0')}`;
  const monthPeriodDays = daysBetweenInclusive(monthStart, monthEnd);
  const monthFeedKgPerDay = monthFeedKg / monthPeriodDays;
  const monthFeedKgPerBirdDay = avesActuales > 0 ? monthFeedKgPerDay / avesActuales : 0;

  // ── Cálculos rango ──────────────────────────────────────────────────────────
  const rangeTotalHuevos = rangeDays.reduce((s, d) => s + d.huevosTotal, 0);
  const rangeTotalDocenas = rangeDays.reduce((s, d) => s + d.docenas, 0);
  const rangePromPostura = avgPct(rangeDays, 'pctPostura');
  const rangePromDocenas = rangeDays.length > 0 ? Math.round(rangeTotalDocenas / rangeDays.length) : 0;
  const rangePeriodDays = daysBetweenInclusive(dateFrom, dateTo);
  const rangeFeedKgPerDay = rangeFeedKg / rangePeriodDays;
  const rangeFeedKgPerBirdDay = avesActuales > 0 ? rangeFeedKgPerDay / avesActuales : 0;

  const totalFeedStockKg = feedItems.reduce((s, item) => s + (item.current_quantity ?? 0), 0);
  const weekFeedKgPerDay = weekFeedKg / 7;
  const weekFeedKgPerBirdDay = avesActuales > 0 ? weekFeedKgPerDay / avesActuales : 0;
  const estimatedStockDays = weekFeedKgPerDay > 0 ? Math.floor(totalFeedStockKg / weekFeedKgPerDay) : null;

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    return {
      val: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    };
  });

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Análisis de Producción</h2>

        {/* ── Alimento ── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Alimento</h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="bg-emerald-50 rounded-2xl p-4 flex items-center justify-between border border-emerald-100">
              <div>
                <p className="text-sm font-bold text-emerald-800 flex items-center gap-1">
                  <Wheat className="w-4 h-4" /> Stock estimado
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {formatKg(totalFeedStockKg)} kg disponibles
                </p>
              </div>
              <p className="text-4xl font-black text-emerald-800">
                {estimatedStockDays !== null ? estimatedStockDays : '—'}
                <span className="text-sm ml-1">días</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Últimos 7 días" value={`${formatKg(weekFeedKg)} kg`} />
              <StatCard label="Promedio diario" value={`${formatKg(weekFeedKgPerDay)} kg`} />
              <StatCard label="Kg/ave/día" value={weekFeedKgPerBirdDay > 0 ? formatDecimal(weekFeedKgPerBirdDay) : '—'} />
              <StatCard label="Bolsas cerradas" value={feedItems.reduce((s, item) => s + (item.bolsas_restantes ?? 0), 0)} />
            </div>

            {feedItems.length > 1 && (
              <div className="pt-2 border-t border-gray-50 space-y-2">
                {feedItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-600">{item.name}</span>
                    <span className="text-gray-400">
                      {item.bolsas_restantes ?? 0} bolsas · {formatKg(item.current_quantity)} kg
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Búsqueda por día ── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Buscar día</h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="flex gap-2">
              <input type="date" className="input-base flex-1" value={searchDate}
                max={today} onChange={e => setSearchDate(e.target.value)} />
              <button onClick={handleSearchDay} disabled={loading} className="btn-primary px-4 py-2">
                <Search className="w-4 h-4" />
              </button>
            </div>

            {daySearched && (
              dayData ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-600">
                    {new Date(searchDate + 'T12:00:00').toLocaleDateString('es-AR', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    })}
                    <span className="text-xs text-gray-400 ml-2">· {dayData.aves} aves</span>
                  </p>

                  {/* Postura destacada */}
                  {dayData.pctPostura !== null && (
                    <div className="bg-yellow-400 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-yellow-900 flex items-center gap-1">
                          <TrendingUp className="w-4 h-4" /> Postura del día
                        </p>
                        <p className="text-xs text-yellow-800 mt-0.5">
                          {dayData.huevosTotal} huevos totales · {dayData.aves} aves
                        </p>
                      </div>
                      <p className="text-4xl font-black text-yellow-900">{dayData.pctPostura}%</p>
                    </div>
                  )}

                  {/* Consumo */}
                  {dayData.huevosConsumo > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Consumo</p>
                      <div className="grid grid-cols-3 gap-2">
                        <StatCard label="Docenas" value={dayData.docenas} />
                        <StatCard label="Rotos" value={dayData.rotos}
                          highlight={dayData.pctRotos !== null && dayData.pctRotos > 5 ? 'red' : undefined} />
                        <StatCard label="% rotos" value={dayData.pctRotos !== null ? `${dayData.pctRotos}%` : '—'}
                          highlight={dayData.pctRotos !== null && dayData.pctRotos > 5 ? 'red' : undefined} />
                      </div>
                    </div>
                  )}

                  {/* Fértiles */}
                  {dayData.huevosFertiles > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Fértiles</p>
                      <div className="grid grid-cols-2 gap-2">
                        <StatCard label="Docenas seleccionadas" value={dayData.docenasFertiles} />
                        <StatCard label="Descarte fértiles" value={dayData.descarteFertiles} />
                      </div>
                    </div>
                  )}

                  {dayNotes.length > 0 && (
                    <div className="bg-yellow-50 rounded-xl px-3 py-2">
                      <p className="text-xs text-yellow-600 font-medium mb-1">Notas</p>
                      {dayNotes.map((n, i) => <p key={i} className="text-sm text-yellow-800">{n}</p>)}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-gray-400 text-sm py-2">Sin registro para ese día</p>
              )
            )}
          </div>
        </section>

        {/* ── Producción por intervalo ── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Producción por intervalo</h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Desde</label>
                <input type="date" className="input-base text-sm" value={dateFrom}
                  max={dateTo} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Hasta</label>
                <input type="date" className="input-base text-sm" value={dateTo}
                  min={dateFrom} max={today} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
            <button onClick={handleSearchRange} disabled={loading}
              className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4" /> Ver producción
            </button>

            {rangeSearched && (
              rangeDays.length > 0 || rangeFeedKg > 0 ? (
                <div className="space-y-4">
                  {rangeDays.length > 0 && <BarChart days={rangeDays} today={today} />}

                  {rangePromPostura !== null && (
                    <div className="bg-yellow-400 rounded-2xl p-3 flex items-center justify-between">
                      <p className="text-sm font-bold text-yellow-900">Postura promedio</p>
                      <p className="text-2xl font-black text-yellow-900">{rangePromPostura}%</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
                    <StatCard label="Total docenas" value={rangeTotalDocenas} />
                    <StatCard label="Total huevos" value={rangeTotalHuevos} />
                    <StatCard label="Promedio docenas/día" value={rangePromDocenas} />
                    <StatCard label="Días con registro" value={rangeDays.length} />
                    <StatCard label="Alimento consumido" value={`${formatKg(rangeFeedKg)} kg`} />
                    <StatCard label="Kg/ave/día" value={rangeFeedKgPerBirdDay > 0 ? formatDecimal(rangeFeedKgPerBirdDay) : '—'}
                      sub={`${formatKg(rangeFeedKgPerDay)} kg/día`} />
                  </div>
                </div>
              ) : (
                <p className="text-center text-gray-400 text-sm">Sin registros en ese período</p>
              )
            )}
          </div>
        </section>

        {/* ── Resumen mensual ── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Resumen mensual</h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <select className="input-base" value={selectedMonth}
              onChange={e => handleMonthChange(e.target.value)}>
              {monthOptions.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>

            {monthDays.length > 0 || monthFeedKg > 0 ? (
              <div className="space-y-4">
                {monthDays.length > 0 && <BarChart days={monthDays} today={today} />}

                {/* Postura promedio destacada */}
                {monthPromPostura !== null && (
                  <div className="bg-yellow-400 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-yellow-900 flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" /> Postura promedio
                      </p>
                      <p className="text-xs text-yellow-800 mt-0.5">
                        Promedio de {monthDiasConReg} días registrados
                      </p>
                    </div>
                    <p className="text-4xl font-black text-yellow-900">{monthPromPostura}%</p>
                  </div>
                )}

                {/* Consumo */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Consumo</p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Total docenas" value={monthTotalDocenas} />
                    <StatCard label="Total huevos" value={monthTotalHuevos} />
                    <StatCard label="Promedio docenas/día" value={monthDiasConReg > 0 ? Math.round(monthTotalDocenas / monthDiasConReg) : 0} />
                    <StatCard label="Días con registro" value={monthDiasConReg} />
                    <StatCard label="Alimento consumido" value={`${formatKg(monthFeedKg)} kg`} />
                    <StatCard label="Kg/ave/día" value={monthFeedKgPerBirdDay > 0 ? formatDecimal(monthFeedKgPerBirdDay) : '—'}
                      sub={`${formatKg(monthFeedKgPerDay)} kg/día`} />
                  </div>
                </div>

                {/* Fértiles */}
                {monthTotalFertiles > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Fértiles</p>
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Total docenas" value={monthTotalFertiles} />
                      <StatCard label="Total huevos fértiles"
                        value={monthDays.reduce((s, d) => s + d.huevosFertiles, 0)} />
                    </div>
                  </div>
                )}

                {/* Calidad y mortalidad */}
                <div className="grid grid-cols-2 gap-2">
                  {monthPromRotos !== null && (
                    <StatCard label="% rotos promedio"
                      value={`${monthPromRotos}%`}
                      sub={`${monthTotalRotos} huevos`}
                      highlight={monthPromRotos > 5 ? 'red' : undefined} />
                  )}
                  {monthLosses > 0 && (
                    <div className="bg-red-50 rounded-2xl p-3">
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Skull className="w-3 h-3" /> Mortalidad
                      </p>
                      <p className="text-xl font-bold text-red-600">{monthLosses}</p>
                      <p className="text-[10px] text-gray-400">aves fallecidas</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-400 text-sm py-4">Sin registros este mes</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

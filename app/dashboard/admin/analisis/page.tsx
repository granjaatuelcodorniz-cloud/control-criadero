'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibilityReload } from '@/lib/visibility-reload';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Search, Calendar, TrendingUp, Skull, Wheat, BarChart2, Egg, Gauge, PackageCheck, Save, Trash2, Wand2, Pencil } from 'lucide-react';

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

type ProductionCorrection = {
  date: string;
  original_huevos_total: number | null;
  corrected_huevos_total: number;
  corrected_docenas_total: number | null;
  reason: string | null;
  method: string | null;
};

type CorrectionFormMessage = {
  type: 'success' | 'error';
  text: string;
};

type CorrectionSuggestion = {
  huevos: number;
  docenas: number;
  method: string;
};

type AnalysisTab = 'resumen' | 'produccion' | 'alimento' | 'eficiencia';
type FeedCategory = 'produccion' | 'bb' | 'otro';

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
  originalHuevosTotal: number;
  originalDocenas: number;
  originalRotos: number;
  isCorrected: boolean;
  correctionReason: string | null;
  correctionMethod: string | null;
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

function getFeedCategory(item: FeedItem): FeedCategory {
  const name = item.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/\b(bb|bebe|baby|iniciador|recria|cria)\b/.test(name)) return 'bb';
  if (/\b(ponedora|postura|adulto|adultas|produccion)\b/.test(name)) return 'produccion';
  return 'produccion';
}

function formatKg(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function formatDecimal(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

async function loadProductionCorrections(from: string, to: string): Promise<Map<string, ProductionCorrection>> {
  const { data, error } = await supabase
    .from('analysis_day_corrections')
    .select('date, original_huevos_total, corrected_huevos_total, corrected_docenas_total, reason, method')
    .gte('date', from)
    .lte('date', to);

  if (error) return new Map();
  return new Map((data || []).map(row => [row.date, row]));
}

async function loadRawProductionTotal(date: string) {
  const [consumoRes, fertilesRes] = await Promise.all([
    supabase.from('consumo_empaque').select('date, docenas, rotos').eq('date', date),
    supabase.from('fertile_records').select('date, docenas_seleccionadas, descarte').eq('date', date),
  ]);

  const consumoMap = groupConsumo(consumoRes.data || []);
  const fertilesMap = groupFertiles(fertilesRes.data || []);
  const consumo = consumoMap.get(date) || { docenas: 0, rotos: 0 };
  const fertiles = fertilesMap.get(date) || { docenas: 0, descarte: 0 };
  const huevosConsumo = (consumo.docenas * 12) + consumo.rotos;
  const huevosFertiles = (fertiles.docenas * 12) + fertiles.descarte;

  return {
    docenas: consumo.docenas,
    rotos: consumo.rotos,
    docenasFertiles: fertiles.docenas,
    descarteFertiles: fertiles.descarte,
    huevosTotal: huevosConsumo + huevosFertiles,
  };
}

async function loadCorrectionSuggestion(
  date: string,
  avesActuales: number,
  losses: Loss[],
  lots: LotInicio[]
): Promise<CorrectionSuggestion | null> {
  const from = addDays(date, -7);
  const to = addDays(date, 7);
  const [consumoRes, fertilesRes, corrections] = await Promise.all([
    supabase.from('consumo_empaque').select('date, docenas, rotos').gte('date', from).lte('date', to),
    supabase.from('fertile_records').select('date, docenas_seleccionadas, descarte').gte('date', from).lte('date', to),
    loadProductionCorrections(from, to),
  ]);

  const consumoMap = groupConsumo(consumoRes.data || []);
  const fertilesMap = groupFertiles(fertilesRes.data || []);
  const dates = Array.from(new Set([...consumoMap.keys(), ...fertilesMap.keys()])).sort();
  const healthyDays = dates
    .filter(candidate => candidate !== date && !corrections.has(candidate))
    .map(candidate => {
      const consumo = consumoMap.get(candidate) || { docenas: 0, rotos: 0 };
      const fertiles = fertilesMap.get(candidate) || { docenas: 0, descarte: 0 };
      const total = (consumo.docenas * 12) + consumo.rotos + (fertiles.docenas * 12) + fertiles.descarte;
      return { date: candidate, total };
    })
    .filter(day => {
      if (day.total <= 0) return false;
      const avesDelDia = avesEnFecha(day.date, avesActuales, losses, lots);
      if (avesDelDia <= 0) return true;
      return day.total >= Math.round(avesDelDia * 0.35) && day.total <= Math.round(avesDelDia * 1.05);
    });

  const before = healthyDays.filter(day => day.date < date).at(-1);
  const after = healthyDays.find(day => day.date > date);
  const referenceDays = [before, after].filter((day): day is { date: string; total: number } => !!day);

  if (referenceDays.length === 0) return null;

  const huevos = Math.round(referenceDays.reduce((sum, day) => sum + day.total, 0) / referenceDays.length);
  const method = referenceDays.length === 2
    ? `Promedio de dias vecinos confiables: ${before?.date} (${before?.total}) y ${after?.date} (${after?.total}).`
    : `Estimado con el dia confiable mas cercano: ${referenceDays[0].date} (${referenceDays[0].total}).`;

  return {
    huevos,
    docenas: Math.round(huevos / 12),
    method,
  };
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
  corrections = new Map<string, ProductionCorrection>(),
): DayFull[] {
  const allDates = new Set([...consumoMap.keys(), ...fertilesMap.keys(), ...corrections.keys()]);
  const result: DayFull[] = [];

  for (const date of allDates) {
    const c = consumoMap.get(date) || { docenas: 0, rotos: 0 };
    const f = fertilesMap.get(date) || { docenas: 0, descarte: 0 };
    const correction = corrections.get(date);

    const originalHuevosConsumo = (c.docenas * 12) + c.rotos;
    const huevosFertiles = (f.docenas * 12) + f.descarte;
    const originalHuevosTotal = originalHuevosConsumo + huevosFertiles;
    const huevosTotal = correction?.corrected_huevos_total ?? originalHuevosTotal;
    const correctedDocenasTotal = correction?.corrected_docenas_total ?? Math.round(huevosTotal / 12);
    const docenas = correction ? correctedDocenasTotal : c.docenas;
    const rotos = correction ? Math.max(0, huevosTotal - (docenas * 12) - huevosFertiles) : c.rotos;
    const huevosConsumo = correction ? Math.max(0, huevosTotal - huevosFertiles) : originalHuevosConsumo;

    const aves = avesEnFecha(date, avesActuales, losses, lots);
    const pctPostura = aves > 0 && huevosTotal > 0
      ? Math.round((huevosTotal / aves) * 100)
      : null;
    const pctRotos = !correction && huevosTotal > 0 && c.rotos > 0
      ? Math.round((c.rotos / huevosTotal) * 100)
      : null;

    result.push({
      date,
      docenas,
      rotos,
      huevosConsumo,
      docenasFertiles: f.docenas,
      descarteFertiles: f.descarte,
      huevosFertiles,
      huevosTotal,
      originalHuevosTotal: correction?.original_huevos_total ?? originalHuevosTotal,
      originalDocenas: c.docenas,
      originalRotos: c.rotos,
      isCorrected: !!correction,
      correctionReason: correction?.reason ?? null,
      correctionMethod: correction?.method ?? null,
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
                {d.huevosTotal > 0 ? `${d.huevosTotal}${d.isCorrected ? '*' : ''}` : ''}
              </span>
              <div
                title={d.isCorrected ? `Corregido: ${d.originalHuevosTotal} -> ${d.huevosTotal}` : undefined}
                className={`w-full rounded-t-lg transition-all ${
                  d.isCorrected ? 'bg-amber-400' : isToday ? 'bg-yellow-400' : 'bg-yellow-200'
                }`}
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

function CorrectionNotice({ days }: { days: DayFull[] }) {
  const corrected = days.filter(day => day.isCorrected);
  if (corrected.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
      <p className="text-xs font-bold text-amber-800">Datos corregidos</p>
      <p className="text-xs text-amber-700 mt-0.5">
        {corrected.map(day => `${dayLabel(day.date)} ${day.originalHuevosTotal} -> ${day.huevosTotal}`).join(' · ')}
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Analisis() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const today = getToday();

  const [activeTab, setActiveTab] = useState<AnalysisTab>('resumen');

  // Global
  const [avesActuales, setAvesActuales] = useState(0);
  const [allLosses, setAllLosses] = useState<Loss[]>([]);
  const [allLots, setAllLots] = useState<LotInicio[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [weekFeedKg, setWeekFeedKg] = useState(0);
  const [weekDays, setWeekDays] = useState<DayFull[]>([]);

  // Búsqueda por día
  const [searchDate, setSearchDate] = useState(today);
  const [dayData, setDayData] = useState<DayFull | null>(null);
  const [daySearched, setDaySearched] = useState(false);
  const [dayNotes, setDayNotes] = useState<string[]>([]);

  // Corrección manual de datos anómalos
  const [correctionDate, setCorrectionDate] = useState(today);
  const [correctionLoaded, setCorrectionLoaded] = useState(false);
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [correctionOriginalHuevos, setCorrectionOriginalHuevos] = useState<number | null>(null);
  const [correctionHuevos, setCorrectionHuevos] = useState('');
  const [correctionDocenas, setCorrectionDocenas] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionMethod, setCorrectionMethod] = useState('');
  const [correctionMessage, setCorrectionMessage] = useState<CorrectionFormMessage | null>(null);
  const [correctionSuggestion, setCorrectionSuggestion] = useState<CorrectionSuggestion | null>(null);
  const [correctionSuggestionLoading, setCorrectionSuggestionLoading] = useState(false);
  const [savedCorrections, setSavedCorrections] = useState<ProductionCorrection[]>([]);

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

    const [consumoRes, fertilesRes, lossesMonthRes, feedMovRes, corrections] = await Promise.all([
      supabase.from('consumo_empaque').select('date, docenas, rotos')
        .gte('date', from).lte('date', to),
      supabase.from('fertile_records').select('date, docenas_seleccionadas, descarte')
        .gte('date', from).lte('date', to),
      supabase.from('lot_losses').select('quantity').eq('loss_type', 'muerte')
        .gte('date', from).lte('date', to),
      supabase.from('stock_movements').select('date, quantity, stock_item_id')
        .eq('movement_type', 'salida').gte('date', from).lte('date', to),
      loadProductionCorrections(from, to),
    ]);

    const consumoMap = groupConsumo(consumoRes.data || []);
    const fertilesMap = groupFertiles(fertilesRes.data || []);
    const days = buildDaysFull(consumoMap, fertilesMap, aves, losses, lots, corrections);
    const feedItemIds = new Set(feedItems.filter(item => getFeedCategory(item) === 'produccion').map(item => item.id));
    setMonthDays(days);
    setMonthLosses(lossesMonthRes.data?.reduce((s, l) => s + l.quantity, 0) || 0);
    setMonthFeedKg(sumFeedKg(feedMovRes.data || [], feedItemIds));
  }, [feedItems]);

  // ── Init ────────────────────────────────────────────────────────────────────
  // Carga los datos base (aves actuales, bajas, lotes). Se ejecuta al entrar y
  // también al volver de segundo plano, para no quedar con datos viejos.
  const loadBase = useCallback(async () => {
    const weekFrom = addDays(today, -6);
    const [slotsRes, lossesRes, lotsRes, feedItemsRes, weekFeedRes, weekConsumoRes, weekFertilesRes, weekCorrections] = await Promise.all([
      supabase.from('cage_slots').select('quantity'),
      supabase.from('lot_losses').select('date, quantity'),
      supabase.from('lots').select('start_date, initial_quantity').neq('status', 'cerrado'),
      supabase.from('stock_items').select('id, name, current_quantity, kg_por_bolsa, bolsas_restantes')
        .eq('is_feed', true).order('name'),
      supabase.from('stock_movements').select('date, quantity, stock_item_id')
        .eq('movement_type', 'salida').gte('date', weekFrom).lte('date', today),
      supabase.from('consumo_empaque').select('date, docenas, rotos')
        .gte('date', weekFrom).lte('date', today),
      supabase.from('fertile_records').select('date, docenas_seleccionadas, descarte')
        .gte('date', weekFrom).lte('date', today),
      loadProductionCorrections(weekFrom, today),
    ]);
    const aves = slotsRes.data?.reduce((s, sl) => s + sl.quantity, 0) || 0;
    const feedData = feedItemsRes.data || [];
    const feedItemIds = new Set(feedData.filter(item => getFeedCategory(item) === 'produccion').map(item => item.id));
    setAvesActuales(aves);
    setAllLosses(lossesRes.data || []);
    setAllLots(lotsRes.data || []);
    setFeedItems(feedData);
    setWeekFeedKg(sumFeedKg(weekFeedRes.data || [], feedItemIds));
    setWeekDays(buildDaysFull(
      groupConsumo(weekConsumoRes.data || []),
      groupFertiles(weekFertilesRes.data || []),
      aves,
      lossesRes.data || [],
      lotsRes.data || [],
      weekCorrections,
    ));
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

  const loadSavedCorrections = useCallback(async () => {
    const { data } = await supabase
      .from('analysis_day_corrections')
      .select('date, original_huevos_total, corrected_huevos_total, corrected_docenas_total, reason, method')
      .order('date', { ascending: false })
      .limit(12);

    setSavedCorrections(data || []);
  }, []);

  useEffect(() => {
    if (!baseDataReady) return;
    void loadSavedCorrections();
  }, [baseDataReady, loadSavedCorrections]);

  // ── Búsqueda día ────────────────────────────────────────────────────────────
  const handleSearchDay = async () => {
    setLoading(true);
    setDaySearched(true);

    const [consumoRes, fertilesRes, notasRes, corrections] = await Promise.all([
      supabase.from('consumo_empaque').select('date, docenas, rotos')
        .eq('date', searchDate),
      supabase.from('fertile_records').select('date, docenas_seleccionadas, descarte')
        .eq('date', searchDate),
      supabase.from('daily_records').select('notas').eq('date', searchDate),
      loadProductionCorrections(searchDate, searchDate),
    ]);

    const consumoMap = groupConsumo(consumoRes.data || []);
    const fertilesMap = groupFertiles(fertilesRes.data || []);

    if (consumoMap.size === 0 && fertilesMap.size === 0 && corrections.size === 0) {
      setDayData(null);
      setDayNotes([]);
    } else {
      const days = buildDaysFull(consumoMap, fertilesMap, avesActuales, allLosses, allLots, corrections);
      setDayData(days[0] || null);
      setDayNotes(
        (notasRes.data || []).map(r => r.notas).filter((n): n is string => !!n)
      );
    }
    setLoading(false);
  };

  const refreshAnalysisAfterCorrection = async (changedDate: string) => {
    if (rangeSearched && changedDate >= dateFrom && changedDate <= dateTo) await handleSearchRange();
    if (daySearched && changedDate === searchDate) await handleSearchDay();
    await Promise.all([
      loadBase(),
      loadSavedCorrections(),
    ]);
  };

  const handleLoadCorrectionDay = async (date = correctionDate) => {
    setCorrectionLoading(true);
    setCorrectionLoaded(true);
    setCorrectionMessage(null);
    setCorrectionSuggestion(null);
    setCorrectionDate(date);

    const [rawDay, corrections] = await Promise.all([
      loadRawProductionTotal(date),
      loadProductionCorrections(date, date),
    ]);
    const existing = corrections.get(date);
    const originalHuevos = existing?.original_huevos_total ?? rawDay.huevosTotal;

    setCorrectionOriginalHuevos(originalHuevos);
    setCorrectionHuevos(String(existing?.corrected_huevos_total ?? rawDay.huevosTotal));
    setCorrectionDocenas(String(existing?.corrected_docenas_total ?? Math.round((existing?.corrected_huevos_total ?? rawDay.huevosTotal) / 12)));
    setCorrectionReason(existing?.reason ?? '');
    setCorrectionMethod(existing?.method ?? '');
    setCorrectionLoading(false);
  };

  const handleSuggestCorrection = async () => {
    setCorrectionSuggestionLoading(true);
    setCorrectionMessage(null);

    const suggestion = await loadCorrectionSuggestion(correctionDate, avesActuales, allLosses, allLots);
    setCorrectionSuggestion(suggestion);

    if (suggestion) {
      setCorrectionHuevos(String(suggestion.huevos));
      setCorrectionDocenas(String(suggestion.docenas));
      if (!correctionReason.trim()) setCorrectionReason('Dato estimado por mala anotacion');
      setCorrectionMethod(suggestion.method);
    } else {
      setCorrectionMessage({ type: 'error', text: 'No encontré días vecinos confiables para estimar.' });
    }

    setCorrectionSuggestionLoading(false);
  };

  const handleSaveCorrection = async () => {
    const correctedHuevos = Number(correctionHuevos);
    const correctedDocenas = correctionDocenas.trim() ? Number(correctionDocenas) : Math.round(correctedHuevos / 12);

    if (!Number.isFinite(correctedHuevos) || correctedHuevos < 0) {
      setCorrectionMessage({ type: 'error', text: 'El total corregido tiene que ser un número válido.' });
      return;
    }
    if (!Number.isFinite(correctedDocenas) || correctedDocenas < 0) {
      setCorrectionMessage({ type: 'error', text: 'Las docenas corregidas tienen que ser un número válido.' });
      return;
    }

    setCorrectionSaving(true);
    setCorrectionMessage(null);

    const originalHuevos = correctionOriginalHuevos ?? (await loadRawProductionTotal(correctionDate)).huevosTotal;
    const { error } = await supabase.from('analysis_day_corrections').upsert({
      date: correctionDate,
      original_huevos_total: originalHuevos,
      corrected_huevos_total: Math.round(correctedHuevos),
      corrected_docenas_total: Math.round(correctedDocenas),
      reason: correctionReason.trim() || null,
      method: correctionMethod.trim() || null,
    }, { onConflict: 'date' });

    if (error) {
      setCorrectionMessage({ type: 'error', text: error.message || 'No se pudo guardar la corrección.' });
    } else {
      setCorrectionMessage({ type: 'success', text: 'Corrección guardada.' });
      await refreshAnalysisAfterCorrection(correctionDate);
    }
    setCorrectionSaving(false);
  };

  const handleDeleteCorrection = async (date = correctionDate) => {
    setCorrectionSaving(true);
    setCorrectionMessage(null);

    const { error } = await supabase.from('analysis_day_corrections').delete().eq('date', date);
    if (error) {
      setCorrectionMessage({ type: 'error', text: error.message || 'No se pudo quitar la corrección.' });
    } else {
      if (date === correctionDate) {
        const rawDay = await loadRawProductionTotal(date);
        setCorrectionHuevos(String(rawDay.huevosTotal));
        setCorrectionDocenas(String(Math.round(rawDay.huevosTotal / 12)));
        setCorrectionReason('');
        setCorrectionMethod('');
        setCorrectionSuggestion(null);
      }
      setCorrectionMessage({ type: 'success', text: 'Corrección quitada.' });
      await refreshAnalysisAfterCorrection(date);
    }
    setCorrectionSaving(false);
  };

  // ── Búsqueda rango ──────────────────────────────────────────────────────────
  const handleSearchRange = async () => {
    setLoading(true);
    setRangeSearched(true);

    const [consumoRes, fertilesRes, feedMovRes, corrections] = await Promise.all([
      supabase.from('consumo_empaque').select('date, docenas, rotos')
        .gte('date', dateFrom).lte('date', dateTo),
      supabase.from('fertile_records').select('date, docenas_seleccionadas, descarte')
        .gte('date', dateFrom).lte('date', dateTo),
      supabase.from('stock_movements').select('date, quantity, stock_item_id')
        .eq('movement_type', 'salida').gte('date', dateFrom).lte('date', dateTo),
      loadProductionCorrections(dateFrom, dateTo),
    ]);

    const consumoMap = groupConsumo(consumoRes.data || []);
    const fertilesMap = groupFertiles(fertilesRes.data || []);
    const days = buildDaysFull(consumoMap, fertilesMap, avesActuales, allLosses, allLots, corrections);
    const feedItemIds = new Set(feedItems.filter(item => getFeedCategory(item) === 'produccion').map(item => item.id));
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
  const monthDiasCorregidos = monthDays.filter(day => day.isCorrected).length;
  const [monthYear, monthNumber] = selectedMonth.split('-').map(Number);
  const monthStart = `${selectedMonth}-01`;
  const monthLastDay = new Date(monthYear, monthNumber, 0).getDate();
  const monthEnd = selectedMonth === today.slice(0, 7)
    ? today
    : `${selectedMonth}-${String(monthLastDay).padStart(2, '0')}`;
  const monthPeriodDays = daysBetweenInclusive(monthStart, monthEnd);
  const monthFeedKgPerDay = monthFeedKg / monthPeriodDays;
  const monthFeedKgPerBirdDay = avesActuales > 0 ? monthFeedKgPerDay / avesActuales : 0;
  const monthKgPerDozen = monthTotalDocenas > 0 ? monthFeedKg / monthTotalDocenas : 0;
  const monthKgPer100Eggs = monthTotalHuevos > 0 ? (monthFeedKg / monthTotalHuevos) * 100 : 0;

  // ── Cálculos rango ──────────────────────────────────────────────────────────
  const rangeTotalHuevos = rangeDays.reduce((s, d) => s + d.huevosTotal, 0);
  const rangeTotalDocenas = rangeDays.reduce((s, d) => s + d.docenas, 0);
  const rangePromPostura = avgPct(rangeDays, 'pctPostura');
  const rangePromDocenas = rangeDays.length > 0 ? Math.round(rangeTotalDocenas / rangeDays.length) : 0;
  const rangeDiasCorregidos = rangeDays.filter(day => day.isCorrected).length;
  const rangePeriodDays = daysBetweenInclusive(dateFrom, dateTo);
  const rangeFeedKgPerDay = rangeFeedKg / rangePeriodDays;
  const rangeFeedKgPerBirdDay = avesActuales > 0 ? rangeFeedKgPerDay / avesActuales : 0;
  const rangeKgPerDozen = rangeTotalDocenas > 0 ? rangeFeedKg / rangeTotalDocenas : 0;
  const rangeKgPer100Eggs = rangeTotalHuevos > 0 ? (rangeFeedKg / rangeTotalHuevos) * 100 : 0;

  const productionFeedItems = feedItems.filter(item => getFeedCategory(item) === 'produccion');
  const bbFeedItems = feedItems.filter(item => getFeedCategory(item) === 'bb');
  const otherFeedItems = feedItems.filter(item => getFeedCategory(item) === 'otro');
  const productionFeedStockKg = productionFeedItems.reduce((s, item) => s + (item.current_quantity ?? 0), 0);
  const weekFeedKgPerDay = weekFeedKg / 7;
  const weekFeedKgPerBirdDay = avesActuales > 0 ? weekFeedKgPerDay / avesActuales : 0;
  const estimatedStockDays = weekFeedKgPerDay > 0 ? Math.floor(productionFeedStockKg / weekFeedKgPerDay) : null;
  const weekTotalHuevos = weekDays.reduce((s, d) => s + d.huevosTotal, 0);
  const weekTotalDocenas = weekDays.reduce((s, d) => s + d.docenas, 0);
  const weekPromPostura = avgPct(weekDays, 'pctPostura');
  const weekKgPerDozen = weekTotalDocenas > 0 ? weekFeedKg / weekTotalDocenas : 0;
  const weekKgPer100Eggs = weekTotalHuevos > 0 ? (weekFeedKg / weekTotalHuevos) * 100 : 0;
  const avgProductionKgPerBag = productionFeedItems.length > 0
    ? productionFeedItems.reduce((s, item) => s + (item.kg_por_bolsa ?? 0), 0) / productionFeedItems.length
    : 0;
  const weekOpenedBags = avgProductionKgPerBag > 0 ? weekFeedKg / avgProductionKgPerBag : 0;
  const weekEggsPerBag = weekOpenedBags > 0 ? weekTotalHuevos / weekOpenedBags : 0;

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

  const tabs: { id: AnalysisTab; label: string; icon: typeof BarChart2 }[] = [
    { id: 'resumen', label: 'Resumen', icon: BarChart2 },
    { id: 'produccion', label: 'Producción', icon: Egg },
    { id: 'alimento', label: 'Alimento', icon: Wheat },
    { id: 'eficiencia', label: 'Eficiencia', icon: Gauge },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Análisis</h2>
          <p className="text-sm text-gray-400 mt-1">Producción, alimento y eficiencia del criadero</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border-2 transition-all flex items-center gap-1.5
                ${activeTab === tab.id
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-yellow-300'}`}>
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'resumen' && (
          <div className="space-y-6">
            <section>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-yellow-400 rounded-2xl p-4 border border-yellow-300">
                  <p className="text-xs font-bold text-yellow-900/70 uppercase mb-1">Postura 7 días</p>
                  <p className="text-3xl font-black text-yellow-950">{weekPromPostura !== null ? `${weekPromPostura}%` : '—'}</p>
                  <p className="text-xs text-yellow-900/70 mt-1">{weekTotalHuevos} huevos</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-700 uppercase mb-1">Ponedora restante</p>
                  <p className="text-3xl font-black text-emerald-800">
                    {estimatedStockDays !== null ? estimatedStockDays : '—'}
                    <span className="text-sm ml-1">días</span>
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">{formatKg(productionFeedStockKg)} kg</p>
                </div>
                <StatCard label="Kg ponedora/ave/día" value={weekFeedKgPerBirdDay > 0 ? formatDecimal(weekFeedKgPerBirdDay) : '—'} />
                <StatCard label="Kg por 100 huevos" value={weekKgPer100Eggs > 0 ? formatDecimal(weekKgPer100Eggs) : '—'} />
                <StatCard label="Alimento 7 días" value={`${formatKg(weekFeedKg)} kg`} />
                <StatCard label="Mortalidad mes" value={monthLosses} highlight={monthLosses > 0 ? 'red' : undefined} />
              </div>
              <div className="mt-3">
                <CorrectionNotice days={weekDays} />
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Lectura rápida</h3>
              <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                <div className="p-4 flex items-start gap-3">
                  <PackageCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-gray-800 text-sm">Eficiencia basada en ponedora</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      El alimento BB, iniciador o recría queda separado y no entra en kg/docena.
                    </p>
                  </div>
                </div>
                <div className="p-4 flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-gray-800 text-sm">Últimos 7 días</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {weekKgPerDozen > 0
                        ? `${formatDecimal(weekKgPerDozen)} kg por docena · ${formatDecimal(weekEggsPerBag)} huevos por bolsa`
                        : 'Todavía falta combinar alimento ponedora y producción en la misma semana.'}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── Alimento ── */}
        {activeTab === 'alimento' && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Alimento</h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="bg-emerald-50 rounded-2xl p-4 flex items-center justify-between border border-emerald-100">
              <div>
                <p className="text-sm font-bold text-emerald-800 flex items-center gap-1">
                  <Wheat className="w-4 h-4" /> Ponedora estimada
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {formatKg(productionFeedStockKg)} kg disponibles
                </p>
              </div>
              <p className="text-4xl font-black text-emerald-800">
                {estimatedStockDays !== null ? estimatedStockDays : '—'}
                <span className="text-sm ml-1">días</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Ponedora 7 días" value={`${formatKg(weekFeedKg)} kg`} />
              <StatCard label="Promedio diario" value={`${formatKg(weekFeedKgPerDay)} kg`} />
              <StatCard label="Kg/ave/día" value={weekFeedKgPerBirdDay > 0 ? formatDecimal(weekFeedKgPerBirdDay) : '—'} />
              <StatCard label="Bolsas ponedora" value={productionFeedItems.reduce((s, item) => s + (item.bolsas_restantes ?? 0), 0)} />
            </div>

            {productionFeedItems.length > 0 && (
              <div className="pt-2 border-t border-gray-50 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Ponedora / producción</p>
                {productionFeedItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-600">{item.name}</span>
                    <span className="text-gray-400">
                      {item.bolsas_restantes ?? 0} bolsas · {formatKg(item.current_quantity)} kg
                    </span>
                  </div>
                ))}
              </div>
            )}

            {(bbFeedItems.length > 0 || otherFeedItems.length > 0) && (
              <div className="pt-2 border-t border-gray-50 space-y-3">
                {bbFeedItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">BB / recría</p>
                    {bbFeedItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-600">{item.name}</span>
                        <span className="text-gray-400">
                          {item.bolsas_restantes ?? 0} bolsas · {formatKg(item.current_quantity)} kg
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {otherFeedItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Sin clasificar</p>
                    {otherFeedItems.map(item => (
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
            )}
          </div>
        </section>
        )}

        {activeTab === 'produccion' && (
        <div className="space-y-6">
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

                  {dayData.isCorrected && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      <p className="text-xs font-bold text-amber-800">Día corregido</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Original {dayData.originalHuevosTotal} huevos; análisis usa {dayData.huevosTotal}.
                        {dayData.correctionReason ? ` ${dayData.correctionReason}` : ''}
                      </p>
                      {dayData.correctionMethod && (
                        <p className="text-[10px] text-amber-600 mt-1">{dayData.correctionMethod}</p>
                      )}
                    </div>
                  )}

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

        {/* ── Corrección manual ── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Corregir día</h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="flex gap-2">
              <input type="date" className="input-base flex-1" value={correctionDate}
                max={today} onChange={e => {
                  setCorrectionDate(e.target.value);
                  setCorrectionLoaded(false);
                  setCorrectionMessage(null);
                }} />
              <button onClick={() => handleLoadCorrectionDay()} disabled={correctionLoading || correctionSaving}
                className="btn-primary px-4 py-2">
                <Search className="w-4 h-4" />
              </button>
            </div>

            {correctionLoaded && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Original cargado" value={correctionOriginalHuevos ?? '—'} />
                  <StatCard
                    label="Postura original"
                    value={avesActuales > 0 && correctionOriginalHuevos !== null
                      ? `${Math.round((correctionOriginalHuevos / avesActuales) * 100)}%`
                      : '—'}
                  />
                </div>

                <button onClick={handleSuggestCorrection} disabled={correctionSuggestionLoading || correctionSaving}
                  className="w-full py-3 text-sm rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-800 font-bold flex items-center justify-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  {correctionSuggestionLoading ? 'Estimando...' : 'Sugerir estimado'}
                </button>

                {correctionSuggestion && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <p className="text-xs font-bold text-amber-800">Sugerencia aplicada</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {correctionSuggestion.huevos} huevos · {correctionSuggestion.docenas} docenas
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Huevos corregidos</label>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="input-base text-sm"
                      value={correctionHuevos}
                      onChange={e => {
                        setCorrectionHuevos(e.target.value);
                        const nextHuevos = Number(e.target.value);
                        if (Number.isFinite(nextHuevos)) setCorrectionDocenas(String(Math.round(nextHuevos / 12)));
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Docenas corregidas</label>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="input-base text-sm"
                      value={correctionDocenas}
                      onChange={e => setCorrectionDocenas(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Motivo</label>
                  <input
                    className="input-base text-sm"
                    value={correctionReason}
                    onChange={e => setCorrectionReason(e.target.value)}
                    placeholder="Ej: Mala anotación, dato estimado"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Método usado</label>
                  <textarea
                    className="input-base text-sm min-h-20 resize-none"
                    value={correctionMethod}
                    onChange={e => setCorrectionMethod(e.target.value)}
                    placeholder="Ej: Promedio de días vecinos confiables"
                  />
                </div>

                {correctionMessage && (
                  <p className={`text-sm ${correctionMessage.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                    {correctionMessage.text}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleSaveCorrection} disabled={correctionSaving || correctionLoading}
                    className="btn-primary py-3 text-sm flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" /> Guardar
                  </button>
                  <button onClick={() => handleDeleteCorrection()} disabled={correctionSaving || correctionLoading}
                    className="py-3 text-sm rounded-xl border-2 border-gray-200 text-gray-500 font-bold flex items-center justify-center gap-2">
                    <Trash2 className="w-4 h-4" /> Quitar
                  </button>
                </div>
              </div>
            )}

            {savedCorrections.length > 0 && (
              <div className="pt-2 border-t border-gray-50 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Correcciones guardadas</p>
                {savedCorrections.map(correction => (
                  <div key={correction.date} className="rounded-xl border border-gray-100 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{correction.date}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {correction.original_huevos_total ?? '—'} -&gt; {correction.corrected_huevos_total}
                          {correction.corrected_docenas_total !== null ? ` · ${correction.corrected_docenas_total} docenas` : ''}
                        </p>
                        {correction.reason && (
                          <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">{correction.reason}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadCorrectionDay(correction.date)}
                          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-500 flex items-center justify-center"
                          title="Editar corrección"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCorrection(correction.date)}
                          disabled={correctionSaving || correctionLoading}
                          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-500 flex items-center justify-center"
                          title="Quitar corrección"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
                  <CorrectionNotice days={rangeDays} />

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
                    <StatCard
                      label={rangeDiasCorregidos > 0 ? 'Días corregidos' : 'Días con registro'}
                      value={rangeDiasCorregidos > 0 ? rangeDiasCorregidos : rangeDays.length}
                      highlight={rangeDiasCorregidos > 0 ? 'orange' : undefined}
                    />
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
                <CorrectionNotice days={monthDays} />

                {/* Postura promedio destacada */}
                {monthPromPostura !== null && (
                  <div className="bg-yellow-400 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-yellow-900 flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" /> Postura promedio
                      </p>
                      <p className="text-xs text-yellow-800 mt-0.5">
                        Promedio de {monthDiasConReg} días registrados
                        {monthDiasCorregidos > 0 ? `; ${monthDiasCorregidos} corregidos` : ''}
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
                    <StatCard
                      label={monthDiasCorregidos > 0 ? 'Días corregidos' : 'Días con registro'}
                      value={monthDiasCorregidos > 0 ? monthDiasCorregidos : monthDiasConReg}
                      highlight={monthDiasCorregidos > 0 ? 'orange' : undefined}
                    />
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
        )}

        {activeTab === 'eficiencia' && (
          <div className="space-y-6">
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Últimos 7 días</h3>
              <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Kg ponedora" value={`${formatKg(weekFeedKg)} kg`} />
                  <StatCard label="Kg/ave/día" value={weekFeedKgPerBirdDay > 0 ? formatDecimal(weekFeedKgPerBirdDay) : '—'} />
                  <StatCard label="Kg por docena" value={weekKgPerDozen > 0 ? formatDecimal(weekKgPerDozen) : '—'} />
                  <StatCard label="Kg por 100 huevos" value={weekKgPer100Eggs > 0 ? formatDecimal(weekKgPer100Eggs) : '—'} />
                  <StatCard label="Huevos por bolsa" value={weekEggsPerBag > 0 ? Math.round(weekEggsPerBag) : '—'} />
                  <StatCard label="Postura promedio" value={weekPromPostura !== null ? `${weekPromPostura}%` : '—'} />
                </div>
                {productionFeedItems.length === 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
                    <p className="text-sm font-bold text-amber-800">Falta clasificar alimento ponedora</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Para usar eficiencia, el alimento productivo debería incluir “ponedora”, “postura”, “adulto” o “producción” en el nombre.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Intervalo consultado</h3>
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
                  <Calendar className="w-4 h-4" /> Calcular eficiencia
                </button>

                {rangeSearched && (
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Kg ponedora" value={`${formatKg(rangeFeedKg)} kg`} />
                    <StatCard label="Kg/ave/día" value={rangeFeedKgPerBirdDay > 0 ? formatDecimal(rangeFeedKgPerBirdDay) : '—'}
                      sub={`${formatKg(rangeFeedKgPerDay)} kg/día`} />
                    <StatCard label="Kg por docena" value={rangeKgPerDozen > 0 ? formatDecimal(rangeKgPerDozen) : '—'} />
                    <StatCard label="Kg por 100 huevos" value={rangeKgPer100Eggs > 0 ? formatDecimal(rangeKgPer100Eggs) : '—'} />
                  </div>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Mes seleccionado</h3>
              <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
                <select className="input-base" value={selectedMonth}
                  onChange={e => handleMonthChange(e.target.value)}>
                  {monthOptions.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Kg ponedora" value={`${formatKg(monthFeedKg)} kg`} />
                  <StatCard label="Kg/ave/día" value={monthFeedKgPerBirdDay > 0 ? formatDecimal(monthFeedKgPerBirdDay) : '—'}
                    sub={`${formatKg(monthFeedKgPerDay)} kg/día`} />
                  <StatCard label="Kg por docena" value={monthKgPerDozen > 0 ? formatDecimal(monthKgPerDozen) : '—'} />
                  <StatCard label="Kg por 100 huevos" value={monthKgPer100Eggs > 0 ? formatDecimal(monthKgPer100Eggs) : '—'} />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Search, Calendar, TrendingUp, Skull } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  bandejas_procesadas: number;
  docenas_seleccionadas: number;
  descarte: number;
};

// Registro agrupado por fecha (suma de múltiples cargas del mismo día)
type DayAgg = {
  date: string;
  docenas: number;
  rotos: number;
  total: number; // docenas*12 + rotos
};

type MonthFertileAgg = {
  docenas: number;
  descarte: number;
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

// Agrupa registros por fecha sumando valores
function aggregateByDate(records: { date: string; docenas_armadas: number; huevos_rotos: number }[]): DayAgg[] {
  const map = new Map<string, DayAgg>();
  for (const r of records) {
    const existing = map.get(r.date);
    if (existing) {
      existing.docenas += r.docenas_armadas;
      existing.rotos += r.huevos_rotos;
      existing.total += (r.docenas_armadas * 12) + r.huevos_rotos;
    } else {
      map.set(r.date, {
        date: r.date,
        docenas: r.docenas_armadas,
        rotos: r.huevos_rotos,
        total: (r.docenas_armadas * 12) + r.huevos_rotos,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function BarChart({ records, today }: { records: DayAgg[]; today: string }) {
  const max = Math.max(...records.map(r => r.total), 1);
  return (
    <div className="flex items-end gap-1 h-32 overflow-x-auto pb-1">
      {records.map((r, i) => {
        const h = Math.max(Math.round((r.total / max) * 100), 4);
        const isToday = r.date === today;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ minWidth: '28px' }}>
            <span className="text-[9px] text-gray-400 leading-none">{r.total > 0 ? r.total : ''}</span>
            <div
              className={`w-full rounded-t-lg transition-all ${isToday ? 'bg-yellow-400' : 'bg-yellow-200'}`}
              style={{ height: `${h}px` }}
            />
            <span className="text-[9px] text-gray-400">{dayLabel(r.date)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Analisis() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const today = getToday();

  // ── Búsqueda por día ────────────────────────────────────────────────────────
  const [searchDate, setSearchDate] = useState(today);
  const [dayRecords, setDayRecords] = useState<DailyRecord[]>([]);
  const [dayFertile, setDayFertile] = useState<FertileRecord | null>(null);
  const [daySearched, setDaySearched] = useState(false);

  // ── Rango ───────────────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [dateTo, setDateTo] = useState(today);
  const [rangeAgg, setRangeAgg] = useState<DayAgg[]>([]);
  const [rangeSearched, setRangeSearched] = useState(false);

  // ── Mes ─────────────────────────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthAgg, setMonthAgg] = useState<DayAgg[]>([]);
  const [monthFertile, setMonthFertile] = useState<MonthFertileAgg>({ docenas: 0, descarte: 0 });
  const [monthLosses, setMonthLosses] = useState(0);
  const [totalAves, setTotalAves] = useState(0);

  const [loading, setLoading] = useState(false);

  // ── Cargar mes ──────────────────────────────────────────────────────────────
  const loadMonth = useCallback(async (month: string) => {
    const [year, mon] = month.split('-');
    const from = `${year}-${mon}-01`;
    const lastDay = new Date(Number(year), Number(mon), 0).getDate();
    const to = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`;

    const [consumoRes, fertilesRes, lossesRes] = await Promise.all([
      supabase.from('daily_records')
        .select('date, docenas_armadas, huevos_rotos')
        .gte('date', from).lte('date', to).order('date'),
      supabase.from('fertile_records')
        .select('docenas_seleccionadas, descarte')
        .gte('date', from).lte('date', to),
      supabase.from('lot_losses')
        .select('quantity')
        .gte('date', from).lte('date', to)
        .eq('loss_type', 'muerte'),
    ]);

    if (consumoRes.data) setMonthAgg(aggregateByDate(consumoRes.data));

    if (fertilesRes.data) {
      setMonthFertile({
        docenas: fertilesRes.data.reduce((s, r) => s + r.docenas_seleccionadas, 0),
        descarte: fertilesRes.data.reduce((s, r) => s + r.descarte, 0),
      });
    }

    if (lossesRes.data) {
      setMonthLosses(lossesRes.data.reduce((s, r) => s + r.quantity, 0));
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }

    const init = async () => {
      const { data: slotsData } = await supabase.from('cage_slots').select('quantity');
      if (slotsData) setTotalAves(slotsData.reduce((s, sl) => s + sl.quantity, 0));
      await loadMonth(selectedMonth);
    };
    init();
  }, [authLoading, user, profile]);

  // ── Búsqueda por día ────────────────────────────────────────────────────────
  const handleSearchDay = async () => {
    setLoading(true);
    setDaySearched(true);
    const [recRes, fertRes] = await Promise.all([
      supabase.from('daily_records').select('*').eq('date', searchDate).order('created_at', { ascending: false }),
      supabase.from('fertile_records').select('*').eq('date', searchDate).order('created_at', { ascending: false }).limit(1),
    ]);
    setDayRecords(recRes.data || []);
    setDayFertile(fertRes.data?.[0] ?? null);
    setLoading(false);
  };

  // ── Búsqueda por rango ──────────────────────────────────────────────────────
  const handleSearchRange = async () => {
    setLoading(true);
    setRangeSearched(true);
    const { data } = await supabase.from('daily_records')
      .select('date, docenas_armadas, huevos_rotos')
      .gte('date', dateFrom).lte('date', dateTo).order('date');
    if (data) setRangeAgg(aggregateByDate(data));
    setLoading(false);
  };

  // ── Cambio de mes ───────────────────────────────────────────────────────────
  const handleMonthChange = async (month: string) => {
    setSelectedMonth(month);
    await loadMonth(month);
  };

  // ── Cálculos día ────────────────────────────────────────────────────────────
  const dayTotalDocenas = dayRecords.reduce((s, r) => s + r.docenas_armadas, 0);
  const dayTotalRotos = dayRecords.reduce((s, r) => s + r.huevos_rotos, 0);
  const dayTotalHuevos = (dayTotalDocenas * 12) + dayTotalRotos;
  const dayPctPostura = totalAves > 0 && dayTotalHuevos > 0 ? Math.round((dayTotalHuevos / totalAves) * 100) : null;
  const dayPctRotos = dayTotalHuevos > 0 ? Math.round((dayTotalRotos / dayTotalHuevos) * 100) : null;
  const dayPctEmpletado = dayTotalHuevos > 0 ? Math.round(((dayTotalDocenas * 12) / dayTotalHuevos) * 100) : null;

  // ── Cálculos rango ──────────────────────────────────────────────────────────
  const rangeTotalDocenas = rangeAgg.reduce((s, r) => s + r.docenas, 0);
  const rangeTotalHuevos = rangeAgg.reduce((s, r) => s + r.total, 0);
  const rangeTotalRotos = rangeAgg.reduce((s, r) => s + r.rotos, 0);
  const rangePctRotos = rangeTotalHuevos > 0 ? Math.round((rangeTotalRotos / rangeTotalHuevos) * 100) : null;
  const rangePromDocenas = rangeAgg.length > 0 ? Math.round(rangeTotalDocenas / rangeAgg.length) : 0;

  // ── Cálculos mes ────────────────────────────────────────────────────────────
  const monthTotalDocenas = monthAgg.reduce((s, r) => s + r.docenas, 0);
  const monthTotalHuevos = monthAgg.reduce((s, r) => s + r.total, 0);
  const monthTotalRotos = monthAgg.reduce((s, r) => s + r.rotos, 0);
  const monthDias = monthAgg.length;
  const monthPromDocenas = monthDias > 0 ? Math.round(monthTotalDocenas / monthDias) : 0;
  const monthPctRotos = monthTotalHuevos > 0 ? Math.round((monthTotalRotos / monthTotalHuevos) * 100) : null;
  const monthPctPostura = totalAves > 0 && monthDias > 0
    ? Math.round((monthTotalHuevos / (totalAves * monthDias)) * 100) : null;

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

        {/* ── Búsqueda por día ── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Buscar día</h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="flex gap-2">
              <input type="date" className="input-base flex-1" value={searchDate}
                max={today} onChange={e => setSearchDate(e.target.value)} />
              <button onClick={handleSearchDay} disabled={loading}
                className="btn-primary px-4 py-2">
                <Search className="w-4 h-4" />
              </button>
            </div>

            {daySearched && (
              dayRecords.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-600">
                    {new Date(searchDate + 'T12:00:00').toLocaleDateString('es-AR', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    })}
                    {dayRecords.length > 1 && (
                      <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full ml-2">
                        {dayRecords.length} cargas sumadas
                      </span>
                    )}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Docenas armadas" value={dayTotalDocenas} />
                    <StatCard label="Huevos rotos" value={dayTotalRotos} />
                    <StatCard label="Bandejas consumo" value={dayRecords.reduce((s, r) => s + r.bandejas_consumo, 0)} />
                    <StatCard label="Bandejas fértiles" value={dayRecords.reduce((s, r) => s + r.bandejas_fertiles, 0)} />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="% postura" value={dayPctPostura !== null ? `${dayPctPostura}%` : '—'} />
                    <StatCard label="% empletado" value={dayPctEmpletado !== null ? `${dayPctEmpletado}%` : '—'} />
                    <StatCard label="% rotos" value={dayPctRotos !== null ? `${dayPctRotos}%` : '—'} />
                  </div>

                  {dayRecords.some(r => r.notas) && (
                    <div className="bg-yellow-50 rounded-xl px-3 py-2">
                      <p className="text-xs text-yellow-600 font-medium mb-1">Notas</p>
                      {dayRecords.filter(r => r.notas).map((r, i) => (
                        <p key={i} className="text-sm text-yellow-800">{r.notas}</p>
                      ))}
                    </div>
                  )}

                  {dayFertile && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Fértiles</p>
                      <div className="grid grid-cols-3 gap-3">
                        <StatCard label="Bandejas" value={dayFertile.bandejas_procesadas} />
                        <StatCard label="Docenas" value={dayFertile.docenas_seleccionadas} />
                        <StatCard label="Descarte" value={dayFertile.descarte} />
                      </div>
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
              rangeAgg.length > 0 ? (
                <div className="space-y-4">
                  <BarChart records={rangeAgg} today={today} />
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
                    <StatCard label="Total docenas" value={rangeTotalDocenas} />
                    <StatCard label="Total huevos" value={rangeTotalHuevos} />
                    <StatCard label="Promedio docenas/día" value={rangePromDocenas} />
                    <StatCard label="% rotos" value={rangePctRotos !== null ? `${rangePctRotos}%` : '—'} />
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    {rangeAgg.length} días con registro en el período
                  </p>
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

            {monthAgg.length > 0 ? (
              <div className="space-y-4">
                <BarChart records={monthAgg} today={today} />

                {/* Postura promedio destacada */}
                {monthPctPostura !== null && (
                  <div className="bg-yellow-400 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-yellow-900 flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" /> Postura promedio
                      </p>
                      <p className="text-xs text-yellow-800 mt-0.5">{totalAves} aves · {monthDias} días registrados</p>
                    </div>
                    <p className="text-4xl font-black text-yellow-900">{monthPctPostura}%</p>
                  </div>
                )}

                {/* Consumo */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Consumo</p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Total docenas" value={monthTotalDocenas} />
                    <StatCard label="Total huevos" value={monthTotalHuevos} />
                    <StatCard label="Promedio docenas/día" value={monthPromDocenas} />
                    <StatCard label="Días con registro" value={monthDias} />
                  </div>
                </div>

                {/* Fértiles */}
                {(monthFertile.docenas > 0 || monthFertile.descarte > 0) && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Fértiles</p>
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Docenas seleccionadas" value={monthFertile.docenas} />
                      <StatCard label="Descarte fértiles" value={monthFertile.descarte}
                        sub={monthFertile.docenas > 0
                          ? `${Math.round(monthFertile.descarte / ((monthFertile.docenas * 12) + monthFertile.descarte) * 100)}% del total`
                          : undefined} />
                    </div>
                  </div>
                )}

                {/* Calidad y mortalidad */}
                <div className="grid grid-cols-2 gap-2">
                  {monthPctRotos !== null && (
                    <div className={`rounded-2xl p-3 ${monthPctRotos > 5 ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400">% rotos</p>
                      <p className={`text-xl font-bold ${monthPctRotos > 5 ? 'text-red-600' : 'text-gray-900'}`}>
                        {monthPctRotos}%
                      </p>
                      <p className="text-[10px] text-gray-400">{monthTotalRotos} huevos</p>
                    </div>
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
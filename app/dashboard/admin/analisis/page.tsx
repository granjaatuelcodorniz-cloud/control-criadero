'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Search, Calendar } from 'lucide-react';

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

type RangeRecord = {
  date: string;
  docenas_armadas: number;
  huevos_rotos: number;
};

export default function Analisis() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  // Búsqueda por día
  const [searchDate, setSearchDate] = useState(new Date().toISOString().split('T')[0]);
  const [dayRecord, setDayRecord] = useState<DailyRecord | null>(null);
  const [dayFertile, setDayFertile] = useState<FertileRecord | null>(null);
  const [daySearched, setDaySearched] = useState(false);
  const [totalAves, setTotalAves] = useState(0);

  // Rango
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [rangeRecords, setRangeRecords] = useState<RangeRecord[]>([]);
  const [rangeSearched, setRangeSearched] = useState(false);

  // Resumen mensual
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthRecords, setMonthRecords] = useState<RangeRecord[]>([]);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }

    // Cargar total aves y resumen mensual inicial
    loadInitial();
  }, [authLoading, user, profile]);

  const loadInitial = async () => {
    const { data: lotsData } = await supabase
      .from('lots').select('current_quantity');
    if (lotsData) setTotalAves(lotsData.reduce((s, l) => s + l.current_quantity, 0));

    await loadMonth(selectedMonth);
  };

  const loadMonth = async (month: string) => {
    const [year, mon] = month.split('-');
    const from = `${year}-${mon}-01`;
    const lastDay = new Date(Number(year), Number(mon), 0).getDate();
    const to = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`;

    const { data } = await supabase
      .from('daily_records')
      .select('date, docenas_armadas, huevos_rotos')
      .gte('date', from)
      .lte('date', to)
      .order('date');
    if (data) setMonthRecords(data);
  };

  const handleSearchDay = async () => {
    setLoading(true);
    setDaySearched(true);

    const { data: rec } = await supabase
      .from('daily_records').select('*')
      .eq('date', searchDate)
      .order('created_at', { ascending: false })
      .limit(1);
    setDayRecord(rec && rec.length > 0 ? rec[0] : null);

    const { data: fert } = await supabase
      .from('fertile_records').select('*')
      .eq('date', searchDate)
      .order('created_at', { ascending: false })
      .limit(1);
    setDayFertile(fert && fert.length > 0 ? fert[0] : null);

    setLoading(false);
  };

  const handleSearchRange = async () => {
    setLoading(true);
    setRangeSearched(true);

    const { data } = await supabase
      .from('daily_records')
      .select('date, docenas_armadas, huevos_rotos')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date');
    if (data) setRangeRecords(data);

    setLoading(false);
  };

  const handleMonthChange = async (month: string) => {
    setSelectedMonth(month);
    await loadMonth(month);
  };

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );
  if (!profile) return null;

  // Cálculos día buscado
  const totalConsumo = dayRecord
    ? (dayRecord.docenas_armadas * 12) + dayRecord.huevos_rotos : 0;
  const pctPostura = totalAves > 0 && totalConsumo > 0
    ? Math.round((totalConsumo / totalAves) * 100) : null;
  const pctRotos = totalConsumo > 0 && dayRecord
    ? Math.round((dayRecord.huevos_rotos / totalConsumo) * 100) : null;
  const pctEmpletado = totalConsumo > 0 && dayRecord
    ? Math.round(((dayRecord.docenas_armadas * 12) / totalConsumo) * 100) : null;

  // Cálculos rango
  const totalDocenasRango = rangeRecords.reduce((s, r) => s + r.docenas_armadas, 0);
  const totalHuevosRango = rangeRecords.reduce((s, r) => s + (r.docenas_armadas * 12) + r.huevos_rotos, 0);
  const totalRotosRango = rangeRecords.reduce((s, r) => s + r.huevos_rotos, 0);
  const pctRotosRango = totalHuevosRango > 0
    ? Math.round((totalRotosRango / totalHuevosRango) * 100) : null;
  const maxRango = rangeRecords.length > 0
    ? Math.max(...rangeRecords.map(r => (r.docenas_armadas * 12) + r.huevos_rotos), 1) : 1;

  // Cálculos mes
  const totalDocenasMes = monthRecords.reduce((s, r) => s + r.docenas_armadas, 0);
  const totalHuevosMes = monthRecords.reduce((s, r) => s + (r.docenas_armadas * 12) + r.huevos_rotos, 0);
  const totalRotosMes = monthRecords.reduce((s, r) => s + r.huevos_rotos, 0);
  const diasConRegistro = monthRecords.length;
  const promedioDocenasDia = diasConRegistro > 0
    ? Math.round(totalDocenasMes / diasConRegistro) : 0;
  const maxMes = monthRecords.length > 0
    ? Math.max(...monthRecords.map(r => (r.docenas_armadas * 12) + r.huevos_rotos), 1) : 1;

  const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  const BarChart = ({ records, max }: { records: RangeRecord[]; max: number }) => (
    <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1">
      {records.map((r, i) => {
        const total = (r.docenas_armadas * 12) + r.huevos_rotos;
        const h = Math.round((total / max) * 80);
        const dayIdx = new Date(r.date + 'T12:00:00').getDay();
        const dayLabel = dias[dayIdx === 0 ? 6 : dayIdx - 1];
        const isToday = r.date === new Date().toISOString().split('T')[0];
        return (
          <div key={i} className="flex flex-col items-center gap-0.5 flex-shrink-0" style={{ minWidth: '24px' }}>
            <div
              className={`w-5 rounded-t transition-all ${isToday ? 'bg-yellow-400' : 'bg-yellow-200'}`}
              style={{ height: `${Math.max(h, 3)}px` }}
            />
            <span className="text-xs text-gray-300">{dayLabel}</span>
          </div>
        );
      })}
    </div>
  );

  // Generar opciones de meses (últimos 12)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return { val, label };
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role}
        backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <h2 className="text-2xl font-bold text-gray-900">Análisis</h2>

        {/* BÚSQUEDA POR DÍA */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Buscar día
          </h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="flex gap-2">
              <input
                type="date"
                className="input-base flex-1"
                value={searchDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setSearchDate(e.target.value)}
              />
              <button
                onClick={handleSearchDay}
                disabled={loading}
                className="btn-primary px-4 py-2"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>

            {daySearched && (
              <div>
                {dayRecord ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-gray-600">
                      {new Date(searchDate + 'T12:00:00').toLocaleDateString('es-AR', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                      })}
                      {dayRecord.registered_at && (
                        <span className="text-gray-400 ml-2 text-xs">
                          · Registrado {dayRecord.registered_at.slice(0, 5)}
                        </span>
                      )}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Docenas armadas', value: dayRecord.docenas_armadas },
                        { label: 'Huevos rotos', value: dayRecord.huevos_rotos },
                        { label: 'Bandejas consumo', value: dayRecord.bandejas_consumo },
                        { label: 'Bandejas fértiles', value: dayRecord.bandejas_fertiles },
                      ].map((m, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">{m.label}</p>
                          <p className="text-xl font-bold text-gray-900">{m.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '% postura', value: pctPostura },
                        { label: '% empletado', value: pctEmpletado },
                        { label: '% rotos', value: pctRotos },
                      ].map((m, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-lg font-bold text-gray-900">
                            {m.value !== null ? `${m.value}%` : '—'}
                          </p>
                          <p className="text-xs text-gray-400">{m.label}</p>
                        </div>
                      ))}
                    </div>

                    {dayRecord.notas && (
                      <div className="bg-yellow-50 rounded-xl px-3 py-2">
                        <p className="text-xs text-yellow-600 font-medium mb-1">Nota</p>
                        <p className="text-sm text-yellow-800">{dayRecord.notas}</p>
                      </div>
                    )}

                    {dayFertile && (
                      <div className="border-t border-gray-50 pt-3">
                        <p className="text-xs text-gray-400 mb-2 font-medium">Fértiles</p>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Bandejas', value: dayFertile.bandejas_procesadas },
                            { label: 'Docenas', value: dayFertile.docenas_seleccionadas },
                            { label: 'Descarte', value: dayFertile.descarte },
                          ].map((m, i) => (
                            <div key={i} className="bg-gray-50 rounded-xl p-3 text-center">
                              <p className="text-lg font-bold text-gray-900">{m.value}</p>
                              <p className="text-xs text-gray-400">{m.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-400 text-sm">
                    Sin registro para ese día
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* GRÁFICO POR INTERVALO */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Producción por intervalo
          </h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Desde</label>
                <input type="date" className="input-base text-sm"
                  value={dateFrom}
                  max={dateTo}
                  onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Hasta</label>
                <input type="date" className="input-base text-sm"
                  value={dateTo}
                  min={dateFrom}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
            <button onClick={handleSearchRange} disabled={loading}
              className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4" />
              Ver producción
            </button>

            {rangeSearched && rangeRecords.length > 0 && (
              <div className="space-y-4">
                <BarChart records={rangeRecords} max={maxRango} />

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
                  {[
                    { label: 'Total docenas', value: totalDocenasRango },
                    { label: 'Total huevos', value: totalHuevosRango },
                    { label: 'Total rotos', value: totalRotosRango },
                    { label: '% rotos', value: pctRotosRango !== null ? `${pctRotosRango}%` : '—' },
                  ].map((m, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400">{m.label}</p>
                      <p className="text-xl font-bold text-gray-900">{m.value}</p>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-400 text-center">
                  {rangeRecords.length} días con registro en el período
                </p>
              </div>
            )}

            {rangeSearched && rangeRecords.length === 0 && (
              <p className="text-center text-gray-400 text-sm">Sin registros en ese período</p>
            )}
          </div>
        </div>

        {/* RESUMEN MENSUAL */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Resumen mensual
          </h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <select
              className="input-base"
              value={selectedMonth}
              onChange={e => handleMonthChange(e.target.value)}
            >
              {monthOptions.map(m => (
                <option key={m.val} value={m.val}>{m.label}</option>
              ))}
            </select>

            {monthRecords.length > 0 ? (
              <div className="space-y-4">
                <BarChart records={monthRecords} max={maxMes} />

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
                  {[
                    { label: 'Total docenas', value: totalDocenasMes },
                    { label: 'Total huevos', value: totalHuevosMes },
                    { label: 'Promedio docenas/día', value: promedioDocenasDia },
                    { label: 'Días con registro', value: diasConRegistro },
                  ].map((m, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400">{m.label}</p>
                      <p className="text-xl font-bold text-gray-900">{m.value}</p>
                    </div>
                  ))}
                </div>

                {totalRotosMes > 0 && (
                  <div className="bg-red-50 rounded-xl px-3 py-2 flex justify-between items-center">
                    <span className="text-sm text-red-600">Rotos en el mes</span>
                    <span className="font-bold text-red-700">{totalRotosMes} huevos</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-gray-400 text-sm py-4">
                Sin registros este mes
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
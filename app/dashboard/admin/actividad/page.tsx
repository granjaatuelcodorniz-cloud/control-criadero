'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import {
  CheckCircle2, FlaskConical, Skull, Package,
  ChevronLeft, ChevronRight, Clock, Inbox,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'tarea' | 'tratamiento' | 'baja' | 'insumo';

type ActivityEvent = {
  id: string;
  type: EventType;
  time: string | null;      // HH:MM string para ordenar y mostrar
  description: string;
  detail: string | null;
  user_name: string;
};

type Profile = { id: string; full_name: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTime(ts: string | null): string | null {
  if (!ts) return null;
  // ts puede ser timestamptz o time string HH:MM:SS
  if (ts.includes('T')) {
    // timestamptz → convertir a hora local Argentina
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return ts.slice(0, 5); // HH:MM
}

function eventColor(type: EventType) {
  switch (type) {
    case 'tarea': return { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'text-yellow-500', dot: 'bg-yellow-400' };
    case 'tratamiento': return { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-500', dot: 'bg-blue-400' };
    case 'baja': return { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-500', dot: 'bg-red-400' };
    case 'insumo': return { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-600', dot: 'bg-green-400' };
  }
}

function EventIcon({ type, className }: { type: EventType; className?: string }) {
  switch (type) {
    case 'tarea': return <CheckCircle2 className={className} />;
    case 'tratamiento': return <FlaskConical className={className} />;
    case 'baja': return <Skull className={className} />;
    case 'insumo': return <Package className={className} />;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Actividad() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(getToday());
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filterType, setFilterType] = useState<EventType | 'all'>('all');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const today = getToday();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Cargar perfiles para mostrar nombres
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name');
      if (profilesData) setProfiles(profilesData);

      const profileMap = new Map((profilesData || []).map(p => [p.id, p.full_name]));
      const allEvents: ActivityEvent[] = [];

      // ── 1. Tareas completadas ─────────────────────────────────────────────
      const { data: taskCompletions } = await supabase
        .from('task_completions')
        .select('task_id, user_id, confirmed_at')
        .eq('date', selectedDate);

      if (taskCompletions && taskCompletions.length > 0) {
        const taskIds = taskCompletions.map(tc => tc.task_id);
        const { data: tasksData } = await supabase
          .from('tasks')
          .select('id, description, type')
          .in('id', taskIds);

        const taskMap = new Map((tasksData || []).map(t => [t.id, t]));

        taskCompletions.forEach(tc => {
          const task = taskMap.get(tc.task_id);
          if (!task) return;
          const typeLabel = task.type === 'daily' ? 'Diaria' : task.type === 'periodic' ? 'Periódica' : 'Asignada';
          allEvents.push({
            id: `tarea-${tc.task_id}-${tc.user_id}`,
            type: 'tarea',
            time: extractTime(tc.confirmed_at),
            description: task.description,
            detail: typeLabel,
            user_name: profileMap.get(tc.user_id) || 'Usuario',
          });
        });
      }

      // ── 2. Tratamientos confirmados ───────────────────────────────────────
      const { data: confirmations } = await supabase
        .from('treatment_confirmations')
        .select('record_id, user_id, confirmed_at')
        .eq('date', selectedDate);

      if (confirmations && confirmations.length > 0) {
        const recordIds = confirmations.map(c => c.record_id);
        const { data: records } = await supabase
          .from('health_records')
          .select('id, type, health_product_id, dose_applied, water_liters, lot_id')
          .in('id', recordIds);

        const productIds = (records || []).map(r => r.health_product_id).filter(Boolean);
        const { data: productsData } = productIds.length > 0
          ? await supabase.from('health_products').select('id, name, unit').in('id', productIds)
          : { data: [] };

        const lotIds = (records || []).map(r => r.lot_id).filter(Boolean);
        const { data: lotsData } = lotIds.length > 0
          ? await supabase.from('lots').select('id, code').in('id', lotIds)
          : { data: [] };

        const recordMap = new Map((records || []).map(r => [r.id, r]));
        const productMap = new Map((productsData || []).map(p => [p.id, p]));
        const lotMap = new Map((lotsData || []).map(l => [l.id, l]));

        confirmations.forEach(c => {
          const record = recordMap.get(c.record_id);
          if (!record) return;
          const product = record.health_product_id ? productMap.get(record.health_product_id) : null;
          const lot = record.lot_id ? lotMap.get(record.lot_id) : null;

          let detail = lot ? lot.code : 'Todo el plantel';
          if (product && record.dose_applied) {
            detail += ` · ${record.dose_applied} ${product.unit}`;
            if (record.water_liters) detail += ` (${(record.dose_applied / record.water_liters).toFixed(2)} ${product.unit}/litro)`;
          }

          allEvents.push({
            id: `tratamiento-${c.record_id}-${c.user_id}`,
            type: 'tratamiento',
            time: extractTime(c.confirmed_at),
            description: `${record.type}${product ? ` — ${product.name}` : ''}`,
            detail,
            user_name: profileMap.get(c.user_id) || 'Usuario',
          });
        });
      }

      // ── 3. Bajas de aves ──────────────────────────────────────────────────
      const { data: losses } = await supabase
        .from('lot_losses')
        .select('id, lot_id, quantity, reason, loss_type, slot_code, user_id, created_at')
        .eq('date', selectedDate);

      if (losses && losses.length > 0) {
        const lotIds2 = losses.map(l => l.lot_id).filter(Boolean);
        const { data: lotsData2 } = lotIds2.length > 0
          ? await supabase.from('lots').select('id, code').in('id', lotIds2)
          : { data: [] };
        const lotMap2 = new Map((lotsData2 || []).map(l => [l.id, l]));

        const lossTypeLabel: Record<string, string> = { muerte: 'Muerte', descarte: 'Descarte', venta: 'Venta' };

        losses.forEach(l => {
          const lot = l.lot_id ? lotMap2.get(l.lot_id) : null;
          const typeLabel = lossTypeLabel[l.loss_type] || l.loss_type;
          let description = `${typeLabel} — ${l.quantity} ave${l.quantity > 1 ? 's' : ''}`;
          let detail = lot ? lot.code : 'Sin lote';
          if (l.slot_code) detail += ` · Boca ${l.slot_code}`;
          if (l.reason) detail += ` · ${l.reason}`;

          allEvents.push({
            id: `baja-${l.id}`,
            type: 'baja',
            time: extractTime(l.created_at),
            description,
            detail,
            user_name: profileMap.get(l.user_id) || 'Usuario',
          });
        });
      }

      // ── 4. Movimientos de insumos ─────────────────────────────────────────
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('id, stock_item_id, quantity, movement_type, notes, user_id, date')
        .eq('date', selectedDate);

      if (movements && movements.length > 0) {
        const itemIds = movements.map(m => m.stock_item_id).filter(Boolean);
        const { data: itemsData } = itemIds.length > 0
          ? await supabase.from('stock_items').select('id, name, unit').in('id', itemIds)
          : { data: [] };
        const itemMap = new Map((itemsData || []).map(i => [i.id, i]));

        movements.forEach(m => {
          const item = itemMap.get(m.stock_item_id);
          const typeLabel = m.movement_type === 'entrada' ? 'Ingreso' : 'Uso';
          const sign = m.movement_type === 'entrada' ? '+' : '−';

          allEvents.push({
            id: `insumo-${m.id}`,
            type: 'insumo',
            time: null, // stock_movements no tiene timestamptz de creación, solo date
            description: `${typeLabel} — ${item?.name || 'Insumo'}`,
            detail: `${sign}${m.quantity} ${item?.unit || ''}${m.notes ? ` · ${m.notes}` : ''}`,
            user_name: profileMap.get(m.user_id) || 'Usuario',
          });
        });
      }

      // Ordenar por hora — sin hora van al fondo
      allEvents.sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
      });

      setEvents(allEvents);
    } catch (error) {
      console.error('Error cargando actividad:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) { router.push('/'); return; }
    if (profile.role !== 'owner') { router.push('/dashboard'); return; }
    loadData();
  }, [authLoading, user, profile, selectedDate]);

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile) return null;

  const filtered = filterType === 'all' ? events : events.filter(e => e.type === filterType);

  // Resumen del día
  const summary = {
    tareas: events.filter(e => e.type === 'tarea').length,
    tratamientos: events.filter(e => e.type === 'tratamiento').length,
    bajas: events.filter(e => e.type === 'baja').reduce((s, e) => {
      const match = e.description.match(/(\d+) ave/);
      return s + (match ? Number(match[1]) : 0);
    }, 0),
    insumos: events.filter(e => e.type === 'insumo').length,
  };

  const filterOptions: { value: EventType | 'all'; label: string }[] = [
    { value: 'all', label: 'Todo' },
    { value: 'tarea', label: 'Tareas' },
    { value: 'tratamiento', label: 'Tratamientos' },
    { value: 'baja', label: 'Bajas' },
    { value: 'insumo', label: 'Insumos' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile.full_name} role={profile.role} backHref="/dashboard/admin" backLabel="Dashboard" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <h2 className="text-2xl font-bold text-gray-900">Actividad</h2>

        {/* Navegación de fecha */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm">
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="text-center">
            <p className="font-bold text-gray-800 capitalize">{formatDate(selectedDate)}</p>
            {selectedDate === today && (
              <span className="text-[10px] font-black text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full uppercase">Hoy</span>
            )}
          </div>
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            disabled={selectedDate >= today}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Resumen del día */}
        {events.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Tareas', value: summary.tareas, cls: 'bg-yellow-50 border-yellow-100 text-yellow-700' },
              { label: 'Tratam.', value: summary.tratamientos, cls: 'bg-blue-50 border-blue-100 text-blue-700' },
              { label: 'Bajas', value: summary.bajas, cls: 'bg-red-50 border-red-100 text-red-600' },
              { label: 'Insumos', value: summary.insumos, cls: 'bg-green-50 border-green-100 text-green-700' },
            ].map(chip => (
              <div key={chip.label} className={`rounded-2xl border px-3 py-2 text-center ${chip.cls}`}>
                <p className="text-xl font-black leading-tight">{chip.value}</p>
                <p className="text-[9px] font-bold uppercase opacity-70">{chip.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border-2 transition-all
                ${filterType === opt.value
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-gray-200 py-16 text-center">
            <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium text-sm">Sin actividad registrada</p>
            {filterType !== 'all' && (
              <button onClick={() => setFilterType('all')} className="text-xs text-yellow-600 mt-2 underline">
                Ver todos los eventos
              </button>
            )}
          </div>
        ) : (
          <div className="relative">
            {/* Línea vertical del timeline */}
            <div className="absolute left-[22px] top-0 bottom-0 w-0.5 bg-gray-100" />

            <div className="space-y-3">
              {filtered.map(event => {
                const colors = eventColor(event.type);
                return (
                  <div key={event.id} className="flex gap-4">
                    {/* Dot */}
                    <div className="relative flex-shrink-0 w-11 flex items-start justify-center pt-3.5">
                      <div className={`w-4 h-4 rounded-full border-2 border-white shadow-sm ${colors.dot}`} />
                    </div>

                    {/* Card */}
                    <div className={`flex-1 rounded-2xl border p-4 mb-1 ${colors.bg} ${colors.border}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <EventIcon type={event.type} className={`w-4 h-4 shrink-0 ${colors.icon}`} />
                          <p className="font-bold text-gray-800 text-sm leading-tight">{event.description}</p>
                        </div>
                        {event.time && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span className="text-[10px] font-bold text-gray-400">{event.time}</span>
                          </div>
                        )}
                      </div>
                      {event.detail && (
                        <p className="text-xs text-gray-500 ml-6">{event.detail}</p>
                      )}
                      <p className="text-[10px] font-bold text-gray-400 ml-6 mt-1.5 uppercase tracking-wide">
                        {event.user_name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Egg,
  CheckSquare,
  AlertTriangle,
  ClipboardList,
  Plus,
  X
} from 'lucide-react';

type Task = {
  id: number;
  description: string;
  type: 'daily' | 'periodic' | 'custom';
  frequency_days?: number;
  is_urgent?: boolean;
};

type Lot = {
  id: number;
  code: string;
  current_quantity: number;
};

type StockItem = {
  id: number;
  name: string;
  unit: string;
  current_quantity: number;
  is_feed?: boolean;
  bolsas_restantes?: number | null;
  kg_por_bolsa?: number | null;
};

export default function Dashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [periodicTasks, setPeriodicTasks] = useState<Task[]>([]);
  const [customTasks, setCustomTasks] = useState<Task[]>([]);
  const [completedIds, setCompletedIds] = useState<number[]>([]);

  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState('');

  const [showExtraTask, setShowExtraTask] = useState(false);
  const [extraTaskDesc, setExtraTaskDesc] = useState('');

  const [loading, setLoading] = useState(true);

  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [savingStock, setSavingStock] = useState(false);
  const [stockSaved, setStockSaved] = useState(false);
  const [confirmStock, setConfirmStock] = useState<number | null>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (authLoading) return;

    if (!user || !profile) {
      router.push('/');
      return;
    }

    if (profile.role === 'owner') {
      router.push('/dashboard/admin');
      return;
    }

    loadData();
  }, [authLoading, user, profile]);

  const loadData = async () => {
    if (!user) return;

    const { data: tasksData } = await supabase
      .from('tasks')
      .select('id, description, type, frequency_days, is_urgent')
      .eq('is_active', true)
      .order('type');

    if (tasksData) {
      setDailyTasks(tasksData.filter(t => t.type === 'daily'));
      setPeriodicTasks(tasksData.filter(t => t.type === 'periodic'));
      setCustomTasks(tasksData.filter(t => t.type === 'custom'));
    }

    const { data: completions } = await supabase
      .from('task_completions')
      .select('task_id')
      .eq('user_id', user.id)
      .eq('date', today);

    if (completions) {
      setCompletedIds(completions.map(c => c.task_id));
    }

    const { data: lotsData } = await supabase
      .from('lots')
      .select('*');

    if (lotsData) setLots(lotsData);

    const { data: stockData } = await supabase
      .from('stock_items')
      .select('*');

    if (stockData) setStockItems(stockData);

    setLoading(false);
  };

  const toggleTask = async (taskId: number) => {
    if (!user) return;

    const isDone = completedIds.includes(taskId);

    if (isDone) {
      await supabase
        .from('task_completions')
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', user.id)
        .eq('date', today);

      setCompletedIds(prev => prev.filter(id => id !== taskId));
    } else {
      await supabase.from('task_completions').insert({
        task_id: taskId,
        user_id: user.id,
        date: today
      });

      setCompletedIds(prev => [...prev, taskId]);
    }
  };

  const handleUseItem = async (item: StockItem) => {
    if (!user) return;

    setSavingStock(true);
    setConfirmStock(null);

    await supabase.from('stock_movements').insert({
      stock_item_id: item.id,
      quantity: 1,
      movement_type: 'salida',
      user_id: user.id,
      date: today
    });

    await supabase
      .from('stock_items')
      .update({
        current_quantity: Math.max(0, item.current_quantity - 1)
      })
      .eq('id', item.id);

    setSavingStock(false);
    setStockSaved(true);
    setTimeout(() => setStockSaved(false), 3000);

    await loadData();
  };

  if (authLoading || loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  const totalTasks =
    dailyTasks.length + periodicTasks.length + customTasks.length;

  const doneTasks = completedIds.length;

  const progress =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const TaskItem = ({ task }: { task: Task }) => {
    const isDone = completedIds.includes(task.id);

    return (
      <div
        onClick={() => toggleTask(task.id)}
        className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition ${
          isDone
            ? 'bg-gray-50 border-gray-100'
            : 'bg-white border-gray-200'
        }`}
      >
        <div
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            isDone ? 'bg-yellow-400 border-yellow-400' : 'border-gray-300'
          }`}
        >
          {isDone && <span className="text-white text-xs">✓</span>}
        </div>

        <span
          className={`${
            isDone ? 'line-through text-gray-400' : 'text-gray-800'
          }`}
        >
          {task.description}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        userName={profile.full_name}
        role={profile.role}
      />

      <div className="max-w-xl mx-auto p-4 space-y-6">

        <h2 className="text-xl font-bold">
          Hola, {profile.full_name} 👋
        </h2>

        <div className="bg-white p-4 rounded-xl">
          <p className="text-sm mb-2">
            Progreso: {doneTasks}/{totalTasks}
          </p>

          <div className="w-full bg-gray-200 h-2 rounded">
            <div
              className="bg-yellow-400 h-2 rounded"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <Link
          href="/dashboard/huevos"
          className="bg-yellow-400 p-4 rounded-xl flex justify-center"
        >
          <Egg className="mr-2" />
          Registrar huevos
        </Link>

        {dailyTasks.map(t => (
          <TaskItem key={t.id} task={t} />
        ))}

        <div>
          {stockItems.map(item => (
            <div
              key={item.id}
              className="bg-white p-3 rounded mb-2 flex justify-between"
            >
              <span>{item.name}</span>

              <button
                onClick={() => handleUseItem(item)}
                className="text-sm text-yellow-600"
              >
                Usar
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
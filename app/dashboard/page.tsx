'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Link from 'next/link';
import { Egg, ClipboardList, ArrowRight, Loader2, CheckSquare } from 'lucide-react';

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Si terminó de cargar y sos el dueño, al admin de una
    if (!loading && profile?.role === 'owner') {
      router.replace('/dashboard/admin');
    }
  }, [profile, loading, router]);

  // Si está cargando o es el dueño (mientras redirecciona), mostramos carga
  if (loading || profile?.role === 'owner') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-yellow-500 animate-spin mb-2" />
        <p className="text-gray-500 font-medium italic">Granja Atuel — Verificando acceso...</p>
      </div>
    );
  }

  // VISTA PARA COLABORADORA (Antonella)
  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={profile?.full_name ?? 'Colaborador'} role="collaborator" backHref="/" backLabel="Salir" />

      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Botón Principal: Registrar Huevos */}
        <Link href="/dashboard/huevos" 
          className="flex items-center justify-between bg-yellow-400 p-6 rounded-3xl shadow-lg shadow-yellow-100 active:scale-95 transition-all">
          <div className="flex items-center gap-4">
            <div className="bg-white/30 p-3 rounded-2xl">
              <Egg className="w-8 h-8 text-yellow-900" />
            </div>
            <div>
              <h3 className="text-xl font-black text-yellow-900">REGISTRAR HUEVOS</h3>
              <p className="text-yellow-800 text-sm font-medium">Carga la producción de hoy</p>
            </div>
          </div>
          <ArrowRight className="w-6 h-6 text-yellow-900" />
        </Link>

        {/* Tareas del día */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-gray-400 ml-1">
            <ClipboardList className="w-4 h-4" />
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Tareas del día</h3>
          </div>
          
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm text-center">
            <div className="bg-gray-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckSquare className="w-6 h-6 text-gray-200" />
            </div>
            <p className="text-gray-400 text-sm font-medium italic">No hay tareas pendientes asignadas.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
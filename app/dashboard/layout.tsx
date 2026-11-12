'use client';

import { usePathname } from 'next/navigation';
import AppLink from '@/components/AppLink';
import Header from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlineStatus } from '@/lib/connection';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, error, retry } = useAuth();
  const pathname = usePathname();
  const online = useOnlineStatus();
  const collaboratorWork = profile?.role === 'collaborator' && (pathname === '/dashboard' || pathname === '/dashboard/lotes');
  const offline = !online && !!profile && pathname !== '/dashboard/huevos' && !collaboratorWork;

  if (error) return (
    <main className="max-w-xl mx-auto p-6" role="alert">
      <div className="card space-y-4">
        <p>{error}</p>
        <button className="btn-primary" onClick={retry}>Reintentar</button>
      </div>
    </main>
  );

  return (
    <>
      {offline && profile && (
        <>
          <Header userName={profile.full_name} role={profile.role} />
          <main className="max-w-xl mx-auto px-4 py-6">
            <div className="card space-y-3">
              <h1 className="text-xl font-bold">Sin conexión</h1>
              <p className="text-sm text-gray-600">Los datos de esta sección se actualizan al volver la señal. Podés seguir cargando la recolección de huevos.</p>
              <AppLink href="/dashboard/huevos" className="btn-primary">Registrar recolección</AppLink>
            </div>
          </main>
        </>
      )}
      <div key={user?.id} hidden={offline}>{children}</div>
    </>
  );
}

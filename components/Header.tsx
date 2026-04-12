'use client';

import Image from 'next/image';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
// 1. Importamos el hook del contexto
import { useAuth } from '@/contexts/AuthContext';

type Props = {
  userName: string;
  role: 'owner' | 'collaborator';
  backHref?: string;
  backLabel?: string;
};

export default function Header({ userName, role, backHref, backLabel }: Props) {
  // 2. Extraemos signOut del contexto
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {backHref ? (
            <Link href={backHref} className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm">
              ← {backLabel || 'Volver'}
            </Link>
          ) : (
            <Image
              src="/logo.webp"
              alt="Granja Atuel"
              width={120}
              height={40}
              className="h-9 w-auto"
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 hidden sm:block">{userName}</span>
          <span className={role === 'owner' ? 'badge-owner' : 'badge-collaborator'}>
            {role === 'owner' ? 'Admin' : 'Colaboradora'}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home, TrendingUp, Package, Heart, MoreHorizontal,
  ClipboardList, BarChart2, Activity, Egg, Bird, X,
  type LucideIcon,
} from 'lucide-react';

type NavItem = { href: string; icon: LucideIcon; label: string };

// Tabs por rol. El admin tiene 5 fijas + un botón "Más" con el resto.
const ADMIN_TABS: NavItem[] = [
  { href: '/dashboard/admin', icon: Home, label: 'Inicio' },
  { href: '/dashboard/admin/lotes', icon: TrendingUp, label: 'Lotes' },
  { href: '/dashboard/admin/stock', icon: Package, label: 'Stock' },
  { href: '/dashboard/admin/sanidad', icon: Heart, label: 'Sanidad' },
];

const ADMIN_MORE: NavItem[] = [
  { href: '/dashboard/admin/tareas', icon: ClipboardList, label: 'Tareas' },
  { href: '/dashboard/admin/analisis', icon: BarChart2, label: 'Análisis' },
  { href: '/dashboard/admin/actividad', icon: Activity, label: 'Actividad' },
  { href: '/dashboard/huevos', icon: Egg, label: 'Huevos' },
];

const COLLAB_TABS: NavItem[] = [
  { href: '/dashboard', icon: Home, label: 'Inicio' },
  { href: '/dashboard/huevos', icon: Egg, label: 'Huevos' },
  { href: '/dashboard/lotes', icon: Bird, label: 'Aves' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard' || href === '/dashboard/admin') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export default function BottomNav() {
  const { profile } = useAuth();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Sólo se muestra dentro del área logueada.
  if (!profile || !pathname?.startsWith('/dashboard')) return null;

  const isOwner = profile.role === 'owner';
  const tabs = isOwner ? ADMIN_TABS : COLLAB_TABS;
  // El admin marca "Más" como activo si la ruta está dentro de ese grupo.
  const moreActive = isOwner && ADMIN_MORE.some(i => isActive(pathname, i.href));

  const tabClass = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
      active ? 'text-yellow-600' : 'text-gray-400 hover:text-gray-600'
    }`;

  return (
    <>
      {/* Espaciador en el flujo: evita que el contenido quede tapado por la barra fija. */}
      <div aria-hidden className="h-16 pb-[env(safe-area-inset-bottom)]" />

      {/* Hoja "Más" (sólo admin) */}
      {moreOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl border-t border-gray-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-sm font-bold text-gray-700">Más opciones</span>
              <button onClick={() => setMoreOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {ADMIN_MORE.map(item => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-colors ${
                      active
                        ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                        : 'border-gray-100 text-gray-500 hover:border-yellow-200 hover:bg-yellow-50/40'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Barra inferior fija */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto flex items-stretch px-1">
          {tabs.map(item => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={tabClass(active)}>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          {isOwner && (
            <button onClick={() => setMoreOpen(true)} className={tabClass(moreActive)}>
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">Más</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

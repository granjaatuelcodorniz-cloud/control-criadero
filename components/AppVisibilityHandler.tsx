'use client';

import { useEffect } from 'react';

export default function AppVisibilityHandler() {
  useEffect(() => {
    // Un listener de 'unload' vacío le indica al navegador que no puede
    // guardar esta página en el bfcache. Es la forma más confiable de
    // deshabilitar el bfcache en todos los navegadores.
    const noop = () => {};
    window.addEventListener('unload', noop);

    // pageshow como respaldo: si por alguna razón la página llega al
    // bfcache igual, forzamos recarga completa
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        window.location.replace(window.location.href);
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('unload', noop);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  return null;
}
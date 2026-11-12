'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export function isConnectionError(error: unknown) {
  const err = error as { message?: string; code?: string; name?: string } | null;
  if (err?.name === 'AuthRetryableFetchError' || err?.name === 'AbortError') return true;
  if (err?.code) return false;
  return /failed to fetch|networkerror|network request failed|fetch failed|load failed|abort|timeout|sin conexión/i
    .test(err?.message ?? '');
}

// Cache local del perfil (rol + nombre) para que la app funcione offline:
// sin esto, al abrir sin señal no se puede leer el perfil y la app patea al login.

export type CachedProfile = { full_name: string; role: 'owner' | 'collaborator' };

const key = (userId: string) => `atuel-profile-${userId}`;

export function saveProfile(userId: string, p: CachedProfile) {
  try { localStorage.setItem(key(userId), JSON.stringify(p)); } catch { /* storage lleno o bloqueado */ }
}

export function loadProfile(userId: string): CachedProfile | null {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as CachedProfile) : null;
  } catch {
    return null;
  }
}

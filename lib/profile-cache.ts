// Cache local del perfil (rol + nombre) para que la app funcione offline:
// sin esto, al abrir sin señal no se puede leer el perfil y la app patea al login.

export type CachedProfile = { full_name: string; role: 'owner' | 'collaborator' };

const key = (userId: string) => `atuel-profile-${userId}`;
const activeKey = 'atuel-active-profile';

export function saveProfile(userId: string, p: CachedProfile) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(p));
    localStorage.setItem(activeKey, userId);
  } catch { /* storage lleno o bloqueado */ }
}

export function loadProfile(userId: string): CachedProfile | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const profile = JSON.parse(raw) as CachedProfile;
    return typeof profile.full_name === 'string' && (profile.role === 'owner' || profile.role === 'collaborator')
      ? profile : null;
  } catch {
    return null;
  }
}

export function loadActiveProfile() {
  try {
    const userId = localStorage.getItem(activeKey);
    const profile = userId ? loadProfile(userId) : null;
    return userId && profile ? { userId, profile } : null;
  } catch {
    return null;
  }
}

export function clearActiveProfile() {
  try {
    const userId = localStorage.getItem(activeKey);
    localStorage.removeItem(activeKey);
    if (userId) localStorage.removeItem(key(userId));
  } catch { /* storage bloqueado */ }
}

// Tipos y constantes del dominio compartidos entre páginas.

export type LossType = 'muerte' | 'descarte' | 'venta';

export const LOSS_TYPE_LABELS: Record<LossType, string> = {
  muerte: 'Muerte',
  descarte: 'Descarte',
  venta: 'Venta',
};

export const LOSS_TYPE_COLORS: Record<LossType, string> = {
  muerte: 'text-red-500',
  descarte: 'text-orange-500',
  venta: 'text-blue-500',
};

// Filas de las baterías de jaulas (A–F).
export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

// Tipos mínimos usados por la baja rápida. Las páginas pueden tener
// variantes con más columnas; estas son las que la baja rápida necesita.
export type QuickLot = { id: number; code: string; current_quantity: number };
export type QuickSlot = { id: number; lot_id: number; slot_code: string; quantity: number };

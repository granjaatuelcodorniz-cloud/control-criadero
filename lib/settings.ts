import { supabase } from '@/lib/supabase';

// Flags de configuración de la app (tabla app_settings, key/value booleano).
export const FLAG_COLAB_LOTES = 'colaboradora_gestiona_lotes';

/** Lee un flag. Si la tabla no existe o hay error, devuelve false (apagado). */
export async function getFlag(key: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) return false;
  return !!data?.value;
}

/** Cambia un flag (solo el owner puede, por RLS). */
export async function setFlag(key: string, value: boolean, userId?: string) {
  return supabase.from('app_settings').upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  });
}

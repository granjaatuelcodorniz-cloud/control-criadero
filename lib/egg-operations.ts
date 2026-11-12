import { supabase } from '@/lib/supabase';
import { getToday } from '@/lib/date';
import { assertSupabaseOk } from '@/lib/supabase-ops';

export async function procesarBandejaFertil(batchId: number, userId: string, docenas: number, descarte: number) {
  assertSupabaseOk(await supabase.rpc('procesar_bandeja_fertil', {
    p_batch_id: batchId,
    p_user_id: userId,
    p_docenas: docenas,
    p_descarte: descarte,
    p_processed_at: getToday(),
    p_registered_at: new Date().toTimeString().split(' ')[0],
  }));
}

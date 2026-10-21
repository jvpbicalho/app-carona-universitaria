import type { MatchingSettings } from '@/admin/matchingValidation';
import { supabase } from '@/lib/supabase';

/**
 * Se o usuário é administrador. A RLS de app_admins só deixa cada um ler a
 * própria linha, então "achou" = é admin. Não há como se promover pelo app.
 */
export async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

type SettingsRow = { radius_km: number | string; time_window_minutes: number };

function toSettings(row: SettingsRow): MatchingSettings {
  // numeric chega como string pelo PostgREST.
  return { radiusKm: Number(row.radius_km), timeWindowMinutes: row.time_window_minutes };
}

/** Valores atuais (linha única de matching_settings). */
export async function fetchMatchingSettings(): Promise<MatchingSettings> {
  const { data, error } = await supabase
    .from('matching_settings')
    .select('radius_km, time_window_minutes')
    .single();
  if (error) throw error;
  return toSettings(data as SettingsRow);
}

/**
 * Salva pela RPC, não por UPDATE direto: para quem não é admin, o UPDATE
 * passaria pela RLS sem erro e sem efeito; a RPC recusa com erro explícito.
 */
export async function saveMatchingSettings(settings: MatchingSettings): Promise<MatchingSettings> {
  const { data, error } = await supabase.rpc('update_matching_settings', {
    p_radius_km: settings.radiusKm,
    p_time_window_minutes: settings.timeWindowMinutes,
  });
  if (error) throw error;
  return toSettings(data as SettingsRow);
}

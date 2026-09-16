import { supabase } from '@/lib/supabase';

/**
 * Listas de referência dos selects de perfil (curso e campus).
 *
 * Cacheadas em memória pelo tempo de vida do processo: mudam por decisão da
 * universidade, não durante o uso do app, e são lidas em duas telas.
 */

export type Campus = {
  id: string;
  name: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

export type Course = {
  id: string;
  name: string;
};

let campusCache: Campus[] | null = null;
let courseCache: Course[] | null = null;

export async function fetchCampuses(): Promise<Campus[]> {
  if (campusCache) return campusCache;

  const { data, error } = await supabase
    .from('campuses')
    .select('id, name, city, latitude, longitude')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;

  campusCache = data ?? [];
  return campusCache;
}

export async function fetchCourses(): Promise<Course[]> {
  if (courseCache) return courseCache;

  const { data, error } = await supabase
    .from('courses')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  courseCache = data ?? [];
  return courseCache;
}

/** Usado ao sair da conta: o próximo login pode ser de outra instituição. */
export function clearReferenceCache(): void {
  campusCache = null;
  courseCache = null;
}

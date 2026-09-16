import { supabase } from '@/lib/supabase';
import { normalizePhone, type ProfileDraft } from '@/profile/profileValidation';

export type Profile = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  courseId: string | null;
  campusId: string | null;
  bio: string | null;
  activeRole: 'passageiro' | 'motorista';
  isComplete: boolean;
};

const AVATAR_BUCKET = 'avatars';

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  course_id: string | null;
  campus_id: string | null;
  bio: string | null;
  active_role: string;
  is_complete: boolean;
};

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    courseId: row.course_id,
    campusId: row.campus_id,
    bio: row.bio,
    activeRole: row.active_role === 'motorista' ? 'motorista' : 'passageiro',
    isComplete: row.is_complete,
  };
}

const SELECT =
  'id, email, full_name, avatar_url, phone, course_id, campus_id, bio, active_role, is_complete';

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? toProfile(data as ProfileRow) : null;
}

export async function updateProfile(userId: string, draft: ProfileDraft): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: draft.fullName?.trim() || null,
      avatar_url: draft.avatarUrl || null,
      // Guardado só com dígitos; a formatação é da camada de exibição.
      phone: draft.phone ? normalizePhone(draft.phone) : null,
      course_id: draft.courseId || null,
      campus_id: draft.campusId || null,
      bio: draft.bio?.trim() || null,
    })
    .eq('id', userId)
    .select(SELECT)
    .single();

  if (error) throw error;
  return toProfile(data as ProfileRow);
}

export async function updateActiveRole(
  userId: string,
  role: 'passageiro' | 'motorista',
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ active_role: role })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Envia a foto para o bucket `avatars` e devolve o caminho do objeto.
 *
 * O caminho começa com o uid porque é o que as policies do Storage usam para
 * autorizar (`(storage.foldername(name))[1] = auth.uid()`).
 *
 * O nome tem timestamp para furar cache de CDN: sem isso, trocar a foto
 * mantendo o mesmo caminho continuaria exibindo a antiga.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });

  if (error) throw error;
  return path;
}

/** URL pública da foto. O bucket é público, então não precisa assinar. */
export function avatarPublicUrl(path: string | null): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

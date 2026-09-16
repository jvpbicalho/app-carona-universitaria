import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { fetchProfile, updateActiveRole, type Profile } from '@/profile/profileApi';
import { profileIncompleteWarning } from '@/profile/profileValidation';
import { fetchVehicle, type Vehicle } from '@/vehicle/vehicleApi';

export type ActiveRole = 'passageiro' | 'motorista';

type ProfileContextValue = {
  profile: Profile | null;
  vehicle: Vehicle | null;
  loading: boolean;
  /** Falha ao carregar. Padrão P.3 do wireframe: mensagem + ação de repetir. */
  error: string | null;
  reload: () => Promise<void>;

  /** Aviso de perfil incompleto, ou null. Critério de aceite da História 1. */
  incompleteWarning: string | null;
  isComplete: boolean;

  /**
   * Pode dirigir = tem veículo cadastrado. Derivado, nunca um campo marcável —
   * decisão do wireframe 2.3: "sem veículo salvo, o modo motorista fica
   * indisponível".
   */
  canDrive: boolean;
  activeRole: ActiveRole;
  setActiveRole: (role: ActiveRole) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setVehicle(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Em paralelo: uma não depende da outra.
      const [nextProfile, nextVehicle] = await Promise.all([
        fetchProfile(userId),
        fetchVehicle(userId),
      ]);
      setProfile(nextProfile);
      setVehicle(nextVehicle);
    } catch {
      setError('Não foi possível carregar seu perfil.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canDrive = vehicle !== null;

  // Sem veículo, o modo motorista não existe — mesmo que o banco tenha
  // 'motorista' salvo de quando havia um veículo que foi removido depois.
  const activeRole: ActiveRole =
    canDrive && profile?.activeRole === 'motorista' ? 'motorista' : 'passageiro';

  const setActiveRole = useCallback(
    async (role: ActiveRole) => {
      if (!userId || !profile) return;
      if (role === 'motorista' && !canDrive) return;

      // Otimista: a alternância precisa ser instantânea. Se a escrita falhar, o
      // pior caso é o modo não sobreviver ao próximo login.
      setProfile({ ...profile, activeRole: role });
      try {
        await updateActiveRole(userId, role);
      } catch {
        setProfile({ ...profile, activeRole: profile.activeRole });
      }
    },
    [userId, profile, canDrive],
  );

  const incompleteWarning = useMemo(() => {
    if (!profile) return null;
    return profileIncompleteWarning({
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      courseId: profile.courseId,
      campusId: profile.campusId,
    });
  }, [profile]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      vehicle,
      loading,
      error,
      reload: load,
      incompleteWarning,
      isComplete: profile?.isComplete ?? false,
      canDrive,
      activeRole,
      setActiveRole,
    }),
    [profile, vehicle, loading, error, load, incompleteWarning, canDrive, activeRole, setActiveRole],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile precisa estar dentro de <ProfileProvider>.');
  return context;
}

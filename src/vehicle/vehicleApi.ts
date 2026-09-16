import { supabase } from '@/lib/supabase';
import { normalizePlate, type VehicleDraft } from '@/vehicle/vehicleValidation';

export type Vehicle = {
  id: string;
  ownerId: string;
  makeModel: string;
  color: string;
  plate: string;
  seats: number;
  cnhDocumentPath: string | null;
};

type VehicleRow = {
  id: string;
  owner_id: string;
  make_model: string;
  color: string;
  plate: string;
  seats: number;
  cnh_document_path: string | null;
};

function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    ownerId: row.owner_id,
    makeModel: row.make_model,
    color: row.color,
    plate: row.plate,
    seats: row.seats,
    cnhDocumentPath: row.cnh_document_path,
  };
}

const SELECT = 'id, owner_id, make_model, color, plate, seats, cnh_document_path';

/** Null quando o usuário ainda não cadastrou veículo — modo motorista indisponível. */
export async function fetchVehicle(userId: string): Promise<Vehicle | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(SELECT)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? toVehicle(data as VehicleRow) : null;
}

/**
 * Cria ou atualiza o veículo do usuário. Upsert por `owner_id`, que tem
 * constraint de unicidade: um veículo por motorista.
 */
export async function saveVehicle(userId: string, draft: VehicleDraft): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .upsert(
      {
        owner_id: userId,
        make_model: (draft.makeModel ?? '').trim(),
        color: draft.color ?? '',
        // O trigger do banco normaliza de novo; normalizar aqui mantém o que
        // a tela mostra igual ao que foi gravado, sem precisar reler.
        plate: normalizePlate(draft.plate ?? ''),
        seats: draft.seats ?? 1,
      },
      { onConflict: 'owner_id' },
    )
    .select(SELECT)
    .single();

  if (error) throw error;
  return toVehicle(data as VehicleRow);
}

export async function deleteVehicle(userId: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('owner_id', userId);
  if (error) throw error;
}

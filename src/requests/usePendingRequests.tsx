import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useNotifications } from '@/notifications/NotificationsContext';
import { fetchPendingSummary } from '@/requests/requestApi';
import { EMPTY_SUMMARY, type PendingSummary } from '@/requests/pendingBadge';

/**
 * Pendências do motorista para o badge da Home, em tempo real.
 *
 * Recontagem (sempre no banco, nunca somando no app):
 *  - ao abrir e ao voltar para a tela (foco) — cobre o que DESCE: aceitar,
 *    recusar e o encerramento por vagas esgotadas acontecem nas telas do
 *    próprio motorista, e ele volta à Home depois;
 *  - quando chega ao vivo um aviso `solicitacao_recebida` — cobre o que SOBE.
 *    Reaproveita a inscrição Realtime dos avisos: uma conexão só, já filtrada
 *    pelo usuário e protegida pela RLS.
 */
export function usePendingRequests(): { summary: PendingSummary; refresh: () => Promise<void> } {
  const [summary, setSummary] = useState<PendingSummary>(EMPTY_SUMMARY);
  const { onLive } = useNotifications();

  const refresh = useCallback(async () => {
    try {
      setSummary(await fetchPendingSummary());
    } catch {
      // Sem rede: mantém o último número; a próxima recontagem corrige.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(
    () =>
      onLive((notification) => {
        if (notification.kind === 'solicitacao_recebida') void refresh();
      }),
    [onLive, refresh],
  );

  return { summary, refresh };
}

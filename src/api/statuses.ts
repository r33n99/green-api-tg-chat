import type { Chat, ChatApi, NotificationBody } from '../types';
import { ApiError } from './greenApi';
import { delay } from './poll';

export async function pollDeliveryStatuses(
  api: ChatApi,
  signal: AbortSignal,
  getChats: () => Chat[],
  onStatus: (body: NotificationBody) => void,
  onError: (error: string | null) => void,
) {
  if (!api.deliveryStatuses) return;
  let failures = 0;
  while (!signal.aborted) {
    let wait = 30_000;
    try {
      const now = Date.now();
      const pending = getChats()
        .flatMap((c) => c.messages)
        .filter(
          (m) =>
            m.direction === 'out' &&
            ['queued', 'sent', 'delivered'].includes(m.status ?? '') &&
            now - m.timestamp < 86_400_000,
        );
      if (pending.length) {
        const minutes =
          Math.ceil((now - Math.min(...pending.map((m) => m.timestamp))) / 60_000) + 1;
        const statuses = await api.deliveryStatuses(minutes, signal);
        if (signal.aborted) return;
        for (const status of statuses) {
          if (pending.some((m) => m.id === status.idMessage && m.chatId === status.chatId))
            onStatus(status);
        }
      }
      failures = 0;
      onError(null);
    } catch (error) {
      if (signal.aborted) return;
      onError(
        `Не удалось обновить статусы: ${error instanceof Error ? error.message : 'Ошибка журнала отправки.'}`,
      );
      if (error instanceof ApiError && [401, 403].includes(error.status)) return;
      wait = Math.min(30_000 * 2 ** failures++, 120_000);
    }
    try {
      await delay(wait, signal);
    } catch {
      return;
    }
  }
}

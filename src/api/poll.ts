import { ApiError } from './greenApi';
import type { ChatApi, NotificationBody } from '../types';

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function pollNotifications(
  api: ChatApi,
  signal: AbortSignal,
  onEvent: (body: NotificationBody) => void,
  onStatus: (error: string | null) => void,
) {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const notification = await api.receive(signal);
      if (signal.aborted) return;
      if (notification) {
        onEvent(notification.body);
        // Commit to session state before acknowledging. Duplicate IDs are ignored by the reducer.
        await api.acknowledge(notification.receiptId, signal);
      } else await delay(250, signal);
      failures = 0;
      onStatus(null);
    } catch (error) {
      if (signal.aborted) return;
      const terminal = error instanceof ApiError && [401, 403].includes(error.status);
      onStatus(
        `${error instanceof Error ? error.message : 'Ошибка получения сообщений.'}${terminal ? ' Выйдите и подключитесь заново.' : ' Переподключаемся…'}`,
      );
      if (terminal) return;
      try {
        await delay(Math.min(1000 * 2 ** failures++, 30_000), signal);
      } catch {
        return;
      }
    }
  }
}

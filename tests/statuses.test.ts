import { afterEach, expect, it, vi } from 'vitest';
import { pollDeliveryStatuses } from '../src/api/statuses';
import type { Chat, ChatApi } from '../src/types';
afterEach(() => vi.useRealTimers());
const chats = (): Chat[] => [
  {
    id: '100',
    title: 'Test',
    unread: 0,
    messages: [
      {
        id: 'm1',
        chatId: '100',
        text: 'Hello',
        timestamp: Date.now(),
        direction: 'out',
        status: 'queued',
      },
    ],
  },
];
it('reconciles a queued message without resending it or consuming notifications', async () => {
  const controller = new AbortController();
  const api = {
    deliveryStatuses: vi.fn().mockResolvedValue([
      { typeWebhook: 'outgoingMessageStatus', idMessage: 'm1', chatId: '100', status: 'delivered' },
      { typeWebhook: 'outgoingMessageStatus', idMessage: 'm1', chatId: 'other', status: 'read' },
    ]),
    send: vi.fn(),
    receive: vi.fn(),
  } as unknown as ChatApi;
  const apply = vi.fn(() => controller.abort());
  await pollDeliveryStatuses(api, controller.signal, chats, apply, vi.fn());
  expect(apply).toHaveBeenCalledOnce();
  expect(apply.mock.calls[0]).toEqual([
    { typeWebhook: 'outgoingMessageStatus', idMessage: 'm1', chatId: '100', status: 'delivered' },
  ]);
  expect(api.send).not.toHaveBeenCalled();
  expect(api.receive).not.toHaveBeenCalled();
});
it('does not query the journal when there are no unsettled recent messages', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const api = { deliveryStatuses: vi.fn() } as unknown as ChatApi;
  const work = pollDeliveryStatuses(api, controller.signal, () => [], vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(31_000);
  controller.abort();
  await work;
  expect(api.deliveryStatuses).not.toHaveBeenCalled();
});

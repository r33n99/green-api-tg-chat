import { describe, expect, it, vi } from 'vitest';
import {
  GreenApi,
  normalizePhone,
  normalizeRecipient,
  validateCredentials,
} from '../src/api/greenApi';
import { pollNotifications } from '../src/api/poll';
const credentials = {
  idInstance: '4100000001',
  apiTokenInstance: 'test-token-12345678',
  apiUrl: 'https://4100.api.green-api.com',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe('Telegram API contract', () => {
  it('calls fetch without binding it to the API instance, as required by browsers', async () => {
    const transport = vi.fn(function (this: unknown) {
      if (this !== undefined) throw new TypeError('Illegal invocation');
      return Promise.resolve(response({ stateInstance: 'authorized' }));
    });
    const api = new GreenApi(credentials, transport);
    await expect(api.request('getStateInstance')).resolves.toEqual({
      stateInstance: 'authorized',
    });
    expect(transport).toHaveBeenCalledOnce();
  });
  it('normalizes supported numbers without treating a phone as chatId', () => {
    expect(normalizePhone('+7 (999) 123-45-67')).toBe('79991234567');
    expect(normalizePhone('+375 29 123-45-67')).toBe('375291234567');
    expect(normalizePhone('+996 700 123 456')).toBe('996700123456');
    expect(normalizePhone('+1 415 555 2671')).toBe('14155552671');
    for (const bad of ['0123456789', '+12', '79991234567oops', '7+9991234567', '1'.repeat(16)])
      expect(() => normalizePhone(bad)).toThrow();
  });
  it('keeps the token restricted to GREEN-API HTTPS origins', () => {
    for (const apiUrl of [
      'http://4100.api.green-api.com',
      'https://green-api.com.evil.example',
      'https://evil.example',
      'https://green-api.com/path',
      'https://user:pass@green-api.com',
    ])
      expect(() => validateCredentials({ ...credentials, apiUrl })).toThrow();
  });
  it('resolves phone, sends to the returned Telegram chat ID, polls, then acknowledges', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(response({ stateInstance: 'authorized' }))
      .mockResolvedValueOnce(
        response({ typeInstance: 'telegram', incomingWebhook: 'yes', webhookUrl: '' }),
      )
      .mockResolvedValueOnce(response({ exist: true, chatId: '10000000' }))
      .mockResolvedValueOnce(response({ idMessage: 'message-id' }))
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response({ result: true }));
    const api = new GreenApi(credentials, transport);
    expect(await api.connect()).toEqual([]);
    const chatId = await api.resolveRecipient('+79991234567');
    expect(chatId).toBe('10000000');
    expect(await api.send(chatId, 'Привет 👋')).toBe('message-id');
    expect(JSON.parse(transport.mock.calls[2][1].body)).toEqual({ phoneNumber: 79991234567 });
    expect(JSON.parse(transport.mock.calls[3][1].body)).toEqual({
      chatId: '10000000',
      message: 'Привет 👋',
    });
    const signal = new AbortController().signal;
    await api.receive(signal);
    await api.acknowledge(123, signal);
    expect(transport.mock.calls[4][0]).toContain(
      '/receiveNotification/test-token-12345678?receiveTimeout=30',
    );
    expect(transport.mock.calls[5][0]).toContain('/deleteNotification/test-token-12345678/123');
    expect(transport.mock.calls[5][1].method).toBe('DELETE');
  });
  it('does not connect an unauthorized instance', async () => {
    const api = new GreenApi(
      credentials,
      vi.fn().mockResolvedValue(response({ stateInstance: 'notAuthorized' })),
    );
    await expect(api.connect()).rejects.toThrow('не авторизован');
  });
  it('rejects instances for another messenger', async () => {
    const api = new GreenApi(
      credentials,
      vi
        .fn()
        .mockResolvedValueOnce(response({ stateInstance: 'authorized' }))
        .mockResolvedValueOnce(response({ typeInstance: 'whatsapp' })),
    );
    await expect(api.connect()).rejects.toThrow('не относится к Telegram');
  });
  it('reports disabled incoming notifications and webhook conflicts without changing settings', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ stateInstance: 'authorized' }))
      .mockResolvedValueOnce(
        response({
          typeInstance: 'telegram',
          incomingWebhook: 'no',
          webhookUrl: 'https://example.com/webhook',
        }),
      );
    expect(await new GreenApi(credentials, fetcher).connect()).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects absent Telegram accounts and blank messages', async () => {
    const api = new GreenApi(
      credentials,
      vi.fn().mockResolvedValue(response({ exist: false, chatId: '' })),
    );
    await expect(api.resolveRecipient('79991234567')).rejects.toThrow('не найден');
    await expect(api.send('100', '  ')).rejects.toThrow('4096');
    await expect(api.send('100', 'a'.repeat(4097))).rejects.toThrow('4096');
  });
  it('normalizes a username and sends only username to checkAccount', async () => {
    expect(normalizeRecipient(' @Some_User ')).toBe('@some_user');
    expect(() => normalizeRecipient('@invalid-name')).toThrow();
    const transport = vi.fn().mockResolvedValue(response({ exist: true, chatId: '223344' }));
    expect(await new GreenApi(credentials, transport).resolveRecipient('@Some_User')).toBe(
      '223344',
    );
    expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ username: '@some_user' });
  });
  it('accepts the Telegram boundary of 4096 characters', async () => {
    const transport = vi.fn().mockResolvedValue(response({ idMessage: 'limit-message' }));
    await expect(new GreenApi(credentials, transport).send('100', 'a'.repeat(4096))).resolves.toBe(
      'limit-message',
    );
    expect(JSON.parse(transport.mock.calls[0][1].body).message).toHaveLength(4096);
  });
  it('rejects MAX and missing messenger types', async () => {
    for (const typeInstance of ['v3', 'max', undefined]) {
      const transport = vi
        .fn()
        .mockResolvedValueOnce(response({ stateInstance: 'authorized' }))
        .mockResolvedValueOnce(response({ typeInstance }));
      await expect(new GreenApi(credentials, transport).connect()).rejects.toThrow(
        'не относится к Telegram',
      );
    }
  });
  it('never echoes an error body containing secrets', async () => {
    const api = new GreenApi(
      credentials,
      vi.fn().mockResolvedValue(response({ error: credentials.apiTokenInstance }, 401)),
    );
    await expect(api.connect()).rejects.toThrow('Неверный idInstance');
    try {
      await api.connect();
    } catch (err) {
      expect(String(err)).not.toContain(credentials.apiTokenInstance);
    }
  });
  it('commits a notification before acknowledgement and stops on abort', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const api = {
      connect: vi.fn(),
      resolveRecipient: vi.fn(),
      send: vi.fn(),
      receive: vi
        .fn()
        .mockResolvedValue({ receiptId: 42, body: { typeWebhook: 'incomingMessageReceived' } }),
      acknowledge: vi.fn(async () => {
        calls.push('ack');
        controller.abort();
      }),
    };
    await pollNotifications(
      api,
      controller.signal,
      () => calls.push('commit'),
      () => {},
    );
    expect(calls).toEqual(['commit', 'ack']);
    expect(api.receive).toHaveBeenCalledTimes(1);
  });
  it('retries failed acknowledgements, leaving events available for deduplication', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const event = { receiptId: 42, body: { typeWebhook: 'incomingMessageReceived' } };
    const api = {
      connect: vi.fn(),
      resolveRecipient: vi.fn(),
      send: vi.fn(),
      receive: vi.fn().mockResolvedValue(event),
      acknowledge: vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockImplementationOnce(async () => {
          controller.abort();
        }),
    };
    const handler = vi.fn();
    const running = pollNotifications(api, controller.signal, handler, () => {});
    await vi.advanceTimersByTimeAsync(1001);
    await running;
    expect(api.acknowledge).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

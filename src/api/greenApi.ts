import type { ChatApi, Credentials, Notification, NotificationBody } from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export function normalizePhone(raw: string): string {
  if (!/^\+?[\d\s()-]+$/.test(raw.trim())) throw new Error('Введите международный номер телефона.');
  const phone = raw.replace(/\D/g, '');
  if (!/^[1-9]\d{6,14}$/.test(phone))
    throw new Error('Укажите номер с кодом страны: от 7 до 15 цифр, например +996 700 123 456.');
  return phone;
}
export function normalizeRecipient(raw: string): string {
  const recipient = raw.trim();
  if (!recipient.startsWith('@')) return normalizePhone(recipient);
  if (!/^@[a-zA-Z0-9_]{1,32}$/.test(recipient))
    throw new Error('Проверьте @username: только латинские буквы, цифры и знак подчёркивания.');
  return recipient.toLowerCase();
}
export function validateCredentials(values: Credentials): Credentials {
  const idInstance = values.idInstance.trim();
  const apiTokenInstance = values.apiTokenInstance.trim();
  if (!/^\d{6,20}$/.test(idInstance))
    throw new Error('idInstance должен содержать от 6 до 20 цифр.');
  if (!/^[a-zA-Z0-9_-]{10,256}$/.test(apiTokenInstance))
    throw new Error('Проверьте apiTokenInstance из личного кабинета.');
  let url: URL;
  try {
    url = new URL(values.apiUrl.trim());
  } catch {
    throw new Error('Укажите корректный apiUrl из личного кабинета.');
  }
  if (
    url.protocol !== 'https:' ||
    !/^(?:[a-z0-9-]+\.)*green-api\.com$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/$/.test(url.pathname)
  ) {
    throw new Error(
      'apiUrl должен быть HTTPS-адресом GREEN-API, например https://4100.api.green-api.com.',
    );
  }
  return { idInstance, apiTokenInstance, apiUrl: url.origin };
}

export class GreenApi implements ChatApi {
  readonly credentials: Credentials;
  constructor(
    credentials: Credentials,
    private transport: typeof fetch = fetch,
  ) {
    this.credentials = validateCredentials(credentials);
  }
  async request<T>(
    method: string,
    options: { verb?: string; body?: unknown; suffix?: string; signal?: AbortSignal } = {},
  ): Promise<T> {
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials;
    const url = `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}${options.suffix ?? ''}`;
    const timeout = AbortSignal.timeout(45_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let response: Response;
    try {
      // Native browser fetch requires a Window receiver or an unbound call.
      const transport = this.transport;
      response = await transport(url, {
        method: options.verb ?? 'GET',
        signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        ...(options.body !== undefined
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }
          : {}),
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ApiError('Нет ответа от GREEN-API. Проверьте сеть и apiUrl.');
    }
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: 'GREEN-API отклонил запрос. Проверьте данные.',
        401: 'Неверный idInstance или apiTokenInstance.',
        403: 'Нет доступа к инстансу. Проверьте ключ и тариф.',
        429: 'Слишком много запросов. Подождите немного.',
        469: 'Telegram временно ограничил поиск номеров. Повторите позже.',
      };
      // Do not expose remote response bodies: they may contain credentials or request URLs.
      throw new ApiError(
        messages[response.status] ?? `Ошибка GREEN-API (${response.status}). Повторите позже.`,
        response.status,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError('GREEN-API вернул некорректный ответ.');
    }
  }
  async connect(signal?: AbortSignal): Promise<string[]> {
    const state = await this.request<{ stateInstance: string }>('getStateInstance', { signal });
    if (state.stateInstance !== 'authorized')
      throw new ApiError(
        'Инстанс не авторизован. Подключите Telegram в личном кабинете GREEN-API и повторите вход.',
      );
    const settings = await this.request<{
      typeInstance?: string;
      incomingWebhook?: string;
      outgoingWebhook?: string;
      outgoingAPIMessageWebhook?: string;
      outgoingMessageWebhook?: string;
      webhookUrl?: string;
    }>('getSettings', { signal });
    if (settings.typeInstance !== 'telegram')
      throw new ApiError('Этот инстанс не относится к Telegram. Используйте инстанс Telegram.');
    const notices: string[] = [];
    if (settings.incomingWebhook !== 'yes')
      notices.push(
        'В GREEN-API включите «Получать уведомления о входящих сообщениях» (incomingWebhook: yes), чтобы видеть ответы.',
      );
    if (
      [
        settings.outgoingWebhook,
        settings.outgoingAPIMessageWebhook,
        settings.outgoingMessageWebhook,
      ].some((value) => value !== 'yes')
    )
      notices.push(
        'В GREEN-API отключены уведомления о статусах исходящих сообщений. Статусы сверяются с журналом с задержкой до 30 секунд.',
      );
    if (settings.webhookUrl)
      notices.push(
        'В настройках GREEN-API задан webhookUrl. Для получения ответов через HTTP API оставьте webhookUrl пустым.',
      );
    return notices;
  }
  async resolveRecipient(raw: string, signal?: AbortSignal): Promise<string> {
    const recipient = normalizeRecipient(raw);
    const result = await this.request<{ exist?: boolean; chatId?: string; status?: boolean }>(
      'checkAccount',
      {
        verb: 'POST',
        body: recipient.startsWith('@')
          ? { username: recipient }
          : { phoneNumber: Number(recipient) },
        signal,
      },
    );
    if (result.status === false)
      throw new ApiError(
        'Telegram не смог найти получателя. Проверьте состояние инстанса или повторите позже.',
      );
    if (!result.exist || !result.chatId)
      throw new ApiError(
        'Аккаунт Telegram не найден. Проверьте номер, @username или настройки приватности получателя.',
      );
    return String(result.chatId);
  }
  async send(chatId: string, message: string, signal?: AbortSignal): Promise<string> {
    if (!message.trim() || message.length > 4096)
      throw new ApiError('Сообщение должно содержать от 1 до 4096 символов.');
    const result = await this.request<{ idMessage: string }>('sendMessage', {
      verb: 'POST',
      body: { chatId, message },
      signal,
    });
    if (!result.idMessage)
      throw new ApiError(
        'Сервер не подтвердил отправку. Проверьте Telegram перед повторной отправкой.',
      );
    return result.idMessage;
  }
  async deliveryStatuses(minutes: number, signal: AbortSignal): Promise<NotificationBody[]> {
    const rows = await this.request<unknown>('lastOutgoingMessages', {
      suffix: `?minutes=${Math.max(1, Math.min(1440, Math.ceil(minutes)))}`,
      signal,
    });
    if (!Array.isArray(rows)) throw new ApiError('GREEN-API вернул некорректный журнал отправки.');
    return rows.flatMap((row) => {
      if (
        !row ||
        row.type !== 'outgoing' ||
        typeof row.idMessage !== 'string' ||
        typeof row.chatId !== 'string' ||
        !['sent', 'delivered', 'read', 'failed', 'noAccount'].includes(row.statusMessage)
      )
        return [];
      return [
        {
          typeWebhook: 'outgoingMessageStatus',
          chatId: row.chatId,
          idMessage: row.idMessage,
          status: row.statusMessage,
        },
      ];
    });
  }
  receive(signal: AbortSignal) {
    return this.request<Notification | null>('receiveNotification', {
      suffix: '?receiveTimeout=30',
      signal,
    });
  }
  async acknowledge(receiptId: number, signal: AbortSignal) {
    const result = await this.request<{ result: boolean }>('deleteNotification', {
      verb: 'DELETE',
      suffix: `/${receiptId}`,
      signal,
    });
    if (!result.result) throw new ApiError('Не удалось подтвердить получение уведомления.');
  }
}

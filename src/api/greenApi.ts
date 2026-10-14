import type { ChatApi, Credentials, Notification } from '../types';

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
  if (/[^\d+\s()-]/.test(raw)) throw new Error('Введите номер телефона, без букв.');
  const phone = raw.replace(/\D/g, '');
  if (!/^(7\d{10}|375\d{9})$/.test(phone))
    throw new Error('Укажите номер с кодом +7 (11 цифр) или +375 (12 цифр).');
  return phone;
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
      'apiUrl должен быть HTTPS-адресом GREEN-API, например https://3100.api.green-api.com.',
    );
  }
  return { idInstance, apiTokenInstance, apiUrl: url.origin };
}

export class GreenApi implements ChatApi {
  private credentials: Credentials;
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
      response = await this.transport(url, {
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
        469: 'MAX временно ограничил поиск номеров. Повторите позже.',
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
        'Инстанс не авторизован. Подключите MAX в личном кабинете GREEN-API и повторите вход.',
      );
    const settings = await this.request<{
      typeInstance?: string;
      incomingWebhook?: string;
      webhookUrl?: string;
    }>('getSettings', { signal });
    if (settings.typeInstance && !['v3', 'max'].includes(settings.typeInstance))
      throw new ApiError('Этот инстанс не относится к MAX. Используйте инстанс MAX.');
    const notices: string[] = [];
    if (settings.incomingWebhook !== 'yes')
      notices.push(
        'В GREEN-API включите «Получать уведомления о входящих сообщениях» (incomingWebhook: yes), чтобы видеть ответы.',
      );
    if (settings.webhookUrl)
      notices.push(
        'В настройках GREEN-API задан webhookUrl. Для получения ответов через HTTP API оставьте webhookUrl пустым.',
      );
    return notices;
  }
  async resolvePhone(phone: string, signal?: AbortSignal): Promise<string> {
    const result = await this.request<{ exist?: boolean; chatId?: string; status?: boolean }>(
      'checkAccount',
      { verb: 'POST', body: { phoneNumber: Number(normalizePhone(phone)) }, signal },
    );
    if (result.status === false)
      throw new ApiError(
        'MAX не смог проверить номер. Проверьте состояние инстанса или повторите позже.',
      );
    if (!result.exist || !result.chatId)
      throw new ApiError(
        'Аккаунт MAX не найден. Проверьте номер и настройки приватности получателя.',
      );
    return String(result.chatId);
  }
  async send(chatId: string, message: string, signal?: AbortSignal): Promise<string> {
    if (!message.trim() || message.length > 4000)
      throw new ApiError('Сообщение должно содержать от 1 до 4000 символов.');
    const result = await this.request<{ idMessage: string }>('sendMessage', {
      verb: 'POST',
      body: { chatId, message },
      signal,
    });
    if (!result.idMessage)
      throw new ApiError('Сервер не подтвердил отправку. Проверьте MAX перед повторной отправкой.');
    return result.idMessage;
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

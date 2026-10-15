import type { Chat, Credentials, Message } from './types';
import type { ChatState } from './state';
import { validateCredentials } from './api/greenApi';

const prefix = 'telegram-chat:v1:';
export type SavedSession =
  { demo: true; notices: string[] } | { demo: false; credentials: Credentials; notices: string[] };
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function read(key: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(prefix + key) ?? 'null');
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): boolean {
  try {
    sessionStorage.setItem(prefix + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function readConnection(): Credentials {
  const value = read('connection');
  return {
    idInstance: object(value) && typeof value.idInstance === 'string' ? value.idInstance : '',
    apiTokenInstance:
      object(value) && typeof value.apiTokenInstance === 'string' ? value.apiTokenInstance : '',
    apiUrl:
      object(value) && typeof value.apiUrl === 'string'
        ? value.apiUrl
        : 'https://4100.api.green-api.com',
  };
}
export const saveConnection = (value: Credentials) => write('connection', value);
export const saveSession = (value: SavedSession) => write('session', value);
export function readSession(): SavedSession | null {
  const value = read('session');
  if (!object(value) || !Array.isArray(value.notices)) return null;
  const notices = value.notices.filter((n): n is string => typeof n === 'string');
  if (value.demo === true) return { demo: true, notices };
  if (value.demo !== false || !object(value.credentials)) return null;
  const c = value.credentials;
  if (![c.idInstance, c.apiTokenInstance, c.apiUrl].every((v) => typeof v === 'string'))
    return null;
  try {
    const credentials = validateCredentials(c as unknown as Credentials);
    return { demo: false, credentials, notices };
  } catch {
    return null;
  }
}
export function historyKey(credentials?: Credentials): string {
  return credentials ? `history:${credentials.apiUrl}:${credentials.idInstance}` : 'history:demo';
}
function isMessage(value: unknown, chatId: string): value is Message {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    value.chatId === chatId &&
    typeof value.text === 'string' &&
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp) &&
    Math.abs(value.timestamp) <= 8.64e15 &&
    ['in', 'out'].includes(String(value.direction)) &&
    (value.status === undefined ||
      ['sending', 'queued', 'sent', 'delivered', 'read', 'failed'].includes(
        String(value.status),
      )) &&
    (value.deliveryError === undefined || typeof value.deliveryError === 'string')
  );
}
function isChat(value: unknown): value is Chat {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.unread === 'number' &&
    Number.isSafeInteger(value.unread) &&
    value.unread >= 0 &&
    (value.phone === undefined || typeof value.phone === 'string') &&
    (value.recipient === undefined || typeof value.recipient === 'string') &&
    Array.isArray(value.messages) &&
    value.messages.every((m) => isMessage(m, value.id as string))
  );
}
export function readHistory(key: string): ChatState | null {
  const value = read(key);
  if (!object(value) || !Array.isArray(value.chats) || !value.chats.every(isChat)) return null;
  const chats = value.chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((message): Message =>
      message.status === 'sending'
        ? {
            ...message,
            status: 'failed',
            deliveryError:
              'Страница была перезагружена во время отправки. Проверьте сообщение в Telegram перед повтором.',
          }
        : message,
    ),
  }));
  const drafts = object(value.drafts)
    ? Object.fromEntries(
        Object.entries(value.drafts).filter(
          ([id, text]) =>
            chats.some((chat) => chat.id === id) && typeof text === 'string' && text.length <= 4096,
        ),
      )
    : {};
  return {
    chats,
    activeId: chats.some((c) => c.id === value.activeId) ? (value.activeId as string) : null,
    drafts: drafts as Record<string, string>,
  };
}
export const saveHistory = (key: string, value: ChatState) => write(key, value);
export function clearSession(key: string) {
  try {
    for (const entry of ['session', 'connection', key]) sessionStorage.removeItem(prefix + entry);
  } catch {
    /* Storage can be disabled; in-memory logout still works. */
  }
}

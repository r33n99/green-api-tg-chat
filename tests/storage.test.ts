import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  historyKey,
  readConnection,
  readHistory,
  readSession,
  saveConnection,
  saveHistory,
  saveSession,
} from '../src/storage';
import { chatReducer, type ChatState } from '../src/state';

const credentials = {
  idInstance: '4100000001',
  apiTokenInstance: 'test-token-12345678',
  apiUrl: 'https://4100.api.green-api.com',
};
const state: ChatState = {
  chats: [
    {
      id: 'alice',
      title: 'Алиса',
      unread: 0,
      messages: [
        {
          id: 'm1',
          chatId: 'alice',
          text: 'Привет',
          direction: 'out',
          timestamp: 1700000000000,
          status: 'delivered',
        },
      ],
    },
  ],
  activeId: 'alice',
  drafts: { alice: 'Неотправленный текст' },
};
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('tab persistence', () => {
  it('restores a connected session and an unfinished login form', () => {
    saveConnection(credentials);
    saveSession({ demo: false, credentials, notices: ['Настройка уведомлений'] });
    expect(readConnection()).toEqual(credentials);
    expect(readSession()).toEqual({ demo: false, credentials, notices: ['Настройка уведомлений'] });
  });
  it('restores messages, active chat and drafts without mixing accounts or demo', () => {
    const key = historyKey(credentials);
    saveHistory(key, state);
    expect(readHistory(key)).toEqual(state);
    expect(readHistory(historyKey())).toBeNull();
    expect(readHistory(historyKey({ ...credentials, idInstance: '4100000002' }))).toBeNull();
    expect(key).not.toContain(credentials.apiTokenInstance);
  });
  it('marks interrupted sends as unconfirmed and never resends them', () => {
    const pending = structuredClone(state);
    pending.chats[0].messages[0].status = 'sending';
    saveHistory(historyKey(), pending);
    const restored = readHistory(historyKey())!;
    expect(restored.chats[0].messages[0].status).toBe('failed');
    expect(restored.chats[0].messages[0].deliveryError).toContain('Проверьте');
    expect(restored.drafts).toEqual(pending.drafts);
  });
  it('ignores corrupt storage, unsafe credentials and invalid message timestamps', () => {
    sessionStorage.setItem('telegram-chat:v1:session', '{invalid');
    expect(readSession()).toBeNull();
    saveSession({
      demo: false,
      credentials: { ...credentials, apiUrl: 'https://evil.example' },
      notices: [],
    });
    expect(readSession()).toBeNull();
    const invalid = structuredClone(state);
    invalid.chats[0].messages[0].timestamp = 9e15;
    saveHistory(historyKey(), invalid);
    expect(readHistory(historyKey())).toBeNull();
  });
  it('clears the current account on logout without deleting unrelated storage', () => {
    saveConnection(credentials);
    saveSession({ demo: false, credentials, notices: [] });
    saveHistory(historyKey(credentials), state);
    saveHistory(historyKey(), state);
    clearSession(historyKey(credentials));
    expect(readSession()).toBeNull();
    expect(readConnection().apiTokenInstance).toBe('');
    expect(readHistory(historyKey(credentials))).toBeNull();
    expect(readHistory(historyKey())).toEqual(state);
  });
  it('reports unavailable storage without breaking the application', () => {
    vi.stubGlobal('sessionStorage', {
      getItem() {
        throw new Error('Disabled');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
      removeItem() {
        throw new Error('Disabled');
      },
    });
    expect(readSession()).toBeNull();
    expect(readHistory(historyKey())).toBeNull();
    expect(saveHistory(historyKey(), state)).toBe(false);
    expect(saveSession({ demo: true, notices: [] })).toBe(false);
    expect(() => clearSession(historyKey())).not.toThrow();
  });
  it('keeps each chat draft when adding or selecting another chat', () => {
    const next = chatReducer(state, { type: 'addChat', id: 'bob', recipient: '@bob' });
    const edited = chatReducer(next, { type: 'draft', chatId: 'bob', text: 'Для Боба' });
    const selected = chatReducer(edited, { type: 'select', id: 'alice' });
    expect(selected.drafts).toEqual({ alice: 'Неотправленный текст', bob: 'Для Боба' });
  });
});

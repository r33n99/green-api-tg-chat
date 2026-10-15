import { expect, it } from 'vitest';
import { chatReducer } from '../src/state';
import type { ChatState } from '../src/state';
import type { NotificationBody } from '../src/types';
const empty: ChatState = { chats: [], activeId: null };
it('creates a chat from username without manufacturing a phone number', () => {
  const state = chatReducer(empty, { type: 'addChat', id: '100', recipient: '@some_user' });
  expect(state.chats[0].title).toBe('@some_user');
  expect(state.chats[0].phone).toBeUndefined();
  expect(state.chats[0].recipient).toBe('@some_user');
});
it('handles Telegram noAccount without idMessage and preserves it after send returns', () => {
  let state = chatReducer(empty, {
    type: 'message',
    message: {
      id: 'local',
      chatId: '100',
      text: 'Hello',
      timestamp: 100,
      direction: 'out',
      status: 'sending',
    },
  });
  state = chatReducer(state, {
    type: 'event',
    body: { typeWebhook: 'outgoingMessageStatus', chatId: '100', status: 'noAccount' },
  });
  state = chatReducer(state, { type: 'sent', localId: 'local', id: 'server', chatId: '100' });
  expect(state.chats[0].messages[0].status).toBe('failed');
  expect(state.chats[0].messages[0].deliveryError).toContain('Получатель не найден');
});
it('explains an unresolvable Telegram recipient without affecting delivered messages', () => {
  let state = chatReducer(empty, {
    type: 'message',
    message: {
      id: 'delivered',
      chatId: '100',
      text: 'Earlier',
      timestamp: 99,
      direction: 'out',
      status: 'delivered',
    },
  });
  state = chatReducer(state, {
    type: 'message',
    message: {
      id: 'pending',
      chatId: '100',
      text: 'Hello',
      timestamp: 100,
      direction: 'out',
      status: 'queued',
    },
  });
  state = chatReducer(state, {
    type: 'event',
    body: {
      typeWebhook: 'outgoingMessageStatus',
      chatId: '100',
      status: 'failed',
      description: 'chatId unresolvable on this session',
    },
  });
  expect(state.chats[0].messages[0].status).toBe('delivered');
  expect(state.chats[0].messages[1].deliveryError).toContain('@username');
});
const incoming: NotificationBody = {
  typeWebhook: 'incomingMessageReceived',
  idMessage: 'incoming-1',
  timestamp: 100,
  senderData: { chatId: '100', senderName: 'Анна' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет' } },
};
it('deduplicates a redelivered receipt and increments unread only once', () => {
  const state = chatReducer(chatReducer(empty, { type: 'event', body: incoming }), {
    type: 'event',
    body: incoming,
  });
  expect(state.chats[0].messages).toHaveLength(1);
  expect(state.chats[0].unread).toBe(1);
  expect(state.chats[0].title).toBe('Анна');
});
it('marks a selected chat read and does not count new messages as unread', () => {
  let state = chatReducer(empty, { type: 'event', body: incoming });
  state = chatReducer(state, { type: 'select', id: '100' });
  state = chatReducer(state, { type: 'event', body: { ...incoming, idMessage: 'incoming-2' } });
  expect(state.chats[0].unread).toBe(0);
  expect(state.chats[0].messages).toHaveLength(2);
});
it('does not downgrade delivery on out-of-order status notifications', () => {
  let state = chatReducer(empty, {
    type: 'message',
    message: {
      id: 'm1',
      chatId: '100',
      text: 'Hello',
      timestamp: 100,
      direction: 'out',
      status: 'queued',
    },
  });
  for (const status of ['read', 'delivered', 'sent'])
    state = chatReducer(state, {
      type: 'event',
      body: { typeWebhook: 'outgoingMessageStatus', idMessage: 'm1', status },
    });
  expect(state.chats[0].messages[0].status).toBe('read');
});
it('does not apply a journal status to a different chat with the same message ID', () => {
  const state = chatReducer(empty, {
    type: 'message',
    message: {
      id: 'm1',
      chatId: '100',
      text: 'Hello',
      timestamp: 100,
      direction: 'out',
      status: 'queued',
    },
  });
  const next = chatReducer(state, {
    type: 'event',
    body: {
      typeWebhook: 'outgoingMessageStatus',
      chatId: 'other',
      idMessage: 'm1',
      status: 'read',
    },
  });
  expect(next.chats[0].messages[0].status).toBe('queued');
});
it('handles text with a URL and ignores unsupported media', () => {
  const state = chatReducer(empty, {
    type: 'event',
    body: {
      ...incoming,
      messageData: {
        typeMessage: 'extendedTextMessage',
        extendedTextMessageData: { text: 'https://example.com' },
      },
    },
  });
  expect(state.chats[0].messages[0].text).toContain('https://');
  expect(
    chatReducer(empty, {
      type: 'event',
      body: { ...incoming, messageData: { typeMessage: 'imageMessage' } },
    }),
  ).toEqual(empty);
});
it('keeps a single message if the outgoing webhook races the send response', () => {
  let state = chatReducer(empty, {
    type: 'message',
    message: {
      id: 'local',
      chatId: '100',
      text: 'Hello',
      timestamp: 100,
      direction: 'out',
      status: 'sending',
    },
  });
  state = chatReducer(state, {
    type: 'event',
    body: {
      ...incoming,
      typeWebhook: 'outgoingAPIMessageReceived',
      idMessage: 'remote',
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Hello' } },
    },
  });
  state = chatReducer(state, { type: 'sent', localId: 'local', id: 'remote', chatId: '100' });
  expect(state.chats[0].messages).toHaveLength(1);
  expect(state.chats[0].messages[0].id).toBe('remote');
});

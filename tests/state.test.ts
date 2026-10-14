import { expect, it } from 'vitest';
import { chatReducer } from '../src/state';
import type { ChatState } from '../src/state';
import type { NotificationBody } from '../src/types';
const empty: ChatState = { chats: [], activeId: null };
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

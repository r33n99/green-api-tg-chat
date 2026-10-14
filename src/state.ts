import type { Chat, Delivery, Message, NotificationBody } from './types';
export interface ChatState {
  chats: Chat[];
  activeId: string | null;
}
export type Action =
  | { type: 'select'; id: string | null }
  | { type: 'addChat'; id: string; recipient: string }
  | { type: 'message'; message: Message }
  | { type: 'sent'; localId: string; id: string; chatId: string }
  | { type: 'failed'; id: string; chatId: string }
  | { type: 'event'; body: NotificationBody };
const statuses: Delivery[] = ['sending', 'queued', 'sent', 'delivered', 'read'];
export function chatReducer(state: ChatState, action: Action): ChatState {
  if (action.type === 'select')
    return {
      ...state,
      activeId: action.id,
      chats: state.chats.map((c) => (c.id === action.id ? { ...c, unread: 0 } : c)),
    };
  if (action.type === 'addChat') {
    const found = state.chats.find((c) => c.id === action.id);
    const phone = action.recipient.startsWith('@') ? undefined : action.recipient;
    return {
      activeId: action.id,
      chats: found
        ? state.chats.map((c) =>
            c.id === action.id
              ? { ...c, unread: 0, recipient: action.recipient, phone: phone ?? c.phone }
              : c,
          )
        : [
            {
              id: action.id,
              phone,
              recipient: action.recipient,
              title: phone ? `+${phone}` : action.recipient,
              unread: 0,
              messages: [],
            },
            ...state.chats,
          ],
    };
  }
  if (action.type === 'message') {
    const msg = action.message;
    const existing = state.chats.find((c) => c.id === msg.chatId);
    if (!existing)
      return {
        ...state,
        chats: [
          {
            id: msg.chatId,
            title: msg.chatId,
            unread: msg.direction === 'in' ? 1 : 0,
            messages: [msg],
          },
          ...state.chats,
        ],
      };
    return {
      ...state,
      chats: state.chats.map((c) =>
        c.id !== msg.chatId || c.messages.some((m) => m.id === msg.id)
          ? c
          : {
              ...c,
              unread: c.unread + (msg.direction === 'in' && state.activeId !== c.id ? 1 : 0),
              messages: [...c.messages, msg].sort((a, b) => a.timestamp - b.timestamp),
            },
      ),
    };
  }
  if (action.type === 'sent' || action.type === 'failed')
    return {
      ...state,
      chats: state.chats.map((c) =>
        c.id !== action.chatId
          ? c
          : {
              ...c,
              messages: c.messages
                .map<Message>((m) =>
                  action.type === 'sent' && (m.id === action.localId || m.id === action.id)
                    ? {
                        ...m,
                        id: action.id,
                        status:
                          m.status && (statuses.indexOf(m.status) > 1 || m.deliveryError)
                            ? m.status
                            : 'queued',
                      }
                    : action.type === 'failed' && m.id === action.id
                      ? { ...m, status: 'failed' }
                      : m,
                )
                .filter((m, index, all) => all.findIndex((x) => x.id === m.id) === index),
            },
      ),
    };
  const body = action.body;
  if (body.typeWebhook === 'outgoingMessageStatus') {
    const next = (body.status === 'noAccount' ? 'failed' : body.status) as Delivery;
    if (![...statuses, 'failed'].includes(next)) return state;
    return {
      ...state,
      chats: state.chats.map((c) => {
        // Some Telegram failure notifications contain chatId without idMessage.
        const pending =
          !body.idMessage && c.id === body.chatId
            ? [...c.messages]
                .reverse()
                .find(
                  (m) =>
                    m.direction === 'out' && ['sending', 'queued', 'sent'].includes(m.status ?? ''),
                )
            : undefined;
        const targetId = body.idMessage ?? pending?.id;
        const deliveryError =
          body.status === 'noAccount'
            ? 'Получатель не найден в Telegram или скрыт настройками приватности.'
            : body.description === 'chatId unresolvable on this session'
              ? 'Не удалось определить получателя. Создайте чат заново по номеру или @username.'
              : 'Telegram отклонил сообщение.';
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === targetId &&
            m.direction === 'out' &&
            (next === 'failed' || statuses.indexOf(next) > statuses.indexOf(m.status ?? 'queued'))
              ? { ...m, status: next, deliveryError: next === 'failed' ? deliveryError : undefined }
              : m,
          ),
        };
      }),
    };
  }
  if (
    !['incomingMessageReceived', 'outgoingAPIMessageReceived', 'outgoingMessageReceived'].includes(
      body.typeWebhook,
    )
  )
    return state;
  const chatId = body.senderData?.chatId ?? body.chatId;
  if (body.senderData?.chatType === 'group' || chatId?.startsWith('-')) return state;
  const text =
    body.messageData?.textMessageData?.textMessage ??
    body.messageData?.extendedTextMessageData?.text;
  if (!chatId || !body.idMessage || typeof text !== 'string') return state;
  const updated = chatReducer(state, {
    type: 'message',
    message: {
      id: body.idMessage,
      chatId: String(chatId),
      text,
      timestamp: (body.timestamp ?? Date.now() / 1000) * 1000,
      direction: body.typeWebhook === 'incomingMessageReceived' ? 'in' : 'out',
      status: 'sent',
    },
  });
  const sender = body.senderData;
  return {
    ...updated,
    chats: updated.chats.map((c) =>
      c.id === String(chatId)
        ? {
            ...c,
            title: sender?.chatName || sender?.senderName || c.title,
            phone:
              c.phone || (sender?.senderPhoneNumber ? String(sender.senderPhoneNumber) : undefined),
          }
        : c,
    ),
  };
}

import { useEffect, useReducer, useRef, useState } from 'react';
import type { ChatApi } from '../types';
import { chatReducer } from '../state';
import { normalizeRecipient } from '../api/greenApi';
import { demoChats } from '../api/demo';
import { pollNotifications } from '../api/poll';

export function useChat(api: ChatApi, demo: boolean) {
  const [state, dispatch] = useReducer(chatReducer, {
    chats: demo ? demoChats() : [],
    activeId: demo ? 'demo-alex' : null,
  });
  const [pollError, setPollError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const sessionAbort = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    sessionAbort.current = controller;
    void pollNotifications(
      api,
      controller.signal,
      (body) => dispatch({ type: 'event', body }),
      setPollError,
    );
    return () => controller.abort();
  }, [api]);
  const active = state.chats.find((c) => c.id === state.activeId);
  const createChat = async (raw: string) => {
    const recipient = normalizeRecipient(raw);
    const found = state.chats.find((c) => c.recipient === recipient || c.phone === recipient);
    const id = found?.id ?? (await api.resolveRecipient(recipient, sessionAbort.current.signal));
    if (!sessionAbort.current.signal.aborted) dispatch({ type: 'addChat', id, recipient });
  };
  const send = async (text: string) => {
    if (!active || sendingRef.current || !text.trim() || text.length > 4096) return false;
    const controller = sessionAbort.current;
    const chatId = active.id;
    const localId = crypto.randomUUID();
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    dispatch({
      type: 'message',
      message: {
        id: localId,
        chatId,
        text,
        timestamp: Date.now(),
        direction: 'out',
        status: 'sending',
      },
    });
    try {
      const id = await api.send(chatId, text, controller.signal);
      if (!controller.signal.aborted) dispatch({ type: 'sent', localId, id, chatId });
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        dispatch({ type: 'failed', id: localId, chatId });
        setSendError(
          `${error instanceof Error ? error.message : 'Не удалось отправить сообщение.'} Текст сохранён в поле ввода. При сетевой ошибке проверьте Telegram перед повтором.`,
        );
      }
      return false;
    } finally {
      sendingRef.current = false;
      if (!controller.signal.aborted) setSending(false);
    }
  };
  return {
    ...state,
    active,
    createChat,
    send,
    sending,
    pollError,
    sendError,
    select: (id: string | null) => dispatch({ type: 'select', id }),
  };
}

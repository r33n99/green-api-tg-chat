import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatApi } from '../types';
import { chatReducer, type Action } from '../state';
import { historyKey, readHistory, saveHistory } from '../storage';
import { normalizeRecipient } from '../api/greenApi';
import { demoChats } from '../api/demo';
import { pollNotifications } from '../api/poll';

export function useChat(api: ChatApi, demo: boolean, restored = false) {
  const key = historyKey(api.credentials);
  const [state, setState] = useState(
    () =>
      readHistory(key) ?? {
        chats: demo ? demoChats() : [],
        activeId: demo ? 'demo-alex' : null,
        drafts: {},
      },
  );
  const currentState = useRef(state);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [checking, setChecking] = useState(restored && !demo);
  const [ready, setReady] = useState(!restored || demo);
  const [attempt, setAttempt] = useState(0);
  const [notices, setNotices] = useState<string[] | null>(null);
  const persist = useCallback(
    (next: typeof state) => {
      setStorageError(
        saveHistory(key, next)
          ? null
          : 'Браузер не позволяет сохранить данные вкладки. Не перезагружайте страницу до восстановления хранилища.',
      );
    },
    [key],
  );
  const dispatch = useCallback(
    (action: Action) => {
      const next = chatReducer(currentState.current, action);
      currentState.current = next;
      persist(next);
      setState(next);
    },
    [persist],
  );
  useEffect(() => {
    persist(currentState.current);
  }, [persist]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const sessionAbort = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    sessionAbort.current = controller;
    void (async () => {
      try {
        if (restored && !demo) {
          const updated = await api.connect(controller.signal);
          if (controller.signal.aborted) return;
          setNotices(updated);
        }
        if (controller.signal.aborted) return;
        setChecking(false);
        setReady(true);
        await pollNotifications(
          api,
          controller.signal,
          (body) => dispatch({ type: 'event', body }),
          setPollError,
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setChecking(false);
          setPollError(
            error instanceof Error ? error.message : 'Не удалось восстановить подключение.',
          );
        }
      }
    })();
    return () => controller.abort();
  }, [api, demo, restored, dispatch, attempt]);
  const active = state.chats.find((c) => c.id === state.activeId);
  const createChat = async (raw: string) => {
    const recipient = normalizeRecipient(raw);
    const found = state.chats.find((c) => c.recipient === recipient || c.phone === recipient);
    const id = found?.id ?? (await api.resolveRecipient(recipient, sessionAbort.current.signal));
    if (!sessionAbort.current.signal.aborted) dispatch({ type: 'addChat', id, recipient });
  };
  const send = async (text: string) => {
    if (!active || !ready || checking || sendingRef.current || !text.trim() || text.length > 4096)
      return false;
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
    checking,
    ready,
    reconnect: () => {
      setChecking(true);
      setPollError(null);
      setAttempt((value) => value + 1);
    },
    notices,
    storageError,
    pollError,
    sendError,
    draft: active ? (state.drafts?.[active.id] ?? '') : '',
    setDraft: (chatId: string, text: string) => dispatch({ type: 'draft', chatId, text }),
    select: (id: string | null) => dispatch({ type: 'select', id }),
  };
}

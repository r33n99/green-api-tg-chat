import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, LogOut, MessageSquare, Plus, Search } from 'lucide-react';
import { Login, Brand } from './components/Login';
import { Conversation, Avatar, formatTime } from './components/Conversation';
import { NewChat } from './components/NewChat';
import { useChat } from './hooks/useChat';
import { DemoApi } from './api/demo';
import { GreenApi } from './api/greenApi';
import { clearSession, historyKey, readSession, saveSession } from './storage';
import type { ChatApi } from './types';
import './styles/App.scss';
interface Session {
  api: ChatApi;
  demo: boolean;
  notices: string[];
  restored?: boolean;
}
export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const saved = readSession();
    return saved
      ? {
          api: saved.demo ? new DemoApi() : new GreenApi(saved.credentials),
          demo: saved.demo,
          notices: saved.notices,
          restored: true,
        }
      : null;
  });
  const [sessionStorageError, setSessionStorageError] = useState(false);
  useEffect(() => {
    if (!session) return;
    const saved = session.demo
      ? saveSession({ demo: true, notices: session.notices })
      : session.api.credentials &&
        saveSession({
          demo: false,
          credentials: session.api.credentials,
          notices: session.notices,
        });
    setSessionStorageError(!saved);
  }, [session]);
  return session ? (
    <Workspace
      session={session}
      sessionStorageError={sessionStorageError}
      onLogout={() => {
        clearSession(historyKey(session.api.credentials));
        setSession(null);
      }}
    />
  ) : (
    <Login
      onConnect={(api, notices) => setSession({ api, notices, demo: false })}
      onDemo={() => setSession({ api: new DemoApi(), demo: true, notices: [] })}
    />
  );
}
function Workspace({
  session,
  onLogout,
  sessionStorageError,
}: {
  session: Session;
  onLogout: () => void;
  sessionStorageError: boolean;
}) {
  const chat = useChat(session.api, session.demo, session.restored);
  const notices = chat.notices ?? session.notices;
  const [search, setSearch] = useState('');
  const [newChat, setNewChat] = useState(false);
  const chats = useMemo(
    () =>
      [...chat.chats]
        .sort((a, b) => (b.messages.at(-1)?.timestamp ?? 0) - (a.messages.at(-1)?.timestamp ?? 0))
        .filter((c) => `${c.title} ${c.phone ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [chat.chats, search],
  );
  return (
    <main className={`workspace ${chat.active ? 'workspace--conversation' : ''}`}>
      <header className="workspace-header">
        <Brand />
        <div className="workspace-account">
          {session.demo ? (
            <span className="demo-label" title="Тестовые сообщения. Аккаунт Telegram не подключён.">
              Деморежим
            </span>
          ) : (
            <span className={`connection-state ${chat.pollError ? 'connection-state--error' : ''}`}>
              <i />
              {chat.checking
                ? 'Подключаемся…'
                : chat.pollError
                  ? 'Получение приостановлено'
                  : 'Аккаунт подключён'}
            </span>
          )}
          <button
            className="icon-button"
            title={session.demo ? 'Выйти из деморежима' : 'Выйти'}
            aria-label={session.demo ? 'Выйти из деморежима' : 'Выйти'}
            onClick={onLogout}
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>
      {(notices.length > 0 || chat.pollError || chat.storageError || sessionStorageError) && (
        <div className="workspace-notices">
          {notices.map((notice) => (
            <p key={notice} className="setup-notice" role="status">
              {notice}
            </p>
          ))}
          {(chat.storageError || sessionStorageError) && (
            <p className="error-notice" role="alert">
              {chat.storageError ??
                'Не удалось сохранить подключение. Проверьте разрешения хранилища браузера.'}
            </p>
          )}
          {chat.pollError && (
            <p className="error-notice" role="alert">
              {chat.pollError}
            </p>
          )}
          {!chat.ready && !chat.checking && (
            <button className="text-button" onClick={chat.reconnect}>
              Повторить подключение
            </button>
          )}
        </div>
      )}
      <div className="chat-layout">
        <aside className="sidebar" aria-label="Список чатов">
          <div className="sidebar-title">
            <h1>Сообщения</h1>
            <button
              className="icon-button new-button"
              title="Новый чат"
              aria-label="Новый чат"
              onClick={() => setNewChat(true)}
            >
              <Plus size={23} />
            </button>
          </div>
          <div className="search-field">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Поиск чатов"
              placeholder="Поиск"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="chat-list">
            {chats.map((c) => {
              const last = c.messages.at(-1);
              return (
                <button
                  key={c.id}
                  className={`chat-item ${chat.activeId === c.id ? 'chat-item--active' : ''}`}
                  aria-current={chat.activeId === c.id ? 'true' : undefined}
                  onClick={() => chat.select(c.id)}
                >
                  <Avatar title={c.title} />
                  <span className="chat-item-copy">
                    <span className="chat-item-line">
                      <strong>{c.title}</strong>
                      {last && <time>{formatTime(last.timestamp)}</time>}
                    </span>
                    <span className="chat-item-line">
                      <span className="chat-preview">
                        {last
                          ? `${last.direction === 'out' ? 'Вы: ' : ''}${last.text}`
                          : 'Нет сообщений'}
                      </span>
                      {c.unread > 0 && (
                        <span className="unread" aria-label={`${c.unread} непрочитанных`}>
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
            {chats.length === 0 && (
              <div className="sidebar-empty">
                {search ? 'Чаты не найдены' : 'Пока нет чатов'}
                {!search && (
                  <button className="text-button" onClick={() => setNewChat(true)}>
                    Написать сообщение
                  </button>
                )}
              </div>
            )}
          </div>
          <footer className="sidebar-footer">
            <span>GREEN-API</span>
            <a
              href="https://green-api.com/telegram/docs/"
              target="_blank"
              rel="noreferrer"
              aria-label="Документация GREEN-API"
            >
              <ExternalLink size={16} />
            </a>
          </footer>
        </aside>
        <div className="chat-main">
          {chat.active ? (
            <Conversation
              key={chat.active.id}
              chat={chat.active}
              sending={chat.sending || chat.checking || !chat.ready}
              draft={chat.draft}
              onDraftChange={(text) => chat.setDraft(chat.active!.id, text)}
              error={chat.sendError}
              onSend={chat.send}
              onBack={() => chat.select(null)}
            />
          ) : (
            <section className="empty-workspace">
              <div className="empty-icon">
                <MessageSquare size={38} strokeWidth={1.5} />
              </div>
              <h2>Начните разговор</h2>
              <p>
                Создайте чат по номеру или @username
                <br />
                или выберите переписку слева.
              </p>
              <button className="primary-button" onClick={() => setNewChat(true)}>
                <Plus size={18} /> Новый чат
              </button>
            </section>
          )}
        </div>
      </div>
      {newChat && <NewChat onClose={() => setNewChat(false)} onCreate={chat.createChat} />}
    </main>
  );
}

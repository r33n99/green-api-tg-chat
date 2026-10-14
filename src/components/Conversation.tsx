import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Clock3, CircleAlert, Send } from 'lucide-react';
import type { Chat, Delivery } from '../types';
import './Conversation.scss';
export const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
const statusText: Record<Delivery, string> = {
  sending: 'Отправляется',
  queued: 'В очереди GREEN-API',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не подтверждено',
};
function Status({ status }: { status: Delivery }) {
  return (
    <span
      className={`delivery delivery--${status}`}
      aria-label={statusText[status]}
      title={statusText[status]}
    >
      {status === 'failed' ? (
        <CircleAlert size={14} />
      ) : status === 'sending' || status === 'queued' ? (
        <Clock3 size={13} />
      ) : status === 'sent' ? (
        <Check size={16} />
      ) : (
        <CheckCheck size={16} />
      )}
    </span>
  );
}
export function Avatar({ title, className = '' }: { title: string; className?: string }) {
  const initials =
    title.startsWith('+') || /^\d/.test(title)
      ? title.slice(-2)
      : title
          .split(' ')
          .map((w) => w[0])
          .slice(0, 2)
          .join('');
  const tone = title.charCodeAt(title.length - 1) % 3;
  return (
    <span className={`avatar avatar--${tone} ${className}`} aria-hidden="true">
      {initials}
    </span>
  );
}
export function Conversation({
  chat,
  sending,
  error,
  onSend,
  onBack,
}: {
  chat: Chat;
  sending: boolean;
  error: string | null;
  onSend: (text: string) => Promise<boolean>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages.length]);
  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (sending || !draft.trim() || draft.length > 4000) return;
    const text = draft;
    if (await onSend(text)) setDraft((current) => (current === text ? '' : current));
  }
  let previousDay = '';
  return (
    <section className="conversation" aria-label={`Чат: ${chat.title}`}>
      <header className="conversation-header">
        <button className="icon-button mobile-back" onClick={onBack} aria-label="К списку чатов">
          <ArrowLeft size={22} />
        </button>
        <Avatar title={chat.title} />
        <div>
          <h2>{chat.title}</h2>
          <p>{chat.phone && !chat.title.startsWith('+') ? `+${chat.phone} · ` : ''}MAX</p>
        </div>
      </header>
      <div
        className="message-area"
        role="log"
        aria-label="Сообщения"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {chat.messages.length === 0 && (
          <div className="conversation-empty">
            <span>Начало переписки</span>
            <p>Напишите первое сообщение.</p>
          </div>
        )}
        {chat.messages.map((message) => {
          const day = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(
            message.timestamp,
          );
          const showDay = previousDay !== day;
          previousDay = day;
          return (
            <div className="message-group" key={message.id}>
              {showDay && <div className="day-divider">{day}</div>}
              <article
                className={`message message--${message.direction} ${message.status === 'failed' ? 'message--failed' : ''}`}
                aria-label={message.direction === 'out' ? 'Вы' : chat.title}
              >
                <p>{message.text}</p>
                <footer>
                  <time dateTime={new Date(message.timestamp).toISOString()}>
                    {formatTime(message.timestamp)}
                  </time>
                  {message.direction === 'out' && <Status status={message.status ?? 'sent'} />}
                </footer>
              </article>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <div className="compose-area">
        {error && (
          <p className="error-notice" role="alert">
            {error}
          </p>
        )}
        <form className="composer" onSubmit={submit}>
          <textarea
            aria-label="Сообщение"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Написать сообщение…"
            rows={2}
            maxLength={4000}
            disabled={sending}
          />
          <button
            type="submit"
            className="send-button"
            aria-label="Отправить сообщение"
            disabled={sending || !draft.trim()}
          >
            <Send size={21} />
          </button>
        </form>
        <div className="compose-caption">
          <span>Enter — отправить · Shift + Enter — новая строка</span>
          <span>{draft.length} / 4000</span>
        </div>
      </div>
    </section>
  );
}

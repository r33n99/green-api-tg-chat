import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  MessageCircle,
  Send,
} from 'lucide-react';
import { GreenApi, validateCredentials } from '../api/greenApi';
import type { ChatApi } from '../types';
import './Login.scss';

export function Login({
  onConnect,
  onDemo,
}: {
  onConnect: (api: ChatApi, notices: string[]) => void;
  onDemo: () => void;
}) {
  const [id, setId] = useState('');
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('https://4100.api.green-api.com');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const controller = new AbortController();
    pending.current = controller;
    try {
      const api = new GreenApi(
        validateCredentials({ idInstance: id, apiTokenInstance: token, apiUrl: url }),
      );
      setBusy(true);
      const notices = await api.connect(controller.signal);
      if (!controller.signal.aborted) onConnect(api, notices);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : 'Не удалось подключиться.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <header className="login-header">
        <Brand />
        <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">
          Личный кабинет <ExternalLink size={15} />
        </a>
      </header>
      <div className="login-layout">
        <section className="login-intro" aria-labelledby="login-title">
          <span className="intro-label">GREEN-API / Telegram</span>
          <h1 id="login-title">Чат Telegram</h1>
          <p>Подключите инстанс, чтобы отправлять и получать текстовые сообщения.</p>
          <div className="connection-diagram" aria-hidden="true">
            <span className="diagram-app">
              <MessageCircle size={30} />
            </span>
            <span className="diagram-line" />
            <span className="diagram-api">API</span>
            <span className="diagram-line" />
            <span className="diagram-telegram">
              <Send size={30} />
            </span>
          </div>
          <div className="intro-note">
            <KeyRound size={18} />
            <span>Ключи хранятся только в памяти вкладки и удаляются при выходе.</span>
          </div>
        </section>
        <section className="login-panel" aria-labelledby="form-title">
          <h2 id="form-title">Подключение аккаунта</h2>
          <p className="form-description">
            Данные инстанса Telegram из личного кабинета GREEN-API.
          </p>
          <form onSubmit={submit}>
            <label htmlFor="instance">idInstance</label>
            <input
              id="instance"
              value={id}
              onChange={(e) => setId(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Например, 4100000001"
              required
              disabled={busy}
            />
            <label htmlFor="token">apiTokenInstance</label>
            <div className="password-field">
              <input
                id="token"
                type={visible ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Ключ доступа"
                required
                disabled={busy}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={visible ? 'Скрыть ключ' : 'Показать ключ'}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            <label htmlFor="api-url">apiUrl</label>
            <input
              id="api-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              disabled={busy}
              aria-describedby="api-help"
            />
            <small id="api-help">Скопируйте адрес сервера вашего инстанса.</small>
            {error && (
              <div className="error-notice" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button connect-button" disabled={busy} type="submit">
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={19} /> Подключаемся…
                </>
              ) : (
                <>
                  Подключиться <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <div className="demo-entry">
            <span>Хотите сначала посмотреть?</span>
            <button className="text-button" type="button" onClick={onDemo} disabled={busy}>
              Открыть демоверсию <ArrowRight size={15} />
            </button>
          </div>
        </section>
      </div>
      <footer className="login-footer">
        <span>Текстовый чат Telegram</span>
        <a href="https://green-api.com/telegram/docs/" target="_blank" rel="noreferrer">
          Документация GREEN-API <ExternalLink size={13} />
        </a>
      </footer>
    </main>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Send size={23} />
      </span>
      <span>
        Telegram<span className="brand-divider">/</span>
        <span className="brand-chat">Чат</span>
      </span>
    </div>
  );
}

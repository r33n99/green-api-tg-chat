import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  ExternalLink,
  LockKeyhole,
  LoaderCircle,
  Send,
} from 'lucide-react';
import { GreenApi, validateCredentials } from '../api/greenApi';
import type { ChatApi } from '../types';
import { readConnection, saveConnection } from '../storage';
import './Login.scss';

export function Login({
  onConnect,
  onDemo,
}: {
  onConnect: (api: ChatApi, notices: string[]) => void;
  onDemo: () => void;
}) {
  const [saved] = useState(readConnection);
  const [id, setId] = useState(saved.idInstance);
  const [token, setToken] = useState(saved.apiTokenInstance);
  const [url, setUrl] = useState(saved.apiUrl);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setStorageError(!saveConnection({ idInstance: id, apiTokenInstance: token, apiUrl: url }));
  }, [id, token, url]);
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
        <section className="login-panel" aria-labelledby="form-title">
          <div className="login-channel">
            <Send size={17} /> Telegram
          </div>
          <h1 id="form-title">Подключение инстанса</h1>
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
            {(error || storageError) && (
              <div className="error-notice" role="alert">
                {error || 'Браузер не позволяет сохранить данные после перезагрузки.'}
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
            <button className="text-button" type="button" onClick={onDemo} disabled={busy}>
              Открыть демоверсию <ArrowRight size={15} />
            </button>
          </div>
        </section>
        <p className="login-privacy">
          <LockKeyhole size={14} /> Данные сохраняются в этой вкладке. Выход очищает их.
        </p>
      </div>
      <footer className="login-footer">
        <span>Telegram · GREEN-API</span>
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
      <img className="brand-logo" src="./green-api.svg" alt="GREEN-API" />
      <span className="brand-channel">Telegram</span>
    </div>
  );
}

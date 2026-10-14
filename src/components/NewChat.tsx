import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import './NewChat.scss';
export function NewChat({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (phone: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      mounted.current = false;
      dialog.current?.close();
    };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onCreate(phone);
      if (mounted.current) onClose();
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Не удалось создать чат.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <dialog
      className="new-chat"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="new-title"
    >
      <header>
        <h2 id="new-title">Новый чат</h2>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
      </header>
      <form onSubmit={submit}>
        <label htmlFor="phone">Номер телефона</label>
        <input
          autoFocus
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+7 999 123-45-67"
          disabled={busy}
          required
          aria-describedby="phone-help"
        />
        <small id="phone-help">Номер MAX с кодом страны +7 или +375.</small>
        {error && (
          <p className="error-notice" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy && <LoaderCircle size={17} className="spin" />}
          {busy ? 'Ищем аккаунт…' : 'Открыть чат'}
        </button>
      </form>
    </dialog>
  );
}

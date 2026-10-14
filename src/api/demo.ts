import type { ChatApi, Notification, Chat } from '../types';
import { delay } from './poll';
export function demoChats(): Chat[] {
  const now = Date.now();
  return [
    {
      id: 'demo-alex',
      title: 'Александр',
      phone: '79990000001',
      unread: 0,
      messages: [
        {
          id: 'd1',
          chatId: 'demo-alex',
          direction: 'in',
          text: 'Привет! Получилось подключить чат?',
          timestamp: now - 240000,
        },
        {
          id: 'd2',
          chatId: 'demo-alex',
          direction: 'out',
          text: 'Привет! Да, всё готово. Проверяю сообщения.',
          timestamp: now - 180000,
          status: 'read',
        },
        {
          id: 'd3',
          chatId: 'demo-alex',
          direction: 'in',
          text: 'Отлично, сообщения приходят 👍',
          timestamp: now - 60000,
        },
      ],
    },
    {
      id: 'demo-maria',
      title: 'Мария',
      phone: '79990000002',
      unread: 1,
      messages: [
        {
          id: 'd4',
          chatId: 'demo-maria',
          direction: 'in',
          text: 'Напиши, когда будешь на связи.',
          timestamp: now - 3600000,
        },
      ],
    },
  ];
}
export class DemoApi implements ChatApi {
  private events: Notification[] = [];
  private lastReceipt = 1;
  private count = 0;
  async connect() {
    return [];
  }
  async resolvePhone(phone: string) {
    return `demo-${phone}`;
  }
  async send(chatId: string, _message: string) {
    const id = `demo-${crypto.randomUUID()}`;
    this.count++;
    this.events.push({
      receiptId: this.lastReceipt++,
      body: { typeWebhook: 'outgoingMessageStatus', idMessage: id, status: 'delivered' },
    });
    this.events.push({
      receiptId: this.lastReceipt++,
      body: {
        typeWebhook: 'incomingMessageReceived',
        idMessage: crypto.randomUUID(),
        timestamp: Date.now() / 1000 + 1,
        senderData: { chatId },
        messageData: {
          typeMessage: 'textMessage',
          textMessageData: {
            textMessage:
              this.count === 1
                ? 'Сообщение получено! Это автоматический ответ в деморежиме.'
                : 'Вижу твоё сообщение 🙂',
          },
        },
      },
    });
    return id;
  }
  async receive(signal: AbortSignal) {
    await delay(1100, signal);
    return this.events[0] ?? null;
  }
  async acknowledge(receipt: number) {
    this.events = this.events.filter((n) => n.receiptId !== receipt);
  }
}

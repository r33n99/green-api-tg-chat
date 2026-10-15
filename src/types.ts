export interface Credentials {
  idInstance: string;
  apiTokenInstance: string;
  apiUrl: string;
}
export type Delivery = 'sending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export interface Message {
  id: string;
  chatId: string;
  text: string;
  timestamp: number;
  direction: 'in' | 'out';
  status?: Delivery;
  deliveryError?: string;
}
export interface Chat {
  id: string;
  title: string;
  phone?: string;
  recipient?: string;
  unread: number;
  messages: Message[];
}
export interface NotificationBody {
  typeWebhook: string;
  idMessage?: string;
  timestamp?: number;
  chatId?: string;
  status?: string;
  description?: string;
  senderData?: {
    chatId: string;
    chatType?: string;
    chatName?: string;
    senderName?: string;
    senderPhoneNumber?: number;
  };
  messageData?: {
    typeMessage: string;
    textMessageData?: { textMessage: string };
    extendedTextMessageData?: { text: string };
  };
}
export interface Notification {
  receiptId: number;
  body: NotificationBody;
}
export interface ChatApi {
  readonly credentials?: Credentials;
  connect(signal?: AbortSignal): Promise<string[]>;
  resolveRecipient(recipient: string, signal?: AbortSignal): Promise<string>;
  send(chatId: string, message: string, signal?: AbortSignal): Promise<string>;
  deliveryStatuses?(minutes: number, signal: AbortSignal): Promise<NotificationBody[]>;
  receive(signal: AbortSignal): Promise<Notification | null>;
  acknowledge(receiptId: number, signal: AbortSignal): Promise<void>;
}

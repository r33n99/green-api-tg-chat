# Проверка

## Автоматические проверки

- TypeScript strict и production-сборка Vite.
- 15 тестов Vitest: формат номеров MAX; ограничение хостов для передачи токена; проверка авторизации и типа инстанса; предупреждения о настройках; получение chatId по номеру; точные payload отправки; long polling и DELETE подтверждения; ошибки API; предел текста; порядок обработки очереди и повтор после ошибки подтверждения; дедупликация; непрочитанное; статусы не по порядку; текст со ссылкой; гонка ответа sendMessage и исходящего уведомления.
- Русские глифы Segoe UI проверены по файлу шрифта через Windows GlyphTypeface.

## Проверка в браузере

Деморежим использует тот же reducer, polling и экран переписки, но отдельный транспорт без сети. Проверены экран подключения, список переписок, отправка по Enter, входящий ответ, статус доставки, создание чата, ошибка номера, поиск и выход. Внешний вид проверен на большом экране и при ширине 390 px.

Исправлены найденные при проверке ошибка возврата из эффекта прокрутки и порядок подключения общих стилей.

## Реальный аккаунт

Ключей GREEN-API в задаче нет. Реальный обмен сообщениями с MAX не проверен. Для приёмки: авторизованный инстанс MAX → включить incomingWebhook и очистить webhookUrl → войти со своим apiUrl → создать чат по доступному номеру → отправить сообщение → ответить с телефона → увидеть ответ → выйти и убедиться, что переписка очищена.

Контракты проверены по официальным источникам:

- https://green-api.com/v3/docs/request-format/
- https://green-api.com/v3/docs/api/service/CheckAccount/
- https://green-api.com/v3/docs/api/sending/SendMessage/
- https://green-api.com/v3/docs/api/receiving/technology-http-api/ReceiveNotification/
- https://green-api.com/v3/docs/api/receiving/technology-http-api/DeleteNotification/
- https://green-api.com/v3/docs/api/receiving/notifications-format/incoming-message/TextMessage/

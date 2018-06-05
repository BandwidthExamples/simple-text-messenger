## Routes

Call `GET` `/profile` to get user's data. If user is not authorized you will receive `null`. Otherwise you will receive json like `{phoneNumber: '', servicePhoneNumber: '', sessionId: ''}`

Use `POST` `/login` with json `{"phoneNumber": "+1XXXXXX"}` to athentificate user. As result you will receive `{"sessionid": "xxxxxx", "servicePhoneNumber": "+1YYYYYY"}`. You should save this session id to have ability to listen to messages via SSE (at least).
If you pass as payload `userId`, `apiToken` and `apiSecret` user's bandwidth auth data will be used.

Use `EventSource` on client side js to strats to listen to messages events like

```js
var source = new EventSource('/messages/events?sessionId=<session-id-after-login>');
source.addEventListener('message', function(e) {
	// you will receive notifications about sent and received messages, also on delivery status changes
	console.log(JSON.parse(e.data));
});
```

Now user can send SMS to `servicePhoneNumber`. You should receive a notification on user's message.

Use `POST` `/messages` with `{"text": "Some message"}` to send messages to user number from `servicePhoneNumber`.

Use `GET` `/messages` to get all messages for this session.

Use field `media` with url to media files to send MMS. To upload one or several files use `POST` `/media` with multipart form. As result you will receive `{"urls": [...]}`. Use these urls with `media`.

`GET` `/media/{name}` will allow to get access to uploaded resources (useful to display images in chat window)

All pathes `/media` and `/messages` require to pass session data via cookie (it will be set after `POST` to `/login`) or via query parameter `sessionId`.

This app automatically creates (or reuse existing) application with name `SimpleTextMessenger` with right callback url and reserves (or reuses) one phone number for sending messages.

# simple-text-messenger

[![Build Status](https://travis-ci.org/BandwidthExamples/simple-text-messenger.svg?branch=master)](https://travis-ci.org/BandwidthExamples/simple-text-messenger)

## Prerequisites
- Configured Machine with Ngrok/Port Forwarding -OR- Azure Account
  - [Ngrok](https://ngrok.com/)
- [Bandwidth Account](https://catapult.inetwork.com/pages/signup.jsf/?utm_medium=social&utm_source=github&utm_campaign=dtolb&utm_content=_)
- [NodeJS 8+](https://nodejs.org/en/)
- [Git](https://git-scm.com/)

## Build and Deploy

### One Click Deploy

#### Settings Required To Run
* ```Bandwidth User Id```
* ```Bandwidth Api Token```
* ```Bandwidth Api Secret```

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Quick install on VPS

`docker` and `docker-compose` should be preinstalled on your VPS. Don't use VPS based on OpenVZ (to avoid troubles with docker).

### Configure receiving of SSL certificates (via Lets Encrypt)

* Install `curl`, `openssl` and `socat`

* Install `acme.sh` by

```bash
curl https://get.acme.sh | sh
```

* Log out an log in again

* Receive SSL certificate files for your domain

```bash
acme.sh --standalone --issue -d YOUR_DOMAIN
```

### Runing the app

* Create a directory for the app settings (for example `/var/simple-text-messenger`) and open it in the terminal

* Install SSL certificates to `./certs` (make links to existing files)

```bash
mkdir ./certs && acme.sh --install-cert -d YOUR_DOMAIN --key-file ./certs/key.pem --fullchain-file ./certs/cert.pem --reloadcmd  "cd /var/simple-text-messenger && docker-compose restart" # ignore any errors related to missing docker-compose file for now
```

After that `acme.sh` will renew certificates and restart the application itself


* Download `docker-compose.yml`

```bash
curl https://raw.githubusercontent.com/BandwidthExamples/simple-text-messenger/master/docker-compose.http2.yml -o docker-compose.yml
```

* Run the app

```bash
docker-compose up -d
```

* Open in firewall ports 80 and 443.

## Install

Extract sources

```bash
git clone https://github.com/BandwidthExamples/simple-text-messenger.git
cd simple-text-messenger
```

### Using Docker

Run `PORT=8080 docker-compose up -d`. After that the app will be available on port 8080.

If you need to use SSL certificates make subdirectory `certs` and copy your certificate files there: cert.pem (with full chain) and key.pem. Use `docker-compose.https.yml` to start the app. Fo http/2 support use `docker-compose.http2.yml`.

### Manual

#### Prepare the application

```bash
# Install dependencies
yarn install

```

#### Start Redis instance

Install and start `redis`.
Set environment variable `REDIS_URL` to `redis://REDIS_USER_NAME:REDIS_PASSWORD@REDIS_HOST`

#### Start the app

```bash
PORT=8080 yarn start

# if you would like to see more detailed log output run as
PORT=8080 LOG_LEVEL=debug yarn start
```

## Routes

Call `GET` `/profile` to get user's data. If user is not authorized the result will be `null`. Otherwise the result will be json like `{phoneNumber: '', servicePhoneNumber: '', sessionId: ''}`

Use `POST` `/login` with json `{"phoneNumber": "+1XXXXXX"}` to athentificate user. the result is json like `{"sessionid": "xxxxxx", "servicePhoneNumber": "+1YYYYYY"}`. Save this session id to have ability to listen to messages via SSE (at least).
If you pass as payload `userId`, `apiToken` and `apiSecret` user's bandwidth auth data will be used insteradof defined on the server.

Use `EventSource` on client side  to listen to messages events like

```js
var source = new EventSource('/messages/events?sessionId=<session-id-after-login>');
source.addEventListener('message', function(e) {
	// you will receive notifications about sent and received messages, also on delivery status changes
	console.log(JSON.parse(e.data));
});
```

Now user can send SMS to `servicePhoneNumber`. You should receive a notification on user's message.

Use `POST` `/messages` with `{"text": "Some message"}` to send messages to user number from `servicePhoneNumber` to `phoneNumber`.

Use `GET` `/messages` to get all messages for this session.

Use field `media` with url to media files to send MMS. To upload one or several files use `POST` `/media` with multipart form. The result is  json like `{"urls": [...]}`. Use these urls with `media`.

`GET` `/media/{name}` will allow to get access to uploaded resources (useful to display images in chat window)

All pathes `/media` and `/messages` require to pass session data via cookie (it will be set after `POST` to `/login`) or via query parameter `sessionId`.

The app automatically creates (or reuse existing) application with name `SimpleTextMessenger` on Bandwidth server with right callback url and reserves (or reuses) one phone number for sending messages.


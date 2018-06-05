const path = require('path');
const uuidv1 = require('uuid/v1');
const Bandwidth = require('node-bandwidth');
const Redis = require('ioredis');
const streamToPromise = require('stream-to-promise');
const {application, phoneNumber} = require('@bandwidth/node-bandwidth-extra');

function getBandwidthApi(request) {
	const user = request.user || {};
	return new Bandwidth({
		userId: user.userId || process.env.BANDWIDTH_USER_ID,
		apiToken: user.apiToken || process.env.BANDWIDTH_API_TOKEN,
		apiSecret: user.apiSecret || process.env.BANDWIDTH_API_SECRET
	});
}

async function getUser(redis, request) {
	const sessionId = request.cookies.sessionId || request.query.sessionId;
	const json = await redis.get(`session:${sessionId}`);
	if (json) {
		return JSON.parse(json);
	}
}

function getUserId(user){
	return user.userId || process.env.BANDWIDTH_USER_ID;
}

function convertMediaUrls(message){
	message.media = (message.media || []).map(url => {
		const list = (url || '').split('/');
		return `/media/${list[list.length - 1]}`;
	});
}

async function getApplicationIdAndServicePhoneNumber(request, user) {
	request.user = user;
	const api = getBandwidthApi(request);
	const applicationId = await application.getOrCreateApplication(api, {
		name: 'SimpleTextMessenger',
		incomingMessageUrl: `https://${request.headers.host}/bandwidth/callback/${getUserId(user)}`,
		incomingCallUrl: ''
	}, request.headers.host);
	request.log.debug(`Application id is ${applicationId}`);
	const servicePhoneNumber = await phoneNumber.getOrCreatePhoneNumber(api, applicationId,
		{name: 'Service number', areaCode: user.areaCode || process.env.AREA_CODE || '910'});
	request.log.debug(`Service phone number is ${servicePhoneNumber}`);
	return {applicationId, servicePhoneNumber};
}

async function routes(fastify) {
	async function authRequired(request, reply) {
		const {redis} = fastify;
		const user = await getUser(redis, request);
		if (user) {
			request.user = user;
			return;
		}
		reply.code(401).send('Authentification is required');
	}

	fastify.decorateRequest('user', null);

	const getProfileSchema = {
		response: {
			200: {
				type: 'object',
				properties: {
					phoneNumber: {type: 'string'},
					servicePhoneNumber: {type: 'string'},
					userId: {type: 'string'},
					apiToken: {type: 'string'},
					apiSecret: {type: 'string'},
					areaCode: {type: 'string'}
				}
			}
		}
	};
	fastify.get('/profile', {schema: getProfileSchema}, async request => {
		const {redis} = fastify;
		const user = await getUser(redis, request);
		if (user) {
			return {
				sessionId: {type: 'string'},
				phoneNumber: user.phoneNumber,
				servicePhoneNumber: user.servicePhoneNumber
			};
		}
		return null;
	});

	const loginSchema = {
		body: {
			type: 'object',
			properties: {
				phoneNumber: {type: 'string'},
				userId: {type: 'string'},
				apiToken: {type: 'string'},
				apiSecret: {type: 'string'},
				areaCode: {type: 'string'}
			},
			required: ['phoneNumber']
		},
		response: {
			200: {
				type: 'object',
				properties: {
					sessionId: {type: 'string'}
				}
			}
		}
	};

	fastify.post('/login', {schema: loginSchema}, async (request, reply) => {
		const {redis} = fastify;
		const {body} = request;
		const user = Object.assign(body, await getApplicationIdAndServicePhoneNumber(request, body), {time: Date.now()});
		const sessionId = uuidv1();
		user.sessionId = sessionId;
		await redis.set(`session:${sessionId}`, JSON.stringify(user));
		reply.setCookie('sessionId', sessionId, {
			domain: request.headers.host,
			path: '/'
		});
		return user;
	});

	const getMessagesSchema = {
		response: {
			200: {
				type: 'object',
				properties: {
					id: {type: 'string'},
					from: {type: 'string'},
					to: {type: 'string'},
					text: {type: 'string'},
					media: {type: 'array', items: {type: 'string'}},
					direction: {type: 'string'},
					time: {type: 'string'},
					receiptRequested: {type: 'string'},
					deliveryState: {type: 'string'},
					deliveryCode: {type: 'string'}
				}
			}
		}
	};
	fastify.get('/messages', {beforeHandler: authRequired, schema: getMessagesSchema}, async request => {
		const api = getBandwidthApi(request);
		const {user} = request;
		const getMessages = async (from, to) => {
			const messages = await api.Message.list({size: 1000, from, to, fromDateTime: user.time});
			return messages.messages;
		};
		const messages = [].concat(await getMessages(user.phoneNumber, user.servicePhoneNumber), await getMessages(user.servicePhoneNumber, user.phoneNumber));
		messages.sort((m1, m2) => m1.time.localeCompare(m2.time));
		messages.forEach(m => convertMediaUrls(m));
		return messages;
	});

	const postMessagesSchema = {
		body: {
			type: 'object',
			properties: {
				text: {type: 'string'},
				media: {type: 'array', items: {type: 'string'}}
			},
			required: ['text']
		},
		response: {
			200: {
				type: 'object',
				properties: {
					id: {type: 'string'}
				}
			}
		}
	};
	fastify.post('/messages', {beforeHandler: authRequired, schema: postMessagesSchema}, async request => {
		const api = getBandwidthApi(request);
		const {body, user} = request;
		body.from = user.servicePhoneNumber;
		body.to = user.phoneNumber;
		request.log.debug(`Send message: ${JSON.stringify(body)}`);
		const {id} = await api.Message.send(body);
		return {id};
	});

	fastify.get('/media/:name', {beforeHandler: authRequired}, async (request, reply) => {
		try {
			const api = getBandwidthApi(request);
			const {contentType, content} = await api.Media.download(request.params.name);
			reply.type(contentType);
			return content;
		} catch (err) {
			request.log.error(`Error on downloading file ${request.params.name}: ${err.message}`);
			reply.code(404).send('Not found');
		}
	});

	const postMediaSchema = {
		response: {
			200: {
				type: 'object',
				properties: {
					urls: {type: 'array', items: {type: 'string'}}
				}
			}
		}
	};
	fastify.post('/media', {beforeHandler: authRequired, schema: postMediaSchema}, async request => {
		const api = getBandwidthApi(request);
		const promises = [];
		const {user} = request;
		await streamToPromise(request.multipart((field, file, filename, encoding, mimetype) => {
			const name = `attachment-${uuidv1()}${path.extname(filename)}`;
			promises.push(api.Media.upload(name, file, mimetype).then(() => `https://api.catapult.inetwork.com/v1/users/${getUserId(user)}/media/${name}`));
		}, () => {}));
		return {urls: await Promise.all(promises)};
	});

	const getEventsSchema = {
		querystring: {
			type: 'object',
			properties: {
				sessionId: {type: 'string'}
			},
			required: ['sessionId']
		}
	};
	fastify.get('/messages/events', {beforeHandler: authRequired, schema: getEventsSchema}, (request, reply) => {
		const redis = new Redis(fastify.redisUrl);
		const {user} = request;
		reply.sse('start', {event: 'start'}); // To avoid connection issue.
		redis.subscribe(`message:${getUserId(user)}:${user.applicationId}:${user.phoneNumber}:${user.servicePhoneNumber}`, `message:${getUserId(user)}:${user.applicationId}:${user.servicePhoneNumber}:${user.phoneNumber}`);
		redis.on('message', (channel, message) => {
			reply.sse(message, {event: 'message'});
		});
		request.raw.on('close', () => {
			redis.disconnect(false);
		});
	});

	const callbackSchema = {
		body: {
			type: 'object',
			properties: {
				eventType: {type: 'string'},
				direction: {type: 'string'},
				from: {type: 'string'},
				to: {type: 'string'},
				messageId: {type: 'string'},
				text: {type: 'string'},
				media: {type: 'array', items: {type: 'string'}},
				applicationId: {type: 'string'},
				time: {type: 'string'},
				state: {type: 'string'},
				deliveryState: {type: 'string'},
				deliveryCode: {type: 'string'},
				deliveryDescription: {type: 'string'}
			}
		}
	};
	fastify.post('/bandwidth/callback/:userId', {schema: callbackSchema}, async request => {
		const {body} = request;
		const {redis} = fastify;
		if (body.eventType === 'sms' || body.eventType === 'mms') {
			request.log.info(`Received event ${body.eventType}`);
			body.id = body.messageId;
			convertMediaUrls(body);
			const json = JSON.stringify(body);
			request.log.debug(json);
			await redis.publish(`message:${request.params.userId}:${body.applicationId}:${body.from}:${body.to}`, json);
		}
		return '';
	});
}

module.exports = routes;

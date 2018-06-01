const uuidv5 = require('uuid/v5');
const Bandwidth = require('node-bandwidth');
const Redis = require('ioredis');
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

async function getApplicationIdAndServicePhoneNumber(request, user) {
	request.user = user;
	const api = getBandwidthApi(request);
	const applicationId = await application.getOrCreateApplication(api, {
		name: 'SimpleTextMessenger',
		incomingMessageUrl: `https://${request.headers.host}/bandwidth/callback/${user.userId || process.env.BANDWIDTH_USER_ID}`,
		incomingCallUrl: ''
	}, request.headers.host);
	const servicePhoneNumber = await phoneNumber.getOrCreatePhoneNumber(api, applicationId, {name: 'Service number', areaCode: process.env.AREA_CODE || '910'});
	return {applicationId, servicePhoneNumber};
}

async function routes(fastify) {
	async function authRequired(request, reply) {
		const {redis} = fastify;
		const user = getUser(redis, request);
		if (user) {
			request.user = user;
			return;
		}
		reply.status(401).send('Authentification is required');
	}

	fastify.decorateRequest('user', null);

	fastify.get('/profile', async request => {
		const {redis} = fastify;
		const user = getUser(redis, request);
		if (user) {
			return {
				phoneNumber: user.phoneNumber,
				servicePhoneNumber: user.servicePhoneNumber
			};
		}
		return null;
	});

	fastify.post('/login', async request => {
		const {redis} = fastify;
		const {body} = request;
		const user = Object.assign(body, await getApplicationIdAndServicePhoneNumber(request, body), {time: Date.now()});
		const sessionId = uuidv5(request.url, uuidv5.URL);
		await redis.set(`session:${sessionId}`, JSON.stringify(user));
		return {sessionId};
	});

	fastify.get('/messages', {beforeHandler: authRequired}, async request => {
		const api = getBandwidthApi(request);
		const {user} = request;
		const getMessages = async (from, to) => {
			const messages = await api.Message.list({size: 1000, from, to, fromDateTime: user.time});
			return messages.messages;
		};
		const messages = [].concat(await getMessages(user.phoneNumber, user.servicePhoneNumber), await getMessages(user.servicePhoneNumber, user.phoneNumber));
		messages.sort((m1, m2) => m1.time.localeCompare(m2.time));
		return messages;
	});

	fastify.post('/messages', {beforeHandler: authRequired}, async request => {
		const api = getBandwidthApi(request);
		//TODO add validator
		const {id} = await api.Message.send(request.body);
		return {id};
	});

	fastify.get('/messages/events', {beforeHandler: authRequired}, async (request, reply) => {
		const redis = new Redis({
			host: process.env.REDIS_HOST || 'localhost',
			port: Number(process.env.REDIS_PORT) || 6379
		});
		const {user} = request;
		await redis.subscribe(`message:${user.userId}:${user.applicationId}:${user.phoneNumber}:${user.servicePhoneNumber}`, `message:${user.userId}:${user.applicationId}:${user.servicePhoneNumber}:${user.phoneNumber}`);
		reply.sse({});
		redis.on('message', (channel, message) => {
			reply.sse({event: 'message', data: message});
		});
		request.on('close', () => {
			redis.close();
		});
	});

	fastify.post('/bandwidth/callback/:userId', async request => {
		const {body} = request;
		const {redis} = fastify;
		if (body.eventType === 'sms' || body.eventType === 'mms') {
			request.log.info(`Received event ${body.eventType}`);
			const json = JSON.stringify(body);
			request.log.debug(json);
			await redis.publish(`message:${request.params.userId}:${body.applicationId}:${body.from}:${body.to}`, json);
		}
		return '';
	});
}
// TODO add routes t upload/get media files (for MMS)
module.exports = routes;

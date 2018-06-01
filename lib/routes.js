const uuidv5 = require('uuid/v5');
// Const {application, phoneNumber} = require("@bandwidth/node-bandwidth-extra");

async function getUser(redis, request) {
	const sessionId = request.cookies.sessionId || request.query.sessionId;
	const json = await redis.get(`session:${sessionId}`);
	if (json){
		return JSON.parse(json);
	}
}

async function routes(fastify){

	async function authRequired(request, reply){
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
		body.time = Date.now();
		const sessionId = uuidv5(request.url, uuidv5.URL);
		await redis.set(`session:${sessionId}`, JSON.stringify(body));
		return {};
	});

	fastify.get('/messages', {beforeHandler: authRequired}, async () => {
		return {};
	});

	fastify.post('/messages', {beforeHandler: authRequired}, async () => {
		return {};
	});

	fastify.get('/messages/events', {beforeHandler: authRequired}, async (request, reply) => {
		const {redis} = fastify;
		const {user} = request;
		await redis.subscribe(`message:${user.userId}:${user.applicationId}:${user.phoneNumber}:${user.servicePhoneNumber}`, `message:${user.userId}:${user.applicationId}:${user.servicePhoneNumber}:${user.phoneNumber}`);
		reply.sse({});
		redis.on('message', (channel, message) => {
			reply.sse({event: 'message', data: message});
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

module.exports = routes;

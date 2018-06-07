const test = require('ava');
const nock = require('nock');
const td = require('testdouble');
const fastify = require('fastify');
const randomString = require('randomstring');
const Redis = require('ioredis');
const streamFromPromise = require('stream-from-promise');
const {application, phoneNumber} = require('@bandwidth/node-bandwidth-extra');
const routes = require('../lib/routes');

td.replace(application, 'getOrCreateApplication');
td.replace(phoneNumber, 'getOrCreatePhoneNumber');
td.replace(randomString, 'generate');
td.replace(Redis.prototype, 'connect', () => Promise.resolve());
td.replace(Redis.prototype, 'sendCommand', () => Promise.resolve());

console.log = () => {};
process.env.BANDWIDTH_USER_ID = 'userId';
process.env.BANDWIDTH_API_TOKEN = 'token';
process.env.BANDWIDTH_API_SECRET = 'secret';

nock.disableNetConnect();

td.when(randomString.generate(td.matchers.anything())).thenReturn('000');

test('routes() should be function', t => {
	t.true(typeof routes === 'function');
});

test('routes() should define routes', async t => {
	let count = 0;
	const app = {
		get: () => count++,
		post: () => count++,
		decorateRequest: () => {}
	};
	await routes(app);
	t.is(count, 8);
});

async function getRoute(method, path, redis) {
	const app = fastify();
	let result = null;
	app.route = a => {
		if (a.method === method && a.url === path) {
			result = a;
		}
	};
	await routes(app);
	app.redis = redis;
	return result;
}

function createRequest(data) {
	return Object.assign({
		headers: {
			host: 'localhost'
		},
		cookies: {},
		query: {},
		log: {
			info: () => {},
			error: () => {},
			warn: () => {},
			debug: () => {}
		}
	}, data);
}

test(`POST /login should create new session`, async t => {
	const redis = {
		set: td.function()
	};
	td.when(application.getOrCreateApplication(td.matchers.anything(), td.matchers.contains({
		name: 'SimpleTextMessenger',
		incomingMessageUrl: `https://localhost/bandwidth/callback/userId`
	}), td.matchers.anything())).thenResolve('appId');
	td.when(phoneNumber.getOrCreatePhoneNumber(td.matchers.anything(), 'appId',
		td.matchers.contains({name: 'Service number', areaCode: '910'}))).thenResolve('+12345678900');

	const route = await getRoute('POST', '/login', redis);
	const request = createRequest({
		body: {
			phoneNumber: '+12345678901'
		}
	});
	const reply = {
		setCookie: td.function()
	};
	td.when(redis.set(td.matchers.contains(/^session:/, td.matchers.anything()))).thenResolve();
	const user = await route.handler(request, reply);
	td.verify(reply.setCookie('sessionId', td.matchers.anything(), td.matchers.contains({
		domain: 'localhost',
		path: '/'
	})));
	t.pass();
	t.is(user.applicationId, 'appId');
	t.is(user.phoneNumber, '+12345678901');
	t.is(user.servicePhoneNumber, '+12345678900');
});

test(`GET /profile should return null on unauthorized call`, async t => {
	const redis = {
		get: td.function()
	};
	const route = await getRoute('GET', '/profile', redis);
	const request = createRequest({});
	td.when(redis.get(td.matchers.contains(/^session:/))).thenResolve(undefined);
	const profile = await route.handler(request);
	t.true(profile === null);
});

test(`GET /profile should return session data`, async t => {
	const redis = {
		get: td.function()
	};
	const route = await getRoute('GET', '/profile', redis);
	const request = createRequest({});
	request.cookies.sessionId = 'sessionId';
	td.when(redis.get('session:sessionId')).thenResolve(JSON.stringify({
		sessionId: 'sessionId',
		phoneNumber: '+12345678900',
		servicePhoneNumber: '+12345678901'
	}));
	const profile = await route.handler(request);
	t.is(profile.phoneNumber, '+12345678900');
});

test(`GET /messages should return messages`, async t => {
	nock('https://api.catapult.inetwork.com')
		.get('/v1/users/userId/messages?size=1000&from=%2B12345678900&to=%2B12345678901&fromDateTime=2018-06-07%2008%3A36%3A55')
		.reply(200, [{time: '2018-06-07T08:36:55Z', media: ['https://host/media']}, {time: '2018-06-07T08:36:58Z'}])
		.get('/v1/users/userId/messages?size=1000&from=%2B12345678901&to=%2B12345678900&fromDateTime=2018-06-07%2008%3A36%3A55')
		.reply(200, [{time: '2018-06-07T08:36:57Z'}]);
	const route = await getRoute('GET', '/messages');
	const request = createRequest({
		user: {
			sessionId: 'sessionId',
			phoneNumber: '+12345678900',
			servicePhoneNumber: '+12345678901',
			time: '2018-06-07T08:36:55Z'
		}
	});
	const messages = await route.handler(request);
	t.is(messages.length, 3);
	t.is(messages[0].media[0], '/media/media');
});

test(`POST /messages should return messages`, async t => {
	nock('https://api.catapult.inetwork.com')
		.post('/v1/users/userId/messages', {from: '+12345678901', to: '+12345678900', text: 'Hello'})
		.reply(201, '', {location: 'https://host/messages/id'});
	const route = await getRoute('POST', '/messages');
	const request = createRequest({
		user: {
			sessionId: 'sessionId',
			phoneNumber: '+12345678900',
			servicePhoneNumber: '+12345678901',
			time: '2018-06-07T08:36:55Z'
		},
		body: {
			text: 'Hello'
		}
	});
	const {id} = await route.handler(request);
	t.is(id, 'id');
});

test(`GET /media/name should return media file content`, async t => {
	nock('https://api.catapult.inetwork.com')
		.get('/v1/users/userId/media/name')
		.reply(200, 'text', {'Context-Type': 'text/plain'});
	const route = await getRoute('GET', '/media/:name');
	const request = createRequest({
		params: {
			name: 'name'
		},
		user: {
			sessionId: 'sessionId',
			phoneNumber: '+12345678900',
			servicePhoneNumber: '+12345678901',
			time: '2018-06-07T08:36:55Z'
		}
	});
	const reply = {
		type: td.function()
	};
	td.when(reply.type('text/plain'));
	const content = await route.handler(request, reply);
	t.is(content, 'text');
});

test(`GET /media/name should return 404 on errors`, async t => {
	nock('https://api.catapult.inetwork.com')
		.get('/v1/users/userId/media/name')
		.reply(404);
	const route = await getRoute('GET', '/media/:name');
	const request = createRequest({
		params: {
			name: 'name'
		},
		user: {
			sessionId: 'sessionId',
			phoneNumber: '+12345678900',
			servicePhoneNumber: '+12345678901',
			time: '2018-06-07T08:36:55Z'
		}
	});
	const reply = {
		code: td.function()
	};
	td.when(reply.code(404)).thenReturn({send: () => {}});
	await route.handler(request, reply);
	t.pass();
});

test(`POST /media should upload media file`, async t => {
	nock('https://api.catapult.inetwork.com')
		.put('/v1/users/userId/media/attachment-000.txt')
		.reply(200);
	const route = await getRoute('POST', '/media');
	const request = createRequest({
		params: {
			name: 'name'
		},
		user: {
			sessionId: 'sessionId'
		},
		multipart(handler) {
			handler('file', Buffer.from('text', 'utf8'), 'file.txt', 'utf8', 'text/plain');
			return streamFromPromise(Promise.resolve());
		}
	});
	const reply = {
		type: td.function()
	};
	td.when(reply.type('text/plain'));
	const {urls} = await route.handler(request, reply);
	t.is(urls[0], 'https://api.catapult.inetwork.com/v1/users/userId/media/attachment-000.txt');
});

test(`GET /messages/events should start SSE session`, async t => {
	const route = await getRoute('GET', '/messages/events');
	const request = createRequest({
		user: {
			sessionId: 'sessionId',
			phoneNumber: '+12345678900',
			servicePhoneNumber: '+12345678901',
			time: '2018-06-07T08:36:55Z'
		},
		raw: {
			on: () => {}
		}
	});
	const reply = {
		sse: td.function()
	};
	td.when(reply.sse(td.matchers.anything(), td.matchers.anything()));
	await route.handler(request, reply);
	t.pass();
});

test(`POST /bandwidth/callback/userId should habdle Bandwidth callbacks`, async t => {
	const redis = {
		publish: td.function()
	};
	const route = await getRoute('POST', '/bandwidth/callback/:userId', redis);
	const request = createRequest({
		body: {
			eventType: 'sms',
			messageId: 'id',
			direction: 'in',
			applicationId: 'appId',
			from: '+12345678900',
			to: '+12345678901',
			text: 'Hello'
		},
		params: {
			userId: 'userId'
		}
	});
	const reply = {
		sse: td.function()
	};

	td.when(redis.publish(`message:userId:appId:+12345678900:+12345678901`, td.matchers.anything())).thenResolve();
	await route.handler(request, reply);
	t.pass();
});

test(`authRequired() should extract user data`, async t => {
	const redis = {
		get: td.function()
	};
	const route = await getRoute('POST', '/media', redis);
	const authRequired = route.beforeHandler;
	const request = createRequest({
		query: {
			sessionId: 'sessionId'
		}
	});
	const reply = {
	};
	td.when(redis.get(`session:sessionId`)).thenResolve('{}');
	await authRequired(request, reply);
	t.pass();
});

test(`authRequired() should return 401 if user is missing`, async t => {
	const redis = {
		get: td.function()
	};
	const route = await getRoute('POST', '/media', redis);
	const authRequired = route.beforeHandler;
	const request = createRequest({
		query: {
			sessionId: 'sessionId'
		}
	});
	const reply = {
		code: td.function()
	};
	td.when(redis.get(`session:sessionId`)).thenResolve(null);
	td.when(reply.code(401)).thenReturn({send: () => {}});
	await authRequired(request, reply);
	t.pass();
});

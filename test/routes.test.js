const test = require('ava');
const td = require('testdouble');
const fastify = require('fastify');
const {application, phoneNumber} = require('@bandwidth/node-bandwidth-extra');
const routes = require('../lib/routes');

td.replace(application, 'getOrCreateApplication');
td.replace(phoneNumber, 'getOrCreatePhoneNumber');

console.log = () => {};

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

async function getRoute(method, path, redis){
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
	process.env.BANDWIDTH_USER_ID = 'userId';
	process.env.BANDWIDTH_API_TOKEN = 'token';
	process.env.BANDWIDTH_API_SECRET = 'secret';
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

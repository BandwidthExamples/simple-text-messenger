const path = require('path');
const fastify = require('fastify');
const fastifyAutoPush = require('fastify-auto-push');
const fastifySSE = require('fastify-sse');
const fastifySecureSession = require('fastify-secure-session');
const fastifyRedis = require('fastify-redis');
const fastifyMultipart = require('fastify-multipart');
const routes = require('./routes');

async function main() {
	const app = fastify({
		logger: {
			level: 'debug'
		},
		prettyPrint: true
	});
	await app.cache.start();
	await app
		.register(fastifyAutoPush.staticServe, {root: path.join(__dirname, '..', 'static')})
		.register(fastifySSE)
		.register(fastifySecureSession, {
			secret: process.env.COOKIE_SECRET || '4zW8k46ce5PHBKGeaBNS34Nr_UAXXZhc',
			cookie: {secure: true, httpOnly: true}
		})
		.register(fastifyRedis, {
			host: process.env.REDIS_HOST || 'localhost',
			port: Number(process.env.REDIS_PORT) || 6379
		})
		.register(fastifyMultipart)
		.register(routes)
		.ready();
	console.log(app.printRoutes());
	return app;
}

module.exports = main;


const path = require('path');
const fastify = require('fastify');
const fastifyAutoPush = require('fastify-auto-push');
// const fastifySSE = require('fastify-sse');
const fastifyCookie = require('fastify-cookie');
const fastifyRedis = require('fastify-redis');
const fastifyMultipart = require('fastify-multipart');

require('dotenv').config();

const routes = require('./routes');

async function main() {
	const app = fastify({
		logger: {
			level: 'debug'
		},
		prettyPrint: true
	});
	await app
		.register(fastifyAutoPush.staticServe, {root: path.join(__dirname, '..', 'static')})
		// .register(fastifySSE)
		.register(fastifyCookie, {secure: true, httpOnly: true})
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


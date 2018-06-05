const path = require('path');
const fs = require('fs');
const util = require('util');
const fastify = require('fastify');
const fastifyAutoPush = require('fastify-auto-push');
const fastifySSE = require('fastify-sse');
const fastifyCookie = require('fastify-cookie');
const fastifyRedis = require('fastify-redis');
const fastifyMultipart = require('fastify-multipart');

const readFile = util.promisify(fs.readFile).bind(fs);

require('dotenv').config();

const routes = require('./routes');

async function main() {
	const options = {
		logger: {
			level: process.env.LOG_LEVEL || 'info'
		},
		prettyPrint: true
	};
	if (process.env.USE_HTTP2 === 'yes') {
		options.http2 = true;
		process.env.USE_HTTPS = 'yes';
	}
	if (process.env.USE_HTTPS === 'yes') {
		options.https = {
			key: await readFile(path.join(__dirname, '..', 'certs', 'key.pem')),
			cert: await readFile(path.join(__dirname, '..', 'certs', 'cert.pem'))
		};
	}
	const app = fastify(options);
	app.decorate('redisUrl', process.env.REDIS_URL || 'redis://localhost:6379');
	await app
		.register(fastifyAutoPush.staticServe, {root: path.join(__dirname, '..', 'static')})
		.register(fastifySSE)
		.register(fastifyCookie, {secure: true, httpOnly: true})
		.register(fastifyRedis, app.redisUrl)
		.register(fastifyMultipart)
		.register(routes)
		.ready();
	console.log(app.printRoutes());
	return app;
}

module.exports = main;


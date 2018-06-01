const fs = require('fs');
const path = require('path');
const fastify = require('fastify');
const fastifyAutoPush = require('fastify-auto-push');
const fastifySSE = require('fastify-sse');
const routes = require('./routes');

async function main(){
    const app = fastify({
        logger: {
          level: 'debug'
        },
        prettyPrint: true,
        //http2: true,
        /*https: {
          key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
          cert: fs.readFileSync(path.join(__dirname, 'cert', 'cert.pem'))
        }*/
      });
      
    await app
      .register(fastifyAutoPush.staticServe, {root: path.join(__dirname, '..', 'static')})
      .register(fastifySSE)
      .register(routes)
      .ready();
    console.log(app.printRoutes());
    return app;
}

module.exports = main;


const fs = require('fs');
const path = require('path');
const fastify = require('fastify');
const fastifyAutoPush = require('fastify-auto-push');
const fastifySSE = require('fastify-sse');
const routes = require('./routes');

function main(){
    const app = fastify({
        //http2: true,
        /*https: {
          key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
          cert: fs.readFileSync(path.join(__dirname, 'cert', 'cert.pem'))
        }*/
      });
      
    app.register(fastifyAutoPush.staticServe, {root: path.join(__dirname, '..', 'static')});
    app.register(fastifySSE);
    app.register(routes);
    return app;
}

module.exports = main;


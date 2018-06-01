async function routes (fastify) {
    fastify.get('/', async (request, reply) => {
      return 'Test';
    })
}

module.exports = routes;
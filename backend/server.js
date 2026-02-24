const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { Server } = require('socket.io');

const fastify = Fastify({ logger: true });

async function start() {
  await fastify.register(cors, {
    origin: '*', // Allow all origins for the development version
  });

  const io = new Server(fastify.server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  require('./sockets/boothSession')(io);

  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

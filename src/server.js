const fastify = require('fastify')({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
        levelFirst: true,
      },
    },
  },
});
const fastifyEnv = require('@fastify/env');
const fastifyCors = require('@fastify/cors');
const models = require('./models');
const authenticate = require('./middlewares/auth');
const { findOneAndUpdateUser } = require('./services/userService');
const playService = require('./services/playService');
const gameService = require('./services/gameService');

const schema = {
  type: 'object',
  required: [
    'PORT',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'MONGODB_URI',
    'APP_URL',
  ],
  properties: {
    PORT: { type: 'string', default: '3000' },
    SPOTIFY_CLIENT_ID: { type: 'string' },
    SPOTIFY_CLIENT_SECRET: { type: 'string' },
    MONGODB_URI: { type: 'string' },
    APP_URL: { type: 'string' },
  },
};

async function start() {
  await fastify.register(fastifyEnv, {
    confKey: 'config',
    schema,
    dotenv: true,
  });
  await fastify.register(require('./plugins/mongodb'));
  await fastify.register(require('@fastify/oauth2'), {
    name: 'spotifyOAuth2',
    credentials: {
      client: {
        id: fastify.config.SPOTIFY_CLIENT_ID,
        secret: fastify.config.SPOTIFY_CLIENT_SECRET,
      },
      auth: require('@fastify/oauth2').SPOTIFY_CONFIGURATION,
    },
    startRedirectPath: '/auth/login',
    callbackUri: `${fastify.config.APP_URL}/auth/callback`,
    scope: [
      'user-read-private',
      'user-read-recently-played',
      'user-top-read',
      'streaming',
      'user-read-email',
      'user-read-playback-state',
      'user-modify-playback-state',
    ],
  });

  await fastify.register(require('./plugins/spotify-proxy'));

  await fastify.register(fastifyCors, {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  fastify.decorate('authenticate', authenticate);

  fastify.get('/test-db', async () => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return {
      database: states[fastify.mongoose.connection.readyState] || 'unknown',
    };
  });

  fastify.get('/auth/callback', async (request, reply) => {
    const { token } =
      await fastify.spotifyOAuth2.getAccessTokenFromAuthorizationCodeFlow(
        request,
      );
    const accessToken = token.access_token;
    const refreshToken = token.refresh_token;

    const profile = await request.spotify.request(
      'https://api.spotify.com/v1/me',
      { tokenType: 'user', token: accessToken },
    );

    const user = await findOneAndUpdateUser(profile, token);
    if (!user?._id) {
      reply.code(500);
      return { error: 'Failed to process user' };
    }
    await playService.syncRecentPlays(user._id, accessToken, 10);

    return {
      message: 'Authentication successful',
      accessToken,
      user: { spotifyId: user.spotifyId, displayName: user.displayName },
    };
  });

  fastify.get('/', async () => ({ hello: 'world' }));

  fastify.get(
    '/api/profile',
    { preHandler: fastify.authenticate },
    async (request) => {
      return request.spotify.request('https://api.spotify.com/v1/me');
    },
  );

  fastify.get(
    '/api/history',
    { preHandler: fastify.authenticate },
    async (request) => {
      const data = await request.spotify.request(
        'https://api.spotify.com/v1/me/player/recently-played?limit=10',
      );
      return { history: data };
    },
  );

  fastify.get(
    '/api/game/simulate-round-with-timer/:artistId',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { artistId } = request.params;
      const roundData = await gameService.getGameRoundData(
        artistId,
        request.user.accessToken,
        fastify.log,
      );
      if (!roundData) {
        reply.code(404);
        return { error: 'No game data' };
      }
      gameService.iteratorWithTimeout(
        gameService.incGenerator(0),
        5,
        (tick) => fastify.log.info(`Tick ${tick}`),
        1000,
      );
      return {
        trackToGuess: roundData.trackToGuess,
        options: roundData.options,
      };
    },
  );

  await fastify.listen({
    port: Number(fastify.config.PORT),
    host: '127.0.0.1',
  });
}

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});

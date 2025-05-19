// src/server.js
const fastify = require('fastify')({ logger: true });
const fastifyEnv = require('@fastify/env');
const fetch = require('node-fetch');
const models = require('./models');
// const User = models.User;
const { findOneAndUpdateUser } = require('./services/userService');
const authenticate = require('./middlewares/auth');
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

  await fastify.register(require('./plugins/mongodb.js'));

  fastify.get('/test-db', async (request, reply) => {
    try {
      const mongoose = fastify.mongoose;
      const connectionState = mongoose.connection.readyState;
      let status = '';
      switch (connectionState) {
        case 0:
          status = 'disconnected';
          break;
        case 1:
          status = 'connected';
          break;
        case 2:
          status = 'connecting';
          break;
        case 3:
          status = 'disconnecting';
          break;
        default:
          status = 'unknown';
          break;
      }
      reply.send({ database: status });
    } catch (err) {
      fastify.log.error(err);
      reply.status(500).send({ error: 'failed to test database' });
    }
  });

  fastify.decorate('authenticate', authenticate);

  fastify.register(require('@fastify/oauth2'), {
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

  fastify.get('/auth/callback', async function (request, reply) {
    fastify.log.info(' Hit /auth/callback');
    const { token } =
      await this.spotifyOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
    const accessToken = token.access_token;
    const refreshToken = token.refresh_token;

    fastify.log.info(
      { accessToken, refreshToken, scopes: token.scope },
      'Token response shape',
    );

    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      const text = await profileRes.text();
      fastify.log.error(
        { status: profileRes.status, body: text },
        'Spotify /me request failed',
      );
      throw new Error(`Spotify /me failed: ${profileRes.status}`);
    }
    const profile = await profileRes.json();
    fastify.log.info({ profile }, 'Spotify profile');

    const user = await findOneAndUpdateUser(profile, token);

    if (!user || !user._id) {
      fastify.log.error(
        { profile, token },
        'Failed to upsert user or user._id is missing after upsert.',
      );
      return reply
        .status(500)
        .send({ error: 'Failed to process user information.' });
    }
    fastify.log.info(
      { userId: user._id, spotifyId: user.spotifyId },
      'Upserted user',
    );

    await playService.syncRecentPlays(user._id, token.access_token, 10);

    return reply.send({
      message: 'Authentication successful',
      accessToken: token.access_token,
      user: {
        spotifyId: user.spotifyId,
        displayName: user.displayName,
      },
    });
  });

  fastify.get('/', async (request, reply) => ({ hello: 'world' }));

  fastify.get(
    '/api/profile',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { spotifyId, displayName, createdAt } = request.user;
      return { spotifyId, displayName, createdAt };
    },
  );

  fastify.get(
    '/api/history',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      fastify.log.info(
        { userId: request.user._id },
        'Entered /api/history handler',
      );
      const userId = request.user._id;
      if (!userId) {
        return reply
          .status(400)
          .send({ error: 'User ID not found in request' });
      }
      const history = await playService.getRecentPlays(userId, 10);
      fastify.log.info(
        { historyCount: history ? history.length : 0 },
        'History fetched',
      );
      return { history };
    },
  );
  fastify.get(
    '/api/game/simulate-round-with-timer/:artistId',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { artistId } = request.params;
      const user = request.user;
      if (!user || !user.accessToken) {
        fastify.log.warn(
          '[GameSim] User or accessToken not found after authentication.',
        );
        return reply.status(401).send({
          error:
            'User not authenticated or access token missing in user object',
        });
      }

      try {
        fastify.log.info(
          `[GameSim] Request to /api/game/simulate-round-with-timer for artistId: ${artistId}`,
        );

        const roundData = await gameService.getGameRoundData(
          artistId,
          user.accessToken,
          fastify.log,
        );

        if (!roundData) {
          fastify.log.warn(
            `[GameSim] Could not generate game round for artist ${artistId}.`,
          );
          return reply.status(404).send({
            error:
              'Could not generate game round. Not enough tracks or artist not found.',
          });
        }

        fastify.log.info(
          `[GameSim] Round data prepared. Track to guess: ${roundData.trackToGuess.name} (URI: ${roundData.trackToGuess.uri}, Duration: ${roundData.trackToGuess.duration_ms}ms). Options: ${roundData.options.join(', ')}`,
        );
        fastify.log.info(
          `[GameSim] Starting 5-second timer simulation using Task 1 functions...`,
        );

        const timerGenerator = gameService.incGenerator(0);
        const gameDurationSeconds = 5;

        const simulatedTickCallback = (tick) => {
          const secondsElapsed = tick + 1;
          const timeLeft = gameDurationSeconds - secondsElapsed;
          fastify.log.info(
            `[GameSim Timer] Tick: ${tick}, Time Elapsed: ${secondsElapsed}s, Time Left: ${timeLeft >= 0 ? timeLeft : 0}s`,
          );
          if (timeLeft <= 0) {
            fastify.log.info(`[GameSim Timer] 5 seconds up! (Simulated)`);
          }
        };

        gameService.iteratorWithTimeout(
          timerGenerator,
          gameDurationSeconds,
          simulatedTickCallback,
          1000,
        );

        return reply.send({
          message: `Game round simulation started for artist ${artistId}. Check server logs for timer ticks.`,
          trackToGuess: {
            name: roundData.trackToGuess.name,
            uri: roundData.trackToGuess.uri,
            duration_ms: roundData.trackToGuess.duration_ms,
          },
          options: roundData.options,
        });
      } catch (error) {
        fastify.log.error(
          { err: error },
          `[GameSim] Error in /api/game/simulate-round-with-timer: ${error.message}`,
        );
        if (
          error.message &&
          error.message.includes('Spotify API') &&
          (error.message.includes('401') || error.message.includes('403'))
        ) {
          return reply.status(401).send({
            error:
              'Spotify token expired, invalid, or insufficient permissions. Please re-authenticate.',
          });
        }
        return reply
          .status(500)
          .send({ error: 'Failed to simulate game round' });
      }
    },
  );

  const port = Number(fastify.config.PORT || 3000);
  await fastify.listen({ port, host: '127.0.0.1' });
  fastify.log.info(`Server running at http://127.0.0.1:${port}`);
}

start().catch((err) => {
  fastify.log.error({ err }, 'Failed to start server');
  process.exit(1);
});

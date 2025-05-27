const fastify = require('fastify')({
  logger: { level: 'info', transport: { target: 'pino-pretty' } },
});
const fastifyEnv = require('@fastify/env');
const spotifyProxyPlugin = require('../plugins/spotify-proxy');
const fastifyOauth2 = require('@fastify/oauth2');

const envSchema = {
  type: 'object',
  required: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'APP_URL'],
  properties: {
    SPOTIFY_CLIENT_ID: { type: 'string' },
    SPOTIFY_CLIENT_SECRET: { type: 'string' },
    APP_URL: { type: 'string' },
  },
};

(async () => {
  await fastify.register(fastifyEnv, {
    confKey: 'config',
    schema: envSchema,
    dotenv: true,
  });
  await fastify.register(fastifyOauth2, {
    name: 'spotifyOAuth2',
    credentials: {
      client: {
        id: fastify.config.SPOTIFY_CLIENT_ID,
        secret: fastify.config.SPOTIFY_CLIENT_SECRET,
      },
      auth: fastifyOauth2.SPOTIFY_CONFIGURATION,
    },
    startRedirectPath: '/auth/login',
    callbackUri: `${fastify.config.APP_URL}/auth/callback`,
    scope: [],
  });
  await fastify.register(spotifyProxyPlugin);
  await fastify.ready();
  fastify.log.info('Client-flow test');
  try {
    const clientRes = await fastify.spotify.request(
      'https://api.spotify.com/v1/browse/new-releases?limit=1',
      { tokenType: 'client' },
    );
    console.log('Client-flow result:', clientRes);
  } catch (err) {
    fastify.log.error(err);
  }

  fastify.log.info('User-flow test');
  const fakeUserToken =
    'BQCOdCdIeA-YxIRjJo-wk4DNB5kaiDi-_1ur6iFpWCTbI6QDvd_Qi3FyW0erNTPezFhA52wUAakuKs-kZc_04ZloimV3eQjScVNVaGYTenVL6m8nwsIobUEI5mf9yvdhMTgH5vjhinpkvREhLdnVk9_kivWsLXbvNQCvN89KAxt8yUXn1PczCcbfn4iEJ5PJPYpZq1nBq_bzefKLs3ugtdtActNmjG2JzhLlTl8egpCirWBoy5HC2hJsyKX79dSv1hYyHugCIutumCY';
  try {
    const me = await fastify.spotify.request('https://api.spotify.com/v1/me', {
      tokenType: 'user',
      token: fakeUserToken,
    });
    console.log('User override result:', me);
  } catch (err) {
    fastify.log.error(err);
  }

  process.exit(0);
})();

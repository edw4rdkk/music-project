const fp = require('fastify-plugin');
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const SpotifyProxy = require('../services/spotifyProxy');

const spotifyProxyPlugin = async (fastify) => {
  const {
    SPOTIFY_CLIENT_ID: clientId,
    SPOTIFY_CLIENT_SECRET: clientSecret,
    APP_URL: appUrl,
  } = fastify.config;
  const tokenUrl = 'https://accounts.spotify.com/api/token';

  const getClientTokenFn = async () => {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch {}
      fastify.log.error(`Token fetch failed ${res.status}: ${text}`);
      throw new Error('Failed to get client token');
    }
    const { access_token } = await res.json();
    return access_token;
  };

  const getUserTokenFn = async (request) => {
    if (!request.user || !request.user.accessToken) {
      throw new Error('User not authenticated');
    }
    return request.user.accessToken;
  };

  const coreProxy = new SpotifyProxy(
    { getClientTokenFn, getUserTokenFn },
    fastify,
  );

  fastify.decorate('spotify', coreProxy);
  fastify.decorateRequest('spotify', null);
  fastify.addHook('onRequest', (request, reply, done) => {
    request.spotify = {
      request: (url, opts = {}) => coreProxy.request(url, { ...opts, request }),
    };
    done();
  });
};

module.exports = fp(spotifyProxyPlugin);

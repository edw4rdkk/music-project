const fp = require('fastify-plugin');
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const SpotifyProxy = require('../services/spotifyProxy');

const spotifyProxyPlugin = async (fastify) => {
  const clientId = fastify.config.SPOTIFY_CLIENT_ID;
  const clientSecret = fastify.config.SPOTIFY_CLIENT_SECRET;
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
      let errText = '';
      try {
        errText = await res.text();
      } catch {
        errText = '';
      }
      fastify.log.error(`Client token error ${res.status}: ${errText}`);
      throw new Error('Failed to get client credentials token');
    }
    const data = await res.json();
    return data.access_token;
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
      request: (url, opts = {}) =>
        coreProxy.request(url, { ...opts, tokenType: 'user', request }),
    };
    done();
  });
};

module.exports = fp(spotifyProxyPlugin);

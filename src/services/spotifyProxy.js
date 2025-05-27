// services/spotifyProxy.js
const fetch = require('node-fetch');

class SpotifyProxy {
  constructor({ getClientTokenFn, getUserTokenFn }, fastify) {
    this._getClientToken = getClientTokenFn;
    this._getUserToken = getUserTokenFn;
    this._fastify = fastify;
  }
  async request(
    url,
    {
      method = 'GET',
      tokenType = 'user',
      headers = {},
      body = null,
      request,
      token,
    } = {},
  ) {
    let accessToken;
    if (token) {
      accessToken = token;
    } else if (tokenType === 'client') {
      accessToken = await this._getClientToken();
    } else {
      accessToken = await this._getUserToken(request);
    }

    const auth = { Authorization: `Bearer ${accessToken}` };
    this._fastify.log.info(`${method} ${url}`);
    let res = await fetch(url, {
      method,
      headers: { ...headers, ...auth },
      body,
    });

    if (res.status === 401 || res.status === 403) {
      this._fastify.log.warn(`Auth failed (${res.status}), refreshing token`);
      if (tokenType === 'client') {
        const newToken = await this._getClientToken();
        res = await fetch(url, {
          method,
          headers: { ...headers, Authorization: `Bearer ${newToken}` },
          body,
        });
      } else {
        throw new Error('User token expired or invalid');
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this._fastify.log.error(`Error ${res.status}: ${text}`);
      throw new Error(`Spotify API error: ${res.status}`);
    }

    return res.json();
  }
}

module.exports = SpotifyProxy;

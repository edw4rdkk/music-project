const fetch = require('node-fetch');

class SpotifyProxy {
  constructor({ getClientTokenFn, getUserTokenFn }, fastify) {
    this._getClientToken = getClientTokenFn;
    this._getUserToken = getUserTokenFn;
    this._fastify = fastify;
  }

  async request(
    url,
    { method = 'GET', headers = {}, body = null, request, token } = {},
  ) {
    let accessToken;
    if (token) {
      accessToken = token;
    } else if (request && request.user && request.user.accessToken) {
      accessToken = await this._getUserToken(request);
    } else {
      accessToken = await this._getClientToken();
    }

    const auth = { Authorization: `Bearer ${accessToken}` };
    this._fastify.log.info(`${method} ${url}`);
    let res = await fetch(url, {
      method,
      headers: { ...headers, ...auth },
      body,
    });

    if (
      (res.status === 401 || res.status === 403) &&
      (!request || !request.user)
    ) {
      this._fastify.log.warn(`Auth failed (${res.status}), refreshing token`);
      const newToken = await this._getClientToken();
      res = await fetch(url, {
        method,
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
        body,
      });
    }

    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch {}
      this._fastify.log.error(`Error ${res.status}: ${text}`);
      throw new Error(`Spotify API error: ${res.status}`);
    }

    return res.json();
  }
}

module.exports = SpotifyProxy;

// src/server.js
const fastify = require("fastify")({ logger: true });
const fastifyEnv = require("@fastify/env");

const schema = {
  type: "object",
  required: ["PORT", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "BASE_URL"],
  properties: {
    PORT: { type: "string", default: "3000" },
    SPOTIFY_CLIENT_ID: { type: "string" },
    SPOTIFY_CLIENT_SECRET: { type: "string" },
    BASE_URL: { type: "string" },
  },
};

fastify
  .register(fastifyEnv, {
    confKey: "config",
    schema,
    dotenv: true,
  })
  .after(() => {
    fastify.register(require("@fastify/oauth2"), {
      name: "spotifyOAuth2",
      credentials: {
        client: {
          id: fastify.config.SPOTIFY_CLIENT_ID,
          secret: fastify.config.SPOTIFY_CLIENT_SECRET,
        },
        auth: require("@fastify/oauth2").SPOTIFY_CONFIGURATION,
      },
      startRedirectPath: "/auth/login",
      callbackUri: `${fastify.config.BASE_URL}/auth/callback`,
    });
  })
  .after(() => {
    fastify.get("/auth/callback", async function (request, reply) {
      const token =
        await this.spotifyOAuth2.getAccessTokenFromAuthorizationCodeFlow(
          request
        );
      return reply.send(token);
    });

    fastify.get("/", async () => ({ hello: "world" }));
  })
  .ready((err) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    const port = Number(fastify.config.PORT);
    fastify.listen({ port }, (listenErr) => {
      if (listenErr) {
        fastify.log.error(listenErr);
        process.exit(1);
      }
      fastify.log.info(`Server running at http://127.0.0.1:${port}`);
    });
  });

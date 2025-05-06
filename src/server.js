const fastify = require("fastify")({ logger: true });
const fastifyEnv = require("@fastify/env");
const mongoose = require("mongoose");
const fetch = require("node-fetch");
const models = require("./models");
const User = models.User;
const { createOrUpdateUser } = require("./services/userService");

const schema = {
  type: "object",
  required: [
    "PORT",
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
    "MONGODB_URI",
    "APP_URL",
  ],
  properties: {
    PORT: { type: "string", default: "3000" },
    SPOTIFY_CLIENT_ID: { type: "string" },
    SPOTIFY_CLIENT_SECRET: { type: "string" },
    MONGODB_URI: { type: "string" },
    APP_URL: { type: "string" },
  },
};

async function start() {
  await fastify.register(fastifyEnv, {
    confKey: "config",
    schema,
    dotenv: true,
  });

  // register custom plugin
  await fastify.register(require("./plugins/mongodb.js"));

  // test database
  fastify.get("/test-db", async (request, reply) => {
    try {
      const mongoose = fastify.mongoose;
      const connectionState = mongoose.connection.readyState;

      let status = "";
      switch (connectionState) {
        case 0:
          status = "disconnected";
          break;
        case 1:
          status = "connected";
          break;
        case 2:
          status = "connecting";
          break;
        case 3:
          status = "disconnecting";
          break;

        default:
          status = "unknown";
          break;
      }
      reply.send({ database: status });
    } catch (err) {
      fastify.log.error(err);
      reply.status(500).send({ error: "failed to test database" });
    }
  });

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
    callbackUri: `${fastify.config.APP_URL}/auth/callback`,
    scope: ["user-read-private", "user-read-recently-played"],
  });

  fastify.get("/auth/callback", async function (request, reply) {
    fastify.log.info(" Hit /auth/callback");
    const { token } =
      await this.spotifyOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
    const accessToken = token.access_token;
    const refreshToken = token.refresh_token;

    fastify.log.info({ accessToken, refreshToken }, "Token response shape");
    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();
    fastify.log.info({ profile }, "Spotify profile");

    const user = await createOrUpdateUser(profile, token);
    fastify.log.info({ user }, "Upserted user");

    return reply.send({ token, user });
  });

  fastify.get("/", async () => ({ hello: "world" }));

  const port = Number(fastify.config.PORT);
  await fastify.listen({ port, host: "127.0.0.1" });
  fastify.log.info(`Server running at http://127.0.0.1:${port}`);
}

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});

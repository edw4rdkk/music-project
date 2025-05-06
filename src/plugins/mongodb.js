const fp = require("fastify-plugin");
const mongoose = require("mongoose");

module.exports = fp(async (fastify, opts) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    fastify.decorate("mongoose", mongoose);
    fastify.addHook("onClose", async (instance, done) => {
      await mongoose.disconnect();
      fastify.log.info("mongodb disconnected");
      done();
    });
    fastify.log.info("mongodb connected");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});

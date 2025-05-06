const fp = require("fastify-plugin");
const mongoose = require("mongoose");

module.exports = fp(async (fastify, opts) => {
  await mongoose.connect(process.env.MONGODB_URI);
  fastify.decorate("mongoose", mongoose);
  fastify.log.info("mongodb connected");

  fastify.addHook("onClose", async () => {
    await mongoose.disconnect();
    fastify.log.info("mongodb disconnected");
  });
});

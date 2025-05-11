const fp = require("fastify-plugin");
const mongoose = require("mongoose");

module.exports = fp(
  async (fastify, opts) => {
    try {
      // Add connection options
      const connectionOptions = {
        connectTimeoutMS: 3000, // 3 seconds timeout
        socketTimeoutMS: 45000, // 45 seconds socket timeout
        serverSelectionTimeoutMS: 5000, // 5 seconds server selection timeout
        maxPoolSize: 10, // Maximum number of connections in pool
      };

      fastify.log.info("Connecting to MongoDB...");

      await mongoose.connect(process.env.MONGODB_URI, connectionOptions);

      // Verify connection is ready
      mongoose.connection.on("connected", () => {
        fastify.log.info("MongoDB connected successfully");
      });

      mongoose.connection.on("error", (err) => {
        fastify.log.error(`MongoDB connection error: ${err}`);
      });

      fastify.decorate("mongoose", mongoose);
    } catch (err) {
      fastify.log.error(`Failed to connect to MongoDB: ${err}`);
      throw err; // Important: rethrow to prevent Fastify from starting
    }

    fastify.addHook("onClose", async () => {
      try {
        await mongoose.disconnect();
        fastify.log.info("MongoDB disconnected");
      } catch (err) {
        fastify.log.error(`Error disconnecting MongoDB: ${err}`);
      }
    });
  },
  {
    name: "fastify-mongoose", // Plugin name for better error messages
    fastify: "5.x", // Fastify version compatibility
  }
);

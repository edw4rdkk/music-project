const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  spotifyId: { type: String, unique: true, required: true },
  displayName: String,
  accessToken: String,
  refreshToken: String,
});

const playSchema = new mongoose.Schema({
  trackId: String,
  playedAt: { type: Date, default: Date.now, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

const User = mongoose.model("User", userSchema);
const Play = mongoose.model("Play", playSchema);

module.exports = { User, Play };

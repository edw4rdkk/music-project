const models = require("../models");
const User = models.User;

const findOneAndUpdateUser = async (profile, token) => {
  await User.findOneAndUpdate(
    { spotifyId: profile.id },
    {
      spotifyId: profile.id,
      displayName: profile.display_name,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    },
    { upsert: true, new: true }
  );
};
module.exports = { findOneAndUpdateUser };

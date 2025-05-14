const models = require("../models");
const Play = models.Play;
const fetch = require('node-fetch');

async function recordPlay(userId, trackId) {
    return await Play.create({user: userId, trackId})
}

async function getRecentPlays(userId, limit = 10){
    return await Play
    .find({user: userId})
    .sort({playedAt: -1})
    .limit(limit)
}

async function syncRecentPlays(userId, accessToken, limit = 10) {
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      throw new Error(`Spotify /me/player/recently-played failed: ${res.status}`);
    }
    const { items } = await res.json();
    
    await Promise.all(
      items.map(item =>
        recordPlay(userId, item.track.id)
      )
    );
  }
module.exports = {recordPlay, getRecentPlays, syncRecentPlays}
const fetch = require('node-fetch');

const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const getAllArtistTracks = async (artistId, accessToken, fastifyLog) => {
  fastifyLog.info(`Fetching initial albums for artist ID: ${artistId}`);
  const albumsUrl = `https://api.spotify.com//v1/artists/${artistId}/albums`;

  try {
    const albumsResponse = await fetch(albumsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!albumsResponse.ok) {
      const errorBody = await albumsResponse.text();
      fastifyLog.error(
        `Error fetching albums from Spotify: ${albumsResponse.status} - ${errorBody}`,
      );
      throw new Error(
        `Spotify API error fetching albums: ${albumsResponse.status}`,
      );
    }

    const albumsData = await albumsResponse.json();
    fastifyLog.info(
      `Fetched ${albumsData.items.length} albums on the first page for artist ${artistId}.`,
    );
    return albumsData.items;
  } catch (error) {
    fastifyLog.error(`Exception in getAllArtistTracks: ${error.message}`);
    return [];
  }
};

module.exports = {
  getAllArtistTracks,
  shuffleArray,
};

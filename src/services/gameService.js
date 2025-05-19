const fetch = require('node-fetch');
const {
  incGenerator,
  iteratorWithTimeout,
} = require('../packages/task1/index.js');

const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const getAllArtistTracks = async (artistId, accessToken, fastifyLog) => {
  let allTracks = [];
  let albumsUrl = `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=50`;
  let page = 1;

  fastifyLog.info(
    `[GameService] Fetching all albums for artist ID: ${artistId}`,
  );

  try {
    while (albumsUrl) {
      fastifyLog.debug(`Fetching album page ${page}: ${albumsUrl}`);

      const albumsResponse = await fetch(albumsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!albumsResponse.ok) {
        const errorBody = await albumsResponse.json();
        fastifyLog.error(
          `Error fetching albums page ${page}: ${albumsResponse.status}`,
          { error: errorBody },
        );

        if (albumsResponse.status === 401 || albumsResponse.status === 403) {
          throw new Error(
            `Spotify API authentication failed: ${albumsResponse.status}`,
          );
        }
        break;
      }

      const albumsData = await albumsResponse.json();
      const currentAlbumItems = albumsData.items || [];
      fastifyLog.debug(
        `Fetched ${currentAlbumItems.length} albums on page ${page}`,
      );

      if (currentAlbumItems.length === 0) {
        albumsUrl = null;
        continue;
      }

      const albumIds = currentAlbumItems.map((album) => album.id);
      for (let i = 0; i < albumIds.length; i += 20) {
        const batchAlbumIds = albumIds.slice(i, i + 20);
        const tracksUrl = `https://api.spotify.com/v1/albums?ids=${batchAlbumIds.join(',')}`;

        fastifyLog.debug(`Fetching tracks for album batch: ${tracksUrl}`);
        const tracksResponse = await fetch(tracksUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!tracksResponse.ok) {
          const errorBody = await tracksResponse.json();
          fastifyLog.error(
            `Error fetching tracks for albums batch: ${tracksResponse.status}`,
            { error: errorBody },
          );
          continue;
        }

        const tracksData = await tracksResponse.json();
        if (!Array.isArray(tracksData.albums)) {
          fastifyLog.warn('Unexpected albums data format', {
            data: tracksData,
          });
          continue;
        }

        tracksData.albums.forEach((album) => {
          if (!album?.tracks?.items) return;

          album.tracks.items.forEach((track) => {
            if (!track?.id || !track?.artists) return;

            const isTargetArtist = track.artists.some(
              (artist) => artist.id === artistId,
            );
            if (!isTargetArtist) return;

            allTracks.push({
              id: track.id,
              name: track.name,
              uri: track.uri,
              duration_ms: track.duration_ms || 0,
              preview_url: track.preview_url || null,
              popularity: track.popularity || 0,
              explicit: track.explicit || false,
              album: {
                id: album.id,
                name: album.name,
                release_date: album.release_date,
                images: album.images || [],
              },
              artists: track.artists.map((artist) => ({
                name: artist.name,
                id: artist.id,
              })),
            });
          });
        });
      }

      albumsUrl = albumsData.next;
      page++;
    }
  } catch (error) {
    fastifyLog.error(`Failed to fetch artist tracks: ${error.message}`, {
      error,
    });
    throw error;
  }

  const uniqueTracks = [
    ...new Map(allTracks.map((track) => [track.id, track])).values(),
  ];

  fastifyLog.info(
    `Fetched ${uniqueTracks.length} unique tracks for artist ${artistId}`,
  );
  return uniqueTracks;
};

const getGameRoundData = async (artistId, accessToken, fastifyLog) => {
  fastifyLog.info(`Preparing game round for artist: ${artistId}`);

  let allArtistTracks;
  try {
    allArtistTracks = await getAllArtistTracks(
      artistId,
      accessToken,
      fastifyLog,
    );
  } catch (error) {
    fastifyLog.error(`Failed to get artist tracks: ${error.message}`);
    throw error;
  }

  if (!allArtistTracks?.length) {
    fastifyLog.warn(`No tracks found for artist ${artistId}`);
    return null;
  }

  const playableTracks = allArtistTracks.filter(
    (track) => track.duration_ms > 5000,
  );
  if (playableTracks.length < 1) {
    fastifyLog.warn(`No playable tracks found for artist ${artistId}`);
    return null;
  }

  const trackToGuess =
    playableTracks[Math.floor(Math.random() * playableTracks.length)];
  const options = [trackToGuess.name];

  const otherTracks = allArtistTracks.filter((t) => t.id !== trackToGuess.id);
  const shuffledTracks = shuffleArray(otherTracks);

  for (const track of shuffledTracks) {
    if (options.length >= 4) break;
    if (!options.includes(track.name)) {
      options.push(track.name);
    }
  }

  if (options.length < 2) {
    fastifyLog.warn(
      `Only ${options.length} options available for artist ${artistId}`,
      { options },
    );
    return null;
  }

  fastifyLog.debug(`Prepared round for ${artistId}`, {
    track: trackToGuess.name,
    options: options.length,
  });

  return {
    trackToGuess: {
      id: trackToGuess.id,
      name: trackToGuess.name,
      uri: trackToGuess.uri,
      duration_ms: trackToGuess.duration_ms,
      preview_url: trackToGuess.preview_url,
      artists: trackToGuess.artists,
      album: trackToGuess.album,
      popularity: trackToGuess.popularity,
      explicit: trackToGuess.explicit,
    },
    options: shuffleArray(options),
    correctTrackName: trackToGuess.name,
  };
};

module.exports = {
  getAllArtistTracks,
  getGameRoundData,
  shuffleArray,
  incGenerator,
  iteratorWithTimeout,
};

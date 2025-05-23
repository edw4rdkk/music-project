const fetch = require('node-fetch');
const memoize = require('./memoize');

const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = newArray[i];
    newArray[i] = newArray[j];
    newArray[j] = temp;
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

class DequePriorityQueue {
  constructor() {
    this.entries = [];
  }
  enqueue(item, priority = 0, timestamp = Date.now()) {
    this.entries.push({ item, priority, timestamp });
  }
  dequeueHighest() {
    if (!this.entries.length) return null;
    let idx = 0;
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i].priority > this.entries[idx].priority) idx = i;
    }
    return this.entries.splice(idx, 1)[0].item;
  }
  dequeueLowest() {
    if (!this.entries.length) return null;
    let idx = 0;
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i].priority < this.entries[idx].priority) idx = i;
    }
    return this.entries.splice(idx, 1)[0].item;
  }
  dequeueOldest() {
    if (!this.entries.length) return null;
    let idx = 0;
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i].timestamp < this.entries[idx].timestamp) idx = i;
    }
    return this.entries.splice(idx, 1)[0].item;
  }
  dequeueNewest() {
    if (!this.entries.length) return null;
    let idx = 0;
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i].timestamp > this.entries[idx].timestamp) idx = i;
    }
    return this.entries.splice(idx, 1)[0].item;
  }
}

const mGetAllArtistTracks = memoize(getAllArtistTracks, { maxSize: 10 });
const getGameRoundData = async (artistId, accessToken, fastifyLog) => {
  fastifyLog.info(`Preparing game round for artist: ${artistId}`);

  const allTracks = await mGetAllArtistTracks(
    artistId,
    accessToken,
    fastifyLog,
  );
  const playable = allTracks.filter((t) => t.duration_ms > 5000);
  if (playable.length === 0) return null;

  const trackToGuess = playable[Math.floor(Math.random() * playable.length)];

  const pq = new DequePriorityQueue();
  playable.forEach((t) => {
    if (t.id !== trackToGuess.id) {
      const ts = new Date(t.album.release_date).getTime();
      pq.enqueue(t, t.popularity, ts);
    }
  });

  const methods = shuffleArray([
    'dequeueHighest',
    'dequeueLowest',
    'dequeueOldest',
    'dequeueNewest',
  ]);

  const options = [trackToGuess.name];
  let idx = 0;
  while (options.length < 3 && idx < methods.length) {
    const fn = pq[methods[idx++]].bind(pq);
    const next = fn();
    if (next) options.push(next.name);
  }

  if (options.length < 3) {
    const rest = shuffleArray(
      playable.map((t) => t.name).filter((n) => !options.includes(n)),
    );
    while (options.length < 3 && rest.length) {
      options.push(rest.shift());
    }
  }

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

function loggable(fn, { level = 'info' } = {}) {
  return async function (...args) {
    const fastifyLog = args.find((a) => a && typeof a[level] === 'function');
    const name = fn.name || '<anonymous>';
    const logger = fastifyLog || console;

    logger[level]({ args }, `Enter ${name}`);
    const start = Date.now();

    try {
      const result = await fn.apply(this, args);
      const duration = Date.now() - start;
      logger[level]({ result, duration }, `Exit ${name}`);
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      logger.error({ err, duration }, `!! Error in ${name}`);
      throw err;
    }
  };
}

module.exports = {
  getAllArtistTracks: loggable(mGetAllArtistTracks, { level: 'debug' }),
  getGameRoundData: loggable(getGameRoundData, { level: 'info' }),
};

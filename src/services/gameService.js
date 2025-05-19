const fetch = require('node-fetch');

const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const getAllArtistTracks = async (artistId, accessToken, fastifyLog) => {
  let allTracks = [];
  let albumsUrl = `https://api.spotify.com//v1/artists/${artistId}/albums?include_groups=album,single&limit=50`;
  let page = 1;

  fastifyLog.info(
    `[GameService - Stage 2] Starting to fetch all albums for artist ID: ${artistId}`,
  );

  while (albumsUrl) {
    fastifyLog.info(
      `[GameService - Stage 2] Fetching album page ${page}: ${albumsUrl}`,
    );
    try {
      const albumsResponse = await fetch(albumsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!albumsResponse.ok) {
        const errorBody = await albumsResponse.text();
        fastifyLog.error(
          `[GameService - Stage 2] Error fetching albums (page ${page}) from Spotify: ${albumsResponse.status} - ${errorBody}`,
        );
        throw new Error(
          `Spotify API error fetching albums (page ${page}): ${albumsResponse.status}`,
        );
      }

      const albumsData = await albumsResponse.json();
      const currentAlbumItems = albumsData.items || [];
      fastifyLog.info(
        `[GameService - Stage 2] Fetched ${currentAlbumItems.length} album items on page ${page}.`,
      );

      if (currentAlbumItems.length > 0) {
        const albumIds = currentAlbumItems.map((album) => album.id);

        for (let i = 0; i < albumIds.length; i += 20) {
          const batchAlbumIds = albumIds.slice(i, i + 20);
          const tracksFromAlbumsUrl = `https://api.spotify.com/?ids=${batchAlbumIds.join(',')}`;
          fastifyLog.info(
            `[GameService - Stage 2] Fetching tracks for album batch (IDs: ${batchAlbumIds.join(',')})`,
          );

          const tracksResponse = await fetch(tracksFromAlbumsUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!tracksResponse.ok) {
            const errorBodyTracks = await tracksResponse.text();
            fastifyLog.error(
              `[GameService - Stage 2] Error fetching tracks for albums batch from Spotify: ${tracksResponse.status} - ${errorBodyTracks}`,
            );
            continue;
          }
          const tracksData = await tracksResponse.json();

          if (tracksData.albums && Array.isArray(tracksData.albums)) {
            tracksData.albums.forEach((albumWithTracks) => {
              if (
                albumWithTracks &&
                albumWithTracks.tracks &&
                albumWithTracks.tracks.items
              ) {
                albumWithTracks.tracks.items.forEach((track) => {
                  const isTargetArtistPresent =
                    track.artists &&
                    track.artists.some((artist) => artist.id === artistId);

                  if (track.preview_url && isTargetArtistPresent) {
                    allTracks.push({
                      id: track.id,
                      name: track.name,
                      preview_url: track.preview_url,
                      popularity: track.popularity,
                      duration_ms: track.duration_ms,
                      explicit: track.explicit,
                      album: {
                        id: albumWithTracks.id,
                        name: albumWithTracks.name,
                        release_date: albumWithTracks.release_date,
                        images: albumWithTracks.images,
                      },
                      artists: track.artists.map((a) => ({
                        name: a.name,
                        id: a.id,
                      })),
                    });
                  }
                });
              }
            });
          }
        }
      }
      albumsUrl = albumsData.next;
      page++;
    } catch (error) {
      fastifyLog.error(
        `[GameService - Stage 2] Exception in getAllArtistTracks while fetching page ${page} of albums/tracks: ${error.message}`,
      );
      albumsUrl = null;
    }
  }

  fastifyLog.info(
    `[GameService - Stage 2] Fetched a total of ${allTracks.length} tracks with preview_url for artist ${artistId} before deduplication.`,
  );

  const uniqueTracks = Array.from(
    new Map(allTracks.map((track) => [track.id, track])).values(),
  );
  fastifyLog.info(
    `[GameService - Stage 2] Returning ${uniqueTracks.length} unique tracks for artist ${artistId}`,
  );
  return uniqueTracks;
};

module.exports = {
  getAllArtistTracks,
  shuffleArray,
};

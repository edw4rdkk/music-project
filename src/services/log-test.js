const fastify = require('fastify')({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
        levelFirst: true,
      },
    },
  },
});
const { getGameRoundData } = require('./gameService');

async function run() {
  try {
    const artistId = '3TVXtAsR1Inumwj472S9r4';
    const accessToken =
      'BQCOdCdIeA-YxIRjJo-wk4DNB5kaiDi-_1ur6iFpWCTbI6QDvd_Qi3FyW0erNTPezFhA52wUAakuKs-kZc_04ZloimV3eQjScVNVaGYTenVL6m8nwsIobUEI5mf9yvdhMTgH5vjhinpkvREhLdnVk9_kivWsLXbvNQCvN89KAxt8yUXn1PczCcbfn4iEJ5PJPYpZq1nBq_bzefKLs3ugtdtActNmjG2JzhLlTl8egpCirWBoy5HC2hJsyKX79dSv1hYyHugCIutumCY';
    await getGameRoundData(artistId, accessToken, fastify.log);
  } catch (err) {
    //
  } finally {
    process.exit();
  }
}

run();

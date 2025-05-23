import React, { useState, useEffect, useRef } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const SNIPPET_DURATION_SECONDS = 5;
const SNIPPET_DURATION_MS = SNIPPET_DURATION_SECONDS * 1000;
const INITIAL_ROUNDS = 5;

function* timerGenerator(start = 0) {
  let i = start;
  while (true) {
    yield i++;
  }
}

function iteratorWithTimeout(iterator, timeoutSec, onTick, intervalMs = 1000) {
  let stopped = false;
  const startTime = Date.now();

  function tick() {
    if (stopped) return;
    const { value, done } = iterator.next();
    onTick(value);
    if (Date.now() - startTime >= timeoutSec * 1000) {
      stopped = true;
      return;
    }
    setTimeout(tick, intervalMs);
  }

  tick();
  return () => {
    stopped = true;
  };
}

class SimpleEventEmitter {
  constructor() {
    this.listeners = {};
  }
  on(event, fn) {
    (this.listeners[event] = this.listeners[event] || []).push(fn);
  }
  off(event, fn) {
    this.listeners[event] = (this.listeners[event] || []).filter(
      (f) => f !== fn,
    );
  }
  emit(event, payload) {
    (this.listeners[event] || []).forEach((f) => f(payload));
  }
}

const gameEvents = new SimpleEventEmitter();

async function fetchApi(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.error || err.message || `API Error: ${res.status}`);
  }
  return res.json();
}

export default function GamePage() {
  const [accessToken, setAccessToken] = useState('');
  const [artistId, setArtistId] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Enter your token & artist ID',
  );

  const [isSdkReady, setIsSdkReady] = useState(false);
  const [isPlayerInit, setIsPlayerInit] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const playerRef = useRef(null);

  const [gameData, setGameData] = useState(null);
  const [roundsLeft, setRoundsLeft] = useState(INITIAL_ROUNDS);

  const [timeLeft, setTimeLeft] = useState(SNIPPET_DURATION_SECONDS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const stopTimerRef = useRef(null);
  const pauseTimeRef = useRef(0);
  const snippetStartRef = useRef(0);

  useEffect(() => {
    const onReady = () => setIsSdkReady(true);
    window.addEventListener('spotify-sdk-ready', onReady);
    if (window.Spotify) setIsSdkReady(true);
    return () => window.removeEventListener('spotify-sdk-ready', onReady);
  }, []);

  useEffect(() => {
    if (!isSdkReady || !accessToken) return;
    playerRef.current?.disconnect();
    const player = new window.Spotify.Player({
      name: 'TuneMetrics Game Player',
      getOAuthToken: (cb) => cb(accessToken),
      volume: 0.5,
    });
    player.addListener('ready', ({ device_id }) => {
      setDeviceId(device_id);
      setIsPlayerInit(true);
      setStatusMessage('Player ready! Enter Artist ID to start.');
    });
    player.connect();
    playerRef.current = player;
    return () => player.disconnect();
  }, [isSdkReady, accessToken]);

  useEffect(() => {
    const handler = () => {
      setTimeLeft(SNIPPET_DURATION_SECONDS);
      setIsPlaying(false);
      setIsPaused(false);
      setStatusMessage(
        `Round ${INITIAL_ROUNDS - roundsLeft + 1}: Guess the track!`,
      );
    };
    gameEvents.on('roundStart', handler);
    return () => gameEvents.off('roundStart', handler);
  }, [roundsLeft]);

  async function startRound() {
    if (!accessToken || !artistId || !deviceId) {
      setStatusMessage('Token, Artist ID and device required');
      return;
    }
    setStatusMessage('Loading round data…');
    try {
      const data = await fetchApi(
        `${API_BASE_URL}/api/game/simulate-round-with-timer/${artistId}`,
        accessToken,
      );
      setGameData(data);
      snippetStartRef.current = Math.floor(
        Math.random() *
          Math.max(0, data.trackToGuess.duration_ms - SNIPPET_DURATION_MS),
      );
      gameEvents.emit('roundStart');
      setRoundsLeft((r) => r - 1);
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    }
  }

  async function playSnippet() {
    if (!gameData || isPlaying) return;
    setIsPlaying(true);

    try {
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_ids: [deviceId] }),
      });

      await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uris: [gameData.trackToGuess.uri],
            position_ms: snippetStartRef.current,
          }),
        },
      );

      stopTimerRef.current = iteratorWithTimeout(
        timerGenerator(0),
        SNIPPET_DURATION_SECONDS,
        (tick) => {
          setTimeLeft(SNIPPET_DURATION_SECONDS - (tick + 1));
          if (tick + 1 >= SNIPPET_DURATION_SECONDS) {
            gameEvents.emit('snippetEnd');
          }
        },
        1000,
      );
    } catch (err) {
      console.error(err);
      setStatusMessage(`Playback error: ${err.message}`);
      setIsPlaying(false);
    }
  }

  function handlePause() {
    if (!isPlaying) return;
    playerRef.current.pause();
    stopTimerRef.current?.();
    pauseTimeRef.current = timeLeft;
    setIsPaused(true);
  }

  function handleResume() {
    if (!isPaused) return;
    setIsPaused(false);
    playerRef.current.resume();

    const remaining = pauseTimeRef.current;
    stopTimerRef.current = iteratorWithTimeout(
      timerGenerator(0),
      remaining,
      (tick) => {
        const elapsed = tick + 1;
        setTimeLeft(remaining - elapsed);
        if (elapsed >= remaining) {
          gameEvents.emit('snippetEnd');
        }
      },
      1000,
    );
  }

  return (
    <div className="game-container">
      <h1>TuneMetrics Game</h1>

      <div className="setup">
        <input
          type="text"
          placeholder="Spotify Access Token"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
        />
        <input
          type="text"
          placeholder="Spotify Artist ID"
          value={artistId}
          onChange={(e) => setArtistId(e.target.value)}
        />
        <button
          onClick={startRound}
          disabled={!accessToken || !artistId || !deviceId}
        >
          Start Round
        </button>
        <p>{statusMessage}</p>
      </div>

      {gameData && (
        <div className="controls">
          <button onClick={playSnippet} disabled={isPlaying || isPaused}>
            Play Snippet
          </button>
          {isPlaying && <button onClick={handlePause}>Pause</button>}
          {isPaused && <button onClick={handleResume}>Resume</button>}
          <div className="timer">Time left: {timeLeft}s</div>
          <div className="options">
            {gameData.options.map((opt) => (
              <button
                key={opt}
                onClick={() =>
                  gameEvents.emit('answerResult', {
                    isCorrect: opt === gameData.correctTrackName,
                    correctAnswer: gameData.correctTrackName,
                  })
                }
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import GamePage from './gamePage';

window.onSpotifyWebPlaybackSDKReady = () => {
  window.dispatchEvent(new Event('spotify-sdk-ready'));
};

const tag = document.createElement('script');
tag.src = 'https://sdk.scdn.co/spotify-player.js';
tag.async = true;
document.body.appendChild(tag);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GamePage />
  </React.StrictMode>,
);

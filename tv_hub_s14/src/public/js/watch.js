const channelId = new URLSearchParams(location.search).get('channelId');
const video = document.querySelector('#video-player');
const playerStatus = document.querySelector('#player-status');
const retryButton = document.querySelector('#retry-player');
const favoriteButton = document.querySelector('#favorite-button');
const reportProblemLink = document.querySelector('#report-problem');
let channel;
let player;
let isFavorite = false;

async function loadUser() {
  const response = await fetch('/api/users/me');
  if (!response.ok) { location.href = '/login'; return false; }
  const user = await response.json(); document.querySelector('#welcome').textContent = `Welcome, ${user.email}`; return true;
}
function showPlayerState(state, message) {
  playerStatus.textContent = message; playerStatus.dataset.state = state;
  video.hidden = state !== 'playing'; retryButton.hidden = state !== 'error';
}
async function loadFavoriteState() {
  const response = await fetch('/api/favorites'); if (!response.ok) return;
  const { favorites } = await response.json(); isFavorite = favorites.some((favorite) => favorite.channelId && favorite.channelId._id === channel._id);
  favoriteButton.hidden = false; favoriteButton.textContent = isFavorite ? '★ Remove from Favorites' : '☆ Add to Favorites';
}
async function toggleFavorite() {
  const response = await fetch(`/api/favorites/${channel._id}`, { method: isFavorite ? 'DELETE' : 'POST' });
  if (!response.ok) return;
  isFavorite = !isFavorite; favoriteButton.textContent = isFavorite ? '★ Remove from Favorites' : '☆ Add to Favorites';
}
async function playChannel() {
  // TODO 7 y 8: Shaka Player intenta reproducir HLS/DASH y se muestran Loading, Playing o Error.
  if (!channel) return;
  if (!window.shaka || !shaka.Player.isBrowserSupported()) {
    showPlayerState('error', 'This browser cannot play this stream.');
    return;
  }
  showPlayerState('loading', 'Loading stream…');
  try {
    if (!player) {
      shaka.polyfill.installAll();
      player = new shaka.Player();
      await player.attach(video);
    }
    await player.load(channel.streamUrl);
    showPlayerState('playing', 'Playing');
  } catch (error) {
    console.error('Playback error', error);
    showPlayerState('error', 'This stream is not available right now.');
  }
}
async function loadChannel() {
  if (!channelId) { showPlayerState('error', 'Choose a channel from Home.'); return; }

  // TODO 5: consultar GET /api/channels/:id y asignar la respuesta a `channel`.
  const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}`);
  if (!response.ok) { showPlayerState('error', 'Channel was not found.'); return; }
  ({ channel } = await response.json());

  // TODO 6: mostrar nombre, país y categorías antes de cargar favoritos y reproducir.
  document.title = `${channel.name} · TV Hub`;
  document.querySelector('#channel-name').textContent = channel.name;
  document.querySelector('#channel-country').textContent = channel.country;
  document.querySelector('#channel-categories').textContent = (channel.categories || []).join(' · ');
  const logo = document.querySelector('#channel-logo');
  logo.src = channel.logoUrl || '/images/channel-placeholder.svg';
  logo.alt = `${channel.name} logo`;
  logo.addEventListener('error', () => { logo.src = '/images/channel-placeholder.svg'; }, { once: true });

  await loadFavoriteState();
  await playChannel();
}
favoriteButton.addEventListener('click', toggleFavorite); retryButton.addEventListener('click', playChannel);
if (channelId) reportProblemLink.href = `/reports.html?${new URLSearchParams({ channelId })}`;
document.querySelector('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login'; });
async function start() { if (await loadUser()) await loadChannel(); } start();

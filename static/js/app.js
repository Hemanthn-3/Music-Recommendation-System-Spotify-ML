/**
 * SPOTIFY AI RECOMMENDER — CLIENT ENGINE
 * Handles Live Search Autocomplete, k-NN Recommendations, Vector Blend,
 * Spider Radar Comparison Chart, Vibe Tuner Sliders, Spotify Embed Dock,
 * Live Canvas Audio Spectrum Visualizer, and Playlist Export.
 */

// Application State
const state = {
  currentTrack: null,
  currentSeed: null,
  comparisonTrack: null,
  currentRecommendations: [],
  currentBlendRecommendations: [],
  tuneParams: null,
  isPlaying: false,
  audioContext: null,
  analyser: null,
  visualizerRunning: false,
  synthInterval: null,
  masterGain: null,
  currentTime: 0,
  durationSec: 200,
  timerInterval: null,
  activeView: 'home',
  presets: [],
  blendBasket: [],
  likedSongs: [],
  recommendationHistory: []
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initGreeting();
  loadLikedSongsFromStorage();
  loadPresets();
  setupSearch();
  setupKeyboardShortcuts();
  fetchModelStats();
  setupCanvasSpectrum();
});

/* ==========================================================================
   GREETING & STATS
   ========================================================================== */
function initGreeting() {
  const greetingEl = document.getElementById('greetingText');
  if (!greetingEl) return;
  const hour = new Date().getHours();
  if (hour < 12) greetingEl.textContent = 'Good morning';
  else if (hour < 18) greetingEl.textContent = 'Good afternoon';
  else greetingEl.textContent = 'Good evening';
}

async function fetchModelStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const data = await res.json();
    const statSongs = document.getElementById('statSongs');
    const statDims = document.getElementById('statDims');
    if (statSongs) statSongs.textContent = `${(data.total_songs / 1000).toFixed(1)}K`;
    if (statDims) statDims.textContent = `${data.dimensions}D`;
  } catch (err) {
    console.warn('Could not fetch stats', err);
  }
}

/* ==========================================================================
   VIEW SWITCHING
   ========================================================================== */
function switchView(viewName) {
  state.activeView = viewName;

  // Toggle active class on sections
  const views = ['home', 'recommendations', 'blend', 'liked', 'radar'];
  views.forEach(v => {
    const el = document.getElementById(`view${capitalize(v)}`);
    if (el) el.classList.toggle('active', v === viewName);
  });

  // Toggle active nav button
  const navMap = {
    home: 'navHomeBtn',
    blend: 'navBlendBtn',
    liked: 'navLikedBtn',
    radar: 'navRadarBtn'
  };
  Object.keys(navMap).forEach(key => {
    const btn = document.getElementById(navMap[key]);
    if (btn) btn.classList.toggle('active', key === viewName);
  });

  // Scroll to top
  const scrollable = document.getElementById('contentScrollable');
  if (scrollable) scrollable.scrollTop = 0;

  // Special view updates
  if (viewName === 'liked') renderLikedGrid();
  if (viewName === 'blend') updateBlendUI();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ==========================================================================
   FEATURED PRESETS & FILTER CHIPS
   ========================================================================== */
async function loadPresets() {
  try {
    const res = await fetch('/api/presets');
    if (!res.ok) throw new Error('Preset fetch failed');
    state.presets = await res.json();
    renderPresetGrid(state.presets);
    
    // Set default track for player if not already set
    if (!state.currentTrack && state.presets.length > 0) {
      setPlayerTrack(state.presets[0], false);
    }
  } catch (err) {
    console.error('Error loading presets:', err);
    const grid = document.getElementById('presetTrackGrid');
    if (grid) grid.innerHTML = `<div class="basket-empty-msg">Could not load featured tracks. Please refresh.</div>`;
  }
}

function renderPresetGrid(tracks) {
  const grid = document.getElementById('presetTrackGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (tracks.length === 0) {
    grid.innerHTML = `<div class="basket-empty-msg" style="grid-column: 1/-1;">No tracks matched this filter.</div>`;
    return;
  }

  tracks.forEach(track => {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.title = `Click to get AI recommendations based on ${track.name}`;
    card.innerHTML = `
      <div class="card-cover-wrap">
        <div class="card-cover" style="background: ${track.gradient}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
        <button class="floating-play-btn" onclick="event.stopPropagation(); playSongFromCard('${track.id}')" title="Play preview">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>
      <div class="card-title">${escapeHtml(track.name)}</div>
      <div class="card-artist">${escapeHtml(track.artist)}</div>
      <div class="card-footer">
        <span class="card-year">${track.year}</span>
        <button class="card-add-blend" onclick="event.stopPropagation(); toggleBlendBasket('${track.id}')" title="Add to blend basket">+ Blend</button>
      </div>
    `;
    card.onclick = () => recommendById(track.id);
    grid.appendChild(card);
  });
}

function filterPresets(filterType, btn) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');

  let filtered = [...state.presets];
  if (filterType === 'high_energy') {
    filtered = filtered.filter(t => t.energy >= 0.65);
  } else if (filterType === 'chill') {
    filtered = filtered.filter(t => t.acousticness >= 0.3 || t.energy <= 0.5);
  } else if (filterType === 'dance') {
    filtered = filtered.filter(t => t.danceability >= 0.7);
  } else if (filterType === 'classics') {
    filtered = filtered.filter(t => t.year < 2000);
  } else if (filterType === 'happy') {
    filtered = filtered.filter(t => t.valence >= 0.6);
  }
  renderPresetGrid(filtered);
}

/* ==========================================================================
   LIVE SEARCH & AUTOCOMPLETE
   ========================================================================== */
function setupSearch() {
  const input = document.getElementById('searchInput');
  const dropdown = document.getElementById('searchDropdown');
  const clearBtn = document.getElementById('clearSearchBtn');
  let debounceTimeout = null;
  let highlightedIndex = -1;

  if (!input || !dropdown) return;

  input.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

    clearTimeout(debounceTimeout);
    if (!val) {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
      return;
    }

    debounceTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}&limit=10`);
        if (!res.ok) return;
        const results = await res.json();
        renderSearchDropdown(results);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 180);
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.search-item');
    if (!dropdown.classList.contains('open') || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % items.length;
      updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
      updateHighlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && items[highlightedIndex]) {
        items[highlightedIndex].click();
      } else if (items[0]) {
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      dropdown.classList.remove('open');
    }
    // Close export dropdowns
    if (!e.target.closest('.export-dropdown-wrapper')) {
      document.querySelectorAll('.export-menu-dropdown').forEach(m => m.classList.remove('open'));
    }
  });

  function updateHighlight(items) {
    items.forEach((it, idx) => {
      it.classList.toggle('highlighted', idx === highlightedIndex);
    });
  }
}

function renderSearchDropdown(results) {
  const dropdown = document.getElementById('searchDropdown');
  if (!dropdown) return;

  if (results.length === 0) {
    dropdown.innerHTML = `<div class="search-item" style="cursor: default; color: var(--text-subdued);">No tracks matching search</div>`;
    dropdown.classList.add('open');
    return;
  }

  dropdown.innerHTML = '';
  results.forEach(track => {
    const item = document.createElement('div');
    item.className = 'search-item';
    item.innerHTML = `
      <div class="search-item-cover" style="background: ${track.gradient}">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
      </div>
      <div class="search-item-details">
        <div class="search-item-title">${escapeHtml(track.name)}</div>
        <div class="search-item-sub">${escapeHtml(track.artist)}</div>
      </div>
      <div class="search-item-meta">
        <span class="search-item-year">${track.year}</span>
        <span class="pop-badge">${track.popularity} pop</span>
      </div>
    `;
    item.onclick = () => {
      dropdown.classList.remove('open');
      const input = document.getElementById('searchInput');
      if (input) input.value = `${track.name} - ${track.artist}`;
      recommendById(track.id);
    };
    dropdown.appendChild(item);
  });

  dropdown.classList.add('open');
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  const dropdown = document.getElementById('searchDropdown');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (input) input.value = '';
  if (dropdown) dropdown.classList.remove('open');
  if (clearBtn) clearBtn.style.display = 'none';
  if (input) input.focus();
}

function focusSearch() {
  const input = document.getElementById('searchInput');
  if (input) {
    input.focus();
    input.select();
  }
}

/* ==========================================================================
   RECOMMENDATIONS ENGINE
   ========================================================================== */
async function recommendById(trackId) {
  showToast('Computing 14D Cosine Neighbors...');
  try {
    const res = await fetch(`/api/recommend?id=${encodeURIComponent(trackId)}&n=15`);
    if (!res.ok) throw new Error('Recommendation request failed');
    const data = await res.json();
    renderRecommendations(data);
    switchView('recommendations');
    setPlayerTrack(data.seed, false);
    initVibeTuner(data.seed);
  } catch (err) {
    console.error('Error fetching recommendations:', err);
    showToast('Could not find recommendations for this track.');
  }
}

function recommendRandom() {
  if (state.presets.length > 0) {
    const rand = state.presets[Math.floor(Math.random() * state.presets.length)];
    recommendById(rand.id);
  } else {
    recommendById('0VjIjW4GlUZAMYd2vXMi3b');
  }
}

function renderRecommendations(data) {
  const seed = data.seed;
  const recs = data.recommendations;
  state.currentRecommendations = recs;
  state.currentSeed = seed;

  // Render Seed Track Card Info
  const coverEl = document.getElementById('seedHeroCover');
  const titleEl = document.getElementById('seedTitle');
  const artistEl = document.getElementById('seedArtist');
  const pillsEl = document.getElementById('seedMetaPills');

  if (coverEl) coverEl.style.background = seed.gradient;
  if (titleEl) titleEl.textContent = seed.name;
  if (artistEl) artistEl.textContent = seed.artist;

  if (pillsEl) {
    pillsEl.innerHTML = `
      <span class="meta-pill">📅 ${seed.year}</span>
      <span class="meta-pill">🔥 ${seed.popularity} Popularity</span>
      <span class="meta-pill">⏱️ ${seed.duration}</span>
      <span class="meta-pill">🥁 ${seed.tempo} BPM</span>
      <span class="meta-pill">🔊 ${seed.loudness} dB</span>
    `;
  }

  // FEATURE 1: Render Interactive SVG Spider Radar Chart
  renderRadarChart(seed, null);

  // Recommendations Table
  const tbody = document.getElementById('recommendationsTableBody');
  const countPill = document.getElementById('recCountPill');
  if (countPill) countPill.textContent = `${recs.length} Matches Found`;

  if (!tbody) return;
  tbody.innerHTML = '';

  recs.forEach((track, idx) => {
    const tr = document.createElement('tr');
    const vibe = getVibeTag(track);

    // Mouse hover listeners for Spider Radar Comparison
    tr.onmouseenter = () => compareTrackOnRadar(track.id);
    tr.onmouseleave = () => clearRadarComparison();

    tr.innerHTML = `
      <td class="td-num">${idx + 1}</td>
      <td>
        <div class="table-track-cell">
          <div class="table-track-cover" style="background: ${track.gradient}" onclick="playSongObject(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(track))}')))">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            <div class="table-track-play-overlay">
              <svg viewBox="0 0 24 24" fill="#fff" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
          <div>
            <div class="table-track-name" onclick="recommendById('${track.id}')" title="Click to branch recommendations from this track">${escapeHtml(track.name)}</div>
            <div class="table-track-artist">${escapeHtml(track.artist)} • ${track.year}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="match-bar-wrap">
          <div class="match-bar-track">
            <div class="match-bar-fill" style="width: ${track.match_pct}%"></div>
          </div>
          <span class="match-pct-text">${track.match_pct}%</span>
        </div>
      </td>
      <td><span class="vibe-tag ${vibe.cls}">${vibe.label}</span></td>
      <td class="tempo-cell">${track.tempo}</td>
      <td>
        <div class="match-bar-wrap">
          <div class="match-bar-track" style="height: 6px;">
            <div class="match-bar-fill" style="width: ${track.popularity}%; background: rgba(255,255,255,0.7);"></div>
          </div>
          <span style="font-size:0.75rem; color:var(--text-subdued);">${track.popularity}</span>
        </div>
      </td>
      <td>
        <div class="table-actions-cell">
          <button class="btn-icon-table" onclick="toggleLikeTrack('${track.id}')" title="Save to Liked Songs">
            <svg viewBox="0 0 24 24" fill="${isLiked(track.id) ? 'var(--spotify-green)' : 'none'}" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </button>
          <button class="btn-icon-table" onclick="toggleBlendBasket('${track.id}')" title="Add to Blend Basket">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button class="btn-icon-table btn-rec-more" onclick="recommendById('${track.id}')" title="Find tracks similar to this">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
          <button class="btn-icon-table" onclick="openSpotifyEmbed('${track.id}')" title="Play official Spotify audio preview">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.503 17.306c-.218.358-.684.474-1.042.256-2.855-1.745-6.449-2.14-10.683-1.173-.41.094-.817-.162-.911-.572-.094-.41.162-.817.572-.911 4.636-1.06 8.604-.613 11.808 1.358.358.218.474.684.256 1.042zm1.47-3.266c-.274.446-.86.588-1.306.314-3.268-2.008-8.25-2.59-12.114-1.417-.497.151-1.026-.134-1.177-.631-.151-.497.134-1.026.631-1.177 4.417-1.34 9.907-.687 13.652 1.605.446.274.588.86.314 1.306zm.126-3.41c-3.918-2.327-10.378-2.541-14.11-1.408-.601.182-1.241-.165-1.423-.766-.182-.601.165-1.241.766-1.423 4.29-1.302 11.418-1.052 15.938 1.631.54.32.716 1.023.396 1.563-.32.54-1.023.716-1.563.396z"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function getVibeTag(track) {
  if (track.energy > 0.75) return { label: '⚡ Energetic', cls: 'vibe-high' };
  if (track.danceability > 0.72) return { label: '🕺 Dance', cls: 'vibe-dance' };
  if (track.acousticness > 0.45 || track.energy < 0.4) return { label: '🌿 Chill', cls: 'vibe-chill' };
  if (track.valence > 0.65) return { label: '☀️ Uplifting', cls: 'vibe-high' };
  return { label: '🎵 Harmonic', cls: '' };
}

function playSeedSong() {
  if (state.currentSeed) playSongObject(state.currentSeed);
}

function addCurrentSeedToBlend() {
  if (state.currentSeed) toggleBlendBasket(state.currentSeed.id);
}

/* ==========================================================================
   FEATURE 1: INTERACTIVE 2-SONG SPIDER / RADAR COMPARISON CHART
   ========================================================================== */
function renderRadarChart(seed, comp = null) {
  const svg = document.getElementById('radarSvg');
  const compLabel = document.getElementById('radarCompLabel');
  const insight = document.getElementById('radarInsight');
  if (!svg) return;

  const cx = 140;
  const cy = 110;
  const r = 70;

  // 6 Primary Dimensions
  const traits = [
    { key: 'energy', label: 'Energy' },
    { key: 'danceability', label: 'Dance' },
    { key: 'valence', label: 'Valence' },
    { key: 'acousticness', label: 'Acoustic' },
    { key: 'tempo_norm', label: 'Tempo' },
    { key: 'liveness', label: 'Liveness' }
  ];

  const numAxes = traits.length;
  const angleStep = (Math.PI * 2) / numAxes;

  // Build SVG content
  let svgContent = '';

  // 1. Background Grid Rings (25%, 50%, 75%, 100%)
  [0.25, 0.5, 0.75, 1.0].forEach(level => {
    let pts = [];
    for (let i = 0; i < numAxes; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = cx + r * level * Math.cos(angle);
      const y = cy + r * level * Math.sin(angle);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    svgContent += `<polygon points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
  });

  // 2. Axis Lines and Labels
  for (let i = 0; i < numAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    svgContent += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-width="1" />`;

    // Label positioning
    const lx = cx + (r + 18) * Math.cos(angle);
    const ly = cy + (r + 14) * Math.sin(angle);
    svgContent += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#888" font-size="9" font-weight="700">${traits[i].label}</text>`;
  }

  // Helper to extract normalized values (0.0 to 1.0)
  function getVal(track, key) {
    if (key === 'tempo_norm') {
      const t = track.tempo || 120;
      return Math.min(1.0, Math.max(0.1, (t - 50) / 130));
    }
    return Math.min(1.0, Math.max(0.05, track[key] !== undefined ? track[key] : 0.5));
  }

  // 3. Render Seed Polygon (Spotify Green)
  let seedPts = [];
  let seedCircles = '';
  for (let i = 0; i < numAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const v = getVal(seed, traits[i].key);
    const x = cx + r * v * Math.cos(angle);
    const y = cy + r * v * Math.sin(angle);
    seedPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    seedCircles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#1DB954" />`;
  }
  svgContent += `<polygon points="${seedPts.join(' ')}" fill="rgba(29, 185, 84, 0.35)" stroke="#1DB954" stroke-width="2.2" />`;
  svgContent += seedCircles;

  // 4. Render Comparison Polygon if hovered (Cyan #00e5ff)
  if (comp) {
    let compPts = [];
    let compCircles = '';
    for (let i = 0; i < numAxes; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const v = getVal(comp, traits[i].key);
      const x = cx + r * v * Math.cos(angle);
      const y = cy + r * v * Math.sin(angle);
      compPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      compCircles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#00e5ff" />`;
    }
    svgContent += `<polygon points="${compPts.join(' ')}" fill="rgba(0, 229, 255, 0.32)" stroke="#00e5ff" stroke-width="2.2" stroke-dasharray="3 2" />`;
    svgContent += compCircles;

    if (compLabel) compLabel.textContent = comp.name;
    if (insight) {
      const dEnergy = Math.round((comp.energy - seed.energy) * 100);
      const dDance = Math.round((comp.danceability - seed.danceability) * 100);
      const signE = dEnergy >= 0 ? `+${dEnergy}%` : `${dEnergy}%`;
      const signD = dDance >= 0 ? `+${dDance}%` : `${dDance}%`;
      insight.textContent = `Comparing "${comp.name}": Energy (${signE}), Danceability (${signD}) — ${comp.match_pct || 98}% match.`;
    }
  } else {
    if (compLabel) compLabel.textContent = 'Match (Hover)';
    if (insight) insight.textContent = 'Hover over any recommended song below to compare vector overlap in real time.';
  }

  svg.innerHTML = svgContent;
}

function compareTrackOnRadar(trackId) {
  if (!state.currentRecommendations || !state.currentSeed) return;
  const comp = state.currentRecommendations.find(t => t.id === trackId);
  if (comp) {
    state.comparisonTrack = comp;
    renderRadarChart(state.currentSeed, comp);
  }
}

function clearRadarComparison() {
  if (state.currentSeed) {
    state.comparisonTrack = null;
    renderRadarChart(state.currentSeed, null);
  }
}

/* ==========================================================================
   FEATURE 2: VIBE TUNER / PARAMETRIC FILTER SLIDERS
   ========================================================================== */
function toggleVibeTuner() {
  const body = document.getElementById('vibeTunerBody');
  const btn = document.getElementById('vibeTunerToggleBtn');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.textContent = isOpen ? 'Customize Vibe ▾' : 'Close Vibe Tuner ▴';
}

function initVibeTuner(seed) {
  if (!seed) return;
  setSliderVal('slideEnergy', 'valTuneEnergy', Math.round((seed.energy || 0.7) * 100), (seed.energy || 0.7).toFixed(2));
  setSliderVal('slideDance', 'valTuneDance', Math.round((seed.danceability || 0.65) * 100), (seed.danceability || 0.65).toFixed(2));
  setSliderVal('slideValence', 'valTuneValence', Math.round((seed.valence || 0.5) * 100), (seed.valence || 0.5).toFixed(2));
  setSliderVal('slideAcoustic', 'valTuneAcoustic', Math.round((seed.acousticness || 0.2) * 100), (seed.acousticness || 0.2).toFixed(2));
  setSliderVal('slideTempo', 'valTuneTempo', Math.round(seed.tempo || 120), `${Math.round(seed.tempo || 120)} BPM`);
  
  const badge = document.getElementById('vibeBadge');
  if (badge) {
    badge.textContent = 'Standard Mode';
    badge.classList.remove('tuned');
  }
}

function setSliderVal(sliderId, labelId, val, labelText) {
  const s = document.getElementById(sliderId);
  const l = document.getElementById(labelId);
  if (s) s.value = val;
  if (l) l.textContent = labelText;
}

function updateTuneSlider(trait, val) {
  if (trait === 'energy') document.getElementById('valTuneEnergy').textContent = (val / 100).toFixed(2);
  if (trait === 'danceability') document.getElementById('valTuneDance').textContent = (val / 100).toFixed(2);
  if (trait === 'valence') document.getElementById('valTuneValence').textContent = (val / 100).toFixed(2);
  if (trait === 'acousticness') document.getElementById('valTuneAcoustic').textContent = (val / 100).toFixed(2);
  if (trait === 'tempo') document.getElementById('valTuneTempo').textContent = `${val} BPM`;
}

async function applyVibeTuning() {
  if (!state.currentSeed) return;
  showToast('Re-weighting query vector...');

  const tunedEnergy = Number(document.getElementById('slideEnergy').value) / 100;
  const tunedDance = Number(document.getElementById('slideDance').value) / 100;
  const tunedValence = Number(document.getElementById('slideValence').value) / 100;
  const tunedAcoustic = Number(document.getElementById('slideAcoustic').value) / 100;
  const tunedTempo = Number(document.getElementById('slideTempo').value);

  try {
    const res = await fetch('/api/recommend-tuned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.currentSeed.id,
        energy: tunedEnergy,
        danceability: tunedDance,
        valence: tunedValence,
        acousticness: tunedAcoustic,
        tempo: tunedTempo,
        n: 15
      })
    });
    if (!res.ok) throw new Error('Tuned recommend failed');
    const data = await res.json();
    renderRecommendations(data);

    const badge = document.getElementById('vibeBadge');
    if (badge) {
      badge.textContent = 'Custom Vibe Active';
      badge.classList.add('tuned');
    }
    showToast('Applied custom vibe vector weights!');
  } catch (err) {
    console.error('Error applying vibe tuning:', err);
    showToast('Failed to apply custom vibe weights.');
  }
}

function resetVibeTuner() {
  if (state.currentSeed) {
    initVibeTuner(state.currentSeed);
    recommendById(state.currentSeed.id);
    showToast('Reset vector weights to seed track.');
  }
}

/* ==========================================================================
   FEATURE 3: OFFICIAL SPOTIFY MINI-PLAYER EMBED DOCK
   ========================================================================== */
function openSpotifyEmbed(trackId) {
  const dock = document.getElementById('spotifyEmbedDock');
  const iframe = document.getElementById('spotifyEmbedIframe');
  if (!dock || !iframe) return;

  iframe.src = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;
  dock.classList.add('open');
  showToast('Opened official Spotify preview player');
}

function openSpotifyEmbedForCurrentSeed() {
  if (state.currentSeed) openSpotifyEmbed(state.currentSeed.id);
  else if (state.currentTrack) openSpotifyEmbed(state.currentTrack.id);
}

function closeSpotifyEmbed() {
  const dock = document.getElementById('spotifyEmbedDock');
  const iframe = document.getElementById('spotifyEmbedIframe');
  if (dock) dock.classList.remove('open');
  if (iframe) iframe.src = '';
}

function toggleSpotifyEmbed() {
  const dock = document.getElementById('spotifyEmbedDock');
  if (!dock) return;
  if (dock.classList.contains('open')) {
    closeSpotifyEmbed();
  } else {
    const id = state.currentTrack?.id || state.currentSeed?.id || '0VjIjW4GlUZAMYd2vXMi3b';
    openSpotifyEmbed(id);
  }
}

/* ==========================================================================
   FEATURE 5: PLAYLIST EXPORT (.CSV / SPOTIFY URLS / M3U8)
   ========================================================================== */
function toggleExportMenu(type) {
  const menuId = type === 'blend' ? 'exportMenuBlend' : 'exportMenuRec';
  const menu = document.getElementById(menuId);
  if (!menu) return;
  menu.classList.toggle('open');
}

function getExportList(type) {
  if (type === 'blend') {
    return state.currentBlendRecommendations || [];
  }
  return state.currentRecommendations || [];
}

function copySpotifyUrls(type) {
  const list = getExportList(type);
  if (list.length === 0) {
    showToast('No recommendations available to export.');
    return;
  }
  const urls = list.map(t => t.spotify_url).join('\n');
  navigator.clipboard.writeText(urls).then(() => {
    showToast(`Copied ${list.length} Spotify track URLs to clipboard!`);
    document.querySelectorAll('.export-menu-dropdown').forEach(m => m.classList.remove('open'));
  }).catch(() => {
    showToast('Could not copy to clipboard.');
  });
}

function downloadCSV(type) {
  const list = getExportList(type);
  if (list.length === 0) {
    showToast('No recommendations available to export.');
    return;
  }
  let csv = 'Track Name,Artist,Year,Popularity,Similarity Match %,BPM,Spotify URL\n';
  list.forEach(t => {
    const row = [
      `"${t.name.replace(/"/g, '""')}"`,
      `"${t.artist.replace(/"/g, '""')}"`,
      t.year,
      t.popularity,
      t.match_pct || '',
      t.tempo || '',
      t.spotify_url
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Spotify_AI_Recommendations_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Downloaded CSV spreadsheet!');
  document.querySelectorAll('.export-menu-dropdown').forEach(m => m.classList.remove('open'));
}

function downloadM3U(type) {
  const list = getExportList(type);
  if (list.length === 0) {
    showToast('No recommendations available to export.');
    return;
  }
  let m3u = '#EXTM3U\n';
  list.forEach(t => {
    m3u += `#EXTINF:${t.duration_ms ? Math.round(t.duration_ms / 1000) : 200},${t.artist} - ${t.name}\n`;
    m3u += `${t.spotify_url}\n`;
  });

  const blob = new Blob([m3u], { type: 'audio/x-mpegurl;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Spotify_AI_Playlist_${Date.now()}.m3u8`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Downloaded M3U8 playlist file!');
  document.querySelectorAll('.export-menu-dropdown').forEach(m => m.classList.remove('open'));
}

/* ==========================================================================
   TASTE BLEND (MULTI-SEED CENTROID)
   ========================================================================== */
function toggleBlendBasket(trackId) {
  const idx = state.blendBasket.findIndex(t => t.id === trackId);
  if (idx >= 0) {
    state.blendBasket.splice(idx, 1);
    showToast('Removed from Blend basket');
  } else {
    if (state.blendBasket.length >= 5) {
      showToast('Maximum 5 tracks in Blend basket.');
      return;
    }
    findTrackById(trackId).then(track => {
      if (track) {
        state.blendBasket.push(track);
        showToast(`Added "${track.name}" to Blend`);
        updateBlendUI();
      }
    });
    return;
  }
  updateBlendUI();
}

async function findTrackById(trackId) {
  let found = state.presets.find(t => t.id === trackId);
  if (found) return found;
  if (state.currentRecommendations) {
    found = state.currentRecommendations.find(t => t.id === trackId);
    if (found) return found;
  }
  if (state.currentSeed && state.currentSeed.id === trackId) return state.currentSeed;
  try {
    const res = await fetch(`/api/song/${trackId}`);
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
}

function updateBlendUI() {
  const badge = document.getElementById('blendCountBadge');
  const sidebarList = document.getElementById('blendBasketList');
  const btnRun = document.getElementById('btnRunBlend');
  const btnLarge = document.getElementById('btnExecuteBlendLarge');
  const countSpan = document.getElementById('blendBasketCount');
  const container = document.getElementById('blendSeedsContainer');

  const count = state.blendBasket.length;
  if (badge) badge.textContent = count;
  if (countSpan) countSpan.textContent = count;

  const canRun = count >= 2;
  if (btnRun) btnRun.disabled = !canRun;
  if (btnLarge) btnLarge.disabled = !canRun;

  if (sidebarList) {
    if (count === 0) {
      sidebarList.innerHTML = `<div class="basket-empty-msg">Add tracks to blend taste vectors</div>`;
    } else {
      sidebarList.innerHTML = '';
      state.blendBasket.forEach(t => {
        const item = document.createElement('div');
        item.className = 'basket-item';
        item.innerHTML = `
          <div class="basket-item-info">
            <div class="basket-item-name">${escapeHtml(t.name)}</div>
            <div class="basket-item-artist">${escapeHtml(t.artist)}</div>
          </div>
          <button class="basket-item-remove" onclick="toggleBlendBasket('${t.id}')">✕</button>
        `;
        sidebarList.appendChild(item);
      });
    }
  }

  if (container) {
    if (count === 0) {
      container.innerHTML = `
        <div class="empty-blend-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="48" height="48"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
          <p>Your blend basket is empty.</p>
          <span>Search for any song or click "+ Blend" on any song card to add seeds here.</span>
        </div>
      `;
    } else {
      container.innerHTML = '';
      state.blendBasket.forEach(t => {
        const div = document.createElement('div');
        div.className = 'basket-item';
        div.style.padding = '12px 16px';
        div.innerHTML = `
          <div class="table-track-cover" style="width: 36px; height: 36px; background: ${t.gradient}; border-radius: 4px;">
            <svg viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </div>
          <div class="basket-item-info">
            <div class="basket-item-name" style="font-size: 0.95rem;">${escapeHtml(t.name)}</div>
            <div class="basket-item-artist">${escapeHtml(t.artist)} (${t.year})</div>
          </div>
          <button class="basket-item-remove" onclick="toggleBlendBasket('${t.id}')" title="Remove track">✕</button>
        `;
        container.appendChild(div);
      });
    }
  }
}

function clearBlendBasket() {
  state.blendBasket = [];
  updateBlendUI();
  const resultsSec = document.getElementById('blendResultsSection');
  if (resultsSec) resultsSec.style.display = 'none';
  showToast('Blend basket cleared');
}

async function runBlendRecommendation() {
  if (state.blendBasket.length < 2) {
    showToast('Add at least 2 tracks to generate a blend.');
    return;
  }
  showToast('Calculating centroid of taste vectors...');
  try {
    const ids = state.blendBasket.map(t => t.id);
    const res = await fetch('/api/blend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids, n: 15 })
    });
    if (!res.ok) throw new Error('Blend failed');
    const data = await res.json();
    state.currentBlendRecommendations = data.recommendations;
    renderBlendResults(data.recommendations);
    switchView('blend');
  } catch (err) {
    console.error('Error running blend:', err);
    showToast('Failed to compute blended recommendations.');
  }
}

function renderBlendResults(recs) {
  const sec = document.getElementById('blendResultsSection');
  const tbody = document.getElementById('blendTableBody');
  if (!sec || !tbody) return;
  sec.style.display = 'block';
  tbody.innerHTML = '';

  recs.forEach((track, idx) => {
    const tr = document.createElement('tr');
    const vibe = getVibeTag(track);
    tr.innerHTML = `
      <td class="td-num">${idx + 1}</td>
      <td>
        <div class="table-track-cell">
          <div class="table-track-cover" style="background: ${track.gradient}" onclick="playSongObject(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(track))}')))">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            <div class="table-track-play-overlay">
              <svg viewBox="0 0 24 24" fill="#fff" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
          <div>
            <div class="table-track-name" onclick="recommendById('${track.id}')">${escapeHtml(track.name)}</div>
            <div class="table-track-artist">${escapeHtml(track.artist)} • ${track.year}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="match-bar-wrap">
          <div class="match-bar-track">
            <div class="match-bar-fill" style="width: ${track.match_pct}%"></div>
          </div>
          <span class="match-pct-text">${track.match_pct}%</span>
        </div>
      </td>
      <td><span class="vibe-tag ${vibe.cls}">${vibe.label}</span></td>
      <td class="tempo-cell">${track.tempo}</td>
      <td>
        <div class="match-bar-wrap">
          <div class="match-bar-track" style="height: 6px;">
            <div class="match-bar-fill" style="width: ${track.popularity}%; background: rgba(255,255,255,0.7);"></div>
          </div>
          <span style="font-size:0.75rem; color:var(--text-subdued);">${track.popularity}</span>
        </div>
      </td>
      <td>
        <div class="table-actions-cell">
          <button class="btn-icon-table" onclick="toggleLikeTrack('${track.id}')">
            <svg viewBox="0 0 24 24" fill="${isLiked(track.id) ? 'var(--spotify-green)' : 'none'}" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </button>
          <button class="btn-icon-table btn-rec-more" onclick="recommendById('${track.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
          <button class="btn-icon-table" onclick="openSpotifyEmbed('${track.id}')" title="Play official Spotify audio preview">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.503 17.306c-.218.358-.684.474-1.042.256-2.855-1.745-6.449-2.14-10.683-1.173-.41.094-.817-.162-.911-.572-.094-.41.162-.817.572-.911 4.636-1.06 8.604-.613 11.808 1.358.358.218.474.684.256 1.042zm1.47-3.266c-.274.446-.86.588-1.306.314-3.268-2.008-8.25-2.59-12.114-1.417-.497.151-1.026-.134-1.177-.631-.151-.497.134-1.026.631-1.177 4.417-1.34 9.907-.687 13.652 1.605.446.274.588.86.314 1.306zm.126-3.41c-3.918-2.327-10.378-2.541-14.11-1.408-.601.182-1.241-.165-1.423-.766-.182-.601.165-1.241.766-1.423 4.29-1.302 11.418-1.052 15.938 1.631.54.32.716 1.023.396 1.563-.32.54-1.023.716-1.563.396z"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function loadBlendPreset(presetType) {
  const map = {
    pop_rock: ['0VjIjW4GlUZAMYd2vXMi3b', '4u7EnebtmKWzUH433cf5Qv'],
    dance_chill: ['2xLMifvAHQIcuKV6v8974V', '1BxfuPKGuaTgP7aM0XbdHN', '2Foc5Q5nqNiosCNqttzNZ8'],
    high_voltage: ['7szuecWpewWKOC3cCMwtGM', '0t1kP63rueHleOhQkYSXFY', '5ghIJDpPoe3CfHMTe7w1Tk']
  };
  const ids = map[presetType] || [];
  state.blendBasket = [];
  Promise.all(ids.map(id => findTrackById(id))).then(tracks => {
    state.blendBasket = tracks.filter(Boolean);
    updateBlendUI();
    runBlendRecommendation();
  });
}

/* ==========================================================================
   LIKED SONGS (LOCAL STORAGE)
   ========================================================================== */
function loadLikedSongsFromStorage() {
  try {
    const raw = localStorage.getItem('spotify_ml_liked_songs');
    if (raw) state.likedSongs = JSON.parse(raw);
  } catch (e) {
    state.likedSongs = [];
  }
  updateLikedBadge();
}

function saveLikedSongsToStorage() {
  try {
    localStorage.setItem('spotify_ml_liked_songs', JSON.stringify(state.likedSongs));
  } catch (e) {}
  updateLikedBadge();
}

function isLiked(trackId) {
  return state.likedSongs.some(t => t.id === trackId);
}

function toggleLikeTrack(trackId) {
  const idx = state.likedSongs.findIndex(t => t.id === trackId);
  if (idx >= 0) {
    state.likedSongs.splice(idx, 1);
    showToast('Removed from Liked Songs');
  } else {
    findTrackById(trackId).then(track => {
      if (track) {
        state.likedSongs.push(track);
        showToast(`Saved "${track.name}" to Liked Songs`);
        saveLikedSongsToStorage();
        if (state.activeView === 'liked') renderLikedGrid();
        updatePlayerHeart();
      }
    });
    return;
  }
  saveLikedSongsToStorage();
  if (state.activeView === 'liked') renderLikedGrid();
  updatePlayerHeart();
}

function toggleLikeCurrent() {
  if (state.currentTrack) toggleLikeTrack(state.currentTrack.id);
}

function updateLikedBadge() {
  const badge = document.getElementById('likedCountBadge');
  const countText = document.getElementById('likedCountText');
  const len = state.likedSongs.length;
  if (badge) badge.textContent = len;
  if (countText) countText.textContent = `${len} ${len === 1 ? 'song' : 'songs'}`;
}

function updatePlayerHeart() {
  const heartBtn = document.getElementById('playerHeartBtn');
  if (!heartBtn) return;
  const liked = state.currentTrack && isLiked(state.currentTrack.id);
  heartBtn.classList.toggle('liked', liked);
}

function renderLikedGrid() {
  const grid = document.getElementById('likedGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (state.likedSongs.length === 0) {
    grid.innerHTML = `<div class="basket-empty-msg" style="grid-column: 1/-1; padding: 40px;">No liked songs yet. Click the heart icon on any song to save it!</div>`;
    return;
  }

  state.likedSongs.forEach(track => {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.innerHTML = `
      <div class="card-cover-wrap">
        <div class="card-cover" style="background: ${track.gradient}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
        <button class="floating-play-btn" onclick="event.stopPropagation(); playSongFromCard('${track.id}')">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>
      <div class="card-title">${escapeHtml(track.name)}</div>
      <div class="card-artist">${escapeHtml(track.artist)}</div>
      <div class="card-footer">
        <span class="card-year">${track.year}</span>
        <button class="card-add-blend" onclick="event.stopPropagation(); toggleLikeTrack('${track.id}')" style="color: #ff5555; border-color: rgba(255,85,85,0.4);">Remove</button>
      </div>
    `;
    card.onclick = () => recommendById(track.id);
    grid.appendChild(card);
  });
}

function clearAllLiked() {
  state.likedSongs = [];
  saveLikedSongsToStorage();
  renderLikedGrid();
  updatePlayerHeart();
  showToast('Liked songs cleared');
}

function blendAllLiked() {
  if (state.likedSongs.length < 2) {
    showToast('Like at least 2 songs to blend them.');
    return;
  }
  state.blendBasket = state.likedSongs.slice(0, 5);
  updateBlendUI();
  switchView('blend');
  runBlendRecommendation();
}

/* ==========================================================================
   FEATURE 4: WEB AUDIO & CANVAS AUDIO SPECTRUM VISUALIZER
   ========================================================================== */
function initWebAudio() {
  if (!state.audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();
    state.masterGain = state.audioContext.createGain();
    state.masterGain.gain.value = 0.3;

    // Connect to AnalyserNode for spectrum visualization
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 64;
    state.analyser.smoothingTimeConstant = 0.75;

    state.masterGain.connect(state.analyser);
    state.analyser.connect(state.audioContext.destination);
  }
  if (state.audioContext.state === 'suspended') {
    state.audioContext.resume();
  }
}

function setAudioVolume(val) {
  if (state.masterGain && state.audioContext) {
    state.masterGain.gain.setValueAtTime((val / 100) * 0.4, state.audioContext.currentTime);
  }
}

function playSongFromCard(trackId) {
  findTrackById(trackId).then(track => {
    if (track) playSongObject(track);
  });
}

function playSongObject(track) {
  setPlayerTrack(track, true);
}

function setPlayerTrack(track, autoPlay = true) {
  state.currentTrack = track;
  state.currentTime = 0;
  state.durationSec = track.duration_ms ? Math.round(track.duration_ms / 1000) : 210;

  const titleEl = document.getElementById('playerTitle');
  const artistEl = document.getElementById('playerArtist');
  const coverEl = document.getElementById('playerCover');
  const timeTotalEl = document.getElementById('timeTotal');
  const timeCurEl = document.getElementById('timeCurrent');
  const extBtn = document.getElementById('btnSpotifyExternal');

  if (titleEl) titleEl.textContent = track.name;
  if (artistEl) artistEl.textContent = track.artist;
  if (coverEl) coverEl.style.background = track.gradient;
  if (timeTotalEl) timeTotalEl.textContent = track.duration || '3:30';
  if (timeCurEl) timeCurEl.textContent = '0:00';
  if (extBtn) extBtn.href = track.spotify_url;

  updatePlayerProgress();
  updatePlayerHeart();

  if (autoPlay) {
    startPlayback();
  }
}

function togglePlayPause() {
  if (state.isPlaying) pausePlayback();
  else startPlayback();
}

function startPlayback() {
  initWebAudio();
  state.isPlaying = true;
  updatePlayButtonUI(true);

  // Scrubber timer
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.currentTime += 1;
    if (state.currentTime >= state.durationSec) {
      playNext();
    } else {
      updatePlayerProgress();
    }
  }, 1000);

  startSynthEngine();
  startCanvasSpectrumLoop();
}

function pausePlayback() {
  state.isPlaying = false;
  updatePlayButtonUI(false);
  clearInterval(state.timerInterval);
  clearInterval(state.synthInterval);
}

function updatePlayButtonUI(playing) {
  const playIcon = document.getElementById('ctrlPlayIcon');
  const pauseIcon = document.getElementById('ctrlPauseIcon');
  if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
  if (pauseIcon) pauseIcon.style.display = playing ? 'block' : 'none';
}

function updatePlayerProgress() {
  const fill = document.getElementById('progressBarFill');
  const timeCur = document.getElementById('timeCurrent');
  if (!fill || !timeCur) return;

  const pct = Math.min(100, (state.currentTime / state.durationSec) * 100);
  fill.style.width = `${pct}%`;

  const m = Math.floor(state.currentTime / 60);
  const s = state.currentTime % 60;
  timeCur.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
}

function seekAudio(e) {
  const container = document.getElementById('progressBarContainer');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  state.currentTime = Math.round(ratio * state.durationSec);
  updatePlayerProgress();
}

function playNext() {
  if (state.currentRecommendations && state.currentRecommendations.length > 0) {
    const curIdx = state.currentRecommendations.findIndex(t => t.id === state.currentTrack?.id);
    const nextIdx = (curIdx + 1) % state.currentRecommendations.length;
    playSongObject(state.currentRecommendations[nextIdx]);
  } else if (state.presets.length > 0) {
    const curIdx = state.presets.findIndex(t => t.id === state.currentTrack?.id);
    const nextIdx = (curIdx + 1) % state.presets.length;
    playSongObject(state.presets[nextIdx]);
  }
}

function playPrev() {
  if (state.currentTime > 3) {
    state.currentTime = 0;
    updatePlayerProgress();
    return;
  }
  if (state.currentRecommendations && state.currentRecommendations.length > 0) {
    const curIdx = state.currentRecommendations.findIndex(t => t.id === state.currentTrack?.id);
    const prevIdx = (curIdx - 1 + state.currentRecommendations.length) % state.currentRecommendations.length;
    playSongObject(state.currentRecommendations[prevIdx]);
  }
}

function toggleShuffle() {
  const btn = document.getElementById('ctrlShuffle');
  if (btn) btn.classList.toggle('active');
  showToast('Shuffle mode toggled');
}

function toggleRepeat() {
  const btn = document.getElementById('ctrlRepeat');
  if (btn) btn.classList.toggle('active');
  showToast('Repeat mode toggled');
}

/* ==========================================================================
   AMBIENT CHORD SYNTHESIZER (WEB AUDIO API)
   ========================================================================== */
function startSynthEngine() {
  clearInterval(state.synthInterval);
  if (!state.audioContext || !state.masterGain) return;

  const track = state.currentTrack || { tempo: 120, valence: 0.5, energy: 0.5 };
  const bpm = track.tempo || 120;
  const beatInterval = (60 / bpm) * 1000;

  const isMajor = track.valence >= 0.5;
  const scale = isMajor 
    ? [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]
    : [220.00, 261.63, 293.66, 329.63, 392.00, 440.00];

  let step = 0;

  const playChordNote = () => {
    if (!state.isPlaying || !state.audioContext) return;
    try {
      const now = state.audioContext.currentTime;
      const osc = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();

      const noteFreq = scale[step % scale.length];
      osc.type = track.energy > 0.6 ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(noteFreq, now);

      const filter = state.audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800 + (track.energy * 1200), now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (beatInterval / 1000) * 1.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(state.masterGain);

      osc.start(now);
      osc.stop(now + (beatInterval / 1000) * 1.6);
      step++;
    } catch (err) {}
  };

  playChordNote();
  state.synthInterval = setInterval(playChordNote, beatInterval * 1.25);
}

/* ==========================================================================
   FEATURE 4: CANVAS FREQUENCY SPECTRUM VISUALIZER LOOP
   ========================================================================== */
function setupCanvasSpectrum() {
  const canvas = document.getElementById('audioVisualizerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function startCanvasSpectrumLoop() {
  if (state.visualizerRunning) return;
  state.visualizerRunning = true;

  const canvas = document.getElementById('audioVisualizerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const bufferLength = state.analyser ? state.analyser.frequencyBinCount : 32;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    if (!state.isPlaying) {
      // Draw resting flat bars
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = 6;
      const gap = 3;
      const totalBars = 12;
      for (let i = 0; i < totalBars; i++) {
        const x = i * (barWidth + gap) + 6;
        ctx.fillStyle = 'rgba(29, 185, 84, 0.25)';
        ctx.beginPath();
        ctx.roundRect(x, canvas.height - 4, barWidth, 4, [2, 2, 0, 0]);
        ctx.fill();
      }
      state.visualizerRunning = false;
      return;
    }

    requestAnimationFrame(draw);

    if (state.analyser) {
      state.analyser.getByteFrequencyData(dataArray);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totalBars = 12;
    const barWidth = 6;
    const gap = 3;

    for (let i = 0; i < totalBars; i++) {
      const val = dataArray[i * 2] || 0;
      const barHeight = Math.max(4, (val / 255) * canvas.height * 0.95);
      const x = i * (barWidth + gap) + 6;
      const y = canvas.height - barHeight;

      // Gradient from Spotify green to bright cyan
      const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
      grad.addColorStop(0, '#1ed760');
      grad.addColorStop(1, '#00e5ff');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
      ctx.fill();
    }
  }

  requestAnimationFrame(draw);
}

/* ==========================================================================
   KEYBOARD SHORTCUTS
   ========================================================================== */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      togglePlayPause();
    }
    if (e.key === '/' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      focusSearch();
    }
    if (e.key === 'Escape') {
      closeSpotifyEmbed();
      document.querySelectorAll('.export-menu-dropdown').forEach(m => m.classList.remove('open'));
    }
  });
}

/* ==========================================================================
   HELPERS & TOAST
   ========================================================================== */
function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

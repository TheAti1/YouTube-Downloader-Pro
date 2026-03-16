// ============================================
// YouTube Downloader Pro - Main Application
// ============================================

const socket = io();

// ============ STATE ============
let currentLang = localStorage.getItem('yt-dl-lang') || 'tr';
let currentTheme = localStorage.getItem('yt-dl-theme') || 'dark';
let currentVideoInfo = null;
let selectedQuality = '1080';
let selectedAudioFormat = 'mp3';
let selectedAudioQuality = '0';
let selectedVideoAudio = true;
let selectedPlaylistVideos = new Set();
let downloadHistory = JSON.parse(localStorage.getItem('yt-dl-history') || '[]');

// ============ DOM ELEMENTS ============
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme);
  applyLanguage(currentLang);
  buildLangDropdown();
  setupEventListeners();
});

// ============ LANGUAGE SYSTEM ============
function t(key) {
  const lang = LANGUAGES[currentLang];
  return lang?.strings?.[key] || LANGUAGES.en.strings[key] || key;
}

function applyLanguage(langCode) {
  currentLang = langCode;
  localStorage.setItem('yt-dl-lang', langCode);
  const lang = LANGUAGES[langCode];
  if (!lang) return;

  $('currentLangName').textContent = lang.name;
  document.documentElement.lang = langCode;

  $$('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = lang.strings[key];
    if (val) el.textContent = val;
  });

  $$('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = lang.strings[key];
    if (val) el.placeholder = val;
  });

  // Update dropdown active state
  $$('.lang-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.lang === langCode);
  });
}

function buildLangDropdown() {
  const dropdown = $('langDropdown');
  let html = `<div class="lang-dropdown-search"><input type="text" id="langSearch" placeholder="${t('searchLang')}" autocomplete="off"></div>`;
  html += '<div class="lang-options-list">';
  for (const [code, lang] of Object.entries(LANGUAGES)) {
    html += `<div class="lang-option ${code === currentLang ? 'active' : ''}" data-lang="${code}">
      <span class="lang-flag">${lang.flag}</span>
      <span class="lang-name">${lang.name}</span>
    </div>`;
  }
  html += '</div>';
  dropdown.innerHTML = html;

  // Search filter
  const searchInput = $('langSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('.lang-option').forEach(opt => {
        const name = opt.querySelector('.lang-name').textContent.toLowerCase();
        opt.style.display = name.includes(q) ? '' : 'none';
      });
    });
  }

  // Click handler
  dropdown.addEventListener('click', (e) => {
    const opt = e.target.closest('.lang-option');
    if (opt) {
      applyLanguage(opt.dataset.lang);
      dropdown.classList.remove('open');
    }
  });
}

// ============ THEME SYSTEM ============
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('yt-dl-theme', theme);
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
  // Theme toggle
  $('themeToggle').addEventListener('click', () => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  // Language dropdown
  $('langBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('langDropdown').classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.lang-selector')) {
      $('langDropdown').classList.remove('open');
    }
  });

  // Paste button
  $('pasteBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      $('urlInput').value = text;
      showToast(t('copiedUrl'), 'info');
    } catch { /* clipboard access denied */ }
  });

  // Analyze button
  $('analyzeBtn').addEventListener('click', analyzeUrl);
  $('urlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') analyzeUrl();
  });

  // Retry
  $('retryBtn').addEventListener('click', analyzeUrl);

  // Tab navigation
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      $(`tab-${tab}`).classList.add('active');
    });
  });

  // Quality buttons
  $$('.quality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.quality-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedQuality = btn.dataset.quality;
    });
  });

  // Audio format buttons
  $$('.format-btn:not(.video-audio-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.format-btn:not(.video-audio-btn)').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAudioFormat = btn.dataset.format;
    });
  });

  // Video Audio toggle buttons
  $$('.video-audio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.video-audio-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedVideoAudio = btn.dataset.audio === 'yes';
    });
  });

  // Audio quality
  $('audioQualitySelect').addEventListener('change', (e) => {
    selectedAudioQuality = e.target.value;
  });

  // Trim toggle
  $('trimToggle').addEventListener('change', (e) => {
    $('trimInputs').style.display = e.target.checked ? 'flex' : 'none';
  });

  // Download buttons
  $('downloadVideoBtn').addEventListener('click', () => downloadVideo());
  $('downloadAudioBtn').addEventListener('click', () => downloadAudio());
  $('downloadThumbnailBtn').addEventListener('click', () => downloadThumbnail());

  // Playlist
  $('selectAllBtn').addEventListener('click', toggleSelectAll);
  $('downloadPlaylistBtn').addEventListener('click', downloadPlaylist);

  // Quick actions
  $$('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'batch') {
        $('batchModal').style.display = 'flex';
      } else if (action === 'history') {
        showHistory();
      }
    });
  });

  // Batch modal
  $('closeBatchModal').addEventListener('click', () => {
    $('batchModal').style.display = 'none';
  });
  $('batchModal').addEventListener('click', (e) => {
    if (e.target === $('batchModal')) $('batchModal').style.display = 'none';
  });
  $('startBatchBtn').addEventListener('click', startBatchDownload);

  // Bulk Save
  const saveAllBtn = $('saveAllBtn');
  if(saveAllBtn) saveAllBtn.addEventListener('click', saveAllToFolder);

  // History
  $('clearHistoryBtn').addEventListener('click', () => {
    downloadHistory = [];
    localStorage.setItem('yt-dl-history', '[]');
    renderHistory();
  });
  $('backFromHistory').addEventListener('click', () => {
    $('historySection').style.display = 'none';
  });

  // Socket events
  socket.on('download-progress', handleProgress);
}

// ============ ANALYZE URL ============
async function analyzeUrl() {
  const url = $('urlInput').value.trim();
  if (!url) {
    showToast(t('invalidUrl'), 'warning');
    return;
  }

  // Reset UI
  $('videoCard').style.display = 'none';
  $('downloadOptions').style.display = 'none';
  $('playlistSection').style.display = 'none';
  $('errorSection').style.display = 'none';
  $('loadingSection').style.display = 'block';
  $('analyzeBtn').disabled = true;

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unknown error');

    $('loadingSection').style.display = 'none';

    if (data.type === 'video') {
      currentVideoInfo = data.data;
      showVideoInfo(data.data);
    } else if (data.type === 'playlist') {
      showPlaylist(data.data);
    }
  } catch (err) {
    $('loadingSection').style.display = 'none';
    $('errorSection').style.display = 'block';
    $('errorText').textContent = err.message;
  } finally {
    $('analyzeBtn').disabled = false;
  }
}

// ============ SHOW VIDEO INFO ============
function showVideoInfo(info) {
  $('videoThumbnail').src = info.thumbnail || '';
  $('videoTitle').textContent = info.title || '';
  $('videoChannel').textContent = info.channel || '';
  $('videoDuration').textContent = formatDuration(info.duration);
  $('videoViews').textContent = info.viewCount ? `${formatNumber(info.viewCount)} ${t('views')}` : '';
  $('videoDate').textContent = info.uploadDate ? formatDate(info.uploadDate) : '';
  $('thumbnailPreview').src = info.thumbnail || '';

  // Subtitles
  const subList = $('subtitleList');
  const allSubs = [...(info.subtitles || []), ...(info.automaticCaptions || [])];
  if (allSubs.length > 0) {
    subList.innerHTML = allSubs.map(lang => `
      <div class="subtitle-item" data-lang="${lang}" onclick="downloadSubtitle('${lang}')">
        <span class="subtitle-lang">${lang.toUpperCase()}</span>
        <svg class="subtitle-dl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </div>
    `).join('');
  } else {
    subList.innerHTML = `<p class="no-data">${t('noSubtitles')}</p>`;
  }

  $('videoCard').style.display = 'flex';
  $('downloadOptions').style.display = 'block';
}

// ============ SHOW PLAYLIST ============
function showPlaylist(playlist) {
  $('playlistTitle').textContent = playlist.title || 'Playlist';
  $('playlistCount').textContent = `${playlist.videoCount || playlist.videos.length} video`;

  selectedPlaylistVideos = new Set(playlist.videos.map((_, i) => i));

  const container = $('playlistVideos');
  container.innerHTML = playlist.videos.map((v, i) => `
    <div class="playlist-video-item selected" data-index="${i}" onclick="togglePlaylistVideo(${i})">
      <div class="playlist-checkbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <span class="playlist-video-index">${v.index || i + 1}</span>
      ${v.thumbnail ? `<img class="playlist-video-thumb" src="${v.thumbnail}" alt="" loading="lazy">` : ''}
      <div class="playlist-video-info">
        <div class="playlist-video-title">${v.title || 'Untitled'}</div>
        <div class="playlist-video-duration">${v.duration ? formatDuration(v.duration) : ''}</div>
      </div>
    </div>
  `).join('');

  $('playlistSection').style.display = 'block';
  currentVideoInfo = { _playlist: playlist };
}

function togglePlaylistVideo(index) {
  if (selectedPlaylistVideos.has(index)) {
    selectedPlaylistVideos.delete(index);
  } else {
    selectedPlaylistVideos.add(index);
  }
  const items = $$('.playlist-video-item');
  items.forEach(item => {
    const i = parseInt(item.dataset.index);
    item.classList.toggle('selected', selectedPlaylistVideos.has(i));
  });
}

function toggleSelectAll() {
  const playlist = currentVideoInfo?._playlist;
  if (!playlist) return;
  if (selectedPlaylistVideos.size === playlist.videos.length) {
    selectedPlaylistVideos.clear();
  } else {
    selectedPlaylistVideos = new Set(playlist.videos.map((_, i) => i));
  }
  $$('.playlist-video-item').forEach(item => {
    const i = parseInt(item.dataset.index);
    item.classList.toggle('selected', selectedPlaylistVideos.has(i));
  });
}

// ============ DOWNLOADS ============
async function downloadVideo() {
  const url = $('urlInput').value.trim();
  if (!url) return;
  const startTime = $('trimToggle').checked ? $('trimStart').value : null;
  const endTime = $('trimToggle').checked ? $('trimEnd').value : null;
  await startDownload(url, { quality: selectedQuality, audioOnly: false, includeAudio: selectedVideoAudio, startTime, endTime });
}

async function downloadAudio() {
  const url = $('urlInput').value.trim();
  if (!url) return;
  await startDownload(url, { format: selectedAudioFormat, audioOnly: true, quality: selectedAudioQuality });
}

async function downloadThumbnail() {
  const url = $('urlInput').value.trim();
  if (!url) return;
  await startDownload(url, { thumbnailOnly: true });
}

function downloadSubtitle(lang) {
  const url = $('urlInput').value.trim();
  if (!url) return;
  startDownload(url, { subtitleLang: lang, audioOnly: false, quality: '0' });
}

async function downloadPlaylist() {
  const playlist = currentVideoInfo?._playlist;
  if (!playlist || selectedPlaylistVideos.size === 0) return;
  const format = $('playlistFormat').value;
  const quality = $('playlistQuality').value;
  const isAudio = format === 'audio';

  for (const idx of selectedPlaylistVideos) {
    const video = playlist.videos[idx];
    if (!video) continue;
    const videoUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
    await startDownload(videoUrl, {
      quality: isAudio ? undefined : quality,
      audioOnly: isAudio,
      format: isAudio ? 'mp3' : undefined
    });
    // Small delay between downloads
    await new Promise(r => setTimeout(r, 500));
  }
}

async function startBatchDownload() {
  const urls = $('batchUrls').value.trim().split('\n').filter(u => u.trim());
  if (urls.length === 0) return;
  const format = $('batchFormat').value;
  const quality = $('batchQuality').value;
  const isAudio = format === 'audio';
  $('batchModal').style.display = 'none';

  for (const url of urls) {
    await startDownload(url.trim(), {
      quality: isAudio ? undefined : quality,
      audioOnly: isAudio,
      format: isAudio ? 'mp3' : undefined
    });
    await new Promise(r => setTimeout(r, 300));
  }
}

async function startDownload(url, options = {}) {
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, ...options })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    addToQueue(data.downloadId, url, options);
    showToast(t('downloadStarted'), 'success');
    $('queueSection').style.display = 'block';
  } catch (err) {
    showToast(`${t('downloadFailed')}: ${err.message}`, 'error');
  }
}

async function saveAllToFolder() {
  const completedItems = $$('.queue-item-status.completed');
  if (completedItems.length === 0) return;
  
  try {
    if (window.showDirectoryPicker) {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      
      // Save sequentially to avoid opening too many streams at once
      for (const item of completedItems) {
        const row = item.closest('.queue-item');
        const saveBtn = row.querySelector('.queue-action-btn.save');
        
        if (saveBtn && !saveBtn.classList.contains('saved-state')) {
          const fileUrl = saveBtn.href;
          const filename = decodeURIComponent(fileUrl.split('/').pop());
          // Clean the UUID prefix (36 chars + dash)
          const cleanName = filename.replace(/^[0-9a-fA-F-]{36}-/, '');
          
          try {
            const fileHandle = await dirHandle.getFileHandle(cleanName, { create: true });
            const writable = await fileHandle.createWritable();
            
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error('File fetch failed');
            
            await response.body.pipeTo(writable);
            
            saveBtn.textContent = '✓';
            saveBtn.classList.add('saved-state');
            saveBtn.style.background = 'var(--success)';
          } catch (e) {
            console.error("Save failed for", cleanName, e);
          }
        }
      }
      showToast(t('saveComplete') || 'Tümü klasöre kaydedildi!', 'success');
    } else {
      let delay = 0;
      for (const item of completedItems) {
        const row = item.closest('.queue-item');
        const saveBtn = row.querySelector('.queue-action-btn.save');
        
        if (saveBtn && !saveBtn.classList.contains('saved-state')) {
          setTimeout(() => {
            const fileUrl = saveBtn.href;
            const a = document.createElement('a');
            a.href = fileUrl;
            
            const filename = decodeURIComponent(fileUrl.split('/').pop());
            const cleanName = filename.replace(/^[0-9a-fA-F-]{36}-/, '');
            
            a.download = cleanName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            saveBtn.textContent = '✓';
            saveBtn.classList.add('saved-state');
            saveBtn.style.background = 'var(--success)';
          }, delay);
          delay += 500;
        }
      }
      showToast(t('saveComplete') || 'İndirmeler başlatıldı!', 'success');
    }
  } catch (err) {
    if (err.name !== 'AbortError') showToast(err.message, 'error');
  }
}

function checkSaveAllVisibility() {
  const comps = $$('.queue-item-status.completed');
  $('saveAllBtn').style.display = comps.length > 0 ? 'flex' : 'none';
}

// ============ DOWNLOAD QUEUE ============
function addToQueue(id, url, options) {
  const title = currentVideoInfo?.title || url;
  const type = options.audioOnly ? 'audio' : options.thumbnailOnly ? 'thumbnail' : 'video';
  const item = document.createElement('div');
  item.className = 'queue-item';
  item.id = `queue-${id}`;
  item.innerHTML = `
    <div class="queue-item-header">
      <span class="queue-item-title">${escapeHtml(title)}</span>
      <span class="queue-item-status downloading">${t('downloading')}</span>
    </div>
    <div class="queue-progress-bar"><div class="queue-progress-fill" style="width:0%"></div></div>
    <div class="queue-item-meta">
      <span class="queue-meta-percent">0%</span>
      <span class="queue-meta-speed"></span>
      <span class="queue-meta-eta"></span>
    </div>
    <div class="queue-item-actions">
      <button class="queue-action-btn cancel" onclick="cancelDownload('${id}')">${t('cancel')}</button>
    </div>
  `;
  $('queueList').prepend(item);
}

function handleProgress(data) {
  const item = $(`queue-${data.id}`);
  if (!item) return;

  if (data.status === 'downloading') {
    const fill = item.querySelector('.queue-progress-fill');
    const percent = item.querySelector('.queue-meta-percent');
    const speed = item.querySelector('.queue-meta-speed');
    const eta = item.querySelector('.queue-meta-eta');
    const status = item.querySelector('.queue-item-status');

    fill.style.width = `${data.percent || 0}%`;
    percent.textContent = `${(data.percent || 0).toFixed(1)}%`;
    if (data.speed) speed.textContent = `${t('speed')}: ${data.speed}`;
    if (data.eta) eta.textContent = `${t('eta')}: ${data.eta}`;
    status.className = 'queue-item-status downloading';
    status.textContent = t('downloading');
  } else if (data.status === 'completed') {
    const fill = item.querySelector('.queue-progress-fill');
    const percent = item.querySelector('.queue-meta-percent');
    const status = item.querySelector('.queue-item-status');
    const actions = item.querySelector('.queue-item-actions');

    fill.style.width = '100%';
    percent.textContent = '100%';
    status.className = 'queue-item-status completed';
    status.textContent = t('completed');

    if (data.filename) {
      actions.innerHTML = `<a class="queue-action-btn save" href="/downloads/${encodeURIComponent(data.filename)}" download>${t('save')}</a>`;
    }

    // Add to history
    const title = item.querySelector('.queue-item-title').textContent;
    addToHistory(title, data.filename);
    showToast(t('downloadComplete'), 'success');
    
    checkSaveAllVisibility();
  } else if (data.status === 'error') {
    const status = item.querySelector('.queue-item-status');
    status.className = 'queue-item-status error';
    status.textContent = t('error');
    showToast(t('downloadFailed'), 'error');
  } else if (data.status === 'cancelled') {
    const status = item.querySelector('.queue-item-status');
    status.className = 'queue-item-status cancelled';
    status.textContent = t('cancelled');
  }
}

async function cancelDownload(id) {
  try {
    await fetch(`/api/cancel/${id}`, { method: 'POST' });
  } catch {}
}

// ============ HISTORY ============
function addToHistory(title, filename) {
  downloadHistory.unshift({
    title, filename,
    date: new Date().toISOString(),
    type: filename?.match(/\.(mp3|m4a|flac|wav|opus|ogg)$/i) ? 'audio' : 'video'
  });
  if (downloadHistory.length > 100) downloadHistory = downloadHistory.slice(0, 100);
  localStorage.setItem('yt-dl-history', JSON.stringify(downloadHistory));
}

function showHistory() {
  $('historySection').style.display = 'block';
  renderHistory();
}

function renderHistory() {
  const list = $('historyList');
  if (downloadHistory.length === 0) {
    list.innerHTML = `<p class="no-data">${t('noHistory')}</p>`;
    return;
  }
  list.innerHTML = downloadHistory.map(h => `
    <div class="history-item">
      <div class="history-icon ${h.type || 'video'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          ${h.type === 'audio'
            ? '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
            : '<polygon points="5 3 19 12 5 21 5 3"/>'}
        </svg>
      </div>
      <div class="history-info">
        <div class="history-title">${escapeHtml(h.title)}</div>
        <div class="history-date">${new Date(h.date).toLocaleString()}</div>
      </div>
      ${h.filename ? `<a class="queue-action-btn save" href="/downloads/${encodeURIComponent(h.filename)}" download>${t('save')}</a>` : ''}
    </div>
  `).join('');
}

// ============ TOAST NOTIFICATIONS ============
function showToast(message, type = 'info') {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============ UTILITIES ============
function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatNumber(n) {
  if (!n) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return `${d}.${m}.${y}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

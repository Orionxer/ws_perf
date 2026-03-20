import './style.css';

// SVG Icons for video player
const PLAY_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

// Dynamically determine WebSocket URL based on current page host
// This works for both localhost (development) and remote access (mobile)
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

const state = {
  clients: new Map(),
  currentRoute: 'list',
  currentClientId: null,
  heartbeatEnabled: true,
  videoAvailable: null,  // null = unchecked, true/false after HEAD check
  videoVersion: Date.now(),
  uploadStatus: {
    clientId: null,
    tone: 'idle',
    text: '',
    html: '',
    busy: false,
  },
};

const uiState = {
  renderedRoute: null,
  renderedClientId: null,
};

let ws = createSocket();

function createSocket() {
  const socket = new WebSocket(WS_URL);
  socket.onmessage = handleSocketMessage;
  socket.onopen = handleSocketOpen;
  socket.onerror = handleSocketError;
  socket.onclose = handleSocketClose;
  return socket;
}

function getActiveSocket() {
  return ws;
}

function setUploadStatus(clientId, tone, text, busy = false, html = '') {
  state.uploadStatus = {
    clientId,
    tone,
    text,
    html,
    busy,
  };

  if (state.currentRoute === 'detail' && state.currentClientId === clientId) {
    if (!refreshUploadStatusUI()) {
      render();
    }
  }
}

function formatMegabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function formatDuration(milliseconds) {
  const durationMs = Number(milliseconds) || 0;
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildUploadSuccessHtml({ bytes, mb, sha256, rttMs, bandwidthMBps, bandwidthMbps, uploadTimeMs }) {
  return `
    <div class="upload-status-title">上传成功</div>
    <div class="upload-status-grid">
      <div class="upload-status-item">
        <span class="upload-status-label">文件大小</span>
        <span class="upload-status-value">${escapeHtml(mb)} MB</span>
        <span class="upload-status-subvalue">${escapeHtml(bytes)} 字节</span>
      </div>
      <div class="upload-status-item upload-status-item--hash">
        <span class="upload-status-label">文件哈希</span>
        <code class="upload-status-hash-code">${escapeHtml(sha256)}</code>
      </div>
      <div class="upload-status-item">
        <span class="upload-status-label">延迟</span>
        <span class="upload-status-value">${escapeHtml(rttMs)} ms</span>
        <span class="upload-status-subvalue">上传时间 ${escapeHtml(formatDuration(uploadTimeMs))}</span>
      </div>
      <div class="upload-status-item">
        <span class="upload-status-label">带宽</span>
        <span class="upload-status-value">${escapeHtml(bandwidthMBps)} MB/s</span>
        <span class="upload-status-subvalue">${escapeHtml(bandwidthMbps)} Mbps</span>
      </div>
    </div>
  `;
}

function refreshUploadStatusUI() {
  const statusNode = document.getElementById('uploadStatus');
  const buttonNode = document.getElementById('uploadButton');

  if (!statusNode || !buttonNode || state.currentRoute !== 'detail' || !state.currentClientId) {
    return false;
  }

  const uploadStatus = state.uploadStatus.clientId === state.currentClientId ? state.uploadStatus : null;

  buttonNode.textContent = uploadStatus?.busy ? '上传中...' : '上传视频';
  buttonNode.disabled = Boolean(uploadStatus?.busy);
  buttonNode.setAttribute('aria-disabled', uploadStatus?.busy ? 'true' : 'false');

  if (uploadStatus?.text) {
    statusNode.className = `upload-status upload-status--${uploadStatus.tone}`;
    if (uploadStatus.html) {
      statusNode.innerHTML = uploadStatus.html;
    } else {
      statusNode.textContent = uploadStatus.text;
    }
    statusNode.hidden = false;
  } else {
    statusNode.textContent = '';
    statusNode.innerHTML = '';
    statusNode.className = 'upload-status';
    statusNode.hidden = true;
  }

  return true;
}

function handleSocketMessage(event) {
  const message = event.data;

  if (message.startsWith('[CONNECT]')) {
    const payload = message.replace('[CONNECT] ', '');
    const [id, ip] = payload.split('-');

    if (id && ip) {
      state.clients.set(id, {
        id,
        ip,
        connectedAt: new Date().toISOString(),
        messages: [],
      });

      if (state.currentRoute === 'list') {
        refreshClientListUI();
      } else {
        refreshHeaderUI();
      }

      highlightNewClient(id);
    }
  } else if (message.startsWith('[DISCONNECT]')) {
    const payload = message.replace('[DISCONNECT] ', '');
    const [id] = payload.split('-');

    if (id) {
      state.clients.delete(id);

      if (state.currentClientId === id) {
        state.currentClientId = null;
        state.currentRoute = 'list';
        render();
        return;
      }

      if (state.currentRoute === 'list') {
        refreshClientListUI();
      } else {
        refreshHeaderUI();
      }
    }
  } else if (message.startsWith('[MESSAGE]')) {
    const payload = message.replace('[MESSAGE] ', '');
    const separatorIndex = payload.indexOf(': ');
    if (separatorIndex === -1) return;

    const clientInfo = payload.substring(0, separatorIndex);
    const msgContent = payload.substring(separatorIndex + 2);
    const [id] = clientInfo.split('-');

    if (id && state.clients.has(id)) {
      const client = state.clients.get(id);
      client.messages.push(msgContent);

      if (msgContent === '/file_start') {
        setUploadStatus(id, 'progress', `上传中：已接收 0 字节，${formatMegabytes(0)} MB`, true);
      } else if (msgContent === '/file_end') {
        setUploadStatus(id, 'progress', '视频上传完成，服务端正在保存...', true);
      }

      if (state.currentRoute === 'detail' && state.currentClientId === id) {
        addNewMessageWithAnimation(msgContent);
      }
    }
  } else if (message.startsWith('[COMMAND_RESULT]')) {
    console.log(`[command result] ${message}`);

    if (message.startsWith('[COMMAND_RESULT] UPLOAD_VIDEO_REQUESTED')) {
      const clientId = message.replace('[COMMAND_RESULT] UPLOAD_VIDEO_REQUESTED ', '').trim();
      state.videoAvailable = false;
      state.videoVersion = Date.now();
      setUploadStatus(clientId, 'progress', '已发送上传指令，等待客户端开始传输...', true);
    } else if (message.startsWith('[COMMAND_RESULT] UPLOAD_VIDEO_PROGRESS')) {
      const payload = message.replace('[COMMAND_RESULT] UPLOAD_VIDEO_PROGRESS ', '');
      const [clientId, bytes = '0', mb = '0.00'] = payload.split(' ');
      setUploadStatus(clientId, 'progress', `上传中：已接收 ${bytes} 字节，${mb} MB`, true);
    } else if (message.startsWith('[COMMAND_RESULT] UPLOAD_VIDEO_SAVED')) {
      const payload = message.replace('[COMMAND_RESULT] UPLOAD_VIDEO_SAVED ', '');
      const [
        clientId,
        bytes = '0',
        mb = '0.00',
        sha256 = '-',
        rttMs = '0',
        bandwidthMBps = '0.00',
        bandwidthMbps = '0.00',
        uploadTimeMs = '0',
      ] = payload.split(' ');
      state.videoAvailable = true;
      state.videoVersion = Date.now();
      setUploadStatus(
        clientId,
        'success',
        `上传成功：文件大小 ${mb} MB（${bytes} 字节） | 文件哈希 ${sha256}\nRTT ${rttMs} ms | 上传时间 ${formatDuration(uploadTimeMs)} | Bandwidth ${bandwidthMBps} MB/s (${bandwidthMbps} Mbps)`,
        false,
        buildUploadSuccessHtml({ bytes, mb, sha256, rttMs, bandwidthMBps, bandwidthMbps, uploadTimeMs }),
      );

      if (state.currentRoute === 'detail' && state.currentClientId === clientId) {
        refreshVideoCardUI();
      }
    } else if (message.startsWith('[COMMAND_RESULT] UPLOAD_VIDEO_FAILED')) {
      const payload = message.replace('[COMMAND_RESULT] UPLOAD_VIDEO_FAILED ', '');
      const [clientId, reason = 'UNKNOWN_ERROR'] = payload.split(' ');
      const text = reason === 'CLIENT_NOT_FOUND'
        ? '上传失败：目标客户端已断开连接。'
        : `上传失败：${reason}`;
      setUploadStatus(clientId, 'error', text, false);
    }
  } else if (message.startsWith('[SYSTEM] HEARTBEAT ')) {
    state.heartbeatEnabled = message.endsWith('ON');
    refreshHeaderUI();
  }
}

function handleSocketOpen() {
  console.log(`[WebSocket] Connected to ${WS_URL}`);
}

function handleSocketError(error) {
  console.error('[WebSocket] Connection error:', error);
}

function handleSocketClose(event) {
  console.log(`[WebSocket] Disconnected (code: ${event.code}, reason: ${event.reason || 'unknown'})`);
  // Attempt to reconnect after 3 seconds
  setTimeout(() => {
    console.log('[WebSocket] Attempting to reconnect...');
    ws = createSocket();
    window.ws = ws;
  }, 3000);
}

window.closeAllClients = () => {
  const socket = getActiveSocket();
  if (socket.readyState === WebSocket.OPEN) {
    socket.send('[COMMAND] CLOSE_ALL_CLIENTS');
  } else {
    console.error('WebSocket not connected');
  }
};

window.toggleHeartbeat = () => {
  const socket = getActiveSocket();
  if (socket.readyState === WebSocket.OPEN) {
    socket.send('[COMMAND] TOGGLE_HEARTBEAT');
  } else {
    console.error('WebSocket not connected');
  }
};

function parseMessage(message) {
  if (message.startsWith('[CONNECT]')) {
    const payload = message.replace('[CONNECT] ', '');
    const [id, ip] = payload.split('-');
    if (id && ip) {
      return { type: 'connect', id, ip };
    }
  } else if (message.startsWith('[DISCONNECT]')) {
    const payload = message.replace('[DISCONNECT] ', '');
    const [id] = payload.split('-');
    if (id) {
      return { type: 'disconnect', id };
    }
  } else if (message.startsWith('[MESSAGE]')) {
    const payload = message.replace('[MESSAGE] ', '');
    const separatorIndex = payload.indexOf(': ');
    if (separatorIndex === -1) return null;

    const clientInfo = payload.substring(0, separatorIndex);
    const msgContent = payload.substring(separatorIndex + 2);
    const [id] = clientInfo.split('-');

    if (id) {
      return { type: 'message', id, content: msgContent };
    }
  }
  return null;
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function checkVideoAvailability() {
  if (state.videoAvailable !== null) return state.videoAvailable;
  try {
    const response = await fetch('/resource/starship.mp4', { method: 'HEAD' });
    state.videoAvailable = response.ok;
  } catch {
    state.videoAvailable = false;
  }
  return state.videoAvailable;
}

function renderVideoCard() {
  if (state.videoAvailable === false) {
    return `
      <div class="video-card">
        <div class="video-unavailable">No video available</div>
      </div>
    `;
  }
  if (state.videoAvailable === null) {
    return `
      <div class="video-card">
        <div class="video-unavailable">Checking video...</div>
      </div>
    `;
  }
  return `
    <div class="video-card">
      <video class="video-player" id="videoPlayer" preload="metadata"
        playsinline
        webkit-playsinline
        src="/resource/starship.mp4?v=${state.videoVersion}">
      </video>
      <div class="video-controls">
        <button class="video-play-btn" id="videoPlayBtn" aria-label="Play video">${PLAY_ICON}</button>
        <div class="video-progress" id="videoProgress">
          <div class="video-progress-bar" id="videoProgressBar"></div>
        </div>
        <span class="video-time" id="videoTime">0:00</span>
      </div>
    </div>
  `;
}

function renderHeader() {
  const clientCount = state.clients.size;
  const heartbeatLabel = state.heartbeatEnabled ? '关闭心跳检测' : '启用心跳检测';
  const heartbeatButtonClass = state.heartbeatEnabled
    ? 'heartbeat-toggle-button heartbeat-toggle-button--active'
    : 'heartbeat-toggle-button';
  return `
    <header class="header" role="banner">
      <div class="header-title-group">
        <h1>WebSocket 监控面板</h1>
        <div class="client-count-badge" id="clientCountBadge" aria-live="polite">
          在线客户端 ${clientCount}
        </div>
      </div>
      <div class="header-actions">
        <button
          id="heartbeatToggleButton"
          class="${heartbeatButtonClass}"
          onclick="window.toggleHeartbeat()"
          aria-label="${heartbeatLabel}"
          aria-pressed="${state.heartbeatEnabled ? 'true' : 'false'}"
        >
          ${heartbeatLabel}
        </button>
        <button
          id="closeAllButton"
          class="close-all-button"
          onclick="window.closeAllClients()"
          ${clientCount === 0 ? 'disabled' : ''}
          aria-label="关闭所有连接的客户端"
          ${clientCount === 0 ? 'aria-disabled="true"' : ''}
        >
          关闭所有客户端
        </button>
      </div>
    </header>
  `;
}

function getClientCardsMarkup() {
  return Array.from(state.clients.values())
    .map((client, index) => `
      <button
        class="client-card"
        data-client-id="${client.id}"
        onclick="window.navigate('${client.id}')"
        aria-label="查看客户端 ${client.id} 的详细信息"
        style="animation-delay: ${index * 0.05}s"
      >
        <div class="client-id">${client.id}</div>
        <div class="client-info">
          <div>连接时间: ${formatDateTime(client.connectedAt)}</div>
          <div>IP 地址: ${client.ip}</div>
        </div>
      </button>
    `)
    .join('');
}

function renderClientList() {
  const cards = getClientCardsMarkup();

  return `
    ${renderHeader()}
    <main class="client-list" id="clientList" role="main" aria-label="客户端列表">
      ${cards || '<div class="empty-state" role="status" aria-live="polite">暂无连接的客户端</div>'}
    </main>
  `;
}

function renderClientDetail() {
  const client = state.clients.get(state.currentClientId);

  if (!client) {
    state.currentRoute = 'list';
    state.currentClientId = null;
    return renderClientList();
  }

  const messageItems = client.messages
    .map((msg, index) => `<div class="message-item" style="animation-delay: ${index * 0.03}s">${msg}</div>`)
    .join('');
  const uploadStatus = state.uploadStatus.clientId === client.id ? state.uploadStatus : null;
  const uploadButtonLabel = uploadStatus?.busy ? '上传中...' : '上传视频';
  const uploadStatusMarkup = uploadStatus?.text
    ? `<div class="upload-status upload-status--${uploadStatus.tone}" id="uploadStatus" role="status" aria-live="polite">${uploadStatus.html || uploadStatus.text}</div>`
    : '<div class="upload-status" id="uploadStatus" role="status" aria-live="polite" hidden></div>';

  return `
    ${renderHeader()}
    <section class="client-detail" id="clientDetail" aria-label="客户端详情">
      <div class="client-detail-header">
        <div class="header-actions">
          <button class="back-button" onclick="window.navigateBack()" aria-label="返回客户端列表">返回列表</button>
          <button class="upload-button" id="uploadButton" onclick="window.uploadVideo()" aria-label="上传视频" ${uploadStatus?.busy ? 'disabled aria-disabled="true"' : ''}>${uploadButtonLabel}</button>
        </div>
        <h2 class="client-id">${client.id}</h2>
        <div class="client-info">
          <div>连接时间: ${formatDateTime(client.connectedAt)}</div>
          <div>IP 地址: ${client.ip}</div>
        </div>
        ${uploadStatusMarkup}
      </div>
      <div id="videoCardContainer">${renderVideoCard()}</div>
      <div class="message-list" id="messageList" role="log" aria-live="polite" aria-label="消息列表">
        ${messageItems || '<div class="empty-state" role="status">暂无消息</div>'}
      </div>
    </section>
  `;
}

function refreshHeaderUI() {
  const clientCountBadge = document.getElementById('clientCountBadge');
  const heartbeatButton = document.getElementById('heartbeatToggleButton');
  const button = document.getElementById('closeAllButton');
  if (!button || !heartbeatButton || !clientCountBadge) {
    return false;
  }

  const heartbeatLabel = state.heartbeatEnabled ? '关闭心跳检测' : '启用心跳检测';
  heartbeatButton.textContent = heartbeatLabel;
  heartbeatButton.className = state.heartbeatEnabled
    ? 'heartbeat-toggle-button heartbeat-toggle-button--active'
    : 'heartbeat-toggle-button';
  heartbeatButton.setAttribute('aria-label', heartbeatLabel);
  heartbeatButton.setAttribute('aria-pressed', state.heartbeatEnabled ? 'true' : 'false');

  const clientCount = state.clients.size;
  clientCountBadge.textContent = `在线客户端 ${clientCount}`;
  button.textContent = '关闭所有客户端';
  button.disabled = clientCount === 0;
  button.setAttribute('aria-label', '关闭所有连接的客户端');
  button.setAttribute('aria-disabled', clientCount === 0 ? 'true' : 'false');
  return true;
}

function refreshClientListUI() {
  const clientList = document.getElementById('clientList');
  if (!clientList || state.currentRoute !== 'list') {
    return false;
  }

  const cards = getClientCardsMarkup();
  clientList.innerHTML = cards || '<div class="empty-state" role="status" aria-live="polite">暂无连接的客户端</div>';
  refreshHeaderUI();
  return true;
}

function refreshVideoCardUI() {
  const container = document.getElementById('videoCardContainer');
  if (!container || state.currentRoute !== 'detail' || !state.currentClientId) {
    return false;
  }

  container.innerHTML = renderVideoCard();
  initVideoPlayer();
  return true;
}

function render() {
  const app = document.getElementById('app');

  if (state.currentRoute === 'list') {
    app.innerHTML = renderClientList();
    uiState.renderedRoute = 'list';
    uiState.renderedClientId = null;
  } else if (state.currentRoute === 'detail' && state.currentClientId) {
    app.innerHTML = renderClientDetail();
    uiState.renderedRoute = 'detail';
    uiState.renderedClientId = state.currentClientId;
    initVideoPlayer();

    // Check video availability on first load, then refresh only the video area.
    if (state.videoAvailable === null) {
      checkVideoAvailability().then(() => {
        if (state.currentRoute === 'detail' && state.currentClientId === uiState.renderedClientId) {
          refreshVideoCardUI();
        }
      });
    }
  } else {
    app.innerHTML = renderClientList();
    uiState.renderedRoute = 'list';
    uiState.renderedClientId = null;
  }
}

window.navigate = (clientId) => {
  state.currentRoute = 'detail';
  state.currentClientId = clientId;
  render();
};

window.navigateBack = () => {
  state.currentRoute = 'list';
  state.currentClientId = null;
  render();
};

window.uploadVideo = () => {
  const currentClientId = state.currentClientId;
  const socket = getActiveSocket();

  if (!currentClientId) {
    console.error('No client selected for video upload');
    return;
  }

  if (socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not connected');
    return;
  }

  state.videoAvailable = false;
  state.videoVersion = Date.now();
  setUploadStatus(currentClientId, 'progress', '正在向客户端发送上传指令...', true);
  refreshVideoCardUI();

  socket.send(`[COMMAND] UPLOAD_VIDEO ${currentClientId}`);
};

window.onpopstate = () => {
  const hash = window.location.hash;

  if (hash.startsWith('#detail/')) {
    const clientId = hash.replace('#detail/', '');
    if (state.clients.has(clientId)) {
      state.currentRoute = 'detail';
      state.currentClientId = clientId;
    } else {
      state.currentRoute = 'list';
      state.currentClientId = null;
    }
  } else {
    state.currentRoute = 'list';
    state.currentClientId = null;
  }

  render();
};

// Animation helper functions
function highlightNewClient(clientId) {
  setTimeout(() => {
    const card = document.querySelector(`.client-card[data-client-id="${clientId}"]`);
    if (!card) {
      return;
    }

    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'newClientHighlight 0.8s ease';
  }, 100);
}

function addNewMessageWithAnimation(content) {
  const messageList = document.getElementById('messageList');
  if (!messageList) return;

  const emptyState = messageList.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  const messageItem = document.createElement('div');
  messageItem.className = 'message-item';
  messageItem.textContent = content;
  messageItem.style.animation = 'messageSlideIn 0.3s ease';

  messageList.appendChild(messageItem);
  messageList.scrollTop = messageList.scrollHeight;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + s.toString().padStart(2, '0');
}

function initVideoPlayer() {
  const video = document.getElementById('videoPlayer');
  const playBtn = document.getElementById('videoPlayBtn');
  const progressBar = document.getElementById('videoProgressBar');
  const timeDisplay = document.getElementById('videoTime');

  if (!video || !playBtn) return;

  playBtn.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      playBtn.innerHTML = PAUSE_ICON;
      playBtn.setAttribute('aria-label', 'Pause video');
    } else {
      video.pause();
      playBtn.innerHTML = PLAY_ICON;
      playBtn.setAttribute('aria-label', 'Play video');
    }
  });

  video.addEventListener('timeupdate', () => {
    if (video.duration) {
      const pct = (video.currentTime / video.duration) * 100;
      progressBar.style.width = pct + '%';
      timeDisplay.textContent = formatTime(video.currentTime);
    }
  });

  video.addEventListener('ended', () => {
    playBtn.innerHTML = PLAY_ICON;
    playBtn.setAttribute('aria-label', 'Play video');
    progressBar.style.width = '0%';
  });
}

// Fix viewport height issue on mobile browsers
function fixViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

window.addEventListener('resize', fixViewportHeight);
window.addEventListener('orientationchange', fixViewportHeight);
fixViewportHeight();

render();

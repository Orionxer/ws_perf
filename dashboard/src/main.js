import './style.css';

// SVG Icons for video player
const PLAY_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

// Dynamically determine WebSocket URL based on current page host
// This works for both localhost (development) and remote access (mobile)
const WS_URL = `ws://${window.location.host}`;

const state = {
  clients: new Map(),
  currentRoute: 'list',
  currentClientId: null,
  videoAvailable: null,  // null = unchecked, true/false after HEAD check
};

const ws = new WebSocket(WS_URL);

ws.onmessage = (event) => {
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
      render();
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
      }

      render();
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

      if (state.currentRoute === 'detail' && state.currentClientId === id) {
        addNewMessageWithAnimation(msgContent);
      } else {
        render();
      }
    }
  } else if (message.startsWith('[COMMAND_RESULT]')) {
    console.log(`[command result] ${message}`);
  }
};

ws.onopen = () => {
  console.log(`[WebSocket] Connected to ${WS_URL}`);
};

ws.onerror = (error) => {
  console.error('[WebSocket] Connection error:', error);
};

ws.onclose = (event) => {
  console.log(`[WebSocket] Disconnected (code: ${event.code}, reason: ${event.reason || 'unknown'})`);
  // Attempt to reconnect after 3 seconds
  setTimeout(() => {
    console.log('[WebSocket] Attempting to reconnect...');
    const newWs = new WebSocket(WS_URL);
    newWs.onmessage = ws.onmessage;
    newWs.onopen = ws.onopen;
    newWs.onerror = ws.onerror;
    newWs.onclose = ws.onclose;
    newWs.onopen = () => {
      window.ws = newWs;
      console.log('[WebSocket] Reconnected successfully');
    };
  }, 3000);
};

window.closeAllClients = () => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send('[COMMAND] CLOSE_ALL_CLIENTS');
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
    const response = await fetch('/resource/starship_11mb.mp4', { method: 'HEAD' });
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
        src="/resource/starship_11mb.mp4">
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
  return `
    <header class="header" role="banner">
      <h1>WebSocket 监控面板</h1>
      <button
        class="close-all-button"
        onclick="window.closeAllClients()"
        ${clientCount === 0 ? 'disabled' : ''}
        aria-label="关闭所有连接的客户端 (${clientCount})"
        ${clientCount === 0 ? 'aria-disabled="true"' : ''}
      >
        关闭所有客户端 (${clientCount})
      </button>
    </header>
  `;
}

function renderClientList() {
  const cards = Array.from(state.clients.values())
    .map((client, index) => `
      <button
        class="client-card"
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

  return `
    ${renderHeader()}
    <main class="client-list" role="main" aria-label="客户端列表">
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

  return `
    ${renderHeader()}
    <section class="client-detail" aria-label="客户端详情">
      <div class="client-detail-header">
        <div class="header-actions">
          <button class="back-button" onclick="window.navigateBack()" aria-label="返回客户端列表">返回列表</button>
          <button class="upload-button" onclick="window.uploadVideo()" aria-label="上传视频">上传视频</button>
        </div>
        <h2 class="client-id">${client.id}</h2>
        <div class="client-info">
          <div>连接时间: ${formatDateTime(client.connectedAt)}</div>
          <div>IP 地址: ${client.ip}</div>
        </div>
      </div>
      ${renderVideoCard()}
      <div class="message-list" id="messageList" role="log" aria-live="polite" aria-label="消息列表">
        ${messageItems || '<div class="empty-state" role="status">暂无消息</div>'}
      </div>
    </section>
  `;
}

function render() {
  const app = document.getElementById('app');

  if (state.currentRoute === 'list') {
    app.innerHTML = renderClientList();
  } else if (state.currentRoute === 'detail' && state.currentClientId) {
    app.innerHTML = renderClientDetail();
    initVideoPlayer();

    // Check video availability on first load, then re-render if state changed
    if (state.videoAvailable === null) {
      checkVideoAvailability().then(() => {
        if (state.currentRoute === 'detail') {
          app.innerHTML = renderClientDetail();
          initVideoPlayer();
        }
      });
    }
  } else {
    app.innerHTML = renderClientList();
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
  console.log('Upload video clicked');
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
    const cards = document.querySelectorAll('.client-card');
    cards.forEach(card => {
      if (card.textContent.includes(clientId)) {
        card.style.animation = 'none';
        card.offsetHeight;
        card.style.animation = 'newClientHighlight 0.8s ease';
      }
    });
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

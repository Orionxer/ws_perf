import './style.css';

const WS_URL = 'ws://localhost:8080';

const state = {
  clients: new Map(),
  currentRoute: 'list',
  currentClientId: null,
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
      render();
    }
  }
};

ws.onopen = () => {
  console.log('Connected to WebSocket server');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
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

function renderHeader() {
  return `
    <div class="header">
      <h1>WebSocket 监控面板</h1>
    </div>
  `;
}

function renderClientList() {
  const cards = Array.from(state.clients.values())
    .map(client => `
      <div class="client-card" onclick="window.navigate('${client.id}')">
        <div class="client-id">${client.id}</div>
        <div class="client-info">
          <div>连接时间: ${formatDateTime(client.connectedAt)}</div>
          <div>IP 地址: ${client.ip}</div>
        </div>
      </div>
    `)
    .join('');

  return `
    ${renderHeader()}
    <div class="client-list">
      ${cards || '<div style="grid-column: 1/-1; text-align: center; color: #999;">暂无连接的客户端</div>'}
    </div>
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
    .map(msg => `<div class="message-item">${msg}</div>`)
    .join('');

  return `
    ${renderHeader()}
    <div class="client-detail">
      <div class="client-detail-header">
        <button class="back-button" onclick="window.navigateBack()">返回列表</button>
        <div class="client-id">${client.id}</div>
        <div class="client-info">
          <div>连接时间: ${formatDateTime(client.connectedAt)}</div>
          <div>IP 地址: ${client.ip}</div>
        </div>
      </div>
      <div class="message-list">
        ${messageItems || '<div style="text-align: center; color: #999;">暂无消息</div>'}
      </div>
    </div>
  `;
}

function render() {
  const app = document.getElementById('app');

  if (state.currentRoute === 'list') {
    app.innerHTML = renderClientList();
  } else if (state.currentRoute === 'detail' && state.currentClientId) {
    app.innerHTML = renderClientDetail();
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

render();

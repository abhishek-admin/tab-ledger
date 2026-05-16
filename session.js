// session.js — Tab Ledger session display page

function renderMarkdown(text) {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>');

  html = html.replace(/((?:^- .+$\n?)+)/gm, (block) => {
    return '<ul>' + block.trim().split('\n').map(l => `<li>${l.replace(/^- /, '').trim()}</li>`).join('') + '</ul>';
  });
  html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (block) => {
    return '<ol>' + block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '').trim()}</li>`).join('') + '</ol>';
  });
  html = html.split(/\n{2,}/).map(chunk => {
    const t = chunk.trim();
    if (!t) return '';
    if (/^<(h[2-4]|ul|ol|hr)/.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function saveName(sessionId, newName) {
  chrome.storage.local.get(['tab_sessions'], (data) => {
    const sessions = data.tab_sessions || [];
    const s = sessions.find(s => String(s.id) === String(sessionId));
    if (s) {
      s.name = newName;
      chrome.storage.local.set({ tab_sessions: sessions });
    }
  });
}

function render(session) {
  const page = document.getElementById('page');
  document.title = `${session.name} — Tab Ledger`;

  const date = new Date(session.savedAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const tabs = session.allTabs || session.importantTabs || [];
  const importantIds = new Set((session.importantTabs || []).map(t => t.url));

  const tabsHtml = tabs.map(t => {
    const isImportant = importantIds.has(t.url) || (t.score && t.score > 35);
    const hostname = (() => { try { return new URL(t.url).hostname; } catch(e) { return t.domain || ''; } })();
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    return `
      <a class="tab-item${isImportant ? ' important' : ''}" href="${escHtml(t.url)}" target="_blank">
        <img class="tab-favicon" src="${faviconUrl}" onerror="this.style.display='none'" />
        <div class="tab-info">
          <div class="tab-title">${escHtml(t.title || t.url)}</div>
          <div class="tab-domain">${escHtml(t.domain || hostname)}</div>
        </div>
        ${isImportant ? '<span class="tab-star">★</span>' : ''}
      </a>
    `;
  }).join('');

  page.innerHTML = `
    <div class="page-header">
      <div class="header-left">
        <div class="brand">Tab Ledger · Session</div>
        <div class="session-title" id="session-title" contenteditable="true">${escHtml(session.name)}</div>
        <div class="session-meta">${date} · ${session.tabCount} tabs captured</div>
      </div>
      <div class="header-right">
        <button class="restore-btn" id="restore-btn">↩ Reopen All Tabs</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Captured Tabs (${tabs.length})</div>
      <div class="tab-list">${tabsHtml || '<p style="color:#555568;font-size:13px;">No tabs recorded.</p>'}</div>
    </div>

    <div class="section">
      <div class="section-title">Session Analysis</div>
      <div class="summary-content">${renderMarkdown(session.summary || 'No analysis available.')}</div>
    </div>

    <div class="page-footer">
      <span>Tab Ledger · Built by <a href="https://x.com/happy_ships" target="_blank">@happy_ships</a></span>
      <span>Day 1/180</span>
    </div>
  `;

  // Editable session name
  const titleEl = document.getElementById('session-title');
  titleEl.addEventListener('blur', () => {
    const newName = titleEl.textContent.trim();
    if (newName) saveName(session.id, newName);
  });
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    if (e.key === 'Escape') { titleEl.textContent = session.name; titleEl.blur(); }
  });

  // Restore button
  document.getElementById('restore-btn').addEventListener('click', () => {
    const tabsToOpen = session.allTabs || session.importantTabs || [];
    tabsToOpen.forEach(tab => chrome.tabs.create({ url: tab.url, active: false }));
  });
}

// Init
const params = new URLSearchParams(location.search);
const sessionId = params.get('id');

if (!sessionId) {
  document.getElementById('page').innerHTML = '<div class="error-state">No session ID in URL.</div>';
} else {
  chrome.storage.local.get(['tab_sessions'], (data) => {
    const session = (data.tab_sessions || []).find(s => String(s.id) === String(sessionId));
    if (!session) {
      document.getElementById('page').innerHTML = '<div class="error-state">Session not found. It may have been deleted.</div>';
    } else {
      render(session);
    }
  });
}

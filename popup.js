document.addEventListener('DOMContentLoaded', () => {
  const actionBtn = document.getElementById('action-btn');
  const retryBtn = document.getElementById('retry-btn');
  const copyBtn = document.getElementById('copy-btn');
  const rerunBtn = document.getElementById('rerun-btn');
  const mainContent = document.getElementById('main-content');
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  const result = document.getElementById('result');
  const resultContent = document.getElementById('result-content');
  const error = document.getElementById('error');
  const errorMessage = document.getElementById('error-message');
  const saveToast = document.getElementById('save-toast');
  const saveToastText = document.getElementById('save-toast-text');
  const viewSessionsLink = document.getElementById('view-sessions-link');

  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsClose = document.getElementById('settings-close');
  const geminiKeyInput = document.getElementById('gemini-key-input');
  const openrouterKeyInput = document.getElementById('openrouter-key-input');
  const saveKeysBtn = document.getElementById('save-keys-btn');
  const clearKeysBtn = document.getElementById('clear-keys-btn');
  const toggleGeminiKey = document.getElementById('toggle-gemini-key');
  const toggleOpenrouterKey = document.getElementById('toggle-openrouter-key');

  const onboarding = document.getElementById('onboarding');
  const onboardGeminiInput = document.getElementById('onboard-gemini-input');
  const onboardOpenrouterInput = document.getElementById('onboard-openrouter-input');
  const onboardSaveBtn = document.getElementById('onboard-save-btn');

  const analyzeView = document.getElementById('analyze-view');
  const sessionsView = document.getElementById('sessions-view');
  const sessionsList = document.getElementById('sessions-list');

  // ---- Markdown → HTML ----

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

    html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
      const rows = tableBlock.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2 || !/^\|[\s\-:]+\|/.test(rows[1])) return tableBlock;
      const parseRow = (row) => row.split('|').slice(1, -1).map(c => c.trim());
      const headers = parseRow(rows[0]);
      let table = '<table><thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
      rows.slice(2).forEach(row => {
        const cells = parseRow(row);
        table += '<tr>' + cells.map(c => `<td>${c.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</td>`).join('') + '</tr>';
      });
      return table + '</tbody></table>';
    });

    html = html.replace(/((?:^- .+$\n?)+)/gm, (block) => {
      return '<ul>' + block.trim().split('\n').map(l => `<li>${l.replace(/^- /, '').trim()}</li>`).join('') + '</ul>';
    });
    html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (block) => {
      return '<ol>' + block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '').trim()}</li>`).join('') + '</ol>';
    });
    html = html.split(/\n{2,}/).map(chunk => {
      const t = chunk.trim();
      if (!t) return '';
      if (/^<(h[2-4]|ul|ol|table|hr)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return html;
  }

  // ---- Timer ----

  let _timerInterval = null;
  let _startTime = 0;
  const loadingTimer = document.getElementById('loading-timer');
  const resultTime   = document.getElementById('result-time');

  function startTimer() {
    _startTime = Date.now();
    if (loadingTimer) loadingTimer.textContent = '0.0s';
    clearInterval(_timerInterval);
    _timerInterval = setInterval(() => {
      const s = ((Date.now() - _startTime) / 1000).toFixed(1);
      if (loadingTimer) loadingTimer.textContent = s + 's';
    }, 100);
  }

  function stopTimer() {
    clearInterval(_timerInterval);
    _timerInterval = null;
    const elapsed = ((Date.now() - _startTime) / 1000).toFixed(1);
    if (resultTime) resultTime.textContent = elapsed + 's';
    return elapsed;
  }

  // ---- UI State Machine ----

  function showState(state) {
    mainContent.classList.toggle('hidden', state !== 'idle');
    loading.classList.toggle('hidden', state !== 'loading');
    result.classList.toggle('hidden', state !== 'result');
    error.classList.toggle('hidden', state !== 'error');
    if (state === 'result') result.classList.add('fade-in');
    if (state !== 'result') saveToast.classList.add('hidden');
  }

  function showResult(text, isProgressive = false) {
    const badge = isProgressive ? '<span class="progressive-badge">⏳ Reading important tabs...</span>' : '';
    resultContent.innerHTML = badge + renderMarkdown(text);
    if (!isProgressive) {
      stopTimer();
      chrome.storage.session.set({ cached_result: text, cached_at: Date.now() });
    } else {
      if (resultTime) resultTime.textContent = '';
    }
    showState('result');
  }

  function showError(msg) {
    stopTimer();
    errorMessage.textContent = msg;
    showState('error');
  }

  function setLoadingText(text) {
    if (loadingText) loadingText.textContent = text;
  }

  // ---- Session badge count ----

  function updateSessionsBadge() {
    chrome.storage.local.get(['tab_sessions'], (data) => {
      const count = (data.tab_sessions || []).length;
      const badge = document.getElementById('sessions-badge');
      if (badge) badge.textContent = count > 0 ? count : '';
    });
  }

  updateSessionsBadge();

  // ---- First-run onboarding ----

  const navTabs = document.querySelector('.nav-tabs');

  function showOnboarding() {
    onboarding.classList.remove('hidden');
    analyzeView.classList.add('hidden');
    sessionsView.classList.add('hidden');
    if (navTabs) navTabs.classList.add('hidden');
  }

  function hideOnboarding() {
    onboarding.classList.add('hidden');
    analyzeView.classList.remove('hidden');
    if (navTabs) navTabs.classList.remove('hidden');
  }

  document.getElementById('onboard-toggle-gemini').addEventListener('click', () => {
    onboardGeminiInput.type = onboardGeminiInput.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('onboard-toggle-openrouter').addEventListener('click', () => {
    onboardOpenrouterInput.type = onboardOpenrouterInput.type === 'password' ? 'text' : 'password';
  });

  onboardSaveBtn.addEventListener('click', () => {
    const gk = onboardGeminiInput.value.trim();
    const ok = onboardOpenrouterInput.value.trim();
    if (!gk && !ok) {
      onboardSaveBtn.textContent = '⚠️ Enter at least one key';
      setTimeout(() => { onboardSaveBtn.textContent = 'Get Started →'; }, 2000);
      return;
    }
    const updates = {};
    if (gk) updates.gemini_api_key = gk;
    if (ok) updates.openrouter_api_key = ok;
    chrome.storage.local.set(updates, () => {
      hideOnboarding();
      initApp();
    });
  });

  // ---- Restore cache on popup open ----

  function initApp() {
    chrome.storage.session.get(['cached_result', 'cached_at'], (data) => {
      if (data.cached_result && data.cached_at) {
        if (Date.now() - data.cached_at < 10 * 60 * 1000) {
          resultContent.innerHTML = renderMarkdown(data.cached_result);
          showState('result');
          return;
        }
      }
      showState('idle');
    });
  }

  chrome.storage.local.get(['gemini_api_key', 'openrouter_api_key'], (keys) => {
    if (!keys.gemini_api_key && !keys.openrouter_api_key) {
      showOnboarding();
    } else {
      initApp();
    }
  });

  // ---- Nav tabs ----

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t === tab));
      const isAnalyze = tab.dataset.tab === 'analyze';
      analyzeView.classList.toggle('hidden', !isAnalyze);
      sessionsView.classList.toggle('hidden', isAnalyze);
      if (!isAnalyze) loadSessions();
    });
  });

  viewSessionsLink.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === 'sessions');
    });
    analyzeView.classList.add('hidden');
    sessionsView.classList.remove('hidden');
    loadSessions();
  });

  // ---- Session management ----

  function getDefaultSessionName() {
    const d = new Date();
    return `Tabs for the day — ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  function saveSession(session) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['tab_sessions'], (data) => {
        const sessions = data.tab_sessions || [];
        sessions.unshift(session);
        if (sessions.length > 30) sessions.splice(30);
        chrome.storage.local.set({ tab_sessions: sessions }, resolve);
      });
    });
  }

  function loadSessions() {
    chrome.storage.local.get(['tab_sessions'], (data) => {
      renderSessions(data.tab_sessions || []);
    });
  }

  function escHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderSessions(sessions) {
    if (!sessions.length) {
      sessionsList.innerHTML = `<div class="sessions-empty">
        <span class="sessions-empty-icon">📒</span>
        <strong>No saved sessions yet</strong>
        Analyze your open tabs to capture your first session — it logs what you were working on and lets you restore it anytime.
      </div>`;
      return;
    }
    sessionsList.innerHTML = sessions.map(s => {
      const date = new Date(s.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const preview = (s.importantTabs || []).slice(0, 2).map(t => `• ${escHtml(t.title || t.domain)}`).join('<br>');
      return `
        <div class="session-card" data-id="${s.id}">
          <div class="session-name-row">
            <div class="session-name">${escHtml(s.name)}</div>
            <span class="session-tab-count">${s.tabCount} tabs</span>
          </div>
          <div class="session-meta">${date}</div>
          ${preview ? `<div class="session-preview">${preview}</div>` : ''}
          <div class="session-btns">
            <button class="btn-restore" data-id="${s.id}">↩ Restore Tabs</button>
            <button class="btn-view-summary" data-id="${s.id}">📄 Summary</button>
            <button class="btn-del" data-id="${s.id}">🗑</button>
          </div>
        </div>
      `;
    }).join('');

    sessionsList.querySelectorAll('.btn-restore').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); restoreSession(btn.dataset.id); });
    });
    sessionsList.querySelectorAll('.btn-view-summary').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); viewSession(btn.dataset.id); });
    });
    sessionsList.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteSession(btn.dataset.id); });
    });
  }

  function restoreSession(sessionId) {
    chrome.storage.local.get(['tab_sessions'], (data) => {
      const session = (data.tab_sessions || []).find(s => String(s.id) === String(sessionId));
      if (!session) return;
      const tabs = session.allTabs || session.importantTabs || [];
      tabs.forEach(tab => chrome.tabs.create({ url: tab.url, active: false }));
      chrome.tabs.create({ url: chrome.runtime.getURL(`session.html?id=${sessionId}`), active: true });
    });
  }

  function viewSession(sessionId) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`session.html?id=${sessionId}`), active: true });
  }

  function deleteSession(sessionId) {
    chrome.storage.local.get(['tab_sessions'], (data) => {
      const sessions = (data.tab_sessions || []).filter(s => String(s.id) !== String(sessionId));
      chrome.storage.local.set({ tab_sessions: sessions }, () => renderSessions(sessions));
    });
  }

  // ---- Tab scoring ----

  function scoreTab(tab) {
    const url = tab.url || '';
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
        url === 'about:newtab' || url === 'about:blank') return -1;

    let score = 10;
    if (tab.pinned) score += 30;
    if (tab.active) score += 15;
    if (tab.audible) score += 10;
    if (tab.title && tab.title !== 'New Tab' && tab.title.length > 5) score += 5;

    const ageMin = Math.floor((Date.now() - (tab.lastAccessed || Date.now())) / 60000);
    if (ageMin < 30) score += 25;
    else if (ageMin < 120) score += 15;
    else if (ageMin < 1440) score += 5;

    const domain = (() => { try { return new URL(url).hostname.toLowerCase(); } catch(e) { return ''; } })();
    const workKeywords = ['github', 'gitlab', 'notion', 'docs.google', 'jira', 'linear', 'figma',
      'stackoverflow', 'mdn', 'medium', 'substack', 'arxiv', 'wikipedia', 'slack', 'trello',
      'asana', 'confluence', 'vercel', 'netlify', 'heroku', 'aws', 'azure'];
    if (workKeywords.some(k => domain.includes(k))) score += 20;

    return score;
  }

  // ---- Page content extraction (runs in popup, not background) ----

  async function extractTabContent(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'extractContent' });
      if (response?.text && response.text.length > 50) return response.text.slice(0, 2500);
    } catch(e) { /* content script not injected */ }
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const el = document.querySelector('article') || document.querySelector('main') || document.body;
          const clone = el.cloneNode(true);
          clone.querySelectorAll('script,style,nav,footer,aside,header,iframe,[role="navigation"]').forEach(n => n.remove());
          return clone.innerText.replace(/\n{3,}/g, '\n\n').trim().slice(0, 2500);
        },
      });
      return results?.[0]?.result || '';
    } catch(e) {
      return '';
    }
  }

  // ---- Main action ----

  async function runAction() {
    showState('loading');
    startTimer();
    setLoadingText('Analyzing your tabs...');

    try {
      const allTabs = await chrome.tabs.query({});
      const now = Date.now();

      const scored = allTabs.map(tab => {
        const score = scoreTab(tab);
        const ageMs = now - (tab.lastAccessed || now);
        const ageMin = Math.floor(ageMs / 60000);
        let ageLabel;
        if (ageMin < 60) ageLabel = `${ageMin}m`;
        else if (ageMin < 1440) ageLabel = `${Math.floor(ageMin / 60)}h`;
        else ageLabel = `${Math.floor(ageMin / 1440)}d`;
        let domain = 'unknown';
        try { domain = new URL(tab.url || '').hostname.replace('www.', ''); } catch(e) {}
        return { ...tab, score, ageMin, ageLabel, domain };
      }).filter(t => t.score > 0).sort((a, b) => b.score - a.score);

      const importantTabs = scored.slice(0, 5);
      const tabSummaryList = scored.slice(0, 20).map((t, i) =>
        `${i + 1}. ${t.score > 35 ? '[★]' : '   '} "${t.title}" (${t.domain}) — ${t.ageLabel} ago`
      ).join('\n');

      // Phase 1: Quick focus assessment from metadata
      const quickPrompt = `I have ${allTabs.length} browser tabs open. Top tabs by importance:\n\n${tabSummaryList}\n\nIn 3 sharp lines: What am I working on? Any obvious clutter I should address?`;

      chrome.runtime.sendMessage({
        action: 'callGeminiBackground',
        prompt: quickPrompt,
        options: {
          model: 'gemini-3.5-flash',
          systemInstruction: 'Analyze browser tab titles and domains. Give a sharp 3-line assessment of what the person is working on. Be specific and direct, not generic.',
          temperature: 0.3,
          maxTokens: 150,
        },
      }, (response) => {
        if (response?.success) showResult(response.data, true);
        else showError(response?.error || 'Failed to analyze tabs');
      });

      // Extract content from top important tabs in parallel
      setLoadingText('Reading important tabs...');
      const tabsWithContent = await Promise.all(
        importantTabs.map(async (tab) => {
          const content = await extractTabContent(tab.id);
          return { ...tab, content };
        })
      );

      // Phase 2: Full session report with content
      const importantDetails = tabsWithContent.map((t, i) =>
        `**Tab ${i + 1}: ${t.title}**\nURL: ${t.url}\nLast active: ${t.ageLabel} ago\n\n${t.content ? `Content:\n${t.content}` : '[Content unavailable]'}`
      ).join('\n\n---\n\n');

      const fullPrompt = `Browser session with ${allTabs.length} total tabs.\n\n## All tabs (top 20 by importance)\n${tabSummaryList}\n\n## Deep dive: Top ${importantTabs.length} important tabs\n\n${importantDetails}\n\n---\n\nWrite a **Session Report**:\n\n## 🎯 What You're Working On\nIdentify the main task or project. Be specific — name the actual thing.\n\n## 📌 Important Tab Summaries\nFor each ★ tab: 1-2 sentences on what it is and why it matters right now.\n\n## 📊 Session Health\n- Active work vs. research vs. distraction (rough %)\n- Stalest tab still open: how long and likely why\n\n## ✅ Action List\n- 2-3 specific tabs to close now (by title)\n- 1-2 to save/bookmark before closing\n\nUse markdown. Be concrete and specific. No generic advice.`;

      chrome.runtime.sendMessage({
        action: 'callGeminiBackground',
        prompt: fullPrompt,
        options: {
          model: 'gemini-3.5-flash',
          systemInstruction: 'You are a productivity analyst reviewing a browser session. Give specific, useful analysis based on actual tab titles and content. Use markdown with ## sections. Be direct and actionable.',
          temperature: 0.4,
        },
      }, async (response) => {
        if (!response?.success) {
          console.error('Full analysis failed:', response?.error);
          return;
        }

        showResult(response.data, false);

        const session = {
          id: Date.now(),
          name: getDefaultSessionName(),
          savedAt: Date.now(),
          tabCount: allTabs.length,
          importantTabs: tabsWithContent.map(t => ({ url: t.url, title: t.title, domain: t.domain })),
          allTabs: scored.map(t => ({ url: t.url, title: t.title, domain: t.domain, score: t.score })),
          summary: response.data,
        };

        await saveSession(session);
        updateSessionsBadge();
        saveToastText.textContent = `Saved as "${session.name}"`;
        saveToast.classList.remove('hidden');
      });

    } catch (err) {
      console.error('Action failed:', err);
      showError(err.message || 'Something went wrong. Try again.');
    }
  }

  // ---- Settings Panel ----

  function openSettings() {
    settingsPanel.classList.remove('hidden');
    settingsPanel.classList.add('fade-in');
    chrome.storage.local.get(['gemini_api_key', 'openrouter_api_key'], (data) => {
      geminiKeyInput.value = data.gemini_api_key || '';
      openrouterKeyInput.value = data.openrouter_api_key || '';
    });
  }

  function closeSettings() {
    settingsPanel.classList.add('hidden');
    settingsPanel.classList.remove('fade-in');
  }

  settingsBtn.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);

  toggleGeminiKey.addEventListener('click', () => {
    geminiKeyInput.type = geminiKeyInput.type === 'password' ? 'text' : 'password';
  });
  toggleOpenrouterKey.addEventListener('click', () => {
    openrouterKeyInput.type = openrouterKeyInput.type === 'password' ? 'text' : 'password';
  });

  saveKeysBtn.addEventListener('click', () => {
    const updates = {};
    const gk = geminiKeyInput.value.trim();
    const ok = openrouterKeyInput.value.trim();
    if (gk) updates.gemini_api_key = gk;
    if (ok) updates.openrouter_api_key = ok;
    if (!Object.keys(updates).length) return;
    chrome.storage.local.set(updates, () => {
      saveKeysBtn.textContent = '✅ Saved';
      setTimeout(() => { saveKeysBtn.textContent = 'Save Keys'; }, 1500);
    });
  });

  clearKeysBtn.addEventListener('click', async () => {
    await resetApiKeys();
    geminiKeyInput.value = '';
    openrouterKeyInput.value = '';
    clearKeysBtn.textContent = '✅ Cleared';
    setTimeout(() => { clearKeysBtn.textContent = 'Clear All Keys'; }, 1500);
  });

  // ---- Event Listeners ----

  actionBtn.addEventListener('click', runAction);
  retryBtn.addEventListener('click', runAction);
  rerunBtn.addEventListener('click', runAction);

  copyBtn.addEventListener('click', () => {
    const temp = document.createElement('div');
    temp.innerHTML = resultContent.innerHTML;
    const text = temp.textContent || temp.innerText;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = '✅';
      setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
    });
  });
});

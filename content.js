// ============================================
// CONTENT.JS TEMPLATE
// Injected into web pages.
// Handles: extracting page content, injecting UI.
// Modify per project.
// ============================================

// --- Extract Page Content ---
function extractPageContent() {
  // Get main text content (strips nav, footer, ads as much as possible)
  const article = document.querySelector('article') || document.querySelector('main') || document.body;

  // Clean extraction
  const clone = article.cloneNode(true);

  // Remove scripts, styles, nav, footer, aside
  const remove = clone.querySelectorAll('script, style, nav, footer, aside, header, iframe, .ad, [role="navigation"]');
  remove.forEach((el) => el.remove());

  const text = clone.innerText
    .replace(/\n{3,}/g, '\n\n')  // Collapse multiple newlines
    .trim()
    .slice(0, 15000);  // Gemini context limit safety (1.5 Flash handles 1M tokens but keep prompts focused)

  return {
    title: document.title,
    url: window.location.href,
    text: text,
    metaDescription: document.querySelector('meta[name="description"]')?.content || '',
  };
}

// --- Inject Sidebar UI ---
function injectSidebar(content) {
  // Remove existing sidebar if present
  const existing = document.getElementById('gemini-sidebar');
  if (existing) existing.remove();

  const sidebar = document.createElement('div');
  sidebar.id = 'gemini-sidebar';
  sidebar.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      right: 0;
      width: 360px;
      height: 100vh;
      background: #0a0a0f;
      color: #e0e0e8;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 999999;
      box-shadow: -4px 0 24px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    ">
      <div style="
        padding: 14px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      ">
        <span style="font-size: 14px; font-weight: 600;">✦ Gemini Analysis</span>
        <button id="gemini-sidebar-close" style="
          background: none;
          border: none;
          color: #8888a0;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
        ">✕</button>
      </div>
      <div id="gemini-sidebar-content" style="
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        font-size: 13px;
        line-height: 1.6;
        white-space: pre-wrap;
      ">${content}</div>
      <div style="
        padding: 10px 16px;
        border-top: 1px solid rgba(255,255,255,0.06);
        font-size: 10px;
        color: #555568;
        text-align: center;
      ">Built by @happy_ships · Powered by Gemini</div>
    </div>
  `;

  document.body.appendChild(sidebar);

  // Close button
  document.getElementById('gemini-sidebar-close').addEventListener('click', () => {
    sidebar.remove();
  });

  // ESC key closes
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      sidebar.remove();
      document.removeEventListener('keydown', handler);
    }
  });
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractContent') {
    const content = extractPageContent();
    sendResponse(content);
  }

  if (message.action === 'showSidebar') {
    injectSidebar(message.content);
    sendResponse({ success: true });
  }

  if (message.action === 'geminiAction') {
    // Context menu triggered — extract content and show loading sidebar
    injectSidebar('<div style="text-align:center;color:#6c8aff;padding-top:40px;"><div style="width:24px;height:24px;border:2px solid rgba(108,138,255,0.15);border-top-color:#6c8aff;border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto;"></div><p style="margin-top:12px;font-size:12px;">Thinking with Gemini...</p></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>');

    // Get content and call Gemini
    const pageContent = extractPageContent();
    const selectedText = message.selectedText;

    const prompt = selectedText
      ? `Analyze this selected text from the page "${pageContent.title}":\n\n"${selectedText}"\n\nProvide a clear, concise analysis.`
      : `Analyze this webpage:\n\nTitle: ${pageContent.title}\nURL: ${pageContent.url}\n\nContent:\n${pageContent.text.slice(0, 8000)}\n\nProvide: 1) Summary 2) Key Points 3) Notable claims or data`;

    // Send to background for Gemini call
    chrome.runtime.sendMessage(
      { action: 'callGeminiBackground', prompt, options: { temperature: 0.5 } },
      (response) => {
        if (response?.success) {
          const sidebarContent = document.getElementById('gemini-sidebar-content');
          if (sidebarContent) {
            sidebarContent.textContent = response.data;
          }
        } else {
          const sidebarContent = document.getElementById('gemini-sidebar-content');
          if (sidebarContent) {
            sidebarContent.innerHTML = `<p style="color:#ff6b6b;">Error: ${response?.error || 'Unknown error'}</p>`;
          }
        }
      }
    );
  }
});

export function createMafiModule() {
  const history = [];

  const element = document.createElement('div');
  element.className = 'flex flex-col h-full bg-softBlue1';
  element.innerHTML = `
    <div class="flex items-center gap-3 px-6 py-4 border-b border-white/8 bg-[linear-gradient(180deg,#13243f_0%,#0d1c33_100%)] shrink-0">
      <div class="flex h-10 w-10 items-center justify-center rounded-[0.85rem] border border-gold/60 bg-[radial-gradient(circle_at_30%_28%,#f4d777_0%,#cfa52e_42%,#8f6a14_100%)] text-[0.7rem] font-black text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
        AI
      </div>
      <div>
        <p class="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-softBlue2">Mortgage Assistant</p>
        <h2 class="text-sm font-bold text-white">MAFI</h2>
      </div>
      <button id="mafi-clear-btn" type="button" class="ml-auto text-xs text-softBlue2 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition hover:border-white/20">
        Clear
      </button>
    </div>

    <div id="mafi-messages" class="flex-1 overflow-y-auto px-5 py-5 space-y-4">
      <div class="flex gap-3">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gold/50 bg-[radial-gradient(circle_at_30%_28%,#f4d777_0%,#cfa52e_42%,#8f6a14_100%)] text-[0.55rem] font-black text-navy mt-0.5">AI</div>
        <div class="max-w-[80%] rounded-2xl rounded-tl-sm bg-[#1a2e4a] border border-white/8 px-4 py-3 text-sm text-slate-200 leading-relaxed">
          Hello! I'm MAFI, your mortgage assistant. Ask me anything about loan programs, guidelines, rates, or mortgage processes.
        </div>
      </div>
    </div>

    <div class="shrink-0 border-t border-white/8 bg-[#0d1c33] px-4 py-3">
      <form id="mafi-form" class="flex gap-2 items-end">
        <textarea
          id="mafi-input"
          rows="1"
          placeholder="Ask MAFI anything..."
          class="flex-1 resize-none rounded-2xl border border-[#34527c] bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#5476a2] max-h-32 leading-relaxed"
        ></textarea>
        <button
          id="mafi-send-btn"
          type="submit"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gold text-navy transition hover:bg-[#d9b23f] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i class="fa-solid fa-paper-plane text-sm"></i>
        </button>
      </form>
    </div>
  `;

  const messagesEl = element.querySelector('#mafi-messages');
  const form = element.querySelector('#mafi-form');
  const input = element.querySelector('#mafi-input');
  const sendBtn = element.querySelector('#mafi-send-btn');
  const clearBtn = element.querySelector('#mafi-clear-btn');

  function appendMessage(role, text) {
    const isUser = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `flex gap-3 ${isUser ? 'justify-end' : ''}`;
    wrapper.innerHTML = isUser
      ? `<div class="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#1e4080] border border-[#2e5499] px-4 py-3 text-sm text-white leading-relaxed">${escapeHtml(text)}</div>`
      : `
          <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gold/50 bg-[radial-gradient(circle_at_30%_28%,#f4d777_0%,#cfa52e_42%,#8f6a14_100%)] text-[0.55rem] font-black text-navy mt-0.5">AI</div>
          <div class="max-w-[80%] rounded-2xl rounded-tl-sm bg-[#1a2e4a] border border-white/8 px-4 py-3 text-sm text-slate-200 leading-relaxed">${formatResponse(text)}</div>
        `;
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return wrapper;
  }

  function appendTypingIndicator() {
    const wrapper = document.createElement('div');
    wrapper.id = 'mafi-typing';
    wrapper.className = 'flex gap-3';
    wrapper.innerHTML = `
      <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gold/50 bg-[radial-gradient(circle_at_30%_28%,#f4d777_0%,#cfa52e_42%,#8f6a14_100%)] text-[0.55rem] font-black text-navy mt-0.5">AI</div>
      <div class="rounded-2xl rounded-tl-sm bg-[#1a2e4a] border border-white/8 px-4 py-3">
        <span class="flex gap-1 items-center h-5">
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay:0ms"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay:150ms"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay:300ms"></span>
        </span>
      </div>
    `;
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTypingIndicator() {
    element.querySelector('#mafi-typing')?.remove();
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatResponse(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 128) + 'px';
  });

  // Submit on Enter (Shift+Enter for newline)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    appendMessage('user', message);
    history.push({ role: 'user', content: message });

    appendTypingIndicator();

    try {
      const res = await fetch('/api/mafi-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: history.slice(-10) }),
      });
      const data = await res.json();
      removeTypingIndicator();

      const reply = data.reply || data.message || data.response || data.error || 'No response received.';
      appendMessage('assistant', reply);
      history.push({ role: 'assistant', content: reply });
    } catch {
      removeTypingIndicator();
      appendMessage('assistant', 'Connection error. Please try again.');
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });

  clearBtn.addEventListener('click', () => {
    history.length = 0;
    messagesEl.innerHTML = '';
    appendMessage('assistant', 'Conversation cleared. How can I help you?');
  });

  return { element };
}

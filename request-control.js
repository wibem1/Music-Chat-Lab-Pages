(() => {
  // v1.1.32 — abort control plus Anthropic structured-output compatibility.
  const activeFetchControllers = new Set();
  const activeXhrs = new Set();
  const isProviderUrl = u => /api\.anthropic\.com\/v1\/messages|api\.openai\.com\/v1\/responses|generativelanguage\.googleapis\.com\/.*:generateContent/i.test(String(u || ''));
  const isAnthropicUrl = u => /api\.anthropic\.com\/v1\/messages/i.test(String(u || ''));

  function messageText(m) {
    if (typeof m?.content === 'string') return m.content;
    if (Array.isArray(m?.content)) return m.content.map(x => x?.text || '').join('');
    return '';
  }

  function applyAnthropicStructuredOutputPolicy(url, init) {
    if (!isAnthropicUrl(url) || typeof init?.body !== 'string') return init;
    try {
      const body = JSON.parse(init.body);
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const lastUser = [...messages].reverse().find(m => m?.role === 'user');
      const prompt = messageText(lastUser).trim();
      const isFinalComposition = /^VERBINDLICHER TECHNISCHER MODUS:\s*(?:PATCH|REPLACE_SCORE|NEW_SCORE)/i.test(prompt);
      if (!isFinalComposition) return init;

      // Claude Sonnet 5 uses adaptive thinking by default. For the final machine-readable
      // score/patch this can consume the entire max_tokens budget before any text is emitted.
      // The musical decision has already been made in the approved proposal, so the final
      // serialization step deliberately runs without thinking.
      body.thinking = { type: 'disabled' };
      delete body.output_config;

      // A patch contains only changed material. 12k visible tokens are already generous and
      // avoid another runaway request while still allowing substantial multi-track edits.
      if (/^VERBINDLICHER TECHNISCHER MODUS:\s*PATCH/i.test(prompt) && Number(body.max_tokens) > 12000) {
        body.max_tokens = 12000;
      }
      return { ...init, body: JSON.stringify(body) };
    } catch {
      return init;
    }
  }

  const previousFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!isProviderUrl(url)) return previousFetch(input, init);
    const adjustedInit = applyAnthropicStructuredOutputPolicy(url, init);
    const controller = new AbortController();
    activeFetchControllers.add(controller);
    const originalSignal = adjustedInit.signal;
    let relay;
    if (originalSignal) {
      if (originalSignal.aborted) controller.abort();
      else {
        relay = () => controller.abort();
        originalSignal.addEventListener('abort', relay, { once: true });
      }
    }
    try {
      return await previousFetch(input, { ...adjustedInit, signal: controller.signal });
    } finally {
      activeFetchControllers.delete(controller);
      if (originalSignal && relay) originalSignal.removeEventListener('abort', relay);
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__mclProviderRequest = isProviderUrl(url);
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    if (this.__mclProviderRequest) {
      activeXhrs.add(this);
      const cleanup = () => activeXhrs.delete(this);
      this.addEventListener('loadend', cleanup, { once: true });
      this.addEventListener('abort', cleanup, { once: true });
    }
    return originalSend.apply(this, args);
  };

  function abortRunning(reason = 'Laufende Anfrage abgebrochen.') {
    for (const c of [...activeFetchControllers]) {
      try { c.abort(); } catch {}
    }
    for (const x of [...activeXhrs]) {
      try { x.abort(); } catch {}
    }
    const note = document.getElementById('composerNote');
    if (note) note.textContent = reason;
  }

  window.MCLAbortRunningRequest = abortRunning;

  window.addEventListener('DOMContentLoaded', () => {
    const provider = document.getElementById('providerSelect');
    const model = document.getElementById('modelSelect');
    provider?.addEventListener('change', () => abortRunning('Laufende Anfrage wurde beim Anbieterwechsel abgebrochen.'), { capture: true });
    model?.addEventListener('change', () => abortRunning('Laufende Anfrage wurde beim Modellwechsel abgebrochen.'), { capture: true });
  });
})();
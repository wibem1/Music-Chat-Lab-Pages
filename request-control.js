(() => {
  // v1.1.35 — abort control plus robust Anthropic Claude-5 output/thinking policy.
  const activeFetchControllers = new Set();
  const activeXhrs = new Set();
  const isProviderUrl = u => /api\.anthropic\.com\/v1\/messages|api\.openai\.com\/v1\/responses|generativelanguage\.googleapis\.com\/.*:generateContent/i.test(String(u || ''));
  const isAnthropicUrl = u => /api\.anthropic\.com\/v1\/messages/i.test(String(u || ''));
  const isClaude5 = model => /^claude-(?:sonnet|opus)-5(?:$|-)/i.test(String(model || ''));

  function messageText(m) {
    if (typeof m?.content === 'string') return m.content;
    if (Array.isArray(m?.content)) return m.content.map(x => x?.text || '').join('');
    return '';
  }

  function classifyAnthropicRequest(url, init) {
    if (!isAnthropicUrl(url) || typeof init?.body !== 'string') return null;
    try {
      const body = JSON.parse(init.body);
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const lastUser = [...messages].reverse().find(m => m?.role === 'user');
      const prompt = messageText(lastUser).trim();
      const isFinalComposition = /^VERBINDLICHER TECHNISCHER MODUS:\s*(?:PATCH|REPLACE_SCORE|NEW_SCORE)/i.test(prompt);
      const isVisibleChat = !body.system && isClaude5(body.model);
      return { body, prompt, isFinalComposition, isVisibleChat };
    } catch {
      return null;
    }
  }

  function applyAnthropicOutputPolicy(url, init) {
    const info = classifyAnthropicRequest(url, init);
    if (!info) return init;
    const { body, prompt, isFinalComposition, isVisibleChat } = info;

    if (isFinalComposition) {
      // The musical decisions already exist in the approved proposal. The final score/patch
      // is a serialization task, so Claude 5 must not spend output tokens on adaptive thinking.
      body.thinking = { type: 'disabled' };
      delete body.output_config;
      if (/^VERBINDLICHER TECHNISCHER MODUS:\s*PATCH/i.test(prompt) && Number(body.max_tokens) > 12000) {
        body.max_tokens = 12000;
      }
      return { ...init, body: JSON.stringify(body) };
    }

    if (isVisibleChat) {
      body.thinking = { type: 'adaptive' };
      body.output_config = { ...(body.output_config || {}), effort: 'medium' };
      const current = Number(body.max_tokens) || 4096;
      body.max_tokens = Math.min(12000, Math.max(8192, current));
      return { ...init, body: JSON.stringify(body) };
    }

    return init;
  }

  function hasAnthropicText(data) {
    return Array.isArray(data?.content) && data.content.some(x => x?.type === 'text' && String(x?.text || '').trim());
  }

  async function shouldRetryVisibleAnthropic(url, init, response) {
    const info = classifyAnthropicRequest(url, init);
    if (!info?.isVisibleChat || !response?.ok) return false;
    try {
      const data = await response.clone().json();
      return !hasAnthropicText(data);
    } catch {
      return false;
    }
  }

  function makeVisibleFallbackInit(url, init) {
    const info = classifyAnthropicRequest(url, init);
    if (!info) return init;
    const body = info.body;
    body.thinking = { type: 'disabled' };
    delete body.output_config;
    body.max_tokens = Math.min(8192, Math.max(4096, Number(body.max_tokens) || 4096));
    return { ...init, body: JSON.stringify(body) };
  }

  const previousFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!isProviderUrl(url)) return previousFetch(input, init);
    const adjustedInit = applyAnthropicOutputPolicy(url, init);
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
      const response = await previousFetch(input, { ...adjustedInit, signal: controller.signal });
      if (await shouldRetryVisibleAnthropic(url, adjustedInit, response)) {
        const fallbackInit = makeVisibleFallbackInit(url, adjustedInit);
        return await previousFetch(input, { ...fallbackInit, signal: controller.signal });
      }
      return response;
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
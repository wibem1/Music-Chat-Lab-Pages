(() => {
  // v0.4.23 — Abort running provider requests when the provider/model is changed.
  const activeFetchControllers = new Set();
  const activeXhrs = new Set();
  const isProviderUrl = u => /api\.anthropic\.com\/v1\/messages|api\.openai\.com\/v1\/responses|generativelanguage\.googleapis\.com\/.*:generateContent/i.test(String(u || ''));

  const previousFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!isProviderUrl(url)) return previousFetch(input, init);
    const controller = new AbortController();
    activeFetchControllers.add(controller);
    const originalSignal = init.signal;
    let relay;
    if (originalSignal) {
      if (originalSignal.aborted) controller.abort();
      else {
        relay = () => controller.abort();
        originalSignal.addEventListener('abort', relay, { once: true });
      }
    }
    try {
      return await previousFetch(input, { ...init, signal: controller.signal });
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
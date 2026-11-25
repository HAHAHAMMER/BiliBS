(function (global) {
  'use strict';
  const pending = new Map();
  const media = new Map();
  const timeout = 25000;
  let sequence = 0;
  let session = 0;
  function take(id) {
    const call = pending.get(id);
    if (call) { clearTimeout(call.timer); pending.delete(id); }
    return call;
  }
  function nativeCall(operation, payload) {
    return new Promise((resolve, reject) => {
      const id = String(++sequence);
      const timer = setTimeout(() => { take(id); reject(new Error('请求超时')); }, timeout);
      pending.set(id, {resolve, reject, timer});
      try {
        if (operation === 'clear') global.BSNative.clearSession(id);
        else global.BSNative.request(id, JSON.stringify(payload));
      } catch (_) {
        take(id); reject(new Error('设备网络服务不可用'));
      }
    });
  }
  async function dispatch(operation, payload) {
    if (global.BSNative && typeof global.BSNative.request === 'function') return nativeCall(operation, payload);
    const loc = global.location;
    if (loc.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(loc.hostname)) {
      throw new Error('请在 BiliBS 安卓应用或本机开发服务中使用在线功能');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch('/__bs/' + operation, {method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-BiliBS-Request':'1'}, body:JSON.stringify(payload),
        cache:'no-store', redirect:'error', signal:controller.signal});
      if (!response.ok) throw new Error('本机网络服务未就绪（' + response.status + '）');
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw new Error('请求超时');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function canonical(raw) {
    return String(raw || '').replace(/^\/\//, 'https://').replace(/^http:\/\//i, 'https://');
  }
  function imageURL(raw) {
    const prefix='/__bs/image/';
    let source=String(raw || '');
    if (source.startsWith(prefix)) source='https://' + source.slice(prefix.length);
    source=canonical(source);
    const target=source.slice('https://'.length);
    if (!source.startsWith('https://') || target.length>1024 || target.includes('..') ||
        !/^i[012]\.hdslb\.com\/bfs\/(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp|gif|avif)(?:@[A-Za-z0-9_.!-]+)?$/i.test(target)) return '';
    return prefix+target;
  }
  global.BSTransport = Object.freeze({
    imageURL,
    async request(input) {
      const version = session;
      const options = {...input};
      if (options.body && typeof options.body !== 'string') options.body = new URLSearchParams(options.body).toString();
      const packet = await dispatch('request', options);
      if (session !== version) throw new Error('会话已更新');
      if (!packet || typeof packet.body !== 'string') throw new Error('网络服务返回无效');
      for (const [url, token] of Object.entries(packet.media || {})) {
        if (typeof token === 'string' && /^[a-zA-Z0-9_-]{20,64}$/.test(token)) {
          media.delete(url); media.set(url, '/__bs/media/' + token);
        }
      }
      while (media.size > 8192) media.delete(media.keys().next().value);
      return {status:packet.status, body:packet.body, headers:packet.headers || {}};
    },
    mediaURL(url) { return media.get(canonical(url)) || ''; },
    async cancelQr() { await dispatch('request', {control:'cancelQr'}); },
    async clearSession() {
      session++; media.clear();
      await dispatch('clear', {});
    },
    resolve(id, value) { const call = take(String(id)); if (call) call.resolve(value); },
    reject(id) { const call = take(String(id)); if (call) call.reject(new Error('平台网络服务暂时不可用')); }
  });
})(window);

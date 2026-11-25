// Application data and the design-review library have separate lifetimes and storage.
(() => {
  'use strict';
  const demo = new URLSearchParams(location.search).get('mode') === 'demo';
  window.BS_MODE = demo ? 'demo' : 'online';
  document.documentElement.dataset.mode = window.BS_MODE;
  window.BS_EXAMPLE = demo && new URLSearchParams(location.search).get('example');
  function failure(message) {
    const box = document.createElement('div');
    box.className = 'empty';
    box.setAttribute('role', 'alert');
    const label = document.createElement('p');
    label.textContent = message;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'secondary';
    retry.textContent = '重新加载';
    retry.onclick = () => location.reload();
    box.append(label, retry);
    const host = document.getElementById('view');
    host.textContent = '';
    host.appendChild(box);
    retry.focus();
  }
  // The shell serializes simple route records. Keep TV WebViews which predate
  // structuredClone, Array.at and Object.hasOwn usable without patching app data.
  if (!window.structuredClone) window.structuredClone = value => JSON.parse(JSON.stringify(value));
  if (!Array.prototype.at) Object.defineProperty(Array.prototype, 'at', {
    configurable: true, writable: true,
    value(index) { const i = Math.trunc(Number(index)) || 0; return this[i < 0 ? this.length + i : i]; }
  });
  if (!Object.hasOwn) Object.hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function load(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.onload = resolve;
      script.onerror = () => reject(new Error(path));
      document.head.appendChild(script);
    });
  }
  async function start() {
    if (demo) {
      await load('src/fixture-data.js');
    } else {
      await load('src/search-words.js');
      await load('src/transport.js');
      await load('src/services.js');
      await load('src/home-candidates.js');
    }
    await load('src/runtime.js');
    if (!window.BS_READY) {
      failure('界面未能启动。请更新系统 WebView 或浏览器，再重新加载。');
    }
  }
  start().catch(() => {
    failure('应用组件加载失败。请重新打开应用，或重新安装完整安装包。');
  });
})();

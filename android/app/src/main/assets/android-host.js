(() => {
  'use strict';
  const visible = el => el && el.getClientRects().length > 0;
  const syncWake = () => {
    const video = document.getElementById('video');
    window.BSHost.playbackActive(Boolean(visible(video) && !video.paused && !video.ended));
  };
  for (const type of ['playing', 'pause', 'ended', 'emptied', 'error'])
    document.addEventListener(type, syncWake, true);
  syncWake();
  function key(name) {
    const el = document.activeElement || document.body;
    const allowed = el.dispatchEvent(new KeyboardEvent('keydown', {
      key: name, bubbles: true, cancelable: true
    }));
    if (name.startsWith('Media')) {
      if (!allowed) return;
      const video = document.getElementById('video');
      if (!video || !visible(video) || !video.currentSrc) return;
      if (name === 'MediaPause' || (name === 'MediaPlayPause' && !video.paused)) video.pause();
      else video.play().catch(() => {});
      return;
    }
    if (allowed && name === 'Enter' && el.matches('button, a[href], [role="button"]')) el.click();
    // Synthetic D-pad events have no default caret movement in editable fields.
    if (allowed && el.matches('input[type=text],input:not([type]),input[type=search],textarea')
        && ['ArrowLeft', 'ArrowRight'].includes(name) && el.selectionStart !== null) {
      const left = name === 'ArrowLeft';
      const anchor = left ? el.selectionStart : el.selectionEnd;
      const delta = el.selectionStart === el.selectionEnd ? (left ? -1 : 1) : 0;
      const pos = Math.max(0, Math.min(el.value.length, anchor + delta));
      el.setSelectionRange(pos, pos);
    }
    el.dispatchEvent(new KeyboardEvent('keyup', {key:name, bubbles:true, cancelable:true}));
  }
  window.BiliBSTVHost = Object.freeze({
    key,
    back() {
      const nav = document.getElementById('nav');
      if ((!nav || !nav.firstElementChild) && !window.BS_READY
          && !window.BS_EXAMPLE && !visible(document.getElementById('player'))) return true;
      const homeTab = document.querySelector(window.BS_MODE==='online'?'#nav [aria-current="page"]':'[data-k="nav-home"]');
      const atHome = document.activeElement === homeTab
          && homeTab && homeTab.getAttribute('aria-current') === 'page';
      const blocked = [...document.querySelectorAll('[role="dialog"], #layer, #sheet')].some(visible);
      if (atHome && !blocked) return true;
      key('Escape');
      return false;
    },
    pause() {
      window.dispatchEvent(new Event('pagehide'));
      document.querySelectorAll('video,audio').forEach(media => media.pause());
    }
  });
})();

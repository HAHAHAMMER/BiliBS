// Runs inside the V6 UI closure. Online playback uses only the current platform
// response and its granted, same-origin media handles. No sample is a fallback.
if (bsOnline) {
  prefOpts.quality=[['auto','自动兼容'],['low','优先省流画质']];
  const outputs = new WeakMap(), libraries = new Map();
  function loadLibrary(name,file,check) {
    if(libraries.has(name))return libraries.get(name);
    const promise=new Promise((resolve,reject)=>{
      const ready=()=>{
        try{
          const lib=window[name];
          if(!lib||!check(lib))throw new Error('当前 WebView 不支持该片源的播放组件');
          resolve(lib);
        }catch(error){reject(error);}
      };
      if(window[name]){ready();return;}
      const script=document.createElement('script');
      script.src=new URL('src/vendor/'+file,document.baseURI).href;
      script.onload=ready;script.onerror=()=>reject(new Error('播放组件未能加载'));
      document.head.append(script);
    }).catch(error=>{libraries.delete(name);throw error;});
    libraries.set(name,promise);
    return promise;
  }
  const loadEngine=()=>loadLibrary('shaka','shaka-player.compiled.js',lib=>{
    lib.polyfill.installAll();return lib.Player.isBrowserSupported();
  });
  const loadFlvEngine=()=>loadLibrary('mpegts','mpegts.js',lib=>lib.isSupported());
  const loadHlsEngine=()=>loadLibrary('Hls','hls.light.min.js',lib=>lib.isSupported());
  function grantedUrl(raw){
    const u=new URL(raw,location.href);
    return u.origin===location.origin&&/^\/__bs\/media\/[\w-]+$/.test(u.pathname);
  }

  const valueNum = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const sec = value => Math.max(0, valueNum(value));
  function handles(track) {
    return [...new Set([track?.url, ...(track?.backupUrls || [])].filter(Boolean).map(url => {
      const path = window.BSTransport.mediaURL(url);
      return /^\/__bs\/media\/[A-Za-z0-9_-]+$/.test(path) ? new URL(path, location.origin).href : '';
    }).filter(Boolean))];
  }
  const codecFamily = codec => /^av01/i.test(codec) ? 'av1' : /^(hvc1|hev1)/i.test(codec) ? 'hevc' : /^avc[13]/i.test(codec) ? 'avc' : codec;
  function supported(track, type) {
    if (!track?.codec || !handles(track).length) return false;
    const base = track.segmentBase;
    if (!base || !/^\d+-\d+$/.test(base.initialization) || !/^\d+-\d+$/.test(base.indexRange)) return false;
    const mime = (track.mime || type + '/mp4') + '; codecs="' + track.codec + '"';
    return !!window.MediaSource?.isTypeSupported(mime);
  }
  function dashChoices(result, qn, options) {
    const audios = (result.audio || []).filter(t => supported(t, 'audio'))
      .sort((a,b) => (options.audio==='auto'?Number(!a.codec.startsWith('mp4a'))-Number(!b.codec.startsWith('mp4a')):0)
        || (options.audio === 'std' ? 1 : -1) * (a.bandwidth - b.bandwidth));
    const priority = [...new Set([options.codec === 'auto' ? 'avc' : options.codec, 'avc', 'hevc', 'av1'])];
    const rank = v => { const n = priority.indexOf(codecFamily(v.codec)); return n < 0 ? 100 : n; };
    let videos = (result.video || []).filter(t => supported(t, 'video'));
    if (qn) videos = videos.filter(t => Number(t.id) === Number(qn));
    videos.sort((a,b) => rank(a)-rank(b) || (options.quality==='low'?a.id-b.id:b.id-a.id));
    // Try a compatible lower tier after an automatic selection fails. Manual
    // selections never silently change the claimed quality.
    const choices = [];
    for (const a of audios) {
      for (const v of videos) choices.push({type:'dash', v, a, duration:sec(result.duration), quality:v.id});
    }
    return choices;
  }
  function progressiveChoice(result) {
    const segments = (result.segments || []).map(t => ({urls:handles(t), duration:sec(t.duration), format:t.format||result.format||''}));
    if (!segments.length || segments.some(s => !s.urls.length)) return null;
    if (segments.length > 1 && segments.some(s => !s.duration)) return null;
    return {type:'file', segments, duration:sec(result.duration) || segments.reduce((n,s) => n+s.duration,0), quality:result.quality};
  }
  function manifest(choice) {
    const xmlEscape = s => esc(String(s));
    const adaptation = (t, kind, id) => '<AdaptationSet contentType="' + kind + '" mimeType="' +
      xmlEscape(t.mime || kind+'/mp4') + '" segmentAlignment="true"><Representation id="' + id +
      '" codecs="' + xmlEscape(t.codec) + '" bandwidth="' + Math.max(1, valueNum(t.bandwidth)) + '"' +
      (kind === 'video' ? ' width="'+valueNum(t.width)+'" height="'+valueNum(t.height)+'"' : '') + '>' +
      handles(t).map(url => '<BaseURL>'+xmlEscape(url)+'</BaseURL>').join('') +
      '<SegmentBase indexRange="'+xmlEscape(t.segmentBase.indexRange)+'"><Initialization range="'+
      xmlEscape(t.segmentBase.initialization)+'"/></SegmentBase></Representation></AdaptationSet>';
    const duration = sec(choice.duration);
    if (!duration) throw new Error('片源未提供有效时长');
    const xml = '<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" minBufferTime="PT1S" mediaPresentationDuration="PT'+duration+'S"><Period duration="PT'+duration+'S">' +
      adaptation(choice.v,'video','v')+adaptation(choice.a,'audio','a')+'</Period></MPD>';
    return 'data:application/dash+xml;base64,' + btoa(xml);
  }
  function partAt(segments, t) {
    let offset = 0;
    for (let i=0; i<segments.length; i++) {
      if (i === segments.length-1 || t < offset + segments[i].duration) return {i,offset};
      offset += segments[i].duration;
    }
    return {i:0,offset:0};
  }
  function clearOutput(el) {
    const prev = outputs.get(el);
    if (!prev) return Promise.resolve();
    if (!prev.closed) {
      prev.closed = true;
      prev.abort.abort();
      if (prev.flv) prev.flv.destroy();
      if (prev.hls) prev.hls.destroy();
      if (prev.engine) prev.release = prev.engine.destroy().catch(() => {});
      else if (prev.assigned) { el.pause(); el.removeAttribute('src'); el.load(); }
    }
    return prev.release || Promise.resolve();
  }
  async function openOutput(el, choice, start, onFatal, valid) {
    await clearOutput(el);
    if (!valid()) throw new Error('已切换');
    const ctx = {closed:false, assigned:false, engine:null, abort:new AbortController(), offset:0};
    outputs.set(el,ctx);
    const active = () => valid() && !ctx.closed && outputs.get(el) === ctx;
    const fatal = err => { if (active()) onFatal(err); };
    if(choice.type==='hls'&&window.MediaSource) {
      const Hls=await loadHlsEngine();
      if(!active())throw new Error('已切换');
      const reader=ctx.hls=new Hls({enableWorker:false,lowLatencyMode:false,emeEnabled:false,
        liveSyncDurationCount:4,liveMaxLatencyDurationCount:20,backBufferLength:15,maxBufferLength:24,
        xhrSetup(xhr,url){if(!grantedUrl(url))throw new Error('直播资源地址未经授权');}});
      let opened=false;
      await new Promise((resolve,reject)=>{
        const finish=err=>{
          clearTimeout(timer);ctx.abort.signal.removeEventListener('abort',cancel);
          if(err)reject(err);else resolve();
        };
        const cancel=()=>finish(new Error('已切换'));
        const timer=setTimeout(()=>finish(new Error('直播清单读取超时')),18000);
        reader.on(Hls.Events.ERROR,(_,data)=>{
          if(!data.fatal)return;
          const err=new Error('直播清单、分片或解码器暂不可用');
          if(opened)fatal(err);else finish(err);
        });
        reader.on(Hls.Events.MANIFEST_PARSED,()=>finish());
        ctx.abort.signal.addEventListener('abort',cancel,{once:true});
        reader.loadSource(choice.url);reader.attachMedia(el);
      });
      if(!active())throw new Error('已切换');
      opened=true;return ctx;
    }
    const filePart=choice.type==='file'?partAt(choice.segments,start):null;
    const fileSegment=filePart&&choice.segments[filePart.i];
    if(choice.type==='flv'||(fileSegment&&/flv/i.test(fileSegment.format))) {
      const mpeg=await loadFlvEngine();
      if(!active())throw new Error('已切换');
      const url=fileSegment?fileSegment.urls[0]:choice.url;
      const live=choice.type==='flv';
      const reader=ctx.flv=mpeg.createPlayer({type:'flv',isLive:live,url},{enableWorker:false,enableWorkerForMSE:false,lazyLoad:!live,autoCleanupSourceBuffer:true});
      ctx.offset=filePart?.offset||0;ctx.part=filePart?.i||0;
      let opened=false;
      await new Promise((resolve,reject)=>{
        const finish=err=>{
          clearTimeout(timer);el.removeEventListener('loadedmetadata',ready);
          ctx.abort.signal.removeEventListener('abort',cancel);
          if(err)reject(err);else resolve();
        };
        const ready=()=>finish();
        const cancel=()=>finish(new Error('已切换'));
        const timer=setTimeout(()=>finish(new Error('FLV 流连接超时')),15000);
        reader.on(mpeg.Events.ERROR,()=>{
          const err=new Error('FLV 媒体读取或解码失败');
          if(opened)fatal(err);else finish(err);
        });
        ctx.abort.signal.addEventListener('abort',cancel,{once:true});
        el.addEventListener('loadedmetadata',ready);
        reader.attachMediaElement(el);reader.load();
      });
      if(!active())throw new Error('已切换');
      opened=true;
      if(!live&&start>ctx.offset)el.currentTime=Math.min(start-ctx.offset,Math.max(0,el.duration-.1));
      return ctx;
    }
    if (choice.type === 'file') {
      const {i,offset} = partAt(choice.segments,start);
      ctx.offset = offset; ctx.part = i;
      const segment = choice.segments[i];
      let lastError;
      for (const url of segment.urls) {
        if (!active()) throw new Error('已切换');
        try {
          await new Promise((resolve,reject) => {
            const finish = err => {
              clearTimeout(timer);
              el.removeEventListener('loadedmetadata',ready);
              el.removeEventListener('error',failure);
              ctx.abort.signal.removeEventListener('abort',cancel);
              err ? reject(err) : resolve();
            };
            const ready = () => finish();
            const failure = () => finish(new Error('媒体地址、容器或编解码器不可用'));
            const cancel = () => finish(new Error('已切换'));
            const timer = setTimeout(failure,15000);
            el.addEventListener('loadedmetadata',ready);
            el.addEventListener('error',failure);
            ctx.abort.signal.addEventListener('abort',cancel,{once:true});
            ctx.assigned = true;
            el.src = url; el.load();
          });
          if (!active()) throw new Error('已切换');
          if (start > offset) el.currentTime = Math.min(start-offset, Math.max(0,el.duration-.1));
          el.addEventListener('error',failureEvent,{signal:ctx.abort.signal});
          return ctx;
        } catch(err) { lastError = err; }
      }
      throw lastError || new Error('媒体地址失效');
    }
    function failureEvent() { fatal(new Error('媒体读取或解码失败')); }
    const sh = await loadEngine();
    if (!active()) throw new Error('已切换');
    const engine = ctx.engine = new sh.Player();
    await engine.attach(el);
    if (!active()) throw new Error('已切换');
    engine.configure({
      abr:{enabled:false},
      manifest:{retryParameters:{maxAttempts:2,baseDelay:150,timeout:11000}},
      streaming:{retryParameters:{maxAttempts:2,baseDelay:150,timeout:11000},bufferingGoal:22,rebufferingGoal:1,bufferBehind:14}
    });
    const uri = choice.type === 'dash' ? manifest(choice) : choice.url;
    engine.getNetworkingEngine().registerRequestFilter((kind,req) => {
      if (kind === sh.net.NetworkingEngine.RequestType.LICENSE) throw new Error('受保护的节目需要官方播放器');
      for (const raw of req.uris) {
        if (choice.type === 'dash' && raw === uri) continue;
        if (!grantedUrl(raw)) throw new Error('片源地址未经授权');
      }
    });
    let loaded = false;
    engine.addEventListener('error',e => {
      if (loaded && e.detail.severity === sh.util.Error.Severity.CRITICAL) fatal(new Error('媒体读取或解码失败（'+e.detail.code+'）'));
    });
    try {
      await engine.load(uri,choice.type === 'hls' ? null : start,choice.type === 'hls' ? 'application/x-mpegurl' : 'application/dash+xml');
    } catch(err) {
      const failure=new Error('媒体读取或解码失败'+(err?.code?'（'+err.code+'）':''));
      if(err?.code===1001&&typeof err.data?.[0]==='string'&&[401,403,404,410].includes(Number(err.data[1])))failure.unreadable=err.data[0];
      throw failure;
    }
    if (!active()) throw new Error('已切换');
    loaded = true;
    return ctx;
  }

  const api = (name, params={}) => window.BSApi.call(name,params);
  function register(item) { return window.BSDiscovery?.register(item) || item; }
  const recordFor = s => (s.room ? R[s.room] : W[s.id] || V[s.id]) || {};
  function episodeList(s) { return (W[s.id]?.episodes || V[s.id]?.pages || []); }
  function metaLabel(s, n) {
    const e = episodeList(s)[(n||1)-1];
    if (!e) return '';
    return (W[s.id] ? [e.title,e.longTitle].filter(Boolean).join(' · ') : e.title || e.part) || '';
  }
  async function identity(s) {
    const w = W[s.id], v = V[s.id];
    if (s.room) {
      const r = await api('liveRoom',{roomId:s.room}); register(r);
      return {roomId:s.room,mid:r.mid || R[s.room]?.host};
    }
    if (w) {
      const full = w.episodes?.length ? w : await window.BSDiscovery.loadSeason(w.seasonId || w.id);
      const eps = full.episodes || [];
      const ep = (s.epId && eps.find(e => String(e.epId) === String(s.epId))) || eps[(s.ep||1)-1];
      if (ep?.areaRestricted===true) throw new Error('该集在当前地区不可观看');
      if (!ep?.epId || !ep.cid) throw new Error('平台暂未提供此集的播放标识');
      return {epId:ep.epId,seasonId:full.seasonId||w.id,cid:ep.cid,aid:ep.aid,bvid:ep.bvid};
    }
    if (!v) throw new Error('视频条目已失效');
    // A normal platform card or a saved history record can already identify
    // the requested part. Opening the part and expanding the catalog are independent.
    if(!v.pages?.length&&(s.cid||((s.ep||1)===1&&v.cid))&&(v.bvid||v.aid))
      return {cid:s.cid||v.cid,aid:v.aid,bvid:v.bvid,mid:v.mid||v.author};
    const full = v.pages?.length ? v : await api('video',v.bvid ? {bvid:v.bvid} : {aid:v.aid||v.id});
    register(full);
    const pagesList = full.pages || [];
    if (V[s.id]) Object.assign(V[s.id],{pages:pagesList});
    const part = (s.cid && pagesList.find(e => String(e.cid) === String(s.cid))) || pagesList[(s.ep||1)-1];
    const cid = part?.cid || (!pagesList.length && (full.cid || s.cid));
    if (!cid) throw new Error('平台暂未提供此分 P 的播放标识');
    return {cid,aid:full.aid,bvid:full.bvid,mid:full.mid||v.author};
  }

  let session = null, previewId = 0, shelfId = 0;
  const isCurrent = p => session === p && playingRoute === p.route && current()===p.route;
  const position = p => p.ready ? (p.out?.offset||0) + sec(video.currentTime) : sec(p.at);
  const total = p => p.route.room ? 0 : p.choice?.duration || sec(video.duration) || sec(recordFor(p.route).duration);
  function setStatus(p,text,failed=false) {
    if (!isCurrent(p)) return;
    p.status = text;
    const waiting=!failed&&!p.presented&&!(p.ready&&p.paused);
    const wasWaiting=player.classList.contains('loading');
    player.classList.toggle('loading',waiting);player.setAttribute('aria-busy',String(waiting));
    player.classList.toggle('failed',failed);
    if(wasWaiting&&!waiting&&!failed&&!overlay&&!player.contains(document.activeElement))
      focus(p.route.room?'toggle':'seek',false);
    $('pKind').textContent = [p.route.room?'直播间':W[p.route.id]?'影视作品':'视频投稿',text].filter(Boolean).join(' · ');
    $('mediaError').hidden = !failed;
    if (failed) {
      $('mediaError').firstChild.textContent = text+'　';
      wake(false); if (!overlay) focus('media-retry',false);
    }
  }
  function paintTitle(p) {
    const s=p.route,w=recordFor(s);
    $('pTitle').textContent=w.title||'正在获取节目信息';
    $('pSub').textContent=s.room?[C[w.host]?.[0]||w.artist,w.area].filter(Boolean).join('　·　') :
      [W[s.id]?types[w.kind]||'影视':w.artist,metaLabel(s,s.ep)].filter(Boolean).join('　/　');
  }

  function setVideoState(p) {
    video.loop=false; video.style.objectFit=prefs.fitMode; video.playbackRate=p.route.room?1:prefs.speed;
    if (p.paused) {if(!video.paused)video.pause();}
    else if(video.paused)video.play().catch(err=>{
      if(!isCurrent(p)||p.paused||err.name==='AbortError')return;
      if(err.name==='NotSupportedError'){p.onFailure?.(err);return}
      p.paused=true;setStatus(p,p.format+' · 已暂停');wake(false);updateControls();
    });
  }
  async function openMain(p,choice,start,token) {
    p.ready=false; p.presented=false; p.at=start; p.choice=choice;clearTimeout(p.bufferTimer);
    const attempt=p.attempt=(p.attempt||0)+1;
    let failed=false;
    const valid=()=>isCurrent(p)&&token===p.token&&attempt===p.attempt;
    const fail=err=>{
      if (!valid()||failed) return;
      failed=true;p.at=position(p);p.ready=false;clearTimeout(p.bufferTimer);
      if(p.next)p.next(err);else setStatus(p,err.message,true);
    };
    p.onFailure=fail;
    const out=await openOutput(video,choice,start,fail,valid);
    if (!valid()) return;
    p.out=out; p.ready=true; p.ended=false; previewSeek=null;
    p.format=(p.trial?'平台授权试看 · ':'')+(choice.type==='hls'?'HLS':choice.type==='flv'?'HTTP-FLV':choice.type==='dash'?'DASH 音视频':'平台分段媒体');
    setStatus(p,p.paused?p.format+' · 已暂停':p.format+' · 正在缓冲');
    setVideoState(p); updateControls(); updateProgress();
    if(!p.paused)p.bufferTimer=setTimeout(()=>{
      if(valid()&&!p.presented&&!p.paused)fail(new Error('片源未输出可播放画面，可以重试'));
    },p.route.room?30000:20000);
  }

  function chooseLive(result) {
    const seen=new Set(), choices=[];
    for(const stream of result.streams||[]) {
      const url=handles(stream)[0];
      if(!url||seen.has(url)||stream.drm)continue;
      const isHls=/hls/i.test(stream.protocol)&&/^(ts|fmp4|hls)$/i.test(stream.format);
      const isFlv=/flv/i.test(stream.format)&&/stream|flv/i.test(stream.protocol);
      if(!isHls&&!isFlv)continue;
      seen.add(url);choices.push({type:isHls?'hls':'flv',url,quality:stream.quality,codec:stream.codec,line:stream.line,format:stream.format});
    }
    return choices.sort((a,b)=>Number(b.type==='hls')-Number(a.type==='hls'));
  }
  const restriction = err => ['DRM_REQUIRED','ROOM_RESTRICTED','PLATFORM_CHECK','AUTH','LOGIN','PERMISSION','PAY','VIP','REGION','RISK','DRM','FORBIDDEN','RESTRICTED','NOT_FOUND'].includes(String(err?.code).toUpperCase()) || [-101,-10403,-403,-412,-352].includes(Number(err?.code));
  async function loadMain(p,reset=false) {
    const token=++p.token;
    const valid=()=>isCurrent(p)&&token===p.token;
    if (p.ready) { p.at=position(p); p.paused=video.paused&&!video.ended; }
    p.ready=false; p.next=null; p.out=null;
    await clearOutput(video);
    if (!valid()) return;
    setStatus(p,'正在获取片源');
    try {
      if (!p.ids || reset) p.ids=await identity(p.route);
      if (!valid()) return;
      paintTitle(p); updateControls();
      if (!p.ancillary) { p.ancillary=true; loadAncillary(p); }
      const id=p.ids;
      const qn=Number(p.quality)||0;
      let result;
      if(p.route.room) result=await api('livePlay',{roomId:id.roomId,...(qn?{qn}:{})});
      else {
        try {result=await api('play',{...id,format:'dash',qn:qn||80});}
        catch(e){
          if(e.code!=='NO_STREAM')throw e;
          result=await api('play',{...id,format:'progressive',qn:qn||80});
        }
      }
      if (!valid()) return;
      p.result=result; p.trial=!!result.preview;
      const matchingResume=(result.lastPlayCid&&String(result.lastPlayCid)===String(id.cid))||
        (id.epId&&result.lastPlayEpId&&String(result.lastPlayEpId)===String(id.epId));
      if (!p.explicitStart && !p.at && !p.route.room && matchingResume && result.lastPlayTime>0) p.at=result.lastPlayTime;
      p.explicitStart=true;
      let choices;
      if (p.route.room) {
        if (![1,2].includes(Number(result.liveStatus))) throw new Error('该房间当前未开播');
        choices=chooseLive(result); p.lines=choices;
        if(qn)choices=choices.filter(c=>Number(c.quality)===qn);
        if (p.line) { const chosen=choices.find(c=>[c.format,c.codec,c.line].join('/')===p.line); if(chosen) choices=[chosen,...choices.filter(c=>c!==chosen)]; }
      } else choices=dashChoices(result,qn,prefs);
      let progressiveTried=!!p.route.room, lowTried=!!p.route.room||!!qn, dashAttempts=0;
      const file=progressiveChoice(result);
      if (file && (!qn || Number(file.quality)===qn)) { choices.push(file); progressiveTried=true; }
      async function next(failure) {
        if (!valid()) return;
        let err=failure;
        while(valid()) {
          if (!choices.length && !progressiveTried) {
            progressiveTried=true;
            try {
              const r=await api('play',{...id,qn:qn||80,format:'progressive'});
              const f=progressiveChoice(r); if(f&&(!qn||Number(f.quality)===qn)) {p.trial=!!r.preview; choices.push(f);}
              if (!valid()) return;
            } catch(e) { if(restriction(e)) throw e; err=e; }
          }
          if (!choices.length && !lowTried) {
            lowTried=true;
            const lower=await api('play',{...id,qn:16,format:'progressive'});
            if(!valid())return;
            const file=progressiveChoice(lower);
            if(file){p.trial=!!lower.preview;choices.push(file)}
          }
          const choice=choices.shift();
          if (choice?.type==='dash'&&++dashAttempts>6) {choices=choices.filter(c=>c.type!=='dash');continue;}
          if (!choice) {
            if (err) throw err;
            if (p.route.room) throw new Error('当前房间没有设备支持的 HLS 或 FLV 线路');
            if (qn) throw new Error('所选画质没有可播放的授权音视频组合');
            throw new Error('没有可播放的完整音视频，音轨、视频轨或解码能力不足');
          }
          try { await openMain(p,choice,p.at,token); return; }
          catch(e) {
            if (!valid()) return;
            err=e;
            if(e.unreadable) choices=choices.filter(c=>c.type!=='dash'||![...handles(c.v),...handles(c.a)].includes(e.unreadable));
          }
        }
      }
      const fail=e=>{ if(valid()) { p.ready=false; clearOutput(video); setStatus(p,e.message||'当前媒体不可用',true); } };
      p.next=err=>next(err).catch(fail);
      await next();
    } catch(err) {
      if (!valid()) return;
      p.ready=false; clearOutput(video); setStatus(p,err?.message||'平台未提供可播放媒体',true);
    }
  }

  async function loadAncillary(p) {
    const s=p.route, id=p.ids, personal=window.BSPersonal;
    personal?.loadRelations?.({id:s.id,...id}).then(()=>{ if(isCurrent(p)) updateControls(); });
    if (!s.room) {
      if(V[s.id]&&!V[s.id].pages?.length){
        api('video',id.bvid?{bvid:id.bvid}:{aid:id.aid}).then(detail=>{
          if(!isCurrent(p))return;
          register(detail);V[s.id].pages=detail.pages||[];paintTitle(p);updateControls();
        }).catch(()=>{if(isCurrent(p))p.detailError=true;});
      }
      api('danmaku',{cid:id.cid}).then(r=>{
        if (!isCurrent(p)) return;
        p.messages=(r.items||[]).filter(m=>m.text&&Number.isFinite(m.time)&&[1,2,3,4,5,6].includes(Number(m.mode))).sort((a,b)=>a.time-b.time);
        p.chatState=p.messages.length ? '已加载 '+p.messages.length+' 条' : '暂无弹幕';
      }).catch(()=>{ if(isCurrent(p)) p.chatState='弹幕暂不可用'; });
      if (id.bvid || id.aid) api('related',id.bvid?{bvid:id.bvid}:{aid:id.aid}).then(r=>{
        if (!isCurrent(p)) return;
        const arr=(r.items||[]).filter(x=>x.kind==='video').map(register).filter(x=>x&&x.id!==s.id);
        p.related=[...new Set(arr.map(x=>x.id))];
        s.queue=[...new Set([...(s.queue||[]),...p.related])];
        if (overlay?.mode==='queue') drawOverlay(document.activeElement.dataset.k);
      }).catch(()=>{ if(isCurrent(p))p.relatedError=true; });
      return;
    }
    const seen=new Set();
    async function poll() {
      if (!isCurrent(p)) return;
      if (!document.hidden && prefs.dm) {
        try {
          const r=await api('liveChat',{roomId:s.room});
          if (!isCurrent(p)) return;
          const now=performance.now()/1000;
          // Place a burst across the next polling interval, retaining upstream order.
          const messages=(r.items||[]).filter(m=>{
            const key=String(m.id||[m.time,m.name,m.text].join('/'));
            if (!m.text||seen.has(key)) return false;
            seen.add(key); return true;
          }).slice(-12);
          while(seen.size>384) seen.delete(seen.values().next().value);
          p.messages=p.messages.filter(m=>m.time>now-9).concat(messages.map((m,i)=>({...m,time:now+i*.65,mode:1})));
          p.chatState=seen.size?'近期消息轮询':'暂无近期消息';
        } catch(_) { if(isCurrent(p))p.chatState='直播消息暂不可用'; }
      }
      if (isCurrent(p)) p.chatTimer=setTimeout(poll,10000);
    }
    poll();
  }
  paintComments = function() {
    const p=session, box=player.querySelector('.comments');
    if (!p||!p.ready||!prefs.dm||!p.messages.length) { box.hidden=true; return; }
    box.hidden=false; box.style.opacity=prefs.opacity;
    const now=p.route.room?performance.now()/1000:position(p), a=p.messages;
    let lo=0,hi=a.length;
    while(lo<hi) { const mid=(lo+hi)>>>1; if(a[mid].time<=now)lo=mid+1;else hi=mid; }
    const limit=Math.min(3,Math.max(1,prefs.density)), rows=[];
    for(let i=lo-1;i>=0&&rows.length<limit&&now-a[i].time<8;i--) {
      const m=a[i],lane=i%limit;
      if(rows.some(row=>row.lane===lane))continue;
      rows.push({m,lane,i});
    }
    const key=rows.map(row=>row.i+'/'+row.m.time).join(',');
    if (p.paintKey!==key) {
      p.paintKey=key; box.replaceChildren();
      for (const row of rows) {
        const span=document.createElement('span'); span.textContent=row.m.text;
        box.append(span);
      }
    }
    [...box.children].forEach((n,j)=>{
      const {m,lane}=rows[j];
      if(!m)return;
      const fraction=(now-m.time)/8,mode=Number(m.mode);
      n.style.fontSize=prefs.dmSize+'px';
      n.style.top=lane*42+'px';
      const color = typeof m.color==='string'&&/^#[\da-f]{6}$/i.test(m.color) ? m.color : Number.isInteger(m.color) ? '#'+(m.color&0xffffff).toString(16).padStart(6,'0') : '#fff';
      n.style.color=color;
      n.style.transform=mode===4||mode===5?'translateX('+((1440-n.offsetWidth)/2)+'px)':
        'translateX('+(mode===6?-n.offsetWidth+fraction*(1440+n.offsetWidth):1440-fraction*(1440+n.offsetWidth))+'px)';
    });
  };
  rememberPlayback = function(forceCloud=false) {
    const p=session;
    if (!p?.ready||!p.presented||p.route.room||!p.ids?.cid||video.readyState<1) return;
    const d=total(p),t=Math.min(position(p),d);
    if (!d||t<.15) return;
    const s=p.route,w=recordFor(s),key=playKey(s),done=!!p.ended&&!p.trial;
    // Only store catalog fields, never URLs for streams, requests or signed-in data.
    const metadata={};
    for (const k of ['id','kind','title','artist','mid','author','bvid','aid','seasonId','cover','wide','desc','duration','cat','count'])
      if(w[k]!=null) metadata[k]=w[k];
    const now=Date.now();
    progress[key]={t,d,ep:s.ep||0,recent:now,done,w:metadata,...p.ids};
    save('history',progress); lastWrite=now;
    if (!signed||!p.ids.aid||p.reporting||(now-p.cloudTime<30000&&!forceCloud)||Math.abs(t-p.cloudPosition)<1&&!done) return;
    p.reporting=true; p.cloudTime=now; p.cloudPosition=t;
    api('reportProgress',{...p.ids,time:done?-1:Math.floor(t),duration:Math.floor(d),userAction:true})
      .then(()=>window.BSPersonal?.invalidateHistory?.()).catch(()=>{ p.cloudFailed=true; }).finally(()=>{p.reporting=false;});
  };
  window.addEventListener('pagehide',()=>{stopEpisodePreview();stopShelfPreview();if(session){rememberPlayback(true);video.pause();}});
  const v6Stash=stash;
  stash=function(){
    v6Stash();
    if(session&&current()===session.route) {
      session.route.at=position(session); session.route.restorePaused=session.ready?video.paused&&!video.ended:session.paused;
    }
  };
  stopWatch = function() {
    if (!session) return;
    rememberPlayback(true); stopEpisodePreview(); clearTimeout(session.chatTimer);clearTimeout(session.bufferTimer);
    clearTimeout(session.intentTimer);session.token++; session=null; activeMedia=null; playingRoute=null; previewSeek=null;
    clearTimeout(hudTimer); cancelCountdown(); clearOutput(video);
    $('mediaError').hidden=true; player.querySelector('.comments').replaceChildren(); player.classList.remove('quiet','loading','failed','withShelf');
  };
  startWatch = function(id,ep=0,opts={}) {
    id=String(id);
    if (!opts.room&&!V[id]&&!W[id]) { notice('条目已失效');return; }
    const visible=[...view.querySelectorAll('[data-act="play"]')].map(n=>n.dataset.id).filter(x=>V[x]);
    const {push:pushRoute,...settings}=opts;
    const s={type:'player',id,ep:W[id]?Math.max(1,Number(ep)||1):Number(ep)||0,
      focus:opts.room?'toggle':'seek',queue:[...new Set([id,...visible])],...settings};
    if(current().type==='player'&&!pushRoute) { stopWatch(); pages[pages.length-1]=s;stamp();render(); }
    else go(s);
  };
  renderWatch = function(s) {
    $('shell').hidden=true; player.hidden=false;
    const key=playKey(s)+'|'+(s.room||'');
    if (!session || activeMedia!==key || session.route!==s) {
      stopWatch();
      const prior=progress[playKey(s)], at=s.room?0:sec(s.at??(prior&&!prior.done?prior.t:0));
      const p=session={route:s,token:0,ready:false,at,explicitStart:s.at!=null||!!prior,paused:!!s.restorePaused,ended:false,
        quality:s.room?(s.liveQuality||'auto'):(s.quality||'auto'),line:s.line,related:[],messages:[],chatState:'正在获取',paintKey:null,cloudTime:Date.now(),cloudPosition:-1};
      activeMedia=key;playingRoute=s;previewSeek=null;
      setStatus(p,'正在获取片源'); paintTitle(p); loadMain(p);
    } else { session.route=s; playingRoute=s; }
    document.querySelector('.timelineRow').hidden=!!s.room;
    $('seek').dataset.row='seek';
    updateControls(); updateProgress(); paintComments(); wake(); focus(s.focus||(s.room?'toggle':'seek'),false);
  };
  hasEpisodes=s=>!s.room&&episodeList(s).length>1;
  relatedVideos=s=>[...new Set([...(session?.related||[]),...(s.queue||[])])].filter(id=>id!==s.id&&V[id]).slice(0,24).map(id=>V[id]);
  nextItem=function(){
    const s=current(),n=s.ep||1;
    if(s.room) return null;
    if(episodeList(s).length>n) return {id:s.id,ep:n+1};
    if(W[s.id]) return null;
    const queue=s.queue||[],i=queue.indexOf(s.id);
    return i>=0&&queue[i+1]?{id:queue[i+1],ep:0}:null;
  };
  doPlay=function(){if(!session)return; session.paused=false;if(session.ready)setVideoState(session);};
  function requestPlayback(p,paused){
    if(!isCurrent(p))return;
    p.paused=paused;
    clearTimeout(p.intentTimer);
    if(!p.ready)return;
    // A remote burst has one final transport intent. Keep the decoder attached.
    p.intentTimer=setTimeout(()=>{
      if(!isCurrent(p)||!p.ready)return;
      if(!p.paused && p.ended){cancelCountdown();p.ended=false;jump(0);p.paused=false}
      setVideoState(p);
      setStatus(p,p.paused?p.format+' · 已暂停':p.format);
    },55);
  }
  toggle=function(){
    if(!session)return;
    wake(false);
    if(!$('mediaError').hidden)return;
    requestPlayback(session,!session.paused && !session.ended);
  };
  document.addEventListener('keydown',e=>{
    if(!session || e.defaultPrevented || !['MediaPause','MediaPlay','MediaPlayPause'].includes(e.key))return;
    e.preventDefault();
    if(!e.repeat)requestPlayback(session,e.key==='MediaPause'||(e.key==='MediaPlayPause'&&!session.paused&&!session.ended));
  });

  changeSource=()=>{ if(session)loadMain(session,true); };
  updateProgress=function(){
    const p=session;
    if(!p)return;
    const d=total(p),t=position(p),seek=$('seek');
    $('trackFill').style.width=(d?Math.min(100,t/d*100):0)+'%';
    $('pTime').textContent=clock(t)+' / '+clock(d);
    seek.setAttribute('aria-valuemax',String(Math.floor(d)));seek.setAttribute('aria-valuenow',String(Math.floor(t)));
    seek.setAttribute('aria-valuetext',clock(t)+' / '+clock(d));
    if(p.ready&&!video.paused&&Date.now()-lastWrite>3000)rememberPlayback();
  };
  jump=function(time){
    const p=session;
    if(!p||p.route.room||!Number.isFinite(time))return;
    const d=total(p),target=Math.max(0,d?Math.min(d-.05,time):time);
    if(!p.ready){p.at=target;return;}
    p.paused=video.paused&&!video.ended;
    if(p.choice.type==='file'&&partAt(p.choice.segments,target).i!==p.out.part){
      const token=++p.token;
      openMain(p,p.choice,target,token).catch(()=>{if(isCurrent(p)&&p.token===token)setStatus(p,'分段媒体读取失败',true);});
    }else video.currentTime=target-(p.out?.offset||0);
    updateProgress();wake();
  };
  // V6 directly references the HTMLMediaElement in its target-phase handlers.
  // These captures supply the aggregate timeline for multi-file media while
  // leaving Shaka and our metadata/error listeners on the element functional.
  video.removeEventListener('error',onTrackError);
  video.addEventListener('loadedmetadata',()=>{
    previewSeek=null;startPaused=false;
  },true);
  video.addEventListener('playing',()=>{
    const p=session;
    if(p?.ready){p.presented=true;clearTimeout(p.bufferTimer);setStatus(p,p.format);}
  });
  function waitForBuffer(){
    const p=session;
    if(!p?.ready||!p.presented||video.paused||video.ended)return;
    const token=p.token,mark=video.currentTime;
    clearTimeout(p.bufferTimer);
    p.bufferTimer=setTimeout(()=>{
      if(!isCurrent(p)||p.token!==token||!p.ready||video.paused||video.ended||video.currentTime>mark+.15)return;
      p.onFailure?.(new Error('媒体连接超时，可以重试'));
    },22000);
  }
  video.addEventListener('waiting',waitForBuffer);
  video.addEventListener('stalled',waitForBuffer);
  video.addEventListener('ended',e=>{
    const p=session;if(!p)return;
    if(!p.ready){e.stopImmediatePropagation();return;}
    if(p.route.room){e.stopImmediatePropagation();p.onFailure?.(new Error('直播线路已断开，可以重新连接'));return;}
    if(p.choice.type==='file'&&p.out.part<p.choice.segments.length-1){
      e.stopImmediatePropagation();
      const target=p.out.offset+p.choice.segments[p.out.part].duration;
      p.paused=false;const token=++p.token;
      openMain(p,p.choice,target,token).catch(()=>{if(isCurrent(p)&&p.token===token)setStatus(p,'下一段媒体读取失败',true);});
    } else if(p.trial){e.stopImmediatePropagation();p.paused=true;rememberPlayback(true);wake(false);updateControls();setStatus(p,'试看结束，完整内容需平台授权');}
    else p.ended=true;
  },true);
  const baseArrows=playerArrows;
  playerArrows=function(el,key){
    const p=session;
    if(p&&!p.route.room&&!countdown&&(player.classList.contains('quiet')||el.dataset.k==='seek'||!player.contains(el))
      &&['ArrowLeft','ArrowRight'].includes(key)){
      wake();focus('seek',false);jump(position(p)+(key==='ArrowRight'?5:-5));return;
    }
    baseArrows(el,key);
  };
  $('seek').addEventListener('click',e=>{
    if(!session||!e.detail)return;
    e.stopImmediatePropagation();const rect=e.currentTarget.getBoundingClientRect();jump((e.clientX-rect.left)/rect.width*total(session));
  },true);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&session){rememberPlayback(true);session.paused=true;video.pause();}
  });
  const baseControls=updateControls;
  updateControls=function(){
    if(!session||current().type!=='player')return;
    baseControls();
    $('pFoot').textContent=$('pFoot').textContent.replace(/返回 退出(?:播放|直播)/,'返回 收起工具');
    const s=session.route, w=recordFor(s), personal=window.BSPersonal;
    const mark=(key,kind,id,yes,no)=>{
      const button=node(key);if(!button)return;
      const enabled=!!personal?.isMarked?.(kind,String(id));
      button.querySelector('span').textContent=enabled?yes:no;button.classList.toggle('lit',enabled);
    };
    if(s.room)mark('roomFollow','follow',w.host,'已关注','关注主播');
    else if(V[s.id])mark('like','like',s.id,'已点赞','点赞');
    else if(W[s.id]){const what=w.kind==='anime'?'番':'剧';mark('collectWork','collect',s.id,'已追'+what,'追'+what);}
  };
  const baseDock=dockAction;
  dockAction=function(id){
    const p=session;if(!p)return;
    const s=p.route,w=recordFor(s);
    const kind={like:'like',collectWork:'collect',roomFollow:'follow'}[id];
    if(!kind){baseDock(id);return;}
    if(needUser())return;
    window.BSPersonal?.action(kind,{id:s.id,aid:w.aid,mid:w.host||w.author,seasonId:w.seasonId}).then(()=>{if(isCurrent(p))updateControls();});
  };

  const v6Panel=watchPanel;
  watchPanel=function(o){
    const p=session;
    if(!p)return {title:'播放器',body:empty('暂无片源')};
    const s=p.route;
    if(o.mode==='line'||o.mode==='quality'){
      const isLine=o.mode==='line',result=p.result||{}, options=[];
      if(isLine){
        (p.lines||[]).forEach((line,i)=>options.push({id:[line.format,line.codec,line.line].join('/'),label:'线路 '+(i+1)+' · '+line.format+' · '+line.codec,on:true}));
      }else{
        const playable=new Set(s.room?(p.lines||[]).map(l=>Number(l.quality)):dashChoices(result,0,prefs).map(c=>Number(c.quality)));
        if(progressiveChoice(result)||p.ready&&p.choice?.type==='file')playable.add(Number(p.choice?.quality||result.quality));
        options.push({id:'auto',label:'自动（兼容优先）',on:true});
        const labels=new Map((result.qualities||[]).map(q=>[Number(q.id),q.label]));
        for(const id of playable)if(id&&!labels.has(id))labels.set(id,'画质 '+id);
        for(const [id,label] of labels)if(playable.has(id)||p.verified?.has(id))options.push({id:String(id),label,on:true});
      }
      if(!isLine&&p.verified)for(const q of options)if(p.verified.has(Number(q.id))) {q.on=true;q.label=q.label.replace(' · 未提供可用地址','');}
      const selected=String(isLine?(p.choice?[p.choice.format,p.choice.codec,p.choice.line].join('/'):''):p.quality);
      let body=options.map((q,i)=>q.on?op('wp-'+i,'wp'+i,'watchPick',q.id,q.label,selected===q.id):
        '<div class="lockedTier">'+esc(q.label)+'</div>').join('')||empty('暂无线路');
      return {title:isLine?'直播线路':'播放画质',desc:'',body,initial:'wp-'+Math.max(0,options.findIndex(q=>q.id===selected&&q.on))};
    }
    if(o.mode==='tech')return detailsPanel();
    if(o.mode==='episodes')return episodePanel(s);
    if(o.mode==='queue'){
      const panel=recommendationPanel(s);
      if(!relatedVideos(s).length&&p.relatedError)panel.body=empty('推荐暂不可用');
      panel.body=panel.body.replace(/data-row="queue\d+"/g,'data-row="queue"');
      return panel;
    }
    const panel=v6Panel(o);
    if(o.mode==='speed')panel.desc='';
    return panel;
  };
  detailsPanel=function(){
    const p=session,c=p?.choice, s=p.route,t=c?.v, a=c?.a;
    const stat=video.getVideoPlaybackQuality?.(),data=p.ready&&p.out?.engine?.getVariantTracks?.().find(x=>x.active);
    const hlsLevel=p.out?.hls?.levels?.[p.out.hls.currentLevel];
    const label=(p.result?.qualities||[]).find(q=>Number(q.id)===Number(c?.quality))?.label;
    const rows=[['片源',p.ready?(c.type==='dash'?'DASH · 已选择音视频双轨':c.type==='hls'?'HLS · '+c.format:c.type==='flv'?'HTTP-FLV':'平台分段媒体'):p.status],
      ['当前画质',p.ready?(label||String(c.quality||'未提供')):'尚未取得'],
      ...(s.room&&p.ready?[['实际线路',String(c.line||'未提供')]]:[]),
      ['解码状态',p.presented?'已有画面输出':p.ready?'等待画面输出':'尚未开始'],
      ['音频解码字节',p.presented&&typeof video.webkitAudioDecodedByteCount==='number'?String(video.webkitAudioDecodedByteCount):'设备未报告'],
      ['画面尺寸',video.videoWidth&&p.ready?video.videoWidth+' × '+video.videoHeight:'尚未取得'],
      ['实际视频编码',p.ready?(t?.codec||data?.videoCodec||hlsLevel?.videoCodec||p.out?.flv?.mediaInfo?.videoCodec||'媒体容器未公开'):'尚未取得'],
      ['实际音轨',p.ready?(a?.codec||data?.audioCodec||hlsLevel?.audioCodec||p.out?.flv?.mediaInfo?.audioCodec||'媒体容器未公开'):'尚未取得'],
      ['片源帧率',t?.frameRate||data?.frameRate||'未提供'],['音轨码率',a?.bandwidth?Math.round(a.bandwidth/1000)+' kb/s':'未提供'],
      ['丢帧 / 总帧',stat&&p.ready?stat.droppedVideoFrames+' / '+stat.totalVideoFrames:'未提供'],['解码器实现','系统未公开'],
      ['弹幕',p.chatState],...(p.detailError?[['分 P 信息','平台未提供完整列表']]:[]),...(p.cloudFailed?[['进度同步','云端暂不可用，本机已保存']]:[])];
    if(p.ready&&t&&prefs.codec!=='auto'&&codecFamily(t.codec)!==prefs.codec)rows.push(['编码回退','已采用可用的 '+t.codec]);
    const body='<dl class="trackInfo">'+rows.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>'+
      (s.room?'':['codec','audio','fitMode'].map((k,i)=>op('ap-'+k,'av'+i,'watchPref',k,prefLabels[k]+'　'+prefLabel(k))).join(''));
    return {title:'播放信息',body,initial:s.room?undefined:'ap-codec'};
  };
  const baseWatchAction=watchAction;
  watchAction=function(a,id,k){
    const p=session;
    if(!p)return;
    if(a==='queuePlay'){
      const open=()=>startWatch(id,0,{queue:p.route.queue,push:true});
      if(overlay)completeOverlay(open);else open();return;
    }
    if(a==='retryMedia'){p.at=position(p);loadMain(p,true);return;}
    if(a==='verifyQuality'){
      if(p.checkingQualities||!p.result||!p.ids)return;
      p.checkingQualities=true;p.checkedQualities=true;p.verified=new Set();
      drawOverlay();
      (async()=>{
        const available=(r,qn)=>p.route.room?chooseLive(r).some(c=>Number(c.quality)===qn):dashChoices(r,qn,prefs).length>0||Number(progressiveChoice(r)?.quality)===qn;
        for(const option of (p.result.qualities||[]).slice(0,12)) {
          const qn=Number(option.id);
          if(!isCurrent(p)||overlay?.mode!=='quality'){p.checkedQualities=false;break;}
          if(!qn||available(p.result,qn))continue;
          try{
            const r=p.route.room?await api('livePlay',{roomId:p.ids.roomId,qn}):await api('play',{...p.ids,qn,format:'dash'});
            if(available(r,qn))p.verified.add(qn);
          }catch(e){if(restriction(e)||[412,429].includes(Number(e.code)))break;}
        }
        p.checkingQualities=false;
        if(isCurrent(p)&&overlay?.mode==='quality')drawOverlay();
      })();return;
    }
    if(a==='watchPick'&&['quality','line'].includes(overlay?.mode)){
      const kind=overlay.mode;
      completeOverlay(()=>{
        if(kind==='line'){p.line=id;p.route.line=id;}
        else {p.quality=id;p.route[p.route.room?'liveQuality':'quality']=id;}
        loadMain(p,true);wake();
      });return;
    }
    baseWatchAction(a,id,k);
  };
  episodePanel=function(s){
    const arr=episodeList(s), n=s.ep||1, w=W[s.id];
    const choices=arr.map((ep,i)=>b('wep-'+(i+1),'epRow','watchEpisode',i+1,
      window.BSEpisodeArt.thumb(ep,recordFor(s),metaLabel(s,i+1))+'<strong>'+esc(w?[ep.title,ep.longTitle].filter(Boolean).join(' · ')||epname(w,i+1):'P'+(i+1)+' · '+metaLabel(s,i+1))+'</strong>'+(n===i+1?'<i>播放中</i>':''),'epChoice episodeCard',
      'aria-pressed="'+(n===i+1)+'" aria-label="'+esc(metaLabel(s,i+1))+'"')).join('');
    return {title:w?'选集':'分 P',desc:'',body:'<div class="epChoices">'+choices+'</div>',initial:'wep-'+n,cls:'episodeDock'};
  };

  // Previews have their own media element and lifecycle. Moving focus invalidates
  // pending metadata/track requests before they can attach a decoder.
  async function preview(s, slot, start, valid, css, status) {
    const ids=await identity(s);
    if(!valid())return;
    const result=await api('play',{...ids,format:'dash',qn:16});
    if(!valid())return;
    const choices=dashChoices(result,0,{audio:'std',codec:'avc'}).sort((a,b)=>a.quality-b.quality);
    const file=progressiveChoice(result);
    if(file)choices.unshift(file);
    const el=document.createElement('video');
    el.muted=el.defaultMuted=true;el.playsInline=true;el.preload='auto';el.setAttribute('aria-hidden','true');
    if(css==='visible')episodeVideo=el;else previewVideo=el;
    slot.append(el);
    const release=()=>{clearOutput(el);el.classList.remove(css);};
    let usedFile=!!file,attempts=0;
    while(valid()&&attempts<4) {
      let candidate=choices.shift();
      if(!candidate&&!usedFile){
        usedFile=true;
        const fallback=await api('play',{...ids,format:'progressive',qn:16});
        candidate=progressiveChoice(fallback);
      }
      if(!candidate||!valid())break;
      attempts++;
      try {
        await openOutput(el,candidate,start,release,valid);
        if(!valid())break;
        await el.play();
        if(valid()) { el.classList.add(css); if(status)status.textContent+=' · 静音预览'; }
        return;
      }catch(_){ if(!valid())return; }
    }
    if(valid()){release(); if(status)status.textContent+=' · 暂无可播放预览';}
  }
  stopEpisodePreview=function(){
    previewId++;clearTimeout(episodePreviewTimer);
    if(episodeVideo){clearOutput(episodeVideo);episodeVideo.remove();episodeVideo=null;}
  };
  showEpisodePreview=function(n){
    const s=current(),slot=$('epVisual');
    if(!slot||s.type!=='player')return;
    stopEpisodePreview();const ep=episodeList(s)[n-1]||{}, w=recordFor(s);
    const index=W[s.id]?n:n===1?0:n, p=progress[s.id+':'+index], status=$('epStatus');
    slot.innerHTML=window.BSEpisodeArt.thumb(ep,w,metaLabel(s,n),p?.t>30?p.t:undefined);
    $('epName').textContent=metaLabel(s,n)||'P'+n;
    status.textContent=(p?.done?'已看完':p?.t?'上次看到 '+clock(p.t):'尚未观看')+' · 确定播放';
    window.BSEpisodeArt.observe();
  };
  stopShelfPreview=function(){
    shelfId++;clearTimeout(previewTimer);previewOwner=null;
    if(previewVideo){clearOutput(previewVideo);previewVideo.remove();previewVideo=null;}
  };
  scheduleShelfPreview=function(id){
    const cell=node('s-'+id)?.closest('.shelfCell');
    if(!cell||!cell.contains(document.activeElement)||overlay||document.hidden){stopShelfPreview();return;}
    if(previewOwner===cell)return;
    stopShelfPreview();previewOwner=cell;
    const epoch=shelfId, w=W[id], slot=cell.querySelector('.previewSlot');
    if(!w||!slot)return;
    const valid=()=>epoch===shelfId&&cell.isConnected&&cell.contains(document.activeElement)&&!overlay&&!document.hidden;
    previewTimer=setTimeout(async()=>{
      try {
        if(!valid())return;
        const full=await window.BSDiscovery.loadSeason(id);
        if(!valid())return;
        const rec=shelfRecord(full);
        await preview({id,ep:rec.ep,epId:rec.epId,cid:rec.cid},slot,sec(rec.preview),valid,'on');
      } catch(_) { /* Keep the season artwork when preview is unavailable. */ }
    },380);
  };
}

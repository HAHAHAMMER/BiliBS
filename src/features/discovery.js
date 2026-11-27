// Public/authorized discovery data for the production UI. The frozen V6 renderer is
// still used for device navigation, cards and design tokens.
if (bsOnline) {
  const dcEntries = new Map();
  const dcKeys = new Map();
  let dcSequence = 0;
  let dcVisible = {page: null, keys: new Set()};
  let dcFlush = false;
  let dcDeferredPage = null;
  let dcViewer;
  let dcActiveStream;
  let dcPageLoad;
  const dcLibraryModes=new Set(['commentary']);
  const dcContinuousModes=new Set(['doc','variety','commentary']);
  const dcOwner = () => signed ? String(window.BSPersonal?.account?.mid || 'signed') : 'guest';
  const dcRegions = {知识:1010,科技:1012,数码:1012,影视:1001,动画:1005,游戏:1008,音乐:1003,生活:1031,美食:1020,舞蹈:1004,体育运动:1018,汽车:1013,旅游:1022,娱乐:1002,动物:1024,时尚:1014,鬼畜:1007,资讯:1009};
  const dcKinds = new Set(['anime','guochuang','movie','drama','doc','variety','season']);
  const dcSorts = {'综合排序':'totalrank','最多播放':'click','最新发布':'pubdate'};
  const dcSearchTypes = {video:'video',anime:'media_bangumi',film:'media_ft',person:'bili_user',room:'live_room'};

  function dcSafeImage(value) {
    if (!value || typeof value!=='string') return '';
    // The gateway returns stable same-origin paths for Bilibili artwork only.
    if (window.BSTransport?.imageURL) return window.BSTransport.imageURL(value) || '';
    try {
      if (!/^(https?:)?\/\//i.test(value)) return '';
      const u = new URL(value, 'https://i0.hdslb.com/');
      if (!['https:','http:'].includes(u.protocol) || !/^(?:i[012]\.hdslb\.com|archive\.biliimg\.com)$/.test(u.hostname) || !u.pathname.startsWith('/bfs/') || u.username || u.password) return '';
      u.protocol = 'https:';
      return u.href.replace(/['"()<>]/g, ch => '%' + ch.charCodeAt(0).toString(16));
    } catch { return ''; }
  }
  const shotCache=new Map(),shotCells=new Map(),shotQueue=[];
  let shotLoading=0;
  function episodeThumb(ep,owner,title,time) {
    const at=time??Math.min(300,Math.max(10,(ep.duration||owner.duration||400)*.15));
    const spec={aid:ep.aid||owner.aid,bvid:ep.bvid||(!owner.episodes?owner.bvid:undefined),cid:ep.cid,time:at};
    const fallback=paint('episode',ep.cover||owner.wide||owner.still||owner.cover,title,'episodeThumb');
    return fallback.replace('<span ','<span data-shot="'+esc(JSON.stringify(spec))+'" ');
  }
  async function loadEpisodeShot(box,identity) {
    const spec=JSON.parse(identity);
    if(!spec.cid||!(spec.aid||spec.bvid))return;
    const key=[spec.bvid||spec.aid,spec.cid].join(':');
    if(!shotCache.has(key)){
      const pending=window.BSApi.call('videoShot',spec).catch(e=>{shotCache.delete(key);throw e});
      shotCache.set(key,pending);
      if(shotCache.size>128)shotCache.delete(shotCache.keys().next().value);
    }
    const shot=await shotCache.get(key);
    if(!box.isConnected||box.dataset.shot!==identity)return;
    const capacity=shot.columns*shot.rows;
    let index=shot.times.length?0:1;
    for(let n=0;n<shot.times.length&&n<shot.images.length*capacity;n++){
      if(shot.times[n]>spec.time)break;
      index=n;
    }
    index=Math.min(index,shot.images.length*capacity-1);
    const image=shot.images[Math.floor(index/capacity)],cell=index%capacity;
    const url=dcSafeImage(image.split('@')[0]+'@1600w.webp');
    if(!url)return;
    const cellKey=key+':'+index;
    if(!shotCells.has(cellKey)){
      const img=await new Promise((resolve,reject)=>{
        const picture=new Image(),timer=setTimeout(()=>{picture.onload=picture.onerror=null;reject(Error('预览图片超时'))},15000);
        let retried=false;
        picture.onload=()=>{clearTimeout(timer);resolve(picture)};
        picture.onerror=()=>{
          if(!retried){retried=true;picture.src=url.replace('@1600w.webp','@1600w_80q.webp');return;}
          clearTimeout(timer);reject(Error('预览图片不可用'));
        };
        picture.src=url;
      });
      // Retain one small frame per episode rather than a full decoded sprite sheet.
      const width=img.naturalWidth/shot.columns,height=img.naturalHeight/shot.rows;
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width));canvas.height=Math.max(1,Math.round(height));
      canvas.getContext('2d').drawImage(img,(cell%shot.columns)*width,Math.floor(cell/shot.columns)*height,width,height,0,0,canvas.width,canvas.height);
      shotCells.set(cellKey,canvas.toDataURL('image/webp',.86));
      if(shotCells.size>256)shotCells.delete(shotCells.keys().next().value);
    }
    if(!box.isConnected||box.dataset.shot!==identity)return;
    box.style.backgroundImage='url('+JSON.stringify(shotCells.get(cellKey))+')';
    box.style.backgroundSize='cover';box.style.backgroundPosition='center';
    box.querySelectorAll('img,.missing').forEach(n=>n.hidden=true);
    box.dataset.previewSource='videoshot';
  }
  function pumpEpisodeShots(){
    while(shotLoading<2&&shotQueue.length){
      const box=shotQueue.shift();
      if(!box.isConnected)continue;
      shotLoading++;
      loadEpisodeShot(box,box.dataset.shot).catch(()=>{if(box.isConnected)box.dataset.previewSource='cover'})
        .finally(()=>{if(box.isConnected)box.dataset.previewSource||='cover';shotLoading--;pumpEpisodeShots()});
    }
  }
  const shotObserver=new IntersectionObserver(entries=>{
    for(const e of entries)if(e.isIntersecting){shotObserver.unobserve(e.target);e.target.dataset.shotQueued='1';shotQueue.push(e.target)}
    pumpEpisodeShots();
  },{rootMargin:'120px'});
  function observeEpisodeShots(){
    shotObserver.disconnect();
    for(const box of document.querySelectorAll('[data-shot]'))if(!box.dataset.previewSource&&!box.dataset.shotQueued)shotObserver.observe(box);
  }
  window.BSEpisodeArt=Object.freeze({thumb:episodeThumb,observe:observeEpisodeShots});
  const dcPaint = paint;
  paint = (container, url, title, cls) => {
    const original=dcSafeImage(url);
    const hero=['spotlight','cinema','feature'].includes(container);
    const physical=Math.max(1920,Math.min(3840,Math.ceil((innerWidth*(window.devicePixelRatio||1))/640)*640));
    const width=hero?physical:({tile:640,rail:384,section:640,folio:384,episode:384,recommendation:384,room:640,dynamic:640})[container];
    const src=width&&original?original.split('@')[0]+'@'+width+'w'+(hero?'_90q':'')+'.webp':original;
    let markup=dcPaint(container,src,title,cls);
    if(cls?.includes('portraitFallback'))markup=markup.replace('<span ', '<span style="--poster-art:url('+esc(JSON.stringify(original))+')" ');
    if (['tile','folio','section','room','episode','recommendation','dynamic'].includes(container)) markup=markup.replace('<img ','<img loading="lazy" decoding="async" ');
    // Keep the focused artwork ahead of thumbnails competing for TV bandwidth.
    return container === 'spotlight' || container === 'cinema'
      ? markup.replace('<img ', '<img fetchpriority="high" ')
      : markup;
  };
  document.addEventListener('error',ev=>{
    const img=ev.target;
    if(img.tagName!=='IMG')return;
    const box=img.closest('[data-art]'), id=box?.closest('[data-id],[data-scene]')?.dataset;
    const w=W[id?.id||id?.scene]||V[id?.id]||R[id?.id];
    const tried=new Set((img.dataset.tried||'').split('|'));
    tried.add(img.getAttribute('src'));
    const alt=[w?.cover,w?.wide,w?.still,w?.hero,img.getAttribute('src')?.split('@')[0]].map(dcSafeImage).find(u=>u&&!tried.has(u));
    if(!alt){
      if(w && W[w.id] && !img.dataset.detailRequested){
        img.dataset.detailRequested='1';
        dcLoadSeason(w.id).then(full=>{
          if(!img.isConnected || !full || !img.hidden)return;
          const next=[full.wide,full.episodes?.[0]?.cover].map(dcSafeImage).find(u=>u&&!tried.has(u));
          if(next){img.hidden=false;img.src=next;box.querySelector('.missing').hidden=true}
        }).catch(()=>{});
      }
      return;
    }
    img.dataset.tried=[...tried].join('|'); img.hidden=false; img.src=alt;
    const missing=box.querySelector('.missing');if(missing)missing.hidden=true;
  },true);
  function dcId(value) {
    const id = String(value ?? '');
    return /^[A-Za-z0-9_-]{1,80}$/.test(id) && !Object.hasOwn(Object.prototype,id) && id !== 'prototype' ? id : '';
  }
  const dcTags = list => Array.isArray(list) ? list.map(x => typeof x === 'string' ? x : x?.name || x?.title).filter(Boolean) : [];
  function dcRegister(x) {
    if (!x || typeof x !== 'object') return null;
    const {kind} = x;
    const id = dcId(kind === 'video' ? (x.bvid || x.id || x.aid) : kind === 'author' ? (x.mid || x.id) : kind === 'live' ? (x.roomId || x.id) : (x.seasonId || x.id));
    if (!id || (!dcKinds.has(kind) && !['author','video','live'].includes(kind))) return null;
    const mid = dcId(x.mid || (kind === 'author' ? id : ''));
    const artist = String(x.artist || (kind === 'author' && (x.name || x.title)) || '');
    if (mid) {
      const prev = C[mid] || [];
      const name = artist || prev[0] || 'UP 主';
      C[mid] = [name, esc(Array.from(name)[0] || 'U'), '#496569', kind === 'author' ? String(x.desc || '') : prev[3] || ''];
    }
    const cover = dcSafeImage(x.cover || x.face);
    const out = {...x,id,kind,title:String(x.title || x.name || '未命名'),artist,mid,author:mid,cover,wide:dcSafeImage(x.wide),hero:dcSafeImage(x.hero),still:dcSafeImage(x.still),desc:String(x.desc || '')};
    if (kind === 'author') return out;
    if (kind === 'video') {
      out.wide ||= cover;
      out.cat = String(x.cat || x.tname || '');
      out.duration = Math.max(0,Number(x.duration) || 0);
      const v = V[id] || {};
      if (!out.pages?.length && v.pages) out.pages = v.pages;
      if (!out.cid && v.cid) out.cid = v.cid;
      V[id] = Object.assign(v,out);
      return V[id];
    }
    if (kind === 'live') {
      const status = x.liveStatus;
      out.on = status == null ? null : [1,2].includes(Number(status));
      for (const key of ['artist','mid','cover','wide','area']) if (!out[key] && R[id]?.[key]) out[key]=R[id][key];
      out.host = out.mid;
      out.roomId = out.roomid = id;
      out.area = String(out.area || x.areaName || '');
      R[id] = Object.assign(R[id] || {},out);
      return R[id];
    }
    const w = W[id] || {};
    out.originalKind = kind==='season' && w.originalKind ? w.originalKind : kind;
    out.kind = out.originalKind==='guochuang' ? 'anime' : out.originalKind;
    out.seasonId = out.season_id = id;
    out.types = dcTags(x.styles || x.types);
    out.release = String(x.release || x.indexShow || '');
    // A catalog/search card can arrive after a full season. Do not erase episode metadata.
    for (const key of ['cover','wide','hero','still','desc','release','year','score']) {
      if (!out[key] && w[key]) out[key] = w[key];
    }
    if (!out.types.length && w.types) out.types = w.types;
    if (Array.isArray(x.episodes)) {
      out.episodes = x.episodes.filter(ep => dcId(ep.epId)).map(ep => ({...ep, ep_id:ep.epId,cover:dcSafeImage(ep.cover)}));
    } else if (w.episodes) out.episodes = w.episodes;
    out.count = out.episodes?.length ?? (Number(x.count) || 0);
    W[id] = Object.assign(w,out);
    return W[id];
  }

  function dcBegin(s) {
    dcActiveStream=null;
    const viewer = dcOwner();
    if (dcViewer !== viewer) {
      dcEntries.clear();
      dcKeys.clear();
      dcViewer = viewer;
    }
    dcVisible = {page:s,keys:new Set()};
  }
  function dcRepaint(entry) {
    if (dcEntries.get(entry.key) !== entry || dcFlush || dcVisible.page !== current() || !dcVisible.keys.has(entry.key)) return;
    dcFlush = true;
    queueMicrotask(() => {
      dcFlush = false;
      if (current() !== dcVisible.page || !dcVisible.keys.has(entry.key) || entry.viewer !== dcOwner()) return;
      if (overlay) {dcDeferredPage = current(); return;}
      const s=current();
      if(entry.op==='recommend'&&s.root==='home'&&s.filter==='rec'&&s.recLoading===entry.params?.page){
        if(entry.value&&!entry.error)afterRender(s);
        else if($('recMore')){$('recMore').innerHTML=dcStatus(entry,'更多推荐');focusStructureVersion++;}
        return;
      }
      const liveFocus = document.activeElement?.dataset.k;
      const field = document.activeElement?.id === 'query' ? [document.activeElement.selectionStart,document.activeElement.selectionEnd] : null;
      if(!dcPatchStream(entry))redraw(liveFocus || current().focus);
      if (field && document.activeElement?.id === 'query') document.activeElement.setSelectionRange(...field);
    });
  }
  const dcOverlayPop=onOverlayPop;
  onOverlayPop=function() {
    dcOverlayPop();
    if (overlay || !dcDeferredPage) return;
    const needsRedraw=dcDeferredPage===current();
    dcDeferredPage=null;
    if (needsRedraw) redraw(document.activeElement?.dataset.k || current().focus);
  };
  function dcLaunch(entry) {
    if (entry.pending) return entry.pending;
    entry.error = null;
    entry.pending = Promise.resolve().then(entry.load).then(value => {
      if (value == null || typeof value !== 'object') throw Error('服务返回了无效数据');
      entry.value = value;
      entry.time = Date.now();
      if(entry.op==='weekly' && value.items?.length)save('weekly',{value,time:entry.time});
      return value;
    }).catch(error => {
      entry.error = error;
      return null;
    }).finally(() => {
      entry.pending = null;
      dcRepaint(entry);
    });
    return entry.pending;
  }
  function dcQuery(op, params = {}, options = {}) {
    const owner = dcOwner();
    const key = JSON.stringify([owner,op,...Object.entries(params).sort(([a],[b]) => a.localeCompare(b))]);
    let entry = dcEntries.get(key);
    if (entry && options.fresh) {
      dcKeys.delete(entry.tag);
      entry = null;
    }
    if (!entry) {
      entry = {key,op,params,viewer:owner,tag:'d'+(++dcSequence),value:null,pending:null,error:null,time:0,load:options.load || (() => window.BSApi.call(op,params))};
      if(op==='recommend'&&options.initial){entry.value=options.initial;entry.time=Date.now();}
      if(op==='weekly'){
        const saved=read('weekly',null);
        if(saved?.value?.items?.length && saved.time){entry.value=saved.value;entry.time=saved.time}
        entry.load=()=>window.BSApi.call('weekly',{knownIssue:{number:entry.value?.number,mediaId:entry.value?.mediaId}});
      }
      dcEntries.set(key,entry);
      dcKeys.set(entry.tag,entry);
    }
    if (options.load && !entry.pending) entry.load=options.load;
    if (options.watch !== false) dcVisible.keys.add(key);
    if (!entry.error && (!entry.value || Date.now()-entry.time > (options.ttl ?? (op==='recommend'?Infinity:5*60_000)))) dcLaunch(entry);
    if (dcEntries.size > 160) {
      for (const old of dcEntries.values()) {
        if (old.pending || dcVisible.keys.has(old.key)) continue;
        dcEntries.delete(old.key);
        dcKeys.delete(old.tag);
        if (dcEntries.size <= 144) break;
      }
    }
    return entry;
  }
  async function dcLoadSeason(id) {
    const e = dcQuery('season',{seasonId:String(id)},{watch:false});
    if (!e.value || e.error) await dcLaunch(e);
    if (e.error) throw e.error;
    return dcRegister(e.value);
  }
  function dcMessage(e) {
    const reason = e?.message || '连接数据服务失败';
    return e?.code != null && !reason.includes(String(e.code)) ? reason+'（'+e.code+'）' : reason;
  }
  function dcStatus(entry, noun, loading = true) {
    if (entry.error) {
      const old = entry.value ? '，保留 '+new Date(entry.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' 的结果' : '';
      const login = String(entry.error.code) === '-101' && !signed ? b('login-'+entry.tag,'state-'+entry.tag,'login','','登录','secondary') : '';
      return '<div class="stateNote" role="status"><span>'+esc(noun+'加载失败'+old+' · '+dcMessage(entry.error))+'</span>'+b('retry-'+entry.tag,'state-'+entry.tag,'dcRetry',entry.tag,'重试','secondary')+login+'</div>';
    }
    return loading && !entry.value ? '<div class="empty" role="status">'+esc('正在加载'+noun+'…')+'</div>' : '';
  }
  function dcItems(entry) {
    const seen = new Set();
    const rows=[];
    for (const item of entry.value?.items || []) {
      const identity=(dcKinds.has(item?.kind)?'season':item?.kind)+':'+(item?.bvid || item?.seasonId || item?.roomId || item?.id || item?.mid || item?.aid);
      if (seen.has(identity)) continue;
      const w=dcRegister(item);
      if (!w) continue;
      seen.add(identity);
      rows.push(w);
    }
    return rows;
  }
  function dcRows(entry, label, draw, emptyText) {
    const list = dcItems(entry);
    return dcStatus(entry,label)+(entry.value ? list.length ? draw(list) : empty(emptyText) : '');
  }
  function dcPageNumber(s, slot) { return s.dcPages?.[slot] || 1; }
  function dcContinuous(slot, params, loadPage) {
    const entry=dcQuery('continuous',{slot,...params},{load:()=>loadPage(1),ttl:Infinity});
    entry.load=async()=>{
      const page=entry.value?.next || 1;
      const value=await loadPage(page);
      const items=new Map();
      for(const x of [...(entry.value?.items||[]),...value.items]){
        const id=[x.kind,x.bvid||x.seasonId||x.roomId||x.id].join(':');
        items.set(id,x);
      }
      const next=value.next===true?page+1:Number(value.next);
      const advanced=!entry.value?.items.length||items.size>entry.value.items.length;
      return {...value,items:[...items.values()],next:next>page&&advanced?next:null};
    };
    dcActiveStream=entry;
    return entry;
  }
  function dcMore(entry) {
    if(!entry?.value?.next || entry.pending || entry.error)return false;
    dcLaunch(entry);
    const stream=view.querySelector('[data-stream="'+entry.tag+'"]');
    if(stream)stream.setAttribute('aria-busy','true');
    return true;
  }
  function dcStreamRows(entry, label, draw, message) {
    entry.streamRender={label,draw,message};
    return '<div data-stream="'+entry.tag+'" aria-busy="'+!!entry.pending+'"><div data-stream-items>'+(entry.value?draw(dcItems(entry)):'')+'</div><div data-stream-state>'+dcStatus(entry,label)+
      (entry.value&&!entry.value.items.length?empty(message):'')+'</div></div>';
  }
  function dcPatchStream(entry){
    const config=entry.streamRender,stream=config&&view.querySelector('[data-stream="'+entry.tag+'"]');
    if(!stream||!entry.value)return false;
    const host=stream.querySelector('[data-stream-items]');
    if(!appendRenderedList(host?.firstElementChild,config.draw(dcItems(entry))))return false;
    const status=stream.querySelector('[data-stream-state]'),html=dcStatus(entry,config.label);
    if(status.innerHTML!==html){status.innerHTML=html;focusStructureVersion++;}
    stream.setAttribute('aria-busy',String(!!entry.pending));stashScroll(current());afterRender(current());return true;
  }
  function dcPager(s, slot, entry) {
    const p = dcPageNumber(s,slot);
    const n = entry.value?.next;
    const next = n === true ? p+1 : Number(n);
    if (p === 1 && !(next > p)) return '';
    const button = (which,num,t) => b('page-'+slot+'-'+which,'dcPage-'+slot,'dcPage',JSON.stringify([slot,num]),t,'secondary');
    return '<div class="listContext" data-page-slot="'+esc(slot)+'">'+(p>1?button('prev',p-1,'上一页'):'')+'<small>第 '+p+' 页</small>'+(next>p?button('next',next,'下一页'):'')+'</div>';
  }
  function dcTabLabel(tabs,key) {return tabs.find(([id])=>id===key)?.[1] || '';}
  function dcThumbs(rows,key='subwork',numbered=false,year=false,offset=0,portrait=false) {
    return '<div class="subGrid">'+rows.map((w,i)=>b(key+'-'+w.id,'subWorks'+Math.floor(i/5),w.kind==='video'?'play':'item',w.id,paint(portrait?'folio':'section',portrait?w.cover||w.wide:w.wide||w.still||w.cover,w.title,'subThumb'+(!w.wide&&!w.still?' portraitFallback':''))+'<strong>'+(numbered?'<em>'+pad(i+1+offset)+'</em>':'')+esc(w.title)+'</strong>'+(year&&w.year?'<small>'+esc(w.year)+'</small>':''),'subWork')).join('')+'</div>';
  }
  function dcLibraryThumbs(rows,mode) {
    const portrait=mode!=='commentary',columns=portrait?6:3;
    return '<div class="subGrid">'+rows.map((w,i)=>{
      let art=paint(portrait?'folio':'section',portrait?w.cover||w.wide:w.wide||w.cover,w.title,'subThumb');
      if(!portrait&&w.duration)art=art.slice(0,-7)+'<b class="stampTime">'+clock(w.duration)+'</b></span>';
      return b('subwork-'+w.id,'subWorks'+Math.floor(i/columns),w.kind==='video'?'play':'item',w.id,art+'<strong>'+esc(w.title)+'</strong>','subWork','aria-label="'+esc(w.title)+'"');
    }).join('')+'</div>';
  }

  homeScreen = function(s) {
    dcBegin(s);
    const tabs = subTabs(filterNames,s.filter,'homeTab');
    if (s.filter === 'zones') return wrap(tabs+zonesScreen(s));
    if (s.filter === 'live') return wrap(tabs+liveScreen(s));
    if (s.filter === 'hot') {
      const week=dcQuery('weekly',{}),size=week.value?dcItems(week).length:20;
      const hot=dcQuery('paired-popular',{size},{load:async()=>{
        const items=new Map();let page=1;
        while(page&&items.size<size){
          const r=await window.BSApi.call('popular',{page});
          const before=items.size;
          for(const x of r.items||[])items.set(x.bvid||x.id,x);
          const next=r.next===true?page+1:Number(r.next);
          page=items.size>before&&next>page?next:null;
        }
        return {items:[...items.values()].slice(0,size)};
      }});
      const count=week.value&&hot.value?Math.min(dcItems(week).length,dcItems(hot).length):size;
      const board=(e,title,key)=>'<section><div class="boardHeading"><h1>'+title+'</h1>'+(e.value?.title?'<small>'+esc(e.value.title)+'</small>':'')+'</div>'+dcRows(e,title,list=>list.slice(0,count).map((w,i)=>rankedLine(w,i,key)).join(''),'本期没有视频')+'</section>';
      return wrap(tabs+'<div class="hotDuo">'+board(hot,'热门视频','hot')+board(week,'每周必看','week')+'</div>');
    }
    const films = dcRandomHome();
    const picks = dcItems(films);
    const owner=dcOwner();
    if(s.recSnapshot&&s.recSnapshot.viewer!==owner){for(const k of ['recSnapshot','recExtra','recSeen','recLoading','recPrevious','recBatch','recLast','recNext'])delete s[k];}
    const rec = dcQuery('recommend',{page:s.recBatch||1},{initial:s.recSnapshot?.viewer===owner&&s.recSnapshot.page===(s.recBatch||1)?s.recSnapshot.value:undefined});
    if(rec.value&&!rec.error&&!rec.pending)s.recSnapshot={viewer:owner,page:s.recBatch||1,value:rec.value};
    const prev = s.recPrevious && dcKeys.get(s.recPrevious);
    const shown = prev && prev.viewer === dcOwner() && (!rec.value || rec.pending || rec.error) ? prev : rec;
    const caption = '<span class="eyeline"><i></i>影视精选</span>';
    let banner = dcStatus(films,'精选',false);
    if (picks.length) {
      const w = dcHydrateFeatured(picks.find(x=>x.id===s.spot) || picks[0]);
      s.spot = w.id;
      const dots = picks.map(x=>'<i class="'+(x===w?'active':'')+'"></i>').join('');
      banner += b('hero-primary','hero','item',w.id,paint('spotlight',w.channelHero||w.hero||w.wide||w.still||w.cover,w.title,'openingArt')+'<span class="openingCopy">'+caption+'<strong>'+esc(w.title)+'</strong><span class="intro">'+esc(w.channelIntro||w.desc||w.release)+'</span></span><span class="spotPicker" aria-hidden="true">'+dots+'</span>','opening','style="--washArt:#293839" data-film="'+esc(w.id)+'" aria-label="'+esc(w.title)+'，左右切换，确定打开"');
    } else if (!films.error) {
      banner += b('hero-primary','hero','dcWait','', '<span class="openingCopy"><strong>'+(films.value?'暂无精选作品':'正在加载精选…')+'</strong></span>','opening','style="--washArt:#293839" aria-live="polite"');
    }
    dcHomePicks = picks;
    if(!s.recLast && rec.value && !rec.error)s.recNext=rec.value.next;
    const first = dcItems(shown).filter(x=>x.kind==='video' && (shown!==rec || !s.recSeen?.includes(x.id)));
    const ids = [...new Set([...first.map(x=>x.id),...(s.recExtra||[])])];
    const videos = ids.map(id=>V[id]).filter(Boolean);
    const oldNote = rec.error && shown!==rec ? '<p class="submeta">显示上一批推荐</p>' : '';
    let grid = videos.length ? tileList(videos,'rec') : '';
    if (grid && shown!==rec) grid='<fieldset class="previousRecommendations" disabled inert>'+grid+'</fieldset>';
    const more=s.recLoading && dcQuery('recommend',{page:s.recLoading});
    const cards = dcStatus(rec,'推荐',shown===rec)+oldNote+(grid ||
      (rec.value?empty(rec.value.items?.length && s.recSeen?.length?'本批没有新的推荐视频':'暂无推荐视频'):''));
    return wrap(tabs+banner+group('为你推荐','<div id="recCards">'+cards+'</div><div id="recMore">'+(more?dcStatus(more,'更多推荐'):'')+'</div>',b('refresh','refresh','refresh','','↻　换一批','textBtn')));
  };
  function appendRecommendations(s){
    if (s.root!=='home'||s.filter!=='rec'||overlay||s.recPrevious||s.recLoading) return;
    if(!s.recNext)return;
    const p=s.recLoading=s.recNext===true?(s.recLast||s.recBatch||1)+1:Number(s.recNext);
    if (!(p>(s.recLast||s.recBatch||1))){delete s.recLoading;return}
    const entry=dcQuery('recommend',{page:p});
    if($('recMore')){$('recMore').innerHTML=dcStatus(entry,'更多推荐');focusStructureVersion++;}
  }
  function atRecEnd(s){
    return s.root==='home' && s.filter==='rec' && view.scrollTop>0 &&
      view.scrollTop+view.clientHeight>=view.scrollHeight-32;
  }
  view.addEventListener('scroll',()=>{
    const s=current();if(atRecEnd(s))appendRecommendations(s);
    if(dcActiveStream && view.scrollTop>0 && view.scrollTop+view.clientHeight>=view.scrollHeight-80)dcMore(dcActiveStream);
  },{passive:true});
  const dcArtQueue=[];
  const dcArtRequested=new Set();
  let dcArtLoading=0;
  function dcPumpArt() {
    while(dcArtLoading<4 && dcArtQueue.length){
      const id=dcArtQueue.shift();dcArtLoading++;
      dcLoadSeason(id).then(w=>{
        if(!w)return;
        for(const box of view.querySelectorAll('.cinThumb,.subThumb')){
          if(box.closest('[data-id]')?.dataset.id!==id)continue;
          const image=box.querySelector('img');
          if(image && w.wide && !box.closest('.portraitCinema')){image.hidden=false;image.src=w.wide;box.classList.remove('portraitFallback')}
        }
        if(current().root==='cinema' && current().featureId===id && $('cinStage'))$('cinStage').innerHTML=cinemaFeature(w,current().filter);
      }).catch(()=>{}).finally(()=>{dcArtLoading--;dcPumpArt()});
    }
  }
  const dcArtObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      dcArtObserver.unobserve(entry.target);
      if(entry.target.closest('.portraitCinema'))continue;
      const id=entry.target.closest('[data-id]')?.dataset.id;
      if(!W[id] || dcArtRequested.has(id))continue;
      dcArtRequested.add(id);dcArtQueue.push(id);
    }
    dcPumpArt();
  },{root:view,rootMargin:'100px'});
  function dcScrollTitle(el) {
    const title=el?.querySelector('.rankTitle strong'),text=title?.firstElementChild;
    if(!text)return;
    const distance=Math.max(0,text.scrollWidth-title.clientWidth);
    title.style.setProperty('--title-distance',-distance+'px');
    title.style.setProperty('--title-time',Math.max(5,distance/42+3)+'s');
    title.classList.toggle('overflowing',distance>1);
  }
  document.addEventListener('focusin',event=>dcScrollTitle(event.target));
  document.addEventListener('load',event=>{
    const img=event.target,box=img.closest?.('.cinThumb,.subThumb');
    if(!box || !img.naturalWidth)return;
    const portrait=img.naturalWidth/img.naturalHeight<1.3;
    box.classList.toggle('portraitFallback',portrait);
    if(portrait)box.style.setProperty('--poster-art','url('+JSON.stringify(img.src)+')');
  },true);
  const dcAfterRender = afterRender;
  afterRender = function(s) {
    dcAfterRender(s);
    observeEpisodeShots();
    const library=view.querySelector('.cinemaLibraryResults'),stream=dcActiveStream;
    if(library&&library.scrollHeight<=library.clientHeight+2&&stream?.value?.next&&!stream.pending&&!stream.error){
      queueMicrotask(()=>{if(library.isConnected&&dcActiveStream===stream)dcMore(stream)});
    }
    if(dcPageLoad?.route===s){
      const button=node(dcPageLoad.anchor);
      if(button){button.textContent='正在加载…';button.setAttribute('aria-busy','true')}
    }
    if(s.dcPageArrival){
      delete s.dcPageArrival;
      const library=view.querySelector('.cinemaLibraryResults'),section=view.querySelector('.channelBrowser');
      if(library){library.scrollTop=0;view.scrollTop=0}
      else if(section)view.scrollTop+=(section.getBoundingClientRect().top-view.getBoundingClientRect().top)/scale;
      s.scroll=view.scrollTop;
    }
    dcScrollTitle(document.activeElement);
    dcArtObserver.disconnect();
    for(const box of view.querySelectorAll('.cinThumb,.subThumb'))dcArtObserver.observe(box);
    if(s.root==='home' && s.filter==='rec' && s.recLoading){
      const page=s.recLoading, e=dcQuery('recommend',{page});
      if(e.value && !e.error && !e.pending){
        const extra=new Set(s.recExtra||[]);
        for(const v of dcItems(e))if(v.kind==='video')extra.add(v.id);
        s.recExtra=[...extra];s.recLast=page;s.recNext=e.value.next;delete s.recLoading;
        const all=[...new Set([...(s.recSnapshot?.value.items||[]).map(x=>dcRegister(x)?.id).filter(id=>!s.recSeen?.includes(id)),...s.recExtra])].map(id=>V[id]).filter(Boolean);
        if(appendRenderedList(view.querySelector('#recCards .grid'),tileList(all,'rec'))){const more=$('recMore');if(more)more.replaceChildren();stashScroll(s);observeEpisodeShots();}
        else redraw(document.activeElement?.dataset.k);
        return;
      }
    }
    if (s.root!=='home' || s.filter!=='rec' || !s.recPrevious) return;
    const rec = dcQuery('recommend',{page:s.recBatch});
    if (!rec.value || rec.pending || rec.error) return;
    delete s.recPrevious;
    if (!overlay && document.activeElement?.dataset.k==='refresh') revealRefreshedBatch();
  };
  let dcHomePicks = [],dcHomeDay='',dcHomeRandom;
  const dcHomeKinds=['anime','movie','drama'];
  const dcRated=x=>x&&dcHomeKinds.includes(x.kind)&&dcId(x.seasonId||x.id)&&Number(x.score)>8&&Number(x.score)<=10&&x.title;
  const dcHomePool=read('home-candidates',{});
  function dcLocalDay(){const d=new Date();return [d.getFullYear(),d.getMonth()+1,d.getDate()].join('-')}
  function dcRandomHome(){
    const day=dcLocalDay();
    if(day===dcHomeDay&&dcHomeRandom)return dcHomeRandom;
    dcHomeDay=day;
    const last=read('home-random-last',{}),items=[];
    for(const kind of dcHomeKinds){
      const cached=(Array.isArray(dcHomePool[kind])?dcHomePool[kind]:[]).filter(x=>x.kind===kind&&dcRated(x));
      const source=cached.length?cached:(window.BS_HOME_CANDIDATES?.[kind]||[]).filter(x=>x.kind===kind&&dcRated(x));
      const other=source.filter(x=>String(x.id||x.seasonId)!==String(last[kind]));
      const pool=other.length?other:source;
      if(pool.length){const pick=pool[Math.floor(Math.random()*pool.length)];items.push(pick);last[kind]=pick.id||pick.seasonId}
    }
    save('home-random-last',last);
    dcHomeRandom={value:{items}};
    // Artwork/detail enrichment is asynchronous; choosing three works never
    // waits for a network request. Newly fetched ratings feed the next draw.
    for(const kind of dcHomeKinds){
      const page=1+Math.floor(Math.random()*10);
      window.BSApi.call('catalog',{kind,page,order:4}).then(result=>{
        const rows=(result.items||[]).filter(dcRated);
        if(rows.length){dcHomePool[kind]=rows;save('home-candidates',dcHomePool)}
      }).catch(()=>{});
    }
    return dcHomeRandom;
  }
  function dcRefreshHomeDay(){
    if(!document.hidden&&dcHomeDay!==dcLocalDay()&&current().root==='home'&&current().filter==='rec'&&!overlay)
      redraw(document.activeElement?.dataset.k);
  }
  document.addEventListener('visibilitychange',dcRefreshHomeDay);
  const dcMidnight=()=>{const now=new Date(),next=new Date(now);next.setHours(24,0,0,25);setTimeout(()=>{dcRefreshHomeDay();dcMidnight()},next-now)};
  dcMidnight();
  const dcWash = new Map();
  document.addEventListener('load',event=>{
    const img=event.target;
    const opening=img.tagName==='IMG' && img.closest('.openingArt')?.closest('.opening');
    if (!opening || !img.naturalWidth || !img.src.startsWith(location.origin+'/__bs/image/')) return;
    if (!dcWash.has(img.src)) {
      try {
        const canvas=document.createElement('canvas'); canvas.width=1; canvas.height=1;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(img,0,0,img.naturalWidth*.5,img.naturalHeight,0,0,1,1);
        const rgb=Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(v=>Math.round(18+v*.25));
        dcWash.set(img.src,'rgb('+rgb.join(',')+')');
        if (dcWash.size>32) dcWash.delete(dcWash.keys().next().value);
      } catch { return; }
    }
    opening.style.setProperty('--washArt',dcWash.get(img.src));
  },true);
  zonesScreen = function(s) {
    const strip = zoneTabs(s);
    const rid = dcRegions[s.cat];
    const slot = 'zone-'+s.cat;
    const kind=({纪录片:'doc',综艺:'variety'})[s.cat];
    const params=kind?{kind}:{rid};
    const e=dcContinuous(slot,params,page=>window.BSApi.call(kind?'catalog':'region',{...params,page}));
    return top('视频分区')+strip+dcStreamRows(e,s.cat,list=>kind?cinemaPlates(list,'zoneVideo'):tileList(list,'zoneVideo'),'这个分区暂时没有视频');
  };
  roomTiles = function(list) {
    if (!list.length) return empty('这里暂时没有直播间');
    return '<div class="roomGrid">'+list.map((r,i)=>b('room-'+r.id,'rooms'+Math.floor(i/3),'room',r.id,paint('room',r.cover||r.wide,r.title,'thumb')+'<span class="roomBody"><small class="onAir '+(r.on?'':'off')+'"><i></i>'+(r.liveStatus===2?'轮播中':r.on?'直播中':r.on===false?'未开播':'查看直播间')+'</small><strong>'+esc(r.title)+'</strong><small>'+esc([r.artist,r.area].filter(Boolean).join('　·　'))+'</small></span>','roomCard')).join('')+'</div>';
  };
  liveScreen = function(s) {
    dcBegin(s);
    const options = [['rec','推荐'],['following','关注'],['knowledge','知识'],['game','游戏'],['music','音乐'],['life','生活']];
    if (!options.some(([k])=>k===s.area)) s.area='rec';
    const head=top('直播')+subTabs(options,s.area,'area','area');
    if (s.area==='following' && !signed) return head+loginGate('登录查看关注的直播');
    const slot='rooms-'+s.area;
    let rooms;
    if (s.area==='rec' || s.area==='following') {
      const params=s.area==='following'?{followed:true}:{};
      rooms=dcContinuous(slot,params,page=>window.BSApi.call('liveRooms',{...params,page}));
    } else {
      const directory = dcQuery('liveAreas');
      if (!directory.value) return head+dcStatus(directory,'直播分区');
      const pattern={knowledge:/知识|学习|科普|百科/,game:/游戏|网游|手游|电竞|单机/,music:/音乐|唱见|唱歌|演奏|乐器|弹唱/,life:/生活|日常/}[s.area];
      const variants=[];
      for (const parent of directory.value.items) {
        const parentAreaId=dcId(parent.id);
        if (!parentAreaId) continue;
        if (pattern.test(parent.title || parent.name)) {
          variants.push({parentAreaId});
        } else {
          for (const child of parent.children || []) {
            const areaId=dcId(child.id);
            if (areaId && pattern.test(child.title || child.name)) variants.push({parentAreaId,areaId});
          }
        }
      }
      if (!variants.length) return head+dcStatus(directory,'直播分区',false)+empty('当前直播目录没有对应的'+dcTabLabel(options,s.area)+'分区');
      rooms=dcContinuous(slot,{filters:JSON.stringify(variants)},async page=>{
        const e=dcGroups('liveRooms',variants,page);
        if(e.pending)await e.pending;
        if(e.error)throw e.error;
        return e.value;
      });
    }
    return head+dcStreamRows(rooms,'直播间',roomTiles,'这里暂时没有直播间');
  };

  function dcOptionGroup(entry,key) {
    const matches = {
      style:/^(style_id|style|styleId|风格|类型|题材)$/,
      area:/^(area|area_id|地区|区域)$/,
      year:/^(year|release_date|年份|时间|上映年份)$/,
      order:/^(order|排序)$/
    };
    return (entry.value?.items || []).find(g=>matches[key].test(String(g.id)) || matches[key].test(String(g.title)))?.options || [];
  }
  function dcGroups(op, rows, pageNum) {
    if (rows.length === 1) return dcQuery(op,{...rows[0],page:pageNum});
    const spec = {filters:JSON.stringify(rows),page:pageNum};
    return dcQuery('combined-'+op,spec,{load:async()=>{
      const results = await Promise.all(rows.map(async p=>{
        try{return {group:await window.BSApi.call(op,{...p,page:pageNum})}}
        catch(error){return {error}}
      }));
      const groups=results.map(r=>r.group).filter(Boolean);
      if(!groups.length)throw results[0].error;
      return {items:groups.flatMap(g=>g.items),next:groups.some(g=>g.next)?pageNum+1:null};
    }});
  }
  function dcFilterSources(kind,sub,options) {
    const base = {kind};
    if (sub==='rec' || sub==='all') return [base];
    if (sub==='opening') return [{kind,order:5}];
    if (sub==='followers') return [{kind,order:3}];
    if (sub==='rating') return [{kind,order:4}];
    if (sub==='rank') return [{kind,order:2}];
    const domestic = /^(中国(大陆)?|中国内地|大陆|内地)$/;
    const optionType = ['cn','overseas'].includes(sub)?'area':'style';
    let choices = dcOptionGroup(options,optionType).filter(o=>!['-1','0','all',''].includes(String(o.id)) && !/全部|不限|其他地区/.test(o.title));
    if (sub==='cn') choices=choices.filter(o=>domestic.test(o.title));
    if (sub==='overseas') choices=choices.filter(o=>!domestic.test(o.title) && !/港澳台|中国港|中国澳|中国台|香港|台湾|澳门/.test(o.title));
    if (sub==='nature') choices=choices.filter(o=>/动物|自然|探索|探险/.test(o.title));
    if (sub==='music') choices=choices.filter(o=>/音乐/.test(o.title));
    return choices.map(o=>({...base,[optionType==='area'?'area':'styleId']:o.id}));
  }
  function dcChannelEntry(kind,sub,p) {
    if (sub==='mine') return {entry:dcQuery('shelf',{kind,page:p})};
    if (kind==='commentary') {
      const order = ({views:'click',new:'pubdate',danmaku:'dm'})[sub] || 'totalrank';
      return {entry:dcQuery('search',{type:'video',keyword:'影视解说',order,page:p})};
    }
    if (sub==='rank' && kind!=='variety') return {entry:dcQuery('ranking',{kind,day:3})};
    const optionsRequired = ['cn','overseas','nature','music'].includes(sub);
    const options = optionsRequired ? dcQuery('catalogOptions',{kind}) : null;
    if (options && !options.value) return {status:dcStatus(options,'频道筛选条件')};
    const variants = dcFilterSources(kind,sub,options);
    if (!variants.length) return {status:dcStatus(options,'频道筛选条件',false)+empty('平台当前未提供此分类的筛选项')};
    return {entry:dcGroups('catalog',variants,p),status:options?dcStatus(options,'频道筛选条件',false):''};
  }
  function dcHydrateFeatured(w) {
    if (w && dcKinds.has(w.kind) && (!w.desc || !(w.hero || w.wide || w.still))) {
      const full = dcQuery('season',{seasonId:w.id});
      if (full.value) dcRegister(full.value);
    }
    return w;
  }
  cinemaFeature = function(w,mode) {
    const art = w.channelHero || w.hero || w.still || w.wide || w.cover;
    const tag = types[mode] || '影视解说';
    return '<article class="cinScene" data-scene="'+esc(w.id)+'" style="--backdrop:url('+esc(dcSafeImage(art))+')">'+paint('cinema',art,w.title,'cinBackdrop'+(!w.hero&&!w.still&&!w.wide?' portraitOnly':''))+'<div class="cinCopy"><span class="eyeline"><i></i>'+esc(tag)+'精选</span><h1>'+esc(w.title)+'</h1><small>'+esc(w.kind==='video'?w.artist:workMeta(w))+'</small><p>'+esc(w.channelIntro||w.desc||w.release)+'</p></div></article>';
  };
  cinemaScreen = function(s) {
    dcBegin(s);
    const mode = s.filter;
    const options = cinSections[mode];
    s.sectionByMode ||= {};
    const sub = s.sectionByMode[mode] || options[0][0];
    const head='<div class="cinChannels">'+subTabs(movieTabs,mode,'cinTab')+'</div>';
    if(dcLibraryModes.has(mode)){
      delete s.featureId;
      const labels=options.map(([id,label])=>[id,id==='nature'?'自然探索':label]);
      const scrollKey=mode+'-'+sub;
      return '<div class="content cinemaLibraryContent"><div class="cinDesk libraryCinema '+(mode==='commentary'?'commentaryCinema':'portraitCinema')+'">'+head+'<section class="channelBrowser"><aside class="cinemaLibrarySidebar" aria-label="频道分类">'+subTabs(labels,sub,'channelSub','channelSub')+'</aside><div id="channelResults" class="cinemaLibraryResults" data-scroll-key="'+esc(scrollKey)+'">'+dcSubRows(s,mode,sub,new Set())+'</div></section></div></div>';
    }
    const source = {entry:dcQuery('channelPage',{kind:mode})};
    const list = dcItems(source.entry).slice(0,6);
    const featured=dcHydrateFeatured(list.find(w=>w.id===s.featureId) || list[0]);
    s.featureId = featured?.id;
    const rail=list.map(w=>b('film-'+w.id,'filmRail',w.kind==='video'?'play':'item',w.id,paint('rail',w.channelHero||w.wide||w.still||w.cover,w.title,'cinThumb'+(!w.wide&&!w.still?' portraitFallback':''))+'<span>'+esc(w.title)+'</span>','cinPick','aria-pressed="'+(w.id===s.featureId)+'"')).join('');
    const show = dcStatus(source.entry,'频道精选')+(featured?'<div id="cinStage">'+cinemaFeature(featured,mode)+'</div><div class="hStrip cinRail">'+rail+'</div>':'');
    const rows=dcSubRows(s,mode,sub,new Set(list.map(w=>w.id)));
    return wrap('<div class="cinDesk">'+head+show+'<section class="channelBrowser">'+subTabs(options,sub,'channelSub','channelSub')+'<div id="channelResults">'+rows+'</div></section></div>');
  };
  function dcChannelLink(sub) {
    let link='';
    const ranked=['rank','followers','rating','views','new','danmaku'].includes(sub);
    if (sub==='all') link=actionLink('channel-index','subResultsHead','cinPage','catalog','打开完整索引');
    else if (sub==='mine') link=actionLink('channel-library','subResultsHead','cinPage','shelf','打开我的片单');
    else if (ranked) link=actionLink('channel-rank','subResultsHead','cinPage','ranking','查看完整榜单');
    return link?'<div class="listContext">'+link+'</div>':'';
  }
  function dcSubRows(s,mode,sub,featuredIds) {
    if (sub==='mine' && !signed) return loginGate('登录查看个人片单');
    const ranked = ['rank','followers','rating','views','new','danmaku'].includes(sub),library=dcLibraryModes.has(mode);
    if(dcContinuousModes.has(mode)){
      const entry=dcContinuous('library-'+mode+'-'+sub,{excluded:sub==='rec'?[...featuredIds].join(','):''},async page=>{
        let source=dcCinemaPageEntry(mode,sub,page,featuredIds);
        if(!source.entry){
          const options=dcQuery('catalogOptions',{kind:mode});
          if(options.error)dcLaunch(options);
          if(options.pending)await options.pending;
          if(options.error)throw options.error;
          source=dcCinemaPageEntry(mode,sub,page,featuredIds);
        }
        if(!source.entry)throw Error('平台当前未提供此分类');
        if(source.entry.error)dcLaunch(source.entry);
        if(source.entry.pending)await source.entry.pending;
        if(source.entry.error)throw source.entry.error;
        return source.entry.value;
      });
      return dcStreamRows(entry,dcTabLabel(cinSections[mode],sub),rows=>library?dcLibraryThumbs(rows,mode):dcThumbs(rows),'这里暂时没有符合条件的作品');
    }
    const slot='channel-'+mode+'-'+sub;
    const p=dcPageNumber(s,slot);
    const {entry,status=''}=dcCinemaPageEntry(mode,sub,p,featuredIds);
    const body=entry?dcRows(entry,dcTabLabel(cinSections[mode],sub),rows=>library?dcLibraryThumbs(rows,mode):dcThumbs(rows,'subwork',ranked,sub==='opening',(p-1)*20),'这里暂时没有符合条件的作品')+dcPager(s,slot,entry):'';
    return (library?'':dcChannelLink(sub))+status+body;
  }
  function dcCinemaPageEntry(mode,sub,p,featuredIds) {
    return sub==='rec' && !dcLibraryModes.has(mode)?{entry:dcFilledChannel(mode,p,featuredIds)}:dcChannelEntry(mode,sub,p);
  }
  async function dcTurnCinemaPage(s,slot,num) {
    if(dcPageLoad?.route===s && dcPageLoad.slot===slot)return;
    const mode=s.filter,sub=s.sectionByMode[mode]||'rec',previous=dcPageNumber(s,slot);
    const anchor=document.activeElement?.dataset.k,scroll=view.scrollTop,viewer=dcOwner();
    const ids=new Set([...view.querySelectorAll('.cinPick')].map(n=>n.dataset.id));
    const {entry}=dcCinemaPageEntry(mode,sub,num,ids);
    if(!entry)return;
    const task=dcPageLoad={route:s,anchor,slot};
    try{
      if(entry.error)dcLaunch(entry);
      redraw(anchor);
      if(entry.pending)await entry.pending;
      if(current()!==s || s.filter!==mode || (s.sectionByMode[mode]||'rec')!==sub || dcOwner()!==viewer || document.activeElement?.dataset.k!==anchor)return;
      if(entry.error){notice(dcMessage(entry.error));return;}
      s.pageAnchors ||= {};
      (s.pageAnchors[slot] ||= {})[previous]={focus:anchor,scroll};
      s.dcPages ||= {};s.dcPages[slot]=num;
      s.dcPageArrival=true;
      if(dcPageLoad===task)dcPageLoad=null;
      const first=dcItems(entry)[0];
      redraw(first?'subwork-'+first.id:'channelSub-'+sub);
    }finally{
      if(dcPageLoad===task){
        dcPageLoad=null;
        if(current()===s)redraw(document.activeElement?.dataset.k);
      }
    }
  }
  function dcFilledChannel(mode,p,featuredIds) {
    return dcQuery('filled-channel',{mode,page:p,excluded:[...featuredIds].join(',')},{load:async()=>{
      const records=new Map(),seen=new Set();
      const first=dcQuery('channelPage',{kind:mode},{watch:false});
      if(first.error)dcLaunch(first);if(first.pending)await first.pending;if(first.error)throw first.error;
      for(const x of first.value.recommendations||[])if(!featuredIds.has(String(x.id||x.seasonId)))records.set(String(x.id||x.seasonId),x);
      // The landing module says has_next=false even when the web feed continues.
      // Its cursor is the starting position, not an end-of-feed signal.
      let cursor=first.value.cursor??0;
      while(cursor!=null&&records.size<=p*20&&!seen.has(String(cursor))){
        seen.add(String(cursor));
        const e=dcQuery('channelFeed',{kind:mode,cursor},{watch:false});
        if(e.error)dcLaunch(e);
        if(e.pending)await e.pending;
        if(e.error)throw e.error;
        for(const w of e.value.items){
          const id=String(w.bvid||w.seasonId||w.id);
          if(!featuredIds.has(id))records.set(id,w);
        }
        cursor=e.value.hasMore?e.value.cursor:null;
      }
      const rows=[...records.values()];
      return {items:rows.slice((p-1)*20,p*20),next:rows.length>p*20?p+1:null};
    }});
  }
  applyChannelSub = function(id) {
    const s=current();
    if (s.root!=='cinema' || !cinSections[s.filter].some(([k])=>k===id) || s.sectionByMode[s.filter]===id) return;
    s.sectionByMode[s.filter]=id;
    redraw('channelSub-'+id);
  };
  const dcOriginalCinemaArrows = cinemaArrows;
  cinemaArrows = function(s,el,key) {
    if(dcLibraryModes.has(s.filter)){
      const row=el.dataset.row,sub=s.sectionByMode[s.filter]||'rec',selected='channelSub-'+sub;
      if(row==='cinTab' && key==='ArrowDown')return focus(selected);
      if(row==='channelSub'){
        const tabs=[...view.querySelectorAll('[data-row="channelSub"]')],i=tabs.indexOf(el);
        if(key==='ArrowUp')return focus(i>0?tabs[i-1].dataset.k:'cinTab-'+s.filter);
        if(key==='ArrowDown'){focus(tabs[i+1]?.dataset.k)||firstKey('.cinemaLibrarySidebar [data-row="subResultsHead"]');return true}
        if(key==='ArrowRight'){
          const pane=view.querySelector('.cinemaLibraryResults'),remembered=s.libraryFocus?.[pane.dataset.scrollKey];
          if(!focus(remembered))firstKey('#channelResults [data-k]');
          return true;
        }
        if(key==='ArrowLeft')return true;
      }
      if(el.closest('.cinemaLibrarySidebar')){
        if(key==='ArrowUp')return focus('channelSub-'+cinSections[s.filter].at(-1)[0]);
        if(key==='ArrowRight'){firstKey('#channelResults [data-k]');return true}
        return true;
      }
      if(el.closest('.cinemaLibraryResults')){
        if(key==='ArrowLeft'){
          const siblings=[...view.querySelectorAll('[data-row="'+CSS.escape(row)+'"]')];
          if(!row.startsWith('subWorks')||siblings[0]===el)return focus(selected);
        }
        if(key==='ArrowUp' && (row==='subWorks0'||!view.querySelector('.subWork')))return focus('cinTab-'+s.filter);
      }
      if(row==='nav' && key==='ArrowDown')return focus('cinTab-'+s.filter);
      return false;
    }
    if(el.dataset.row==='filmRail' && key==='ArrowDown') {
      firstKey('[data-row="channelSub"]');
      return true;
    }
    if (!s.featureId && el.dataset.row==='cinTab' && key==='ArrowDown') {
      firstKey('.cinDesk .stateNote button') || firstKey('[data-row="channelSub"]');
      return true;
    }
    if (!s.featureId && el.dataset.row==='channelSub' && key==='ArrowUp') return focus('cinTab-'+s.filter);
    return dcOriginalCinemaArrows(s,el,key);
  };

  // Sorting by name has no server-side index order. To preserve global order,
  // collect every page for the selected conditions before exposing the sorted set.
  function dcNameSorted(kind,params,p,s) {
    const size=20;
    const key=JSON.stringify(params);
    const e=dcQuery('titles-'+kind,{key},{load:async()=>{
      const works=new Map();
      for (const variant of params) {
        let pn=1;
        for (;;) {
          if (current()!==s || s.order!=='片名' || s.dcTitleKey!==key) throw Error('片名排序已停止，可重试');
          const response=await window.BSApi.call('catalog',{...variant,page:pn});
          const before=works.size;
          for (const w of response.items || []) works.set(w.seasonId||w.id,w);
          if (!response.next) break;
          const next=response.next===true?pn+1:Number(response.next);
          if (!(next>pn) || (pn>1 && works.size===before)) throw Error('作品库未返回下一页，无法完成片名排序');
          pn=next;
        }
      }
      const all=[...works.values()].sort((a,b)=>String(a.title).localeCompare(String(b.title),'zh-Hans-CN'));
      return {items:all};
    }});
    if (!e.value) return e;
    return {...e,value:{items:e.value.items.slice((p-1)*size,p*size),next:p*size<e.value.items.length?p+1:null}};
  }
  document.addEventListener('focusin',ev=>{
    const pane=ev.target.closest?.('.cinemaLibraryResults');
    if(!restoring&&!overlay&&pane){const s=current();s.libraryFocus||={};s.libraryFocus[pane.dataset.scrollKey]=ev.target.dataset.k}
    if (restoring || overlay || current().root!=='cinema' || ev.target.dataset.row!=='filmRail') return;
    const w=W[ev.target.dataset.id];
    if (w) dcHydrateFeatured(w);
  });
  view.addEventListener('scroll',ev=>{
    const pane=ev.target;
    if(!restoring&&pane.matches?.('.cinemaLibraryResults')&&view.contains(pane)){
      stashScroll(current());
      if(pane.scrollTop>0&&pane.scrollTop+pane.clientHeight>=pane.scrollHeight-80&&dcActiveStream)dcMore(dcActiveStream);
    }
  },true);
  catalogScreen = function(s) {
    dcBegin(s);
    const kind=s.kind;
    const title=(types[kind]||'影视解说')+(s.name==='ranking'?'榜单':'作品库');
    if (s.name==='ranking' || kind==='commentary') {
      const sub=s.rankMode && cinSections[kind].some(([k])=>k===s.rankMode)?s.rankMode:(kind==='commentary'?'rec':'rank');
      const slot='index-'+kind+'-'+sub;
      const {entry,status=''}=dcChannelEntry(kind,sub,dcPageNumber(s,slot));
      const draw=rows=>s.name==='ranking'?'<div class="rankBoard">'+rows.map((w,i)=>rankedLine(w,i+(dcPageNumber(s,slot)-1)*20)).join('')+'</div>':tileList(rows,'works');
      return wrap(top(title)+'<p class="submeta">'+esc(dcTabLabel(cinSections[kind],sub))+'</p>'+status+(entry?dcRows(entry,title,draw,'没有符合条件的作品')+dcPager(s,slot,entry):''));
    }
    s.origin ||= '全部'; s.genre ||= '全部'; s.year ||= '全部'; s.order ||= '默认';
    const kinds=kind==='anime' ? ({'全部':['anime','guochuang'],'国创':['guochuang'],'其他番剧':['anime']}[s.origin] || ['anime']) : [kind];
    const defs=kinds.map(k=>dcQuery('catalogOptions',{kind:k}));
    const groups=defs.map(entry=>dcOptionGroup(entry,'style'));
    const choices = values => [...new Set(values.filter(t=>t && !/^(全部|全部类型|不限|所有)$/.test(t)))];
    const genres=choices(groups.flat().map(o=>o.title));
    let years=choices(defs.flatMap(entry=>dcOptionGroup(entry,'year')).map(o=>o.title?.match(/^(\d{4})年?$/)?.[1])).sort().reverse();
    let specs=kinds.flatMap((k,i)=>{
      const spec={kind:k};
      if (s.order==='热度') spec.order=2;
      if (s.year!=='全部') spec.year=Number(s.year);
      if (s.genre!=='全部') {
        const match=groups[i].find(o=>o.title===s.genre);
        if (!match) return [];
        spec.styleId=match.id;
      }
      return [spec];
    });
    const slot='catalog-'+kind+'-'+s.origin+'-'+s.genre+'-'+s.year+'-'+s.order;
    const p=dcPageNumber(s,slot);
    s.dcTitleKey=JSON.stringify(specs);
    const entry=specs.length ? s.order==='片名' ? dcNameSorted(kind,specs,p,s) : dcGroups('catalog',specs,p) : null;
    if (!years.length && entry?.value) years=choices(entry.value.items.map(w=>String(w.year || '')).filter(x=>/^\d{4}$/.test(x))).sort().reverse();
    if (s.year!=='全部' && !years.includes(s.year)) years.unshift(s.year);
    if (s.genre!=='全部' && !genres.includes(s.genre)) genres.unshift(s.genre);
    const controls=(kind==='anime'?filterStrip('作品',['全部','国创','其他番剧'],s.origin,'origin'):'')+filterStrip('类型',['全部',...genres],s.genre,'genre')+filterStrip('年份',['全部',...years],s.year,'year')+filterStrip('排序',['默认','热度','片名'],s.order,'order');
    const showWorks=rows=>{
      if (s.order!=='热度' || kinds.length<2) return cinemaPlates(rows,'works');
      return kinds.map(k=>{
        const part=rows.filter(w=>w.originalKind===k);
        return part.length?group(k==='guochuang'?'国创 · 按热度':'其他番剧 · 按热度',cinemaPlates(part,'works')):'';
      }).join('');
    };
    const waiting=defs.some(e=>!e.value);
    return wrap(top(title)+controls+defs.map(e=>dcStatus(e,'作品库筛选条件',!entry)).join('')+(entry?dcRows(entry,s.order==='片名'?'完整作品库以按片名排序':'作品库',showWorks,'没有符合条件的作品')+dcPager(s,slot,entry):waiting?'':empty('没有符合条件的作品')));
  };

  renderDetail = function(s) {
    dcBegin(s);
    const detail=dcQuery('season',{seasonId:String(s.id)});
    const w=detail.value ? dcRegister(detail.value) : W[s.id];
    if (!w) return wrap(top('作品详情')+dcStatus(detail,'作品详情'));
    const eps=detail.value ? w.episodes || [] : [];
    const remoteIndex=signed && w.resume?.epId ? eps.findIndex(ep=>String(ep.epId)===String(w.resume.epId))+1 : 0;
    const requested=Math.max(1,Number(s.ep)||latestFor(w.id)?.ep||remoteIndex||1);
    if (eps.length) s.ep=Math.min(eps.length,requested);
    const ep=eps[(s.ep||requested)-1];
    const historyItem=progress[w.id+':'+s.ep] || (remoteIndex===s.ep && w.resume?.time>0?{t:w.resume.time}:null);
    const canFollow=['anime','drama'].includes(w.kind);
    const followed = window.BSPersonal?.isMarked?.('collect',w.id) || w.following;
    const collect=canFollow ? b('collect','hero','collect',w.id,(followed?'✓ 已追':followed===false?'＋ 追':'追')+(w.kind==='anime'?'番':'剧'),'secondary') : '';
    const extra=collect+(ep?'<span class="mini">'+esc([ep.title,ep.longTitle,ep.badge].filter(Boolean).join(' · '))+'</span>':'');
    const playLabel=historyItem?.done?'重播':historyItem?.t?'继续播放':'播放正片';
    let stage=feature({kind:'detailFeature',tag:workMeta(w),title:w.title,desc:w.desc,source:w.hero||w.still||w.wide||w.cover,scene:w.hero||w.still||w.wide?'hero':'portrait',id:w.id,action:'playWork',label:playLabel,extra}).replace('data-act="playWork"','data-act="dcPlaySelected"');
    if (!ep || detail.error || ep.areaRestricted) {
      const label = detail.error ? '暂时无法确认播放信息' : ep?.areaRestricted ? '当前地区无法观看本集' : detail.value ? '暂无可播放的正片' : '正在获取分集…';
      stage=stage.replace(/<div class="actions">[\s\S]*?<\/div><\/div><\/article>$/, '<div class="actions">'+collect+'<span class="mini">'+esc(label)+'</span></div></div></article>');
    }
    const episodes=eps.length>1 && !detail.error ? group('选集','<div class="epGrid">'+eps.map((ep,i)=>{
      const title=[ep.title,ep.longTitle].filter(Boolean).join(' · ') || epname(w,i+1);
      return b('ep-'+(i+1),'ep'+Math.floor(i/6),'dcPlayEp',String(i+1),episodeThumb(ep,w,title)+'<strong>'+esc(title+(ep.areaRestricted?' · 地区受限':''))+'</strong>','ep episodeCard'+(s.ep===i+1?' current':''),'aria-label="'+esc(title)+'" aria-pressed="'+(s.ep===i+1)+'"'+(ep.areaRestricted?' disabled aria-disabled="true"':'' ));
    }).join('')+'</div>','<span class="submeta">'+esc(w.release)+'</span>') : '';
    let related='';
    if (detail.value && !detail.error) {
      const similar=dcQuery('seasonRelated',{seasonId:w.id});
      const items=dcItems(similar).filter(x=>x.id!==w.id);
      related=group('相关作品',dcStatus(similar,'相关作品')+(items.length?cinemaPlates(items,'related'):similar.value?empty('暂无相关作品'):''));
    }
    return wrap(stage+dcStatus(detail,'作品详情',false)+episodes+related);
  };

  const dcLocalCandidates=q=>Object.keys(data.pinyin || {}).filter(t=>matches(q,[t]));
  const dcSuggestionCache=new Map();
  let dcSuggestionTimer, dcPendingTerm='';
  function dcCandidateButtons(terms) {
    return terms.slice(0,8).map((t,i)=>b('cand-'+i,'candidate'+Math.floor(i/2),'queryWord',t,esc(t),'word')).join('');
  }
  candidateMarkup=function(q) {
    const word=String(q||'').trim().slice(0,60);
    if (current().name!=='search') return '';
    const terms=()=>[...new Set([...(dcSuggestionCache.get(word)||[]),...dcLocalCandidates(word)])];
    if (dcPendingTerm!==word) {
      clearTimeout(dcSuggestionTimer);
      dcPendingTerm=word;
      if (word && !dcSuggestionCache.has(word)) {
        const owner=current();
        dcSuggestionTimer=setTimeout(async()=>{
          try {
            const resp=await window.BSApi.call('suggest',{keyword:word});
            dcSuggestionCache.set(word,(resp.items || []).map(x=>x.title).filter(Boolean));
            if (dcSuggestionCache.size>64) dcSuggestionCache.delete(dcSuggestionCache.keys().next().value);
            if (current()!==owner || (current().q||'').trim()!==word) return;
            const box=$('wordCandidates');
            if (box && !box.contains(document.activeElement)) box.innerHTML=dcCandidateButtons(terms());
          } catch { /* The local phonetic dictionary remains available offline. */ }
        },240);
      }
    }
    return word ? dcCandidateButtons(terms()) : '';
  };
  searchScreen=function(s) {
    dcBegin(s);
    const field='<div class="searchBox"><i class="mag"></i><input type="text" aria-label="搜索关键词" id="query" data-k="query" data-row="query" maxlength="60" placeholder="输入片名、UP 主、拼音或首字母" value="'+esc(s.q || '')+'">'+b('submit','query','submit','','搜索','cta')+'</div>';
    const keys=Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',(ch,i)=>b('osk-'+ch,'osk'+Math.floor(i/9),'oskLetter',ch,ch,'letter')).join('');
    const actions=[['del','删除'],['clear','清空'],['go','搜索']].map(([id,t])=>b('osk-'+id,'oskActions','oskOp',id,t,'letter opKey')).join('');
    function terms(list,key) {
      return '<div class="terms">'+list.map((x,i)=>b(key+'-'+i,key+Math.floor(i/2),'queryWord',x,esc(x),'word')).join('')+'</div>';
    }
    const recent=group('最近搜索',searchHistory.length?terms(searchHistory,'past'):'<p class="submeta">还没有搜索记录</p>',searchHistory.length?actionLink('clear-queries','clear','confirm','queries','清空'):'');
    const hasQuery=!!s.q?.trim();
    const side='<div id="recentSearch" '+(hasQuery?'hidden':'')+'>'+recent+'</div><div id="suggestSearch" '+(hasQuery?'':'hidden')+'>'+group('联想搜索','<div id="wordCandidates" class="terms">'+candidateMarkup(s.q)+'</div>')+'</div>';
    return wrap('<div class="searchDesk searchV5">'+top('搜索')+field+'<div class="typingDesk"><section class="keyPanel"><h2>遥控器键盘</h2><div class="letterGrid">'+keys+'</div><div class="letterOps">'+actions+'</div></section><aside>'+side+'</aside></div></div>');
  };
  resultsScreen=function(s) {
    dcBegin(s);
    const slot='result-'+s.tab+'-'+s.sort;
    const e=dcQuery('search',{type:dcSearchTypes[s.tab],keyword:s.q,order:s.tab==='video' ? dcSorts[s.sort] : 'totalrank',page:dcPageNumber(s,slot)});
    const list=dcItems(e);
    const controls=s.tab==='video'?subTabs(Object.keys(dcSorts).map(t=>[t,t]),s.sort,'sort','sort'):'';
    let body=dcStatus(e,'搜索结果');
    if (e.value) {
      let content='';
      if (!list.length) content=empty('没有找到相关内容','<p>换个关键词，或切换上方的结果类型。</p>');
      else if (s.tab==='person') content=authorList(list.map(x=>x.id)).replaceAll('data-k="person-','data-k="hit-');
      else if (s.tab==='room') content=roomTiles(list).replaceAll('data-k="room-','data-k="hit-');
      else if (s.tab==='anime') content=cinemaPlates(list,'hit');
      else content=tileList(list,'hit',4,{prefix:'hit'});
      const count=Number.isFinite(e.value.total)?'找到 '+e.value.total+' 个结果':'本页 '+list.length+' 个结果';
      body+=group(count,content);
    }
    return wrap(top('“'+s.q+'”')+subTabs(searchTypes,s.tab,'resultType','resultType')+controls+body+dcPager(s,slot,e));
  };
  const dcSubPage=subPage;
  subPage=function(s) {
    if (s.name!=='offlineRoom') return dcSubPage(s);
    dcBegin(s);
    // Check the room on entry, including search hits whose state was omitted.
    const e=dcQuery('liveRoom',{roomId:s.id},{ttl:30_000});
    const listed=R[s.id];
    if (!e.value) return wrap(top(listed?.title || '直播间')+dcStatus(e,'直播间状态'));
    const room=dcRegister(e.value);
    if (!room) return wrap(top('直播间')+empty('直播间资料不完整'));
    const live=room.on;
    const who=room.artist || (room.host && authorNames(room.host)) || '';
    const follows=room.host?window.BSPersonal?.isMarked?.('follow',room.host):null;
    const action=live?b('room-enter','room','dcLivePlay',room.id,'进入直播','cta'):'';
    const detail=room.host?b('room-follow','room','follow',room.host,follows?'✓ 已关注':'关注主播','secondary')+b('room-author','room','author',room.host,'主播空间','secondary'):'';
    return wrap(top(room.title)+dcStatus(e,'直播间状态')+'<div class="accountPanel">'+(room.host?avatar(room.host):'')+'<h2>'+esc(room.liveStatus===2?'直播轮播中':live?'直播中':room.liveStatus===0?'直播尚未开始':'平台未提供开播状态')+'</h2><p>'+esc(who)+'</p><div class="actions">'+action+detail+b('room-state','room','dcRetry',e.tag,'刷新状态','secondary')+'</div></div>');
  };
  const dcTile=tile;
  tile=function(w,i,row,opt={}) {
    if (w.kind==='video' && opt.sub?.endsWith('　·　')) opt={...opt,sub:w.artist || ''};
    return dcTile(w,i,row,opt);
  };
  const dcBaseDispatch=revisedDispatch;
  revisedDispatch=function(a,id,s) {
    if (a==='dcWait') return true;
    if (a==='dcRetry') {
      const entry=dcKeys.get(id);
      if (entry && dcVisible.page===s && dcVisible.keys.has(entry.key)) {
        dcLaunch(entry);
        if (s.root==='home' && s.filter==='hot') redraw('homeTab-hot',true);
        else if(entry.op==='continuous') {
          const cards=[...view.querySelectorAll('[data-stream="'+entry.tag+'"] button[data-k]')].filter(n=>!n.closest('.stateNote'));
          redraw(cards.at(-1)?.dataset.k);
        }
        else if (entry.op==='recommend' && s.recLoading) redraw(view.querySelector('.grid .tileWrap:last-child .tile')?.dataset.k || 'refresh');
        else if (entry.op==='recommend' && s.root==='home' && s.filter==='rec') redraw('refresh',true);
        else redraw(document.activeElement?.dataset.k);
      }
      return true;
    }
    if (a==='refresh' && s.root==='home' && s.filter==='rec') {
      const old=dcQuery('recommend',{page:s.recBatch||1});
      if (old.pending) return true;
      if (old.error) {
        dcLaunch(old);
      } else {
        s.recSeen=[...new Set([...(s.recSeen || []),...dcItems(old).map(w=>w.id),...(s.recExtra||[])])].slice(-120);
        s.recPrevious=old.tag;
        s.recBatch=Math.max(s.recLoading||0,s.recLast||0,s.recBatch||1)+1;
        delete s.recLast;delete s.recNext;delete s.recExtra;delete s.recLoading;
        dcQuery('recommend',{page:s.recBatch},{fresh:true,watch:false});
      }
      redraw('refresh',true);
      return true;
    }
    if (a==='dcPage') {
      const [slot,num]=JSON.parse(id);
      if (Number.isInteger(num) && num>0) {
        if(s.root==='cinema'){dcTurnCinemaPage(s,slot,num);return true;}
        s.dcPages ||= {};
        s.pageAnchors ||= {};
        const anchors=s.pageAnchors[slot] ||= {};
        const previous=dcPageNumber(s,slot);
        anchors[previous]={focus:document.activeElement?.dataset.k,scroll:view.scrollTop};
        s.dcPages[slot]=num;
        const key=s.name==='results'?(s.tab==='video'?'sort-'+s.sort:'resultType-'+s.tab) : s.root==='cinema'?'channelSub-'+(s.sectionByMode[s.filter]||'rec') : s.filter==='zones'?'zone-'+s.cat : (s.filter==='live'||s.name==='live')?'area-'+s.area : s.filter==='hot'?'homeTab-hot':null;
        redraw(key,true);
      }
      return true;
    }
    if (a==='item') {
      go({type:'detail',id,ep:latestFor(id)?.ep,focus:'feature'});
      return true;
    }
    if ((a==='dcPlayEp' || a==='dcPlaySelected') && s.type==='detail') {
      const index=a==='dcPlaySelected' ? s.ep : Number(id);
      const w=W[s.id];
      if (w?.episodes?.[index-1]?.epId && !w.episodes[index-1].areaRestricted) {
        s.ep=index;
        const local=progress[w.id+':'+index];
        const remote=signed && String(w.resume?.epId)===String(w.episodes[index-1].epId) ? Number(w.resume.time)||0 : 0;
        startWatch(s.id,index,{at:local?.done?0:Math.max(0,local?.t??remote)});
      }
      return true;
    }
    if (a==='room') {
      const room=R[id];
      if (room?.on) startWatch(id,0,{room:id});
      else page('offlineRoom',{id});
      return true;
    }
    if (a==='dcLivePlay') {startWatch(id,0,{room:id});return true;}
    return dcBaseDispatch(a,id,s);
  };
  const dcBaseArrows=revisedArrow;
  revisedArrow=function(s,el,key) {
    if(key==='ArrowDown' && dcActiveStream && el.closest('[data-stream]')){
      const last=el.closest('[data-stream]').querySelector('[data-stream-items]')?.firstElementChild?.lastElementChild;
      const target=last?.matches('button[data-row]')?last:last?.querySelector('button[data-row]');
      if(target?.dataset.row===el.dataset.row && dcMore(dcActiveStream))return true;
    }
    if (s.root==='home' && s.filter==='rec') {
      const r=el.dataset.row,down=key==='ArrowDown',up=key==='ArrowUp';
      if (down && r?.startsWith('rec') && el.closest('.grid')?.lastElementChild?.querySelector('[data-row]')?.dataset.row===r){
        appendRecommendations(s);
        if(!s.recLoading || view.querySelector('[data-act="dcRetry"]'))return false;
        return true;
      }
      if (r==='hero') {
        if ((key==='ArrowLeft'||key==='ArrowRight') && dcHomePicks.length) {
          const n=dcHomePicks.findIndex(w=>w.id===s.spot);
          s.spot=dcHomePicks[(n+(key==='ArrowRight'?1:-1)+dcHomePicks.length)%dcHomePicks.length].id;
          redraw('hero-primary');
        } else if (down) firstKey('[data-row="rec0"]:enabled') || focus('refresh');
        else if (up) focus('homeTab-rec');
        return true;
      }
      if ((r==='rec0'&&up)||(r==='refresh'&&(up||down))) {
        if (down) {
          if (!firstKey('[data-row="rec0"]:enabled')) {
            const retry=el.closest('.section')?.querySelector('[data-act="dcRetry"]');
            if (retry) focus(retry.dataset.k);
          }
        } else if (r==='rec0' && el===[...view.querySelectorAll('[data-row="rec0"]')].at(-1)) focus('refresh');
        else focus('hero-primary') || focus('homeTab-rec');
        return true;
      }
    }
    if (s.root==='home' && s.filter==='hot' && el.closest('.hotDuo') && ['ArrowLeft','ArrowRight'].includes(key)) {
      const section=el.closest('section'),duo=section.parentElement;
      const other=key==='ArrowLeft'?section.previousElementSibling:section.nextElementSibling;
      if (other && other.parentElement===duo) {
        const list=[...other.querySelectorAll('button')],i=[...section.querySelectorAll('button')].indexOf(el);
        if (list.length) focus(list[Math.min(i,list.length-1)].dataset.k);
      }
      return true;
    }
    if (s.root==='home' && s.filter==='zones' && el.dataset.row==='zones' && key==='ArrowDown') {
      firstKey('[data-row="zoneVideo0"]') || firstKey('.stateNote button');
      return true;
    }
    return dcBaseArrows(s,el,key);
  };
  function dcInvalidate(op) {
    for (const e of [...dcEntries.values()]) {
      if (e.op!==op) continue;
      dcEntries.delete(e.key); dcKeys.delete(e.tag);
    }
  }
  const dcSelect=selectTab;
  selectTab=function(act,id,k,row) {
    const s=current();
    if (s.name==='results' && ((act==='resultType' && s.tab!==id)||(act==='sort' && s.sort!==id))) {
      const tab=act==='resultType'?id:s.tab;
      const sort=act==='resultType'?'综合排序':id;
      if (s.dcPages) delete s.dcPages['result-'+tab+'-'+sort];
    }
    return dcSelect(act,id,k,row);
  };
  const dcConfirm=confirmDo;
  confirmDo=function(id) {
    if (id==='clear-cache') {dcInvalidate('search');dcSuggestionCache.clear();}
    return dcConfirm(id);
  };
  window.BSDiscovery=Object.freeze({
    register:dcRegister,loadSeason:dcLoadSeason,imageURL:dcSafeImage,
    invalidate(op){
      dcInvalidate(op);
      if (op==='shelf') dcInvalidate('season');
      if (current()===dcVisible.page && !overlay) redraw(current().focus);
    },
    accountChanged(){
      dcEntries.clear(); dcKeys.clear();
      for (const w of Object.values(W)) { delete w.following; delete w.resume; }
      if (current()===dcVisible.page && !overlay) redraw(current().focus);
    }
  });
}

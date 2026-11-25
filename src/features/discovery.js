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
  const dcOwner = () => signed ? String(window.BSPersonal?.account?.mid || 'signed') : 'guest';
  const dcRegions = {知识:36,科技:188,数码:95,影视:181,动画:1,游戏:4,音乐:3,生活:160,美食:211,舞蹈:129,体育运动:234,汽车:223,娱乐:5,动物:217,时尚:155,鬼畜:119,资讯:202,纪录片:177,综艺:71};
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
      if (!['https:','http:'].includes(u.protocol) || !/^i[012]\.hdslb\.com$/.test(u.hostname) || !u.pathname.startsWith('/bfs/') || u.username || u.password) return '';
      u.protocol = 'https:';
      return u.href.replace(/['"()<>]/g, ch => '%' + ch.charCodeAt(0).toString(16));
    } catch { return ''; }
  }
  const dcPaint = paint;
  paint = (container, url, title, cls) => {
    const markup = dcPaint(container, dcSafeImage(url), title, cls);
    // Keep the focused artwork ahead of thumbnails competing for TV bandwidth.
    return container === 'spotlight' || container === 'cinema'
      ? markup.replace('<img ', '<img fetchpriority="high" ')
      : markup;
  };
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
      const liveFocus = document.activeElement?.dataset.k;
      const field = document.activeElement?.id === 'query' ? [document.activeElement.selectionStart,document.activeElement.selectionEnd] : null;
      redraw(liveFocus || current().focus);
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
      entry = {key,op,viewer:owner,tag:'d'+(++dcSequence),value:null,pending:null,error:null,time:0,load:options.load || (() => window.BSApi.call(op,params))};
      dcEntries.set(key,entry);
      dcKeys.set(entry.tag,entry);
    }
    if (options.load && !entry.pending) entry.load=options.load;
    if (options.watch !== false) dcVisible.keys.add(key);
    if (!entry.error && (!entry.value || Date.now()-entry.time > (options.ttl ?? 5*60_000))) dcLaunch(entry);
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
  function dcPager(s, slot, entry) {
    const p = dcPageNumber(s,slot);
    const n = entry.value?.next;
    const next = n === true ? p+1 : Number(n);
    if (p === 1 && !(next > p)) return '';
    const button = (which,num,t) => b('page-'+slot+'-'+which,'dcPage-'+slot,'dcPage',JSON.stringify([slot,num]),t,'secondary');
    return '<div class="listContext">'+(p>1?button('prev',p-1,'上一页'):'')+'<small>第 '+p+' 页</small>'+(next>p?button('next',next,'下一页'):'')+'</div>';
  }
  function dcTabLabel(tabs,key) {return tabs.find(([id])=>id===key)?.[1] || '';}
  function dcThumbs(rows,key='subwork',numbered=false,year=false,offset=0) {
    return '<div class="subGrid">'+rows.map((w,i)=>b(key+'-'+w.id,'subWorks'+Math.floor(i/5),w.kind==='video'?'play':'item',w.id,paint('section',w.wide||w.still||w.cover,w.title,'subThumb')+'<strong>'+(numbered?'<em>'+pad(i+1+offset)+'</em>':'')+esc(w.title)+'</strong>'+(year&&w.year?'<small>'+esc(w.year)+'</small>':''),'subWork')).join('')+'</div>';
  }

  homeScreen = function(s) {
    dcBegin(s);
    const tabs = subTabs(filterNames,s.filter,'homeTab');
    if (s.filter === 'zones') return wrap(tabs+zonesScreen(s));
    if (s.filter === 'live') return wrap(tabs+liveScreen(s));
    if (s.filter === 'hot') {
      const board = (op,title,key) => {
        const e = dcQuery(op,op==='weekly' ? {} : {page:dcPageNumber(s,key)});
        const offset = op==='popular' ? (dcPageNumber(s,key)-1)*20 : 0;
        return '<section><div class="boardHeading"><h1>'+title+'</h1>'+(e.value?.title?'<small>'+esc(e.value.title)+'</small>':'')+'</div>'+dcRows(e,title,list=>list.map((w,i)=>rankedLine(w,i+offset,key)).join(''),'本期没有视频')+(op==='popular'?dcPager(s,key,e):'')+'</section>';
      };
      return wrap(tabs+'<div class="hotDuo">'+board('popular','热门视频','hot')+board('weekly','每周必看','week')+'</div>');
    }
    const films = dcQuery('catalog',{kind:'movie',page:1,order:2});
    const picks = dcItems(films).slice(0,3);
    const rec = dcQuery('recommend',{page:s.recBatch || 1});
    const prev = s.recPrevious && dcKeys.get(s.recPrevious);
    const shown = prev && prev.viewer === dcOwner() && (!rec.value || rec.pending || rec.error) ? prev : rec;
    const caption = '<span class="eyeline"><i></i>电影频道<span></span>热播精选</span>';
    let banner = dcStatus(films,'精选',false);
    if (picks.length) {
      const w = dcHydrateFeatured(picks.find(x=>x.id===s.spot) || picks[0]);
      s.spot = w.id;
      const dots = picks.map(x=>'<i class="'+(x===w?'active':'')+'"></i>').join('');
      banner += b('hero-primary','hero','item',w.id,paint('spotlight',w.hero||w.wide||w.still||w.cover,w.title,'openingArt').replace('<img ',w.hero||w.wide||w.still?'<img ':'<img style="object-fit:contain;object-position:82% center" ')+'<span class="openingCopy">'+caption+'<strong>'+esc(w.title)+'</strong><span class="intro">'+esc(w.desc||w.release)+'</span></span><span class="spotPicker" aria-hidden="true">'+dots+'</span>','opening','style="--washArt:#293839" data-film="'+esc(w.id)+'" aria-label="'+esc(w.title)+'，左右切换，确定打开"');
    } else if (!films.error) {
      banner += b('hero-primary','hero','dcWait','', '<span class="openingCopy"><strong>'+(films.value?'暂无精选作品':'正在加载精选…')+'</strong></span>','opening','style="--washArt:#293839" aria-live="polite"');
    }
    dcHomePicks = picks;
    const videos = dcItems(shown).filter(x=>x.kind==='video' && (shown!==rec || !s.recSeen?.includes(x.id))).slice(0,12);
    const oldNote = rec.error && shown!==rec ? '<p class="submeta">显示上一批推荐</p>' : '';
    let grid = videos.length ? tileList(videos,'rec') : '';
    if (grid && shown!==rec) grid='<fieldset class="previousRecommendations" disabled inert>'+grid+'</fieldset>';
    const cards = dcStatus(rec,'推荐',shown===rec)+oldNote+(grid ||
      (rec.value?empty(rec.value.items?.length && s.recSeen?.length?'本批没有新的推荐视频':'暂无推荐视频'):''));
    return wrap(tabs+banner+group('为你推荐',cards,b('refresh','refresh','refresh','','↻　换一批','textBtn')));
  };
  const dcAfterRender = afterRender;
  afterRender = function(s) {
    dcAfterRender(s);
    if (s.root!=='home' || s.filter!=='rec' || !s.recPrevious) return;
    const rec = dcQuery('recommend',{page:s.recBatch});
    if (!rec.value || rec.pending || rec.error) return;
    delete s.recPrevious;
    if (!overlay && document.activeElement?.dataset.k==='refresh') revealRefreshedBatch();
  };
  let dcHomePicks = [];
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
    const p = dcPageNumber(s,slot);
    const e = rid ? dcQuery('region',{rid,page:p}) : dcQuery('search',{type:'video',keyword:s.cat,order:'pubdate',page:p});
    const note = rid ? '分区排行榜' : s.cat+'主题搜索 · 最新发布';
    return top('视频分区','<small class="submeta">'+esc(note)+'</small>')+strip+dcRows(e,s.cat,list=>tileList(list,'zoneVideo'),'这个分区暂时没有视频')+dcPager(s,slot,e);
  };
  roomTiles = function(list) {
    if (!list.length) return empty('这里暂时没有直播间');
    return '<div class="roomGrid">'+list.map((r,i)=>b('room-'+r.id,'rooms'+Math.floor(i/3),'room',r.id,paint('room',r.cover||r.wide,r.title,'thumb')+'<span class="roomBody"><small class="onAir '+(r.on?'':'off')+'"><i></i>'+(r.liveStatus===2?'轮播中':r.on?'直播中':r.on===false?'未开播':'查看直播间')+'</small><strong>'+esc(r.title)+'</strong><small>'+esc([r.artist,r.area].filter(Boolean).join('　·　'))+'</small></span>','roomCard')).join('')+'</div>';
  };
  liveScreen = function(s) {
    dcBegin(s);
    const directory = dcQuery('liveAreas');
    const options = [['rec','推荐'],['following','关注'],['knowledge','知识'],['game','游戏'],['music','音乐'],['life','生活']];
    if (!options.some(([k])=>k===s.area)) s.area='rec';
    const head=top('直播')+subTabs(options,s.area,'area','area');
    if (s.area==='following' && !signed) return head+loginGate('登录查看关注的直播');
    const slot='rooms-'+s.area;
    const p=dcPageNumber(s,slot);
    let rooms;
    if (s.area==='rec' || s.area==='following') {
      rooms=dcQuery('liveRooms',s.area==='following'?{followed:true,page:p}:{page:p});
    } else {
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
      rooms=dcGroups('liveRooms',variants,p);
    }
    return head+dcRows(rooms,'直播间',roomTiles,'这里暂时没有直播间')+dcPager(s,slot,rooms);
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
      const groups = await Promise.all(rows.map(p=>window.BSApi.call(op,{...p,page:pageNum})));
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
    const art = w.hero || w.still || w.wide || w.cover;
    const tag = types[mode] || '影视解说';
    return '<article class="cinScene" data-scene="'+esc(w.id)+'" style="--backdrop:url('+esc(dcSafeImage(art))+')">'+paint('cinema',art,w.title,'cinBackdrop'+(!w.hero&&!w.still&&!w.wide?' portraitOnly':''))+'<div class="cinCopy"><span class="eyeline"><i></i>'+esc(tag)+'精选</span><h1>'+esc(w.title)+'</h1><small>'+esc(w.kind==='video'?w.artist:workMeta(w))+'</small><p>'+esc(w.desc||w.release)+'</p></div></article>';
  };
  cinemaScreen = function(s) {
    dcBegin(s);
    const mode = s.filter;
    const options = cinSections[mode];
    s.sectionByMode ||= {};
    const sub = s.sectionByMode[mode] || options[0][0];
    const source = dcChannelEntry(mode,'rec',1);
    const list = dcItems(source.entry).slice(0,12);
    const featured=dcHydrateFeatured(list.find(w=>w.id===s.featureId) || list[0]);
    s.featureId = featured?.id;
    const rail=list.map(w=>b('film-'+w.id,'filmRail',w.kind==='video'?'play':'item',w.id,paint('rail',w.wide||w.still||w.cover,w.title,'cinThumb')+'<span>'+esc(w.title)+'</span>','cinPick','aria-pressed="'+(w.id===s.featureId)+'"')).join('');
    const show = dcStatus(source.entry,'频道精选')+(featured?'<div id="cinStage">'+cinemaFeature(featured,mode)+'</div><div class="hStrip cinRail">'+rail+'</div>':'');
    const head='<div class="cinChannels">'+subTabs(movieTabs,mode,'cinTab')+'</div>';
    const rows=dcSubRows(s,mode,sub);
    return wrap('<div class="cinDesk">'+head+show+'<section class="channelBrowser">'+subTabs(options,sub,'channelSub','channelSub')+'<div id="channelResults">'+rows+'</div></section></div>');
  };
  function dcSubRows(s,mode,sub) {
    if (sub==='mine' && !signed) return loginGate('登录查看个人片单');
    const ranked = ['rank','followers','rating','views','new','danmaku'].includes(sub);
    let link='';
    if (sub==='all') link=actionLink('channel-index','subResultsHead','cinPage','catalog','打开完整索引');
    else if (sub==='mine') link=actionLink('channel-library','subResultsHead','cinPage','shelf','打开我的片单');
    else if (ranked) link=actionLink('channel-rank','subResultsHead','cinPage','ranking','查看完整榜单');
    const slot='channel-'+mode+'-'+sub;
    const {entry,status=''}=dcChannelEntry(mode,sub,dcPageNumber(s,slot));
    const body=entry?dcRows(entry,dcTabLabel(cinSections[mode],sub),rows=>dcThumbs(rows,'subwork',ranked,sub==='opening',(dcPageNumber(s,slot)-1)*20),'这里暂时没有符合条件的作品')+dcPager(s,slot,entry):'';
    return (link?'<div class="listContext">'+link+'</div>':'')+status+body;
  }
  applyChannelSub = function(id) {
    const s=current();
    if (s.root!=='cinema' || !cinSections[s.filter].some(([k])=>k===id) || s.sectionByMode[s.filter]===id) return;
    s.sectionByMode[s.filter]=id;
    redraw('channelSub-'+id);
  };
  const dcOriginalCinemaArrows = cinemaArrows;
  cinemaArrows = function(s,el,key) {
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
    if (restoring || overlay || current().root!=='cinema' || ev.target.dataset.row!=='filmRail') return;
    const w=W[ev.target.dataset.id];
    if (w) dcHydrateFeatured(w);
  });
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
      return b('ep-'+(i+1),'ep'+Math.floor(i/8),'dcPlayEp',String(i+1),esc(title+(ep.areaRestricted?' · 地区受限':'')),'ep'+(s.ep===i+1?' current':''),'aria-pressed="'+(s.ep===i+1)+'"'+(ep.areaRestricted?' disabled aria-disabled="true"':'' ));
    }).join('')+'</div>','<span class="submeta">'+esc(w.release)+'</span>') : '';
    let related='';
    if (detail.value && !detail.error) {
      const similar=dcQuery('seasonRelated',{seasonId:w.id});
      const items=dcItems(similar).filter(x=>x.id!==w.id);
      related=group('相关作品',dcStatus(similar,'相关作品')+(items.length?tileList(items,'related'):similar.value?empty('暂无相关作品'):''));
    }
    return wrap(stage+dcStatus(detail,'作品详情',false)+episodes+related);
  };

  const dcLocalCandidates=q=>Object.keys(data.pinyin || {}).filter(t=>matches(q,[t]));
  const dcSuggestionCache=new Map();
  let dcSuggestionTimer, dcPendingTerm='';
  function dcCandidateButtons(terms) {
    return terms.slice(0,4).map((t,i)=>b('cand-'+i,'candidates','queryWord',t,esc(t),'word')).join('');
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
    const hot=dcQuery('hotSearch');
    const field='<div class="searchBox"><i class="mag"></i><input type="text" aria-label="搜索关键词" id="query" data-k="query" data-row="query" maxlength="60" placeholder="输入片名、UP 主、拼音或首字母" value="'+esc(s.q || '')+'">'+b('submit','query','submit','','搜索','cta')+'</div>';
    const keys=Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',(ch,i)=>b('osk-'+ch,'osk'+Math.floor(i/9),'oskLetter',ch,ch,'letter')).join('');
    const actions=[['del','删除'],['clear','清空'],['go','搜索']].map(([id,t])=>b('osk-'+id,'oskActions','oskOp',id,t,'letter opKey')).join('');
    function terms(list,key) {
      return '<div class="terms">'+list.map((x,i)=>b(key+'-'+i,key+Math.floor(i/2),'queryWord',x,esc(x),'word')).join('')+'</div>';
    }
    const recent=group('最近搜索',searchHistory.length?terms(searchHistory,'past'):'<p class="submeta">还没有搜索记录</p>',searchHistory.length?actionLink('clear-queries','clear','confirm','queries','清空'):'');
    const words=(hot.value?.items || []).slice(0,8).map(x=>x.title).filter(Boolean);
    const suggestions=group('热搜',dcStatus(hot,'热搜')+(words.length?terms(words,'suggest'):hot.value?'<p class="submeta">暂无热搜词</p>':''));
    return wrap('<div class="searchDesk searchV5">'+top('搜索')+field+'<div class="typingDesk"><section class="keyPanel"><h2>遥控器键盘</h2><div class="letterGrid">'+keys+'</div><div class="letterOps">'+actions+'</div><div id="wordCandidates" class="terms">'+candidateMarkup(s.q)+'</div></section><aside>'+recent+suggestions+'</aside></div></div>');
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
    return wrap(top('“'+s.q+'”',actionLink('change-query','title','editQuery','','修改搜索词'))+subTabs(searchTypes,s.tab,'resultType','resultType')+controls+body+dcPager(s,slot,e));
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
        if (entry.op==='recommend' && s.root==='home' && s.filter==='rec') redraw('refresh',true);
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
        s.recSeen=[...new Set([...(s.recSeen || []),...dcItems(old).slice(0,12).map(w=>w.id)])].slice(-120);
        s.recPrevious=old.tag;
        s.recBatch=(s.recBatch||1)+1;
        dcQuery('recommend',{page:s.recBatch},{fresh:true,watch:false});
      }
      redraw('refresh',true);
      return true;
    }
    if (a==='dcPage') {
      const [slot,num]=JSON.parse(id);
      if (Number.isInteger(num) && num>0) {
        s.dcPages ||= {};
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
    if (s.root==='home' && s.filter==='rec') {
      const r=el.dataset.row,down=key==='ArrowDown',up=key==='ArrowUp';
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

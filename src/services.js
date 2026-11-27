(() => {
  'use strict';
  // Only the host transport owns the session. All upstream routes are fixed here.
  const API = 'https://api.bilibili.com';
  const LIVE = 'https://api.live.bilibili.com';
  const PASSPORT = 'https://passport.bilibili.com';
  const SUGGEST = 'https://s.search.bilibili.com';
  const types = {anime: 1, movie: 2, doc: 3, guochuang: 4, drama: 5, variety: 7};
  const typeNames = Object.fromEntries(Object.entries(types).map(([name, id]) => [id, name]));
  const regionPaths = {1001:'cinephile',1002:'ent',1003:'music',1004:'dance',1005:'douga',1007:'kichiku',
    1008:'game',1009:'information',1010:'knowledge',1012:'tech',1013:'car',1014:'fashion',1018:'sports',
    1020:'food',1022:'travel',1024:'animal',1031:'life_experience'};
  const PAGE_SIZE = 20;

  function error(code, message, status = 0) {
    return Object.assign(new Error(message), {code, status});
  }
  function invalid(name) { throw error('INVALID_INPUT', '参数无效：' + name); }
  function malformed(name) { throw error('BAD_RESPONSE', '平台响应缺少有效的' + name); }
  function id(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return '';
    return /^[1-9]\d{0,23}$/.test(String(value)) ? String(value) : '';
  }
  function reqId(value, label) { return id(value) || invalid(label); }
  function bvid(value) { return /^BV[0-9a-zA-Z]{10}$/.test(String(value)) ? value : ''; }
  function videoId(p) { return p.bvid ? {bvid: bvid(p.bvid) || invalid('bvid')} : {aid: reqId(p.aid, 'aid')}; }
  function seasonType(kind) { return Object.hasOwn(types, kind) ? types[kind] : invalid('kind'); }
  function input(value, name, max = 128) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(name);
    return value.trim();
  }
  function page(p) { return Number(reqId(p.page ?? 1, 'page')); }
  function num(value, fallback = 0) {
    return value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
  }
  function duration(value) {
    if (typeof value === 'string' && /^\d+(:\d{1,2}){1,2}$/.test(value)) {
      return value.split(':').reduce((n, part) => n * 60 + Number(part), 0);
    }
    return Math.max(0, num(value));
  }
  const entities = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
  function text(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).replace(/<\/?em\b[^>]*>/gi, '').replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (full, token) => {
      if (token[0] !== '#') return entities[token.toLowerCase()] ?? full;
      const value = token[1]?.toLowerCase() === 'x' ? parseInt(token.slice(2), 16) : Number(token.slice(1));
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : full;
    }).trim();
  }
  function https(value) {
    if (typeof value !== 'string' || !/^(?:https?:)?\/\//i.test(value)) return '';
    try {
      const u = new URL(value, API);
      if (u.username || u.password) return '';
      u.protocol = 'https:';
      return u.href;
    } catch { return ''; }
  }
  function array(value, label) { return Array.isArray(value) ? value : malformed(label); }
  function rows(value, convert) {
    return array(value, '列表').filter(x => x && typeof x === 'object').map(convert).filter(x => x && x.id && x.title);
  }
  function list(value, convert, current, hasMore, total) {
    const items = rows(value, convert);
    const more = hasMore ?? (total != null ? current * PAGE_SIZE < total : false);
    return {items, next: more && current ? current + 1 : null, total: num(total, null)};
  }
  function params(values) {
    const out = new URLSearchParams();
    for (const [key, val] of Object.entries(values)) if (val != null && val !== '') out.set(key, String(val));
    return out.toString();
  }
  async function transport(host, path, values = {}, method = 'GET') {
    if (!window.BSTransport?.request) throw error('UNAVAILABLE', '此运行环境缺少 BiliBS 网络服务');
    const data = params(values);
    const req = {method, url: host + path};
    if (method === 'POST') {
      req.body = data;
      req.headers = {'Content-Type': 'application/x-www-form-urlencoded'};
    } else if (data) req.url += '?' + data;
    let result;
    try { result = await window.BSTransport.request(req); }
    catch (e) { throw error(e?.code ?? 'NETWORK', e?.message || '网络服务未连接', num(e?.status)); }
    const status = Number(result?.status);
    if (status < 200 || status >= 300 || !Number.isFinite(status)) {
      const tip = [403, 412, 429].includes(status) ? '，平台限制当前请求' : '';
      throw error(status || 'NETWORK', '请求未完成（HTTP ' + (status || 0) + '）' + tip, status || 0);
    }
    return {body: result.body, status};
  }
  async function json(host, path, values = {}, method = 'GET') {
    const {body, status} = await transport(host, path, values, method);
    let out;
    try { out = JSON.parse(body); } catch { malformed('JSON'); }
    if (!out || typeof out !== 'object' || !Number.isInteger(out.code)) malformed('状态码');
    if (out.code !== 0) throw error(out.code, text(out.message || out.msg || ('平台错误 ' + out.code)), status);
    const payload = out.data ?? out.result;
    if (payload?.v_voucher || out.v_voucher) throw error('PLATFORM_CHECK', '平台要求验证后才能访问', status);
    return payload;
  }
  const get = (path, values) => json(API, path, values);
  const live = (path, values) => json(LIVE, path, values);
  const passport = (path, values) => json(PASSPORT, '/x/passport-login/web/qrcode/' + path, values);
  const bool = value => value === true || value === 1 || value === '1' ? true :
    value === false || value === 0 || value === '0' ? false : null;

  function videoCard(x) {
    const bv = bvid(x.bvid || x.bv_id);
    const aid = id(x.aid || x.id);
    const cover = https(x.pic || x.cover);
    const owner = x.owner || x.upper || {};
    return {kind: 'video', id: bv || aid, bvid: bv, aid, cid: id(x.cid), title: text(x.title),
      cover, wide: cover, desc: text(x.desc || x.description || x.intro), artist: text(owner.name || x.author),
      mid: id(owner.mid || x.mid), cat: text(x.tname || x.typename), published: num(x.pubdate ?? x.created, null), dm: num(x.stat?.danmaku ?? x.video_review, null), duration: duration(x.duration ?? x.length), views: num(x.stat?.view ?? x.play, null)};
  }
  function videoCardFromRecommendation(x) {
    if (x.goto && x.goto !== 'av') return null;
    return videoCard(x);
  }
  function seasonCard(x, fallbackKind) {
    const seasonId = id(x.season_id);
    const kind = typeNames[x.season_type ?? x.media_type ?? x.type] || fallbackKind || 'season';
    const release = text(x.new_ep?.desc || x.new_ep?.index_show || x.index_show || x.newest_ep?.desc);
    const year = String(x.pubtime_year || x.year || x.publish?.release_date || (/上映|首播/.test(release)?release:'')).match(/(?:19|20)\d{2}/)?.[0] || '';
    return {kind, id: seasonId, seasonId, title: text(x.season_title || x.title),
      cover: https(x.cover || x.pic), wide: https(x.horizontal_cover_169 || x.bkg_cover || x.horizontal_cover_1610 || x.cover_16_9),
      desc: text(x.evaluate || x.desc || x.subTitle || x.description), artist: '', mid: '', duration: 0,
      release, year, score: num(x.rating?.score ?? x.media_score?.score ?? x.score, null), badge: text(x.badge),
      areas: (Array.isArray(x.areas) ? x.areas : []).map(a => text(a.name || a)).filter(Boolean),
      styles: (Array.isArray(x.styles) ? x.styles : []).map(a => text(a.name || a)).filter(Boolean)};
  }
  function episode(x) {
    return {epId: id(x.ep_id || x.id), aid: id(x.aid), cid: id(x.cid), bvid: bvid(x.bvid),
      title: text(x.title || x.index), longTitle: text(x.long_title || x.index_title),
      duration: num(x.duration) / 1000, cover: https(x.cover), badge: text(x.badge), areaRestricted: bool(x.rights?.area_limit)};
  }
  function authorCard(x) {
    const mid = id(x.mid || x.uid);
    const face = https(x.face || x.upic);
    const name = text(x.name || x.uname);
    return {kind: 'author', id: mid, mid, title: name, name, artist: name, face, cover: face, wide: '',
      desc: text(x.sign || x.usign), duration: 0, following: bool(x.following ?? x.is_follow), followers: num(x.fans ?? x.follower, null)};
  }
  function roomCard(x) {
    const roomId = id(x.roomid || x.room_id || x.roomId || x.id);
    const cover = https(x.user_cover || x.cover || x.keyframe || x.system_cover);
    return {kind: 'live', id: roomId, roomId, title: text(x.title || x.roomname || x.uname), artist: text(x.uname || x.name),
      mid: id(x.uid || x.mid), face: https(x.face || x.uface), desc: text(x.description || '').replace(/<[^>]+>/g, ''),
      duration: 0, cover, wide: cover, liveStatus: num(x.live_status ?? x.liveStatus, null), area: text(x.area_name || x.area_v2_name), viewers: num(x.online, null)};
  }
  function folderCard(x) {
    const folderId = id(x.id);
    return {id: folderId, folderId, title: text(x.title), count: num(x.media_count), cover: https(x.cover), selected: bool(x.fav_state)};
  }
  async function nav() {
    try {
      const d = await get('/x/web-interface/nav');
      if (typeof d?.isLogin !== 'boolean') malformed('登录状态');
      if (d.isLogin && !id(d.mid)) malformed('用户编号');
      return {loggedIn: d.isLogin, mid: id(d.mid), name: text(d.uname), face: https(d.face), vip: bool(d.vipStatus ?? d.vip?.status) === true};
    } catch (e) {
      if (e.code !== -101) throw e;
      return {loggedIn: false, mid: '', name: '', face: '', vip: false};
    }
  }
  async function userId(mid) {
    if (mid != null && mid !== '') return reqId(mid, 'mid');
    const me = await nav();
    if (!me.loggedIn) throw error(-101, '账号未登录');
    return reqId(me.mid, 'mid');
  }
  function eligible(p) { if (p.userAction !== true) throw error('USER_ACTION_REQUIRED', '此操作需要用户确认'); }
  function enabled(p) { return typeof p.enabled === 'boolean' ? p.enabled : invalid('enabled'); }
  async function write(p, path, fields) {
    eligible(p);
    return await json(API, path, fields, 'POST');
  }
  async function ack(p, path, fields) { await write(p, path, fields); return {ok: true}; }
  const ops = Object.create(null);
  Object.assign(ops, {
    async recommend(p) {
      const i = page(p);
      const d = await get('/x/web-interface/wbi/index/top/feed/rcmd', {ps: PAGE_SIZE, fresh_idx: i, fresh_idx_1h: i});
      return list(d?.item, videoCardFromRecommendation, i, d?.item?.length > 0);
    },
    async popular(p) {
      const i = page(p);
      const d = await get('/x/web-interface/popular', {pn: i, ps: PAGE_SIZE});
      return list(d?.list, videoCard, i, d?.no_more === false || (d?.no_more == null && d?.list?.length === PAGE_SIZE));
    },
    async weekly(p) {
      let number = p.number, issue;
      if (!number) {
        const d = await get('/x/web-interface/popular/series/list', {web_location:'333.934'});
        const issues = array(d?.list, '周刊列表');
        if (!issues.length) return {items: [], next: null};
        issue=issues[0];number=issue.number;
      }
      number=reqId(number,'number');
      try{
        const d=await get('/x/web-interface/popular/series/one',{number,web_location:'333.934'});
        return {...list(d?.list,videoCard),number,mediaId:id(d?.config?.media_id),title:text(d?.config?.name)};
      }catch(err){
        // The publisher also releases a public collection. Only accept a verified
        // collection for this exact issue, including the publisher and issue title.
        const mediaId=id(issue?.media_id)||(p.knownIssue?.number===number?id(p.knownIssue.mediaId):'');
        if(!mediaId || ![-352,412,403,429].includes(Number(err.code)))throw err;
        const items=[];let more=true;
        for(let pn=1;more;pn++){
          const folder=await get('/x/v3/fav/resource/list',{media_id:mediaId,pn,ps:20});
          if(String(folder?.info?.upper?.mid)!=='412466388' || !String(folder.info.title).includes('第'+number+'期'))throw err;
          const videos=rows(folder.medias,x=>x.type===2?videoCard(x):null);
          items.push(...videos);
          more=!!folder.has_more && pn*20<Number(folder.info.media_count);
        }
        if(!items.length)throw err;
        return {items,number,mediaId,title:text(issue?.name)||'第'+number+'期',next:null};
      }
    },
    async region(p) {
      const channel = regionPaths[p.rid];
      if (!channel) {
        const d = await get('/x/web-interface/ranking/v2', {rid:reqId(p.rid,'rid'),type:'all'});
        return list(d?.list,videoCard);
      }
      const i=page(p);
      try{
        const d=await get('/x/web-interface/region/feed/rcmd',{from_region:p.rid,display_id:i,request_cnt:15,device:'web',plat:30,web_location:'333.40138'});
        return list(d?.archives,x=>videoCard({...x,owner:x.author,pic:x.cover}),i,d?.archives?.length>0);
      }catch(error){
        if(Number(error.code)===62013)return {items:[],next:null};
        if(i>1 || ![403,412,429,-352].includes(Number(error.code)))throw error;
      }
      // Read the public channel's rendered cards. The detached template never runs page scripts or loads its images.
      const {body}=await transport('https://www.bilibili.com','/c/'+channel+'/');
      const markup=document.createElement('template');
      markup.innerHTML=body;
      const cards=[...markup.content.querySelectorAll('.bili-video-card')].map(el=>{
        const cover=el.querySelector('.bili-cover-card');
        const author=el.querySelector('.bili-video-card__author');
        return {bvid:cover?.getAttribute('href')?.match(/\/video\/(BV\w{10})/)?.[1],
          title:el.querySelector('.bili-video-card__title')?.textContent.trim(),
          pic:cover?.querySelector('img')?.getAttribute('src'),
          duration:cover?.querySelector('.bili-cover-card__stat:last-child')?.textContent.trim(),
          author:author?.textContent.trim().split(' · ')[0],mid:author?.getAttribute('href')?.match(/\.com\/(\d+)/)?.[1]};
      });
      if(!cards.length){
        for(const link of markup.content.querySelectorAll('a.cover-wrap[href*="/video/BV"]')){
          const img=link.querySelector('img');
          if(img)cards.push({bvid:link.getAttribute('href').match(/\/video\/(BV\w{10})/)?.[1],title:img.alt,pic:img.getAttribute('src')});
        }
      }
      const result=list(cards,videoCard);
      if(!result.items.length)malformed('频道视频列表');
      return {...result,next:2};
    },
    async catalog(p) {
      const i = page(p), t = seasonType(p.kind);
      const animated = t === 1 || t === 4;
      const year = p.year ?? -1;
      const oneYear = /^\d{4}$/.test(String(year));
      const animeYear = oneYear ? '[' + year + ',' + (Number(year) + 1) + ')' : year;
      const releaseDate = oneYear ? '[' + year + '-01-01 00:00:00,' + (Number(year) + 1) + '-01-01 00:00:00)' : year;
      const dates = animated ? {year: animeYear} : {release_date: p.releaseDate ?? releaseDate};
      const d = await get('/pgc/season/index/result', {season_type: t, type: 1, st: t, page: i, pagesize: PAGE_SIZE,
        order: p.order ?? 2, sort: p.sort ?? 0, area: p.area ?? -1, style_id: p.styleId ?? p.style ?? -1,
        is_finish: p.isFinish ?? -1, season_status: p.seasonStatus ?? -1, season_version: -1, season_month: -1, copyright: -1, ...dates});
      return list(d?.list, x => seasonCard(x, p.kind), i, bool(d?.has_next), d?.total);
    },
    async channelPage(p) {
      const name=({movie:'movie',drama:'tv',anime:'anime',doc:'documentary',variety:'variety'})[p.kind]||invalid('kind');
      const d=await get('/pgc/page/web/'+(p.kind==='anime'?'v3':'v2'),{name,...(p.kind==='anime'?{abtest_key:'ogv_channel_page_26_9',abtest_result:1}:{})});
      const modules=array(d?.modules,'频道模块');
      const flatten=items=>(items||[]).flatMap(x=>x.sub_items?flatten(x.sub_items):[x]);
      const convert=async(x,banner=false)=>{
        const link=String(x.link||''),sid=id(x.season_id)||link.match(/\/bangumi\/play\/ss(\d+)/)?.[1];
        const epId=id(x.episode_id)||link.match(/\/bangumi\/play\/ep(\d+)/)?.[1];
        if(!sid&&!epId)return null;
        const base=sid?seasonCard({...x,season_id:sid},p.kind):await ops.season({epId});
        const image=https(x.big_cover||x.cover),wide=https(x.hover?.img)||image;
        return {...base,title:text(x.title).replace(/^《|》$/g,'')||base.title,desc:text(x.evaluate||x.sub_title)||base.desc,
          wide,score:num(x.rating,base.score),...(banner?{channelHero:image,channelIntro:text(x.sub_title||x.play_title),hero:image}:{} )};
      };
      const banner=modules.find(m=>/^web_banner/.test(m.style)),hot=modules.filter(m=>/^web_hot/.test(m.style)),feed=modules.find(m=>/^web_feed/.test(m.style));
      const items=(await Promise.all((banner?.items||[]).map(x=>convert(x,true)))).filter(Boolean);
      const recommendations=(await Promise.all(flatten([...hot.flatMap(m=>m.items||[]),...(feed?.items||[])]).map(x=>convert(x)))).filter(Boolean);
      return {items,recommendations,cursor:feed?.coursor,hasMore:bool(feed?.has_next)===true};
    },
    async channelFeed(p) {
      const name=({movie:'movie',drama:'tv',anime:'anime',doc:'documentary',variety:'variety'})[p.kind]||invalid('kind');
      const d=await get('/pgc/page/web/'+(p.kind==='anime'?'v3/feed':'feed'),{name,coursor:input(String(p.cursor),'cursor',2048),new_cursor_status:true});
      const flatten=items=>items.flatMap(x=>x.sub_items?flatten(x.sub_items):[x]);
      return {...list(flatten(array(d?.items,'频道推荐')),x=>({...seasonCard(x,p.kind),wide:https(x.hover?.img)||https(x.cover),desc:text(x.evaluate||x.sub_title)})),cursor:d.coursor,hasMore:bool(d.has_next)===true};
    },
    async catalogOptions(p) {
      const d = await get('/pgc/season/index/condition', {season_type: seasonType(p.kind), type: 1});
      const groups = array(d?.filter ?? d?.filters ?? d, '筛选条件');
      return {items: groups.map(g => ({id: text(g.field || g.key), title: text(g.name || g.title),
        options: (g.values || g.options || []).map(o => ({id: String(o.keyword ?? o.value ?? ''), title: text(o.name || o.title)}))})).filter(g => g.id && g.options.length)};
    },
    async ranking(p) {
      const t = seasonType(p.kind);
      const d = await get(t === 1 ? '/pgc/web/rank/list' : '/pgc/season/rank/web/list', {day: p.day ?? 3, season_type: t});
      return list(d?.list, x => seasonCard(x, p.kind));
    },
    async video(p) {
      const d = await get('/x/web-interface/view', videoId(p));
      const v = videoCard(d || {});
      if (!v.id) malformed('投稿编号');
      return {...v, pages: array(d.pages, '分P列表').map(s => ({cid: id(s.cid), page: num(s.page), title: text(s.part), duration: duration(s.duration),cover:https(s.first_frame)}))};
    },
    async videoShot(p) {
      const d=await get('/x/player/videoshot',{...videoId(p),cid:reqId(p.cid,'cid'),index:1});
      const columns=num(d?.img_x_len),rows=num(d?.img_y_len);
      if(!Number.isInteger(columns)||columns<1||columns>100||!Number.isInteger(rows)||rows<1||rows>100)malformed('预览网格');
      const images=array(d?.image,'预览图片').map(https);
      if(!images.length||images.some(u=>!u))malformed('预览图片');
      return {images,columns,rows,times:(Array.isArray(d.index)?d.index:[]).map(t=>Math.max(0,num(t)))};
    },
    async season(p) {
      const d = await get('/pgc/view/web/season', p.epId ? {ep_id: reqId(p.epId, 'epId')} : {season_id: reqId(p.seasonId, 'seasonId')});
      const s = seasonCard(d || {});
      if (!s.id) malformed('季度编号');
      const seasons = rows(d.seasons ?? [], x => seasonCard({...x, title: x.season_title || x.title || x.season_tab}, s.kind));
      const current = (d.seasons || []).find(x => id(x.season_id) === s.id);
      const raw = d.episodes ?? (bool(d.publish?.is_started) === false || d.total === 0 ? [] : undefined);
      const visible = array(raw, '分集列表').filter(x => x && !bool(x.is_view_hide));
      const episodes = visible.filter(x => num(x.section_type) === 0).map(episode).filter(x => x.epId);
      const extras = visible.filter(x => num(x.section_type) !== 0).map(episode).filter(x => x.epId);
      const progress = d.user_status?.progress;
      const resume = id(progress?.last_ep_id) ? {epId: id(progress.last_ep_id), time: num(progress.last_time), label: text(progress.last_ep_index)} : null;
      return {...s, wide: s.wide || https(current?.horizontal_cover_169) || episodes[0]?.cover || '',
        seasons, episodes, extras, following: bool(d.user_status?.follow), resume};
    },
    async related(p) { return list(await get('/x/web-interface/archive/related', videoId(p)), videoCard); },
    async seasonRelated(p) {
      const d = await get('/pgc/season/web/related/recommend', {season_id: reqId(p.seasonId, 'seasonId')});
      return list(d?.season ?? d?.relates, x => seasonCard(x));
    },
    async search(p) {
      const i = page(p);
      const parse = {video: x => (!x.type || x.type==='video') ? videoCard(x) : null, media_bangumi: x => seasonCard(x, 'anime'), media_ft: x => seasonCard(x),
        bili_user: authorCard, live_room: roomCard};
      const t = p.type || 'video';
      if (!Object.hasOwn(parse, t)) invalid('type');
      const d = await get('/x/web-interface/wbi/search/type', {search_type: t, keyword: input(p.keyword, 'keyword'), page: i, order: p.order || 'totalrank'});
      const values = (d?.result == null && d?.numResults === 0) ? [] : d?.result;
      return list(values, parse[t], i, i < num(d?.numPages), d?.numResults);
    },
    async hotSearch() {
      const d = await get('/x/web-interface/wbi/search/square', {limit: 12, platform: 'web'});
      return {items: array(d?.trending?.list, '热搜列表').map(x => ({title: text(x.keyword || x.show_name)})).filter(x => x.title)};
    },
    async suggest(p) {
      const {body} = await transport(SUGGEST, '/main/suggest', {term: input(p.keyword, 'keyword'), main_ver: 'v1', func: 'suggest', suggest_type: 'accurate', highlight: 0});
      let d;
      try { d = JSON.parse(body); } catch { malformed('搜索建议'); }
      if (d?.code != null && Number(d.code) !== 0) throw error(d.code, text(d.message) || '平台未提供搜索建议');
      if (d?.result?.v_voucher || d?.data?.v_voucher) throw error('PLATFORM_CHECK', '平台要求验证后才能访问');
      const tags = d?.result?.tag ?? (Array.isArray(d?.result) ? d.result : undefined) ??
        (d?.code === 0 && d.result && Object.keys(d.result).length === 0 ? [] : undefined);
      return {items: array(tags, '搜索建议').map(x => ({title: text(x.value || x.name || x)})).filter(x => x.title)};
    },
    async liveAreas() {
      const d = await live('/room/v1/Area/getList');
      const normalize = x => ({id: id(x.id), title: text(x.name), parentAreaId: id(x.parent_id), children: (x.list || []).map(normalize)});
      return {items: array(d, '直播分区').map(normalize)};
    },
    async liveRooms(p) {
      if (p.followed) {
        await userId();
        const d = await live('/xlive/web-ucenter/v1/xfetter/GetWebList', {hit_ab: true});
        return list(d?.rooms ?? d?.list, x => roomCard({...x, live_status: x.live_status ?? 1}));
      }
      const i = page(p);
      const recommended=!Number(p.parentAreaId)&&!Number(p.areaId);
      if(recommended&&i===1){
        const d=await live('/xlive/web-interface/v1/webMain/getMoreRecList',{platform:'web'});
        return {...list(d?.recommend_room_list,x=>roomCard({...x,live_status:x.live_status??1})),next:2};
      }
      const sourcePage=recommended?i-1:i;
      const d = await live('/room/v3/area/getRoomList', {parent_area_id:p.parentAreaId ?? 0,
        area_id:p.areaId ?? 0, sort_type:'online', page_size:PAGE_SIZE, page:sourcePage});
      const more=bool(d?.has_more)??(d?.count!=null?sourcePage*PAGE_SIZE<num(d.count):d?.list?.length===PAGE_SIZE);
      return list(d?.list, x => roomCard({...x, live_status: x.live_status ?? 1}), i, more, d?.count);
    },
    async liveRoom(p) {
      const d = await live('/room/v1/Room/get_info', {room_id: reqId(p.roomId, 'roomId')});
      const r = roomCard(d || {});
      if (!r.id) malformed('直播间编号');
      return r;
    },
    async authorLive(p) {
      const mid = reqId(p.mid, 'mid');
      const d = await live('/room/v1/Room/get_status_info_by_uids', {'uids[]': mid});
      if (!d || typeof d !== 'object') malformed('主播状态');
      return list(Object.values(d), roomCard);
    },
    nav,
    async qrGenerate() {
      const d = await passport('generate');
      const u = https(d?.url);
      if (!u || !['passport.bilibili.com', 'passport.biligame.com', 'account.bilibili.com'].includes(new URL(u).hostname) || !d.qrcode_key) malformed('官方二维码');
      return {url: u, key: String(d.qrcode_key)};
    },
    async qrPoll(p) {
      const d = await passport('poll', {qrcode_key: input(p.key, 'key', 128)});
      const states = {0: 'confirmed', 86038: 'expired', 86090: 'scanned', 86101: 'waiting'};
      if (!d || !Object.hasOwn(states, d.code)) throw error(d?.code ?? 'BAD_RESPONSE', text(d?.message) || '无法确认扫码状态');
      return {state: states[d.code]};
    },
    async logout(p) {
      eligible(p);
      if (!window.BSTransport?.clearSession) throw error('UNAVAILABLE', '此环境缺少会话清理支持');
      await window.BSTransport.clearSession();
      return {ok: true};
    },
  });
  function postCard(x, depth = 0) {
    const m = x.modules || {}, author = m.module_author || {}, dyn = m.module_dynamic || {}, major = dyn.major || {};
    const archive = major.archive, opus = major.opus, article = major.article;
    let target = null, postType = 'text';
    if (archive) {
      postType = 'video';
      target = videoCard({...archive, owner: author, duration: archive.duration_text});
    } else if (major.pgc) {
      postType = 'video';
      target = seasonCard(major.pgc);
      target.epId = id(major.pgc.epid);
      target.id ||= target.epId;
    } else if (major.live || major.live_rcmd) {
      postType = 'live';
      let content = major.live;
      try { if (major.live_rcmd) content = JSON.parse(major.live_rcmd.content).live_play_info; } catch { content = null; }
      if (content) target = roomCard({...content, uname: author.name, uid: author.mid});
    } else if (article || x.type === 'DYNAMIC_TYPE_ARTICLE') postType = 'article';
    else if (opus?.pics?.length || major.draw) postType = 'image';
    if (x.orig) postType = 'forward';
    const desc = text(dyn.desc?.text || opus?.summary?.text || article?.desc || archive?.desc || major.common?.desc);
    const images = [...(opus?.pics || major.draw?.items || []).map(i => i.url || i.src), ...(article?.covers || [])].map(https).filter(Boolean);
    const original = x.orig && depth < 1 ? postCard(x.orig, depth + 1) : null;
    const title = text(opus?.title || article?.title || target?.title || dyn.topic?.name || desc || original?.title || major.none?.tips || author.name);
    return {id: id(x.id_str), kind: 'post', postType, title, desc, images, artist: text(author.name), mid: id(author.mid),
      face: https(author.face), published: num(author.pub_ts), target: target?.id ? target : null, original,
      commentId:id(x.basic?.comment_id_str),commentType:num(x.basic?.comment_type),commentCount:num(m.module_stat?.comment?.count)};
  }
  function replyCard(x) {
    const member=x.member || {}, content=x.content || {};
    return {id:id(x.rpid_str || x.rpid),mid:id(member.mid),author:text(member.uname),face:https(member.avatar),
      message:text(content.message),published:num(x.ctime),likes:num(x.like),count:num(x.rcount),
      images:(content.pictures || []).map(p=>https(p.img_src)).filter(Boolean),
      replies:(x.replies || []).map(y=>replyCard({...y,replies:[]}))};
  }
  function replyCards(value) {
    return array(value,'评论列表').filter(x=>x&&typeof x==='object').map(replyCard).filter(x=>x.id);
  }
  function historyCard(x) {
    const h = x.history || {}, biz = h.business;
    let item;
    if (biz === 'archive') {
      item = videoCard({...x, aid: h.oid, bvid: h.bvid, cid: h.cid, author: x.author_name, mid: x.author_mid});
    } else if (biz === 'pgc') {
      item = seasonCard({...x, season_id: h.oid, season_type: x.season_type});
      Object.assign(item, {epId: id(h.epid), cid: id(h.cid), bvid: bvid(h.bvid), duration: duration(x.duration)});
    } else if (biz === 'live') item = roomCard({...x, roomid: h.oid, uid: x.author_mid, uname: x.author_name});
    else return null;
    return {...item, kid: biz + '_' + reqId(h.oid, 'oid'), progress: num(x.progress), page: num(h.page, 1),
      part: text(h.part || x.show_title), partTitle: text(h.part || x.show_title), viewAt: num(x.view_at)};
  }
  function idList(inputIds) {
    if (inputIds == null) return '';
    if (!Array.isArray(inputIds)) invalid('folderIds');
    return [...new Set(inputIds.map(i => reqId(i, 'folderId')))].join(',');
  }
  Object.assign(ops, {
    async feed(p) {
      const values = {offset: p.offset || undefined, features: 'itemOpusStyle'};
      let path = '/x/polymer/web-dynamic/v1/feed/all';
      if (p.mid) { path = '/x/polymer/web-dynamic/v1/feed/space'; values.host_mid = reqId(p.mid, 'mid'); }
      const d = await get(path, values);
      let items = rows(d?.items, x => postCard(x));
      if (['video', 'image', 'article', 'live', 'forward', 'text'].includes(p.type)) items = items.filter(x => x.postType === p.type);
      return {items, next: d.has_more && d.offset ? String(d.offset) : null};
    },
    async post(p) {
      const d = await get('/x/polymer/web-dynamic/v1/detail', {id: reqId(p.id, 'id'), features: 'itemOpusStyle'});
      if (!d?.item) malformed('动态');
      return postCard(d.item);
    },
    async comments(p) {
      const d=await get('/x/v2/reply/wbi/main',{oid:reqId(p.oid,'oid'),type:reqId(p.type,'type'),mode:3,
        pagination_str:JSON.stringify({offset:p.cursor?input(p.cursor,'cursor',8192):''}),web_location:'333.1365'});
      const items=replyCards([...(d.top_replies || []),...(d.replies || [])]);
      const unique=[...new Map(items.map(x=>[x.id,x])).values()];
      const next=d.cursor?.pagination_reply?.next_offset;
      return {items:unique,total:num(d.cursor?.all_count),next:!d.cursor?.is_end && next && next!=='no-next-offset'?String(next):null};
    },
    async commentReplies(p) {
      const i=page(p);
      const d=await get('/x/v2/reply/reply',{oid:reqId(p.oid,'oid'),type:reqId(p.type,'type'),root:reqId(p.root,'root'),pn:i,ps:10});
      return {items:replyCards(d.replies || []),total:num(d.page?.count),next:i*10<num(d.page?.count)?i+1:null};
    },
    async author(p) {
      const d = await get('/x/web-interface/card', {mid: reqId(p.mid, 'mid')});
      if (!d?.card?.mid) malformed('作者名片');
      return authorCard({...d.card, following: d.following, follower: d.follower});
    },
    async authorVideos(p) {
      const i = page(p);
      const d = await get('/x/space/wbi/arc/search', {mid: reqId(p.mid, 'mid'), pn: i, ps: PAGE_SIZE, order: 'pubdate',platform:'web',order_avoided:true,web_location:'333.1387'});
      return list(d?.list?.vlist, videoCard, i, null, d?.page?.count);
    },
    async follows(p) {
      const i = page(p);
      const d = await get('/x/relation/followings', {vmid: await userId(p.mid), pn: i, ps: PAGE_SIZE, order: 'desc'});
      return list(d?.list ?? (d?.total === 0 ? [] : undefined), authorCard, i, null, d?.total);
    },
    async likes(p) {
      const d=await get('/x/space/like/video', {vmid: await userId(p.mid)});
      return list(Array.isArray(d)?d:d?.list, videoCard);
    },
    async history(p) {
      const c = p.cursor || {};
      const d = await get('/x/web-interface/history/cursor', {ps: PAGE_SIZE, max: c.max, business: c.business, view_at: c.view_at});
      const result = list(d?.list, historyCard);
      const cursor = d.cursor;
      const more = d.list.length > 0 && cursor && (num(cursor.max) || num(cursor.view_at));
      result.next = more && !(String(cursor.max) === String(c.max) && String(cursor.view_at) === String(c.view_at) && cursor.business === c.business)
        ? {max: cursor.max, view_at: cursor.view_at, business: cursor.business} : null;
      return result;
    },
    async later() {
      const d = await get('/x/v2/history/toview/web');
      return list(d?.list ?? (d?.count === 0 ? [] : undefined), videoCard, null, false, d?.count);
    },
    async folders(p) {
      const d = await get('/x/v3/fav/folder/created/list-all', {up_mid: await userId(p.mid), rid: p.aid ? reqId(p.aid, 'aid') : undefined, type: p.aid ? 2 : undefined});
      return list(d?.list ?? (d?.count === 0 ? [] : undefined), folderCard, null, false, d?.count);
    },
    async folder(p) {
      const i = page(p);
      const d = await get('/x/v3/fav/resource/list', {media_id: reqId(p.folderId, 'folderId'), pn: i, ps: PAGE_SIZE, order: 'mtime', type: 0, platform: 'web'});
      return list(d?.medias ?? (d?.info?.media_count === 0 || d?.has_more === false ? [] : undefined),
        x => (!x.type || x.type === 2) && x.attr !== 9 ? videoCard(x) : null, i, bool(d?.has_more), d?.info?.media_count);
    },
    async shelf(p) {
      const i = page(p);
      if (!['anime', 'drama'].includes(p.kind)) invalid('kind');
      const d = await get('/x/space/bangumi/follow/list', {vmid: await userId(p.mid), type: p.kind === 'anime' ? 1 : 2, pn: i, ps: PAGE_SIZE});
      return list(d?.list ?? (d?.total === 0 ? [] : undefined), x => seasonCard(x, p.kind), i, null, d?.total);
    },
    async relation(p) {
      if (!p.aid && !p.mid) invalid('aid/mid');
      const result = {liked: null, favorited: null, following: null};
      if (p.aid) {
        const d = await get('/x/web-interface/archive/relation', {aid: reqId(p.aid, 'aid')});
        if (!d || typeof d !== 'object') malformed('视频关系');
        result.liked = bool(d.like);
        result.favorited = bool(d.favorite);
      }
      if (p.mid) {
        const d = await get('/x/relation', {fid: reqId(p.mid, 'mid')});
        if (d?.attribute == null) malformed('关注状态');
        result.following = [1, 2, 6].includes(Number(d.attribute));
      }
      return result;
    },
    like: p => ack(p, '/x/web-interface/archive/like', {aid: reqId(p.aid, 'aid'), like: enabled(p) ? 1 : 2}),
    follow: p => ack(p, '/x/relation/modify', {fid: reqId(p.mid, 'mid'), act: enabled(p) ? 1 : 2, re_src: 11}),
    setLater: p => ack(p, '/x/v2/history/toview/' + (enabled(p) ? 'add' : 'del'), {aid: reqId(p.aid, 'aid')}),
    setFavorite(p) {
      const add = idList(p.addIds), remove = idList(p.removeIds);
      if ((!add && !remove) || (add && remove && add.split(',').some(x => remove.split(',').includes(x)))) invalid('folderIds');
      return ack(p, '/x/v3/fav/resource/deal', {rid: reqId(p.aid, 'aid'), type: 2, add_media_ids: add, del_media_ids: remove});
    },
    setShelf: p => ack(p, '/pgc/web/follow/' + (enabled(p) ? 'add' : 'del'), {season_id: reqId(p.seasonId, 'seasonId')}),
    async createFolder(p) {
      const d = await write(p, '/x/v3/fav/folder/add', {title: input(p.title, 'title', 40), privacy: 1});
      const f = folderCard(d || {});
      if (!f.id) malformed('新收藏夹编号');
      return f;
    },
    clearHistory: p => ack(p, '/x/v2/history/clear', {}),
    removeHistory(p) {
      if (!/^(archive|pgc|live|article|article-list)_[1-9]\d*$/.test(p.kid)) invalid('kid');
      return ack(p, '/x/v2/history/delete', {kid: p.kid});
    },
    reportProgress(p) {
      const when = Math.floor(num(p.time, NaN));
      if (!Number.isSafeInteger(when) || when < -1) invalid('time');
      const ids = {aid: reqId(p.aid, 'aid'), cid: reqId(p.cid, 'cid')};
      if (p.epId) return ack(p, '/x/click-interface/web/heartbeat', {...ids, type: 4, epid: reqId(p.epId, 'epId'),
        sid: reqId(p.seasonId, 'seasonId'), played_time: when});
      return ack(p, '/x/v2/history/report', {...ids, progress: when});
    },
  });

  function drmProtected(item) {
    return Boolean(item && (bool(item.is_drm) || num(item.drm_tech_type) > 0 || item.drm?.length || item.drm_kid));
  }
  function mediaAddresses(primary, alternatives) {
    const urls = [...new Set([primary, ...(Array.isArray(alternatives) ? alternatives : [])].map(https).filter(Boolean))];
    return {url: urls.shift() || '', backupUrls: urls};
  }
  function track(x) {
    const seg = x.SegmentBase || x.segment_base || x.segmentBase || {};
    return {id: num(x.id), ...mediaAddresses(x.baseUrl || x.base_url, x.backupUrl || x.backup_url),
      codec: text(x.codecs), mime: text(x.mimeType || x.mime_type), bandwidth: num(x.bandwidth), width: num(x.width),
      height: num(x.height), frameRate: text(x.frameRate || x.frame_rate), segmentBase: {
        initialization: text(seg.Initialization || seg.initialization), indexRange: text(seg.indexRange || seg.index_range)}};
  }
  function readableTracks(input) {
    return (input || []).filter(x => x && !drmProtected(x)).map(track).filter(x => x.url);
  }
  Object.assign(ops, {
    async play(p) {
      const target = p.epId ? {ep_id: reqId(p.epId, 'epId')} : {...videoId(p), cid: reqId(p.cid, 'cid')};
      const result = await get(p.epId ? '/pgc/player/web/playurl' : '/x/player/playurl', {...target, qn: p.qn ?? 80,
        fnval: p.format === 'progressive' ? 1 : 4048, fnver: 0, fourk: 1});
      const d = result?.video_info ?? result;
      if (!d || typeof d !== 'object') malformed('播放数据');
      if (drmProtected(d)) throw error('DRM_REQUIRED', '该内容要求平台授权的 DRM 播放器');
      const dash = d.dash || {};
      const video = readableTracks(dash.video);
      const audio = readableTracks([...(dash.audio || []), ...(dash.dolby?.audio || []), ...(dash.flac?.audio ? [dash.flac.audio] : [])]);
      const segments = (d.durl || []).filter(x => !drmProtected(x)).map(s => ({...mediaAddresses(s.url, s.backup_url),
        duration: num(s.length) / 1000, format: text(d.format)})).filter(x => x.url);
      if (!video.length && !segments.length) {
        if ((dash.video || []).some(drmProtected) || (d.durl || []).some(drmProtected)) throw error('DRM_REQUIRED', '该内容要求平台授权的 DRM 播放器');
        throw error('NO_STREAM', text(d.view_info?.dialog?.desc || d.message) || '平台未提供可播放的视频流');
      }
      const qualities = (d.accept_quality || []).map((id, i) => ({id: num(id), label: text(d.accept_description?.[i]) || String(id)}));
      return {quality: num(d.quality), format: text(d.format), duration: num(d.timelength) / 1000 || num(dash.duration),
        qualities, video, audio, segments, lastPlayTime: num(d.last_play_time) / 1000, lastPlayCid: id(d.last_play_cid || d.lastPlayCid),
        lastPlayEpId: id(d.last_play_epid || d.last_play_ep_id || d.lastPlayEpId), preview: bool(d.is_preview) === true};
    },
    async livePlay(p) {
      const d = await live('/xlive/web-room/v2/index/getRoomPlayInfo', {room_id: reqId(p.roomId, 'roomId'), qn: p.qn ?? 80,
        protocol: '0,1', format: '0,1,2', codec: '0,1', platform: 'web'});
      if (d?.live_status == null) malformed('开播状态');
      if (bool(d.is_locked) || bool(d.is_hidden) || (bool(d.encrypted) && !bool(d.pwd_verified))) throw error('ROOM_RESTRICTED', '该直播间限制访问');
      const play = d.playurl_info?.playurl;
      const streams = [], ids = new Set(), labels = new Map((play?.g_qn_desc || []).map(x => [num(x.qn), text(x.desc)]));
      for (const s of play?.stream || []) {
        for (const f of s.format || []) {
          for (const c of f.codec || []) {
            if (drmProtected(c) || !c.base_url) continue;
            const quality = num(c.current_qn);
            for (const qn of c.accept_qn || []) ids.add(num(qn));
            if (quality) ids.add(quality);
            for (const [index, i] of (c.url_info || []).entries()) {
              if (!i.host) continue;
              const url = https(i.host + c.base_url + (i.extra || ''));
              if (url) streams.push({url, quality, codec: text(c.codec_name), format: text(f.format_name),
                protocol: text(s.protocol_name), line: index + 1});
            }
          }
        }
      }
      const liveStatus = num(d.live_status);
      if (liveStatus !== 0 && !streams.length) throw error('NO_STREAM', '平台未提供当前直播线路');
      return {liveStatus, quality: streams[0]?.quality || 0, streams, qualities: [...ids].map(id => ({id, label: labels.get(id) || String(id)}))};
    },
    async danmaku(p) {
      const {body} = await transport(API, '/x/v1/dm/list.so', {oid: reqId(p.cid, 'cid')});
      if (typeof body !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(body)) malformed('弹幕 XML');
      const doc = new DOMParser().parseFromString(body, 'application/xml');
      if (doc.documentElement?.localName !== 'i' || doc.getElementsByTagName('parsererror').length) malformed('弹幕 XML');
      const items = [];
      for (const line of doc.getElementsByTagName('d')) {
        const [t, m, s, c] = (line.getAttribute('p') || '').split(',');
        const time = num(t, -1), mode = num(m), size = num(s), color = num(c, -1);
        if (time >= 0 && mode >= 1 && mode <= 6 && size > 0 && color >= 0 && color <= 16777215 && line.textContent) {
          items.push({time, mode, size, color, text: line.textContent});
        }
      }
      return {items: items.sort((a, b) => a.time - b.time)};
    },
    async liveChat(p) {
      const d = await live('/xlive/web-room/v1/dM/gethistory', {roomid: reqId(p.roomId, 'roomId')});
      return {items: array(d?.room, '直播消息').map(x => {
        const name = text(x.nickname), message = text(x.text), time = text(x.timeline);
        const key = x.id_str || x.id || [x.uid, time, message].join('|');
        return {id: String(key), text: message, name, time};
      }).filter(x => x.text)};
    },
  });
  window.BSApi = Object.freeze({
    async call(operation, p = {}) {
      if (typeof ops[operation] !== 'function') throw error('UNAVAILABLE', '没有此项数据服务');
      if (!p || typeof p !== 'object' || Array.isArray(p)) invalid('params');
      return await ops[operation](p);
    },
  });
})();

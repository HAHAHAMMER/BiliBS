// Personal pages share the V6 views, routing, and focus system. Only real sessions
// enter this branch. No account cookie, pairing key, or private list enters web storage.
if (bsOnline) {
  const api = (op, params = {}) => window.BSApi.call(op, params);
  const publicArt = value => window.BSDiscovery?.imageURL(value) || '';
  const faces = new Map();
  function register(item) {
    if(!item)return null;
    const record=window.BSDiscovery.register(item);
    if(item.face && item.mid) faces.set(String(item.mid),item.face);
    return record;
  }
  function faceIcon(name,face,cls) {
    const initial=Array.from(name||'用')[0];
    const art=face?paint('user-face',face,initial,'').replace('<img ', '<img style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" '):'';
    return '<i class="'+cls+'" style="position:relative;overflow:hidden">'+esc(initial)+art+'</i>';
  }
  const baseAvatar=avatar;
  avatar=function(id) {
    return faces.has(String(id)) ? faceIcon(C[id]?.[0],faces.get(String(id)),'avatar') : C[id] ? baseAvatar(id) : '<i class="avatar">U</i>';
  };
  const cache = new Map();
  const marks = new Map();
  const pendingWrites = new Set();
  const foldersById = new Map();
  let account = null, generation = 0, authAttempt = 0, authBusy = true, authError = '';
  let qrSession = null, qrNumber = 0;
  let redrawQueued = false, firstShelfFocus = null;
  const personalRoutes = new Set(['shelf','account','login','folders','folder','later','likes','follows','author','history','post']);
  signed = false;

  function redrawPersonal() {
    if (redrawQueued || overlay || document.hidden) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      const s = current();
      if (!overlay && (personalRoutes.has(s.name) || ['mine','feed'].includes(s.root))) {
        const previous = document.activeElement?.dataset.k;
        redraw(previous || s.focus);
      }
    });
  }
  function resetPrivate() {
    generation++;
    cache.clear(); marks.clear(); foldersById.clear(); pendingWrites.clear(); faces.clear();
    profile.follows = []; profile.likes = []; profile.later = [];
    profile.folders = Object.create(null); profile.cloud = Object.create(null);
    collection.anime = []; collection.drama = [];
    gallery.anime = 0; gallery.drama = 0;
  }
  function assignAccount(value,closingLogout=false) {
    const next = value?.loggedIn && value.mid ? value : null;
    const changed=String(next?.mid || '') !== String(account?.mid || '');
    const privateDialog=changed && account && !closingLogout ? overlay : null;
    if (changed) resetPrivate();
    account = next;
    signed = Boolean(next);
    if (changed) window.BSDiscovery?.accountChanged?.();
    if (privateDialog && overlay===privateDialog) {
      modal.replaceChildren();
      completeOverlay(()=>{if (current().type==='player')updateControls();else redraw(current().focus);});
    }
  }
  async function refreshAccount() {
    const n = ++authAttempt;
    authBusy = true; authError = '';
    try {
      const info = await api('nav');
      if (n !== authAttempt) return false;
      assignAccount(info);
      return Boolean(account);
    } catch (e) {
      if (n === authAttempt) { assignAccount(null); authError = e.message || '账户服务不可用'; }
      return false;
    } finally {
      if (n === authAttempt) { authBusy = false; redrawPersonal(); }
    }
  }
  function failSession(err) {
    if (Number(err?.code) === -101 && signed) {
      ++authAttempt; assignAccount(null); authBusy = false; authError = '';
      notice('登录已失效，请重新扫码'); redrawPersonal();
    }
  }
  function gate(label) {
    if (authBusy) return empty('正在检查登录状态…');
    if (authError) return '<div class="stateNote"><span>'+esc(authError)+'</span>'+b('auth-read','auth','authRetry','','重新检查账户','secondary')+'</div>'+loginGate(label);
    return loginGate(label);
  }
  function entryKey(op, params) { return JSON.stringify([op, params]); }
  function resource(op, params = {}) {
    const key = entryKey(op, params);
    let r = cache.get(key);
    if (!r) {
      r = {key,op,params,items:[],value:null,ready:false,more:null,busy:false,error:'',readBy:new WeakSet()};
      cache.set(key, r);
      request(r);
    }
    const ttl = op==='feed' || op==='history' ? 30000 : 120000;
    if (r.ready && !r.error && !r.busy && !r.readBy.has(current()) && Date.now()-r.fetched>ttl) request(r);
    r.readBy.add(current());
    return r;
  }
  async function request(r, append = false) {
    if (r.busy || (append && r.more == null)) return;
    const epoch = generation;
    const more = append ? r.more : null;
    r.busy = true; r.error = '';
    const params = {...r.params};
    if (more != null) params[r.op === 'feed' ? 'offset' : ['history','comments'].includes(r.op) ? 'cursor' : 'page'] = more;
    try {
      const result = await api(r.op, params);
      if (generation !== epoch || cache.get(r.key) !== r) return;
      const list = result?.items || [];
      const seen = new Set();
      r.items = (append ? r.items.concat(list) : list).filter(x => {
        const id = r.op==='history' ? JSON.stringify([x.kid,x.epId||x.cid||x.page]) : String(x.folderId || x.id || '');
        if (seen.has(id)) return false;
        seen.add(id); return true;
      });
      r.value = result;
      r.total = Number.isFinite(result?.total) ? result.total : undefined;
      r.more = result?.next ?? null;
      if (JSON.stringify(more) === JSON.stringify(r.more)) r.more = null;
      r.ready = true; r.fetched=Date.now();
      applyList(r);
    } catch (e) {
      if (generation === epoch && cache.get(r.key) === r) { r.error = e.message || '读取失败'; failSession(e); }
    } finally {
      r.busy = false;
      if (generation === epoch && cache.get(r.key) === r && r.readBy.has(current())) redrawPersonal();
    }
  }
  function mark(kind, id, value) {
    if (id == null || id === '' || typeof value !== 'boolean') return;
    id = String(id);
    marks.set(kind + '/' + id, value);
    const list = {like:profile.likes, later:profile.later, follow:profile.follows}[kind];
    if (list && list.includes(id) !== value) { if (value) list.push(id); else list.splice(list.indexOf(id), 1); }
  }
  function applyList(r) {
    if (r.op === 'folders') {
      for (const f of r.items) foldersById.set(String(f.folderId || f.id), f);
    } else if (r.op === 'shelf') {
      const ids = r.items.map(item=>register(item)?.id).filter(Boolean);
      collection[r.params.kind] = ids;
      for (const id of ids) mark('collect', id, true);
    } else if (['likes','follows','later'].includes(r.op)) {
      const kind = {likes:'like', follows:'follow', later:'later'}[r.op];
      for (const item of r.items) { const w = register(item); if (w) mark(kind, w.id, true); }
    }
  }
  function clearResources(...ops) {
    for (const [key,r] of cache) if (ops.includes(r.op)) cache.delete(key);
  }
  function status(r, moreLabel = '加载更多') {
    if (r.error) return '<div class="stateNote"><span>'+esc(r.error)+'</span>'+b('retry-'+r.op,'load','personalRetry',r.key,'重试','secondary')+'</div>';
    if (r.busy) return '<p class="submeta" role="status">正在读取…</p>';
    if (r.more != null) return b('more-'+r.op,'load','personalMore',r.key,esc(moreLabel),'secondary');
    return '';
  }
  const listCount = r => r?.ready ? (r.total ?? (r.more == null ? r.items.length : null)) : null;
  const cached = (op,params = {}) => cache.get(entryKey(op,params));
  function markValue(kind,id) { return marks.get(kind+'/'+String(id)); }

  const relationPromises = new Map();
  async function loadRelations({id, aid, mid, seasonId} = {}) {
    if (!signed) return;
    const w = W[id] || V[id];
    aid = aid || (w?.kind === 'video' ? w.aid : null);
    mid = mid || w?.mid || w?.author;
    seasonId = seasonId || w?.seasonId;
    const epoch = generation;
    const tasks = [];
    for (const [kind,target,field,result] of [['like',id,'aid','liked'],['follow',mid,'mid','following']]) {
      const param=field==='aid'?aid:mid;
      if (!target || !param || markValue(kind,target)!=null) continue;
      const key = JSON.stringify([epoch,kind,target,param]);
      let promise = relationPromises.get(key);
      if (!promise) {
        promise = api('relation',{[field]:param}).then(v=>{
          if (generation===epoch && markValue(kind,target)==null) mark(kind,target,v[result]);
        }).catch(e=>{if(generation===epoch)failSession(e);}).finally(()=>relationPromises.delete(key));
        relationPromises.set(key,promise);
      }
      tasks.push(promise);
    }
    if (seasonId && markValue('collect',id) == null) {
      if (typeof w?.following === 'boolean') mark('collect',id,w.following);
      else tasks.push(window.BSDiscovery.loadSeason(seasonId).then(detail=>{
        if (generation === epoch) mark('collect',id,detail?.following);
      }).catch(failSession));
    }
    await Promise.all(tasks);
  }
  function writeComplete(kind,id,w,on) {
    mark(kind,id,on);
    if (kind === 'collect' && w) {
      w.following = on;
      const list = collection[w.kind];
      if (list && on !== list.includes(id)) { if (on) list.unshift(id); else list.splice(list.indexOf(id),1); }
    }
    if (kind==='collect' || kind==='follow') window.BSDiscovery?.invalidate?.(kind==='collect'?'shelf':'liveRooms');
    clearResources(...({like:['likes'],later:['later'],follow:['follows','feed','author','authorLive'],collect:['shelf'],favorite:['folders','folder']}[kind] || []));
  }
  async function action(kind,{id,aid,mid,seasonId,enabled,folderId} = {}) {
    if (!signed) { needUser(); return false; }
    id = String(kind==='follow' ? (mid || id || '') : (id ?? seasonId ?? ''));
    const w = V[id] || W[id];
    const params = {userAction:true};
    const ops = {like:'like',later:'setLater',follow:'follow',collect:'setShelf',favorite:'setFavorite'};
    if (!ops[kind]) return false;
    if (kind === 'follow') params.mid = String(mid || id);
    else if (kind === 'collect') params.seasonId = String(seasonId || w?.seasonId || id);
    else params.aid = String(aid || w?.aid || '');
    const lockKey = kind+'/'+id+'/'+(folderId || ''), epoch = generation;
    if (pendingWrites.has(lockKey)) return false;
    pendingWrites.add(lockKey);
    try {
      if (['like','later','favorite'].includes(kind) && !params.aid && w?.bvid) {
        const detail=await api('video',{bvid:w.bvid});
        if(generation!==epoch)return false;
        register(detail);params.aid=detail.aid;
      }
      let previous = markValue(kind,id);
      if (typeof enabled !== 'boolean' && previous == null) {
        if (kind === 'later') {
          const r = await api('later');
          const present = r.items.some(x=>String(x.aid)===params.aid);
          if (present || r.next == null && (r.total==null || r.items.length>=r.total)) previous = present;
        } else {
          await loadRelations({id,aid:params.aid,mid:params.mid,seasonId:params.seasonId});
          previous = markValue(kind,id);
        }
        if (typeof previous !== 'boolean') throw new Error('暂时无法确认当前状态，请重试');
      }
      if (epoch !== generation) return false;
      const on = typeof enabled === 'boolean' ? enabled : !previous;
      if (kind === 'favorite') {
        if (!folderId) throw new Error('请选择收藏夹');
        params[on?'addIds':'removeIds'] = [String(folderId)];
      } else params.enabled = on;
      const result = await api(ops[kind],params);
      if (epoch !== generation) return false;
      if (!result?.ok) throw new Error('平台尚未确认操作');
      writeComplete(kind,id,w,on);
      notice(({like:on?'已点赞':'已取消点赞',later:on?'已加入稍后再看':'已移出稍后再看',follow:on?'已关注':'已取消关注',collect:on?'已加入片单':'已移出片单',favorite:on?'已加入收藏夹':'已移出收藏夹'})[kind]);
      return true;
    } catch (e) {
      if (epoch === generation) { failSession(e); notice(e.message || '操作失败，请重试'); }
      return false;
    } finally { if (epoch === generation) pendingWrites.delete(lockKey); }
  }

  // Encode an ASCII URL as a standard QR Model 2 symbol, byte mode, ECC-L.
  // Block layout and symbol placement follow ISO/IEC 18004. A four-module
  // quiet zone surrounds the symbol; rendering never sends the URL off device.
  function qrImage(url) {
    const bytes = new TextEncoder().encode(url);
    const ec = [0,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28];
    const blocks = [0,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8];
    const capacity = ver => {
      let n = (16*ver+128)*ver+64;
      if (ver >= 2) {
        const centers = Math.floor(ver/7)+2;
        n -= (25*centers-10)*centers-55;
        if (ver >= 7) n -= 36;
      }
      return Math.floor(n/8);
    };
    let v = 1;
    while (v<=20 && bytes.length + (v<10?2:3)>capacity(v)-ec[v]*blocks[v]) v++;
    if (v>20) throw new Error('授权链接过长，请换码');
    const bits = [];
    function put(number,len) { for (let i=len-1;i>=0;i--) bits.push((number>>>i)&1); }
    const raw = capacity(v), dataCount = raw - ec[v]*blocks[v];
    put(4,4); put(bytes.length,v<10?8:16);
    for (const byte of bytes) put(byte,8);
    put(0,Math.min(4,dataCount*8-bits.length));
    while (bits.length%8) bits.push(0);
    const data = [];
    for (let i=0;i<bits.length;i+=8) data.push(bits.slice(i,i+8).reduce((n,x)=>2*n+x,0));
    let padByte = 236;
    while (data.length<dataCount) { data.push(padByte); padByte ^= 253; }
    function multiply(x,y) {
      let z = 0;
      for (let i=7;i>=0;i--) { z = (z<<1)^((z>>>7)*285); z ^= ((y>>>i)&1)*x; }
      return z;
    }
    const deg = ec[v], poly = Array(deg).fill(0);
    poly[deg-1] = 1;
    let root = 1;
    for (let i=0;i<deg;i++) {
      for (let j=0;j<deg;j++) poly[j] = multiply(poly[j],root) ^ (poly[j+1]||0);
      root = multiply(root,2);
    }
    const groups = [], parity = [];
    let offset = 0;
    for (let i=0;i<blocks[v];i++) {
      const size = Math.floor(dataCount/blocks[v]) + (i>=blocks[v]-dataCount%blocks[v]?1:0);
      const part = data.slice(offset,offset+size), rem = Array(deg).fill(0);
      offset += size;
      for (const b of part) {
        const factor = b ^ rem.shift(); rem.push(0);
        for (let j=0;j<deg;j++) rem[j] ^= multiply(poly[j],factor);
      }
      groups.push(part); parity.push(rem);
    }
    const words = [];
    for (const group of [groups,parity]) {
      for (let col=0;col<group[group.length-1].length;col++)
        for (const row of group) if (col<row.length) words.push(row[col]);
    }
    const n = 17+4*v, matrix = Array.from({length:n},()=>Array(n).fill(null));
    function set(x,y,b) { if (x>=0&&x<n&&y>=0&&y<n) matrix[y][x]=Boolean(b); }
    for (let i=0;i<n;i++) { set(6,i,i%2===0); set(i,6,i%2===0); }
    for (const [x,y] of [[3,3],[n-4,3],[3,n-4]])
      for (let dy=-4;dy<=4;dy++) for (let dx=-4;dx<=4;dx++) {
        const d = Math.max(Math.abs(dx),Math.abs(dy)); set(x+dx,y+dy,d!==2 && d!==4);
      }
    if (v>=2) {
      const count=Math.floor(v/7)+2, step=Math.ceil((n-13)/(2*count-2))*2;
      const centers=[6];
      for (let i=0;i<count-1;i++) centers.splice(1,0,n-7-i*step);
      for (const x of centers) for (const y of centers) {
        if ((x===6&&y===6)||(x===6&&y===n-7)||(x===n-7&&y===6)) continue;
        for (let a=-2;a<=2;a++) for (let b=-2;b<=2;b++) set(x+a,y+b,Math.max(Math.abs(a),Math.abs(b))!==1);
      }
    }
    if (v>=7) {
      let remainder=v;
      for (let i=0;i<12;i++) remainder=(remainder<<1)^((remainder>>>11)*0x1f25);
      const version=v<<12|remainder;
      for (let i=0;i<18;i++) {const a=n-11+i%3,b=Math.floor(i/3);set(a,b,(version>>>i)&1);set(b,a,(version>>>i)&1);}
    }
    // ECC-L, mask pattern 0.
    const format=0x77c4, fmt=i=>(format>>>i)&1;
    for (let i=0;i<6;i++) set(8,i,fmt(i));
    set(8,7,fmt(6));set(8,8,fmt(7));set(7,8,fmt(8));
    for (let i=9;i<15;i++) set(14-i,8,fmt(i));
    for (let i=0;i<8;i++) set(n-1-i,8,fmt(i));
    for (let i=8;i<15;i++) set(8,n-15+i,fmt(i));
    set(8,n-8,true);
    let index=0, upward=true;
    for (let right=n-1;right>=1;right-=2) {
      if (right===6) right--;
      for (let j=0;j<n;j++) for (let dx=0;dx<2;dx++) {
        const x=right-dx,y=upward?n-1-j:j;
        if (matrix[y][x]!==null) continue;
        const bit=((words[index>>>3]||0)>>>(7-(index%8)))&1;
        matrix[y][x]=Boolean(bit ^ ((x+y)%2===0)); index++;
      }
      upward=!upward;
    }
    const paths=[];
    for (let y=0;y<n;y++) for (let x=0;x<n;x++) if (matrix[y][x]) paths.push('M'+(x+4)+' '+(y+4)+'h1v1h-1z');
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(n+8)+' '+(n+8)+'" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="'+paths.join('')+'"/></svg>');
  }

  function cancelQr(revoke=true) {
    if (!qrSession) return;
    clearTimeout(qrSession.timer); qrSession = null;
    if (revoke) window.BSTransport?.cancelQr?.()?.catch(()=>{});
  }
  const activeQr = q => q === qrSession && current() === q.route && !document.hidden;
  function qrMessage(q) {
    return {loading:'正在获取二维码…',waiting:'等待扫码',scanned:'已扫码，请在手机上确认',confirmed:'正在验证账户…',expired:'二维码已过期，请换码',error:q.error}[q.state] || '';
  }
  function updateQrText(q) {
    if (!activeQr(q)) return;
    const counter = $('pair-status');
    if (counter) counter.textContent = qrMessage(q) + (['waiting','scanned'].includes(q.state)?'　·　剩余 '+clock(Math.max(0,Math.ceil((q.until-Date.now())/1000))):'');
  }
  function expireQr(q) {
    if(!activeQr(q) || q.state==='expired')return;
    q.state='expired';clearTimeout(q.timer);
    window.BSTransport?.cancelQr?.()?.catch(()=>{}); redrawPersonal();
  }
  async function pollQr(q) {
    if (!activeQr(q)) return;
    if (Date.now() >= q.until) {
      expireQr(q); return;
    }
    try {
      const result = await api('qrPoll',{key:q.key});
      if (!activeQr(q)) return;
      if(q.state==='expired' || Date.now()>=q.until){expireQr(q);return;}
      if (!['waiting','scanned','expired','confirmed'].includes(result?.state)) throw new Error('无法识别授权状态');
      q.state=result.state; updateQrText(q);
      if (q.state==='confirmed') {
        // Verify the cookie jar with nav. A QR state alone is never a signed-in identity.
        const n=++authAttempt, value=await api('nav');
        if (!activeQr(q) || n!==authAttempt) return;
        if (!value?.loggedIn || !value.mid) throw new Error('未取得有效账户，请重新扫码');
        assignAccount(value); authError=''; authBusy=false;
        const route=q.route;
        cancelQr(); notice('已登录 '+String(value.name || '哔哩哔哩'));
        if (route.returnTarget) {
          pages[pages.length-1]={type:'page',name:route.returnTarget.name,...route.returnTarget.props,scroll:0};
          stamp(); render();
        } else if (pages.length>1) history.back();
        else rootTo('mine');
        return;
      }
      if (q.state==='expired') { redrawPersonal(); return; }
      q.timer=setTimeout(()=>pollQr(q),2200);
    } catch (e) {
      if (activeQr(q)) { q.state='error';q.error=e.message || '授权状态读取失败';redrawPersonal(); }
    }
  }
  function beginQr(route) {
    cancelQr(false);
    const q=qrSession={route,number:++qrNumber,state:'loading',error:'',image:'',timer:0};
    api('qrGenerate').then(result=>{
      if (!activeQr(q)) return;
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !['account.bilibili.com','passport.bilibili.com','passport.biligame.com'].includes(url.hostname) || !result.key)
        throw new Error('授权服务未返回有效的官方链接');
      q.image=qrImage(url.href); q.key=result.key;
      q.until=Date.now()+1000*(Number(result.expiresIn)>0?Number(result.expiresIn):180);
      q.state='waiting'; redrawPersonal();
      q.timer=setTimeout(()=>pollQr(q),1500);
    }).catch(e=>{
      if (activeQr(q)) { q.state='error';q.error=e.message || '二维码获取失败';redrawPersonal(); }
    });
  }
  loginScreen = function(s) {
    if (authBusy) return wrap(top('扫码登录')+empty('正在检查登录状态…'));
    if (signed) {
      if(s.returnTarget)queueMicrotask(()=>{
        if(current()!==s || !signed)return;
        pages[pages.length-1]={type:'page',name:s.returnTarget.name,...s.returnTarget.props,scroll:0};stamp();render();
      });
      return accountScreen();
    }
    if (!qrSession || qrSession.route!==s) beginQr(s);
    const q=qrSession, ready=['waiting','scanned','confirmed'].includes(q.state);
    const image=ready&&q.image?'<img alt="哔哩哔哩扫码登录二维码" src="'+esc(q.image)+'">':'<div style="width:252px;height:252px;display:grid;place-items:center">'+esc(q.state==='loading'?'正在取码':'请换码')+'</div>';
    return wrap(top('扫码登录')+'<div class="pairBox"><div class="pairArt">'+image+'</div><article><div class="tag">哔哩哔哩账号授权</div><h2>在手机上确认登录</h2><p>打开哔哩哔哩客户端，用扫一扫扫描左侧二维码。</p><p id="pair-status" role="status">'+esc(qrMessage(q))+'</p>'+b('pair-renew','pair','onlineRenew','','换一个码','secondary')+'</article></div>');
  };
  setInterval(()=>{const q=qrSession;if(q && activeQr(q) && ['waiting','scanned'].includes(q.state)){if(Date.now()>=q.until){expireQr(q);}else updateQrText(q);}},1000);
  addEventListener('pagehide',cancelQr);
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) { cancelQr(); return; }
    if (current().name==='login' && !signed) redrawPersonal();
    else refreshAccount();
  });

  accountScreen = function() {
    const who = signed ? account.name || '哔哩哔哩用户' : '游客模式';
    return wrap(top('账户')+'<div class="accountPanel">'+faceIcon(signed?who:'客',account?.face,'profileIcon')+'<h2>'+esc(who)+'</h2><p>'+esc(signed?'UID '+account.mid:'可以搜索、浏览和播放，也可以查看本机观看历史。')+'</p>'+b('account-action','account','accountAct','',signed?'退出账号':'扫码登录','secondary')+'</div>');
  };
  confirms.logout = ['退出当前账号？','退出后仍可查看本机观看记录。再次扫码可打开账号的片单。','退出账号'];
  let continueItem=null;
  function recentContinue() {
    const local=recentItems().map(({w,p,ep})=>({...p,w,ep}));
    const cloud=signed?(cached('history')?.items||[]).map(histRecord).filter(Boolean):[];
    const seen=new Set();
    for(const p of local.concat(cloud).sort(validDates)) {
      if(p.w.kind==='live')continue;
      const key=[p.w.id,p.epId||p.cid||p.ep||0].join('/');
      if(seen.has(key))continue;
      seen.add(key);
      if(!p.done && p.t>0)return p;
    }
    return null;
  }
  mineScreen = function() {
    const counts={history:recentItems().length};
    if(signed){
      for(const op of ['folders','later','likes','follows']) counts[op]=listCount(resource(op));
      for(const kind of ['anime','drama']) resource('shelf',{kind});
      resource('history');
    }
    const who=signed?(account.name||'哔哩哔哩用户'):'登录账号';
    const accountCard=b('my-account','side0','page',signed?'account':'login',
      faceIcon(signed?who:'入',account?.face,'accountAvatar')+'<strong>'+esc(who)+'</strong><small>'+(signed?'管理账户　›':'扫码登录　›')+'</small>','accountBlock');
    const tools=[['settings','设置'],['about','关于 BiliBS'],['guide','使用指南']].map(([id,label],i)=>
      b('mine-'+id,'side'+(i+1),'page',id,label+' <span>›</span>','sideOption')).join('');
    const units={history:' 条',folders:' 个',later:' 个',likes:' 个',follows:' 位'};
    const items=mineItems.filter(([k])=>Object.hasOwn(units,k)).map(([key,label],i)=>
      b('mine-'+key,'mytools'+Math.floor(i/3),'mineGo',key,tinyMark(key)+'<span>'+esc(label)+'</span><small>'+
        (counts[key]==null?'›':esc(counts[key]+units[key]))+'</small>','menuCard')).join('');
    continueItem=recentContinue();
    const h=continueItem, resume=h?group('继续观看',b('my-resume','resume','mineResume','',
      paint('resume',h.w.still||h.w.wide||h.w.cover,h.w.title,'resArt')+'<strong>'+esc(h.w.title)+'</strong><span>'+esc(h.part||whichEpisode(h.w,h.ep))+'　'+clock(h.t)+(h.d?' / '+clock(h.d):'')+'</span><i class="playIcon"></i>','continueLine')):'';
    return wrap('<div class="personalDesk"><aside class="personalSide">'+accountCard+'<div class="systemLinks">'+tools+'</div></aside><section class="personalLibrary">'+top('我的片库')+'<div class="libraryPair">'+libraryEntry('anime')+libraryEntry('drama')+'</div>'+group('片库管理','<div class="menuGrid mytools">'+items+'</div>')+resume+'</section></div>');
  };
  const localEntry=libraryEntry;
  libraryEntry = function(mode) {
    const r=cached('shelf',{kind:mode}),count=listCount(r);
    const markup=localEntry(mode);
    return signed?markup.replace(/<small>\d+ 部作品<\/small>/,'<small>'+esc(count==null?(r?.ready?'已获取 '+r.items.length+' 部':'我的片单'):count+' 部作品')+'</small>'):markup;
  };

  // Restore the public media metadata needed to replay a local history row after restart.
  function restoreHistory() {
    if (!window.BSDiscovery) return;
    for (const p of Object.values(progress)) if (p?.w && !V[p.w.id] && !W[p.w.id]) register(p.w);
  }
  function histRecord(item) {
    const id=String(item.bvid||item.seasonId||item.id);
    const w=(item.seasonId ? W[String(item.seasonId)] : item.kind==='video' ? V[id] : null) || register(item);
    if(!w)return null;
    const season=!!w.seasonId,ep=Number(item.page) || (season?1:0);
    return {id:w.id,w,ep,part:item.partTitle||item.part||'',epId:item.epId || null,cid:item.cid || null,t:Math.max(0,Number(item.progress)||0),d:Number(item.duration)||0,
      done:Number(item.progress)===-1 || Number(item.duration)>0&&Number(item.progress)>=Number(item.duration),recent:Number(item.viewAt)*1000||0};
  }
  function validDates(a,b) { return (Number(b.recent)||0)-(Number(a.recent)||0); }
  const localShelfRecord=shelfRecord;
  shelfRecord = function(w) {
    if(!w)return {ep:1,at:0,preview:0,label:'尚未观看'};
    const rows=Object.entries(progress).filter(([k])=>k.slice(0,k.lastIndexOf(':'))===String(w.id)).map(([k,p])=>({...p,ep:Number(p.ep??k.slice(k.lastIndexOf(':')+1))}));
    for (const item of cached('history')?.items || []) {
      if(String(item.seasonId)===String(w.seasonId || w.id)) {const row=histRecord(item);if(row)rows.push(row);}
    }
    const last=rows.sort(validDates)[0];
    if(!last && w.resume?.epId) {
      const ep=(w.episodes?.findIndex(x=>String(x.epId)===String(w.resume.epId))??-1)+1;
      const at=Math.max(0,Number(w.resume.time)||0);
      return {ep:ep||1,epId:w.resume.epId,at,preview:Math.max(0,at-5),label:[w.resume.label,w.resume.time===-1?'已看完':clock(at)].filter(Boolean).join(' · ')};
    }
    if(!last)return {...localShelfRecord(w),ep:1,at:0,preview:0,label:'尚未观看'};
    const ep=(last.epId && w.episodes?.findIndex(x=>String(x.epId)===String(last.epId))+1) || Math.max(1,Number(last.ep)||1);
    const at=last.done ? 0 : Math.max(0,Number(last.t)||0);
    return {ep,at,preview:Math.max(0,at-5),epId:last.epId,cid:last.cid,next:ep<w.count?ep+1:0,
      label:(ep?epname(w,ep)+' · ':'')+(last.done?'已看完':clock(at))};
  };
  async function playRecord(w,rec,fromStart=false,fromShelf=false) {
    const origin=current();let epId=rec.epId;
    let ep=Number(rec.ep)||0;
    try {
      let item=w;
      if(w.seasonId) {
        const detailed=await window.BSDiscovery.loadSeason(w.seasonId);
        if(current()!==origin)return;
        if(!detailed?.episodes?.length)throw new Error('平台未返回可播放分集');
        item=detailed;
        if(fromShelf){rec=shelfRecord(item);ep=rec.ep;epId=rec.epId;}
        if(epId || rec.cid) {
          const i=item.episodes.findIndex(x=>epId?String(x.epId)===String(epId):String(x.cid)===String(rec.cid));
          if(i<0)throw new Error('原观看分集目前不可用');
          ep=i+1;
        } else ep=Math.max(1,ep);
      }
      if(item.kind==='live'){if(current()===origin)dispatch({dataset:{act:'room',id:item.id}});return;}
      if(current()===origin)startWatch(item.id,ep,{at:fromStart||rec.done?0:Number(rec.at??rec.t)||0,...(epId?{epId}:{}),...(rec.cid?{cid:rec.cid}:{})});
    } catch(e){if(current()===origin)notice(e.message||'无法读取播放项目');}
  }
  const sampleHistory=historyScreen;
  historyScreen=function(s){
    if(s.origin!=='cloud') {restoreHistory();return sampleHistory(s);}
    const r=signed?resource('history'):null;
    const title=top('观看历史',r?.items.length?actionLink('clear-history','title','confirm','clear-history','清空记录'):'')+subTabs([['local','本机记录'],['cloud','云端记录']],'cloud','historyOrigin','historyOrigin');
    if(!signed)return wrap(title+gate('登录查看云端记录'));
    let day='';
    const rows=r.items.map((item,i)=>{
      const p=histRecord(item);if(!p)return '';
      const date=timeDay(p.recent),head=day===date?'':'<h2 class="day">'+esc(date)+'</h2>';day=date;
      return head+'<div class="histRow">'+paint('history',publicArt(p.w.wide||p.w.cover),p.w.title,'histArt')+'<div class="histMeta"><strong>'+esc(p.w.title)+'</strong><span>'+esc([item.epId?'分集 '+(item.partTitle||item.epId):p.ep?'P'+p.ep:'',p.done?'已看完':clock(p.t)+(p.d?' / '+clock(p.d):'')].filter(Boolean).join(' · '))+'</span>'+lineProgress(p)+'</div>'+b('cloud-'+i,'hist'+i,'cloudResume',i,p.done?'重播':'继续','secondary')+(p.done?'':b('cloud-start-'+i,'hist'+i,'cloudRestart',i,'从头播','textBtn'))+'</div>';
    }).join('');
    return wrap(title+(rows?'<div class="histList">'+rows+'</div>':r.ready?empty('暂无云端观看记录'):'')+status(r));
  };
  const frozenShelf=shelf;
  const localStep=stepGallery;
  stepGallery=function(delta) {
    const s=current();
    const list=collection[s.filter] || [], next=(gallery[s.filter] || 0)+delta;
    const r=cached('shelf',{kind:s.filter});
    if (s.name==='shelf' && next>=list.length && r?.more!=null) {
      if(r.error){focus('retry-shelf');return;}
      const first=list.length;
      if(!r.busy) request(r,true).then(()=>{
        if(current()===s && !overlay && collection[s.filter].length>first){
          gallery[s.filter]=Math.min(next,collection[s.filter].length-1);
          redraw('s-'+collection[s.filter][gallery[s.filter]]);
        }
      });
      return;
    }
    return localStep(delta);
  };
  function signedShelf(s) {
    if(!signed) return wrap(top('追看片单')+gate('登录查看片单'));
    s.filter=s.filter==='drama'?'drama':'anime';
    const r=resource('shelf',{kind:s.filter});
    if(!r.ready && !s.focus)firstShelfFocus={route:s,mode:s.filter};
    resource('history');
    let html=frozenShelf();
    if(!r.ready) html=html.replace(/<div class="empty">[\s\S]*?<\/div>/,'');
    const canLoad=Math.floor(gallery[s.filter]/shelfPageSize)>=Math.floor(Math.max(0,r.items.length-1)/shelfPageSize);
    if(r.error || r.busy || canLoad&&r.more!=null) html=html.replace(/<\/div>$/,status(r,'读取下一批作品')+'</div>');
    return html;
  }
  function syncShelfFocus() {
    if(current().name!=='shelf')return;
    const cell=document.activeElement?.closest('.shelfCell');
    if(cell){updateGallery(cell.dataset.work);return;}
    stopShelfPreview();
    for(const row of view.querySelectorAll('.denseRow')){
      row.style.gridTemplateColumns=shelfTracks(-1);
      for(const item of row.children){
        item.classList.remove('expanded');
        item.querySelector('.coverKey')?.setAttribute('aria-pressed','false');
      }
    }
  }
  document.addEventListener('focusin',syncShelfFocus);
  libraryPage=function(s) {
    const name=s.name,title=name==='folder'?(foldersById.get(String(s.folder))?.title||'收藏夹'):labels[name];
    if(!signed)return wrap(top(title)+gate('登录查看'+title));
    if(name==='folder'){
      const owned=resource('folders');
      if(!owned.ready)return wrap(top('收藏夹')+status(owned));
      if(!owned.items.some(f=>String(f.folderId)===String(s.folder)))return wrap(top('收藏夹')+empty('当前账号没有这个收藏夹'));
    }
    const r=resource(name,name==='folder'?{folderId:s.folder}:{});
    const count=listCount(r);
    const create=name==='folders'?actionLink('new-folder','title','newFolder','','＋ 新建收藏夹'):'';
    const heading=top(title,create||(count!=null?'<span class="submeta">'+count+(name==='follows'?' 位 UP 主':' 个视频')+'</span>':''));
    let body='';
    if(name==='folders'){
      body='<div class="folderGrid">'+r.items.map((f,i)=>b('folder-'+f.folderId,'folders'+Math.floor(i/3),'onlineFolder',f.folderId,'<span class="folderMontage">'+(f.cover?paint('folder',publicArt(f.cover),f.title,'folderPic'):'')+'</span><strong>'+esc(f.title)+'</strong><small>'+esc(f.count??0)+' 个视频</small>','folderCard')).join('')+'</div>';
    }else if(name==='follows'){
      body=r.items.length?authorList(r.items.map(item=>register(item)?.id).filter(Boolean)):'';
    }else{
      const list=r.items.map(register).filter(Boolean);
      if(name==='later')body='<div class="watchQueue">'+list.map((w,i)=>'<div class="queueRow">'+b('media-'+w.id,'queue'+i,'play',w.id,'<em>'+pad(i+1)+'</em>'+paint('queue',publicArt(w.wide||w.cover),w.title,'quickArt')+'<span><strong>'+esc(w.title)+'</strong><small>'+esc(w.artist)+'　·　'+clock(w.duration)+'</small></span>','queuePlay')+b('later-menu-'+w.id,'queue'+i,'videoMenu',w.id,'•••','textBtn','aria-label="更多操作"')+'</div>').join('')+'</div>';
      else body=tileList(list,'media',4,{menu:name!=='likes'});
    }
    if(!r.items.length && r.ready)body=empty('这里暂时没有'+({folders:'收藏夹',follows:'关注的 UP 主',likes:'点赞的视频'}[name]||'视频'));
    return wrap(heading+body+status(r));
  };

  function byline(p) {
    if (p.mid) register({kind:'author',mid:p.mid,title:p.artist,face:p.face});
    return (p.mid && C[p.mid]?avatar(p.mid):'')+esc(p.artist||'');
  }
  function feedCard(p,i) {
    const target=p.target?register(p.target):null;
    const action=p.postType==='video' && target?.kind==='video'?'play':p.postType==='live'&&target?.kind==='live'?'room':'post';
    const image=p.images?.[0]||target?.wide||target?.cover||p.cover;
    const kind={video:'视频',live:'直播',article:'专栏',forward:'转发',image:'图文',text:'动态'}[p.postType]||'动态';
    const date=Number(p.published)>0 ? new Date(Number(p.published)*1000).toLocaleDateString('zh-CN'):'';
    const title=p.title||p.desc||target?.title||kind;
    return b('post-'+p.id,'journal'+Math.floor(i/4),action,action==='post'?p.id:target.id,paint('dynamic',publicArt(image),title,'feedArt')+'<span class="feedType">'+esc(kind)+'</span><strong>'+esc(title)+'</strong><span class="feedBy">'+byline(p)+'<small>'+esc(date)+'</small></span>','feedCard');
  }
  function feedItems(items,filter,mid) {
    return items.filter(p=>(!mid||String(p.mid)===String(mid)) && (filter==='all'||filter==='post'&&!['video','live'].includes(p.postType)||filter==='video'&&p.postType==='video'||filter==='room'&&p.postType==='live'));
  }
  feedScreen=function(s) {
    if(!signed)return wrap(top('关注动态')+gate('登录查看动态'));
    const authors=resource('follows');
    let selected=s.creator&&s.creator!=='all'?s.creator:'';
    if(selected && authors.ready && !authors.more && !authors.items.some(x=>String(x.mid)===String(selected))) {
      selected='';s.creator='all';
    }
    const r=resource('feed',{...(selected?{mid:selected}:{}),...(s.filter==='video'?{type:'video'}:{})});
    const chips=[['all','全部'],...authors.items.map(a=>{const c=register(a);return c?[c.id,c.title]:null;}).filter(Boolean)].map(([id,label])=>b('creator-'+id,'authors','feedCreator',id,(id==='all'?'':avatar(id))+esc(label),'creatorChip','aria-selected="'+(id===(selected||'all'))+'"')).join('');
    const strip='<div class="authorStrip hStrip">'+b('all-follows','authors','private','follows','全部关注　›','manageChip')+chips+'</div>';
    const filtered=feedItems(r.items,s.filter||'all',selected);
    return wrap(top('关注动态')+strip+(authors.error?status(authors):'')+subTabs([['all','全部动态'],['video','视频投稿'],['post','图文'],['room','正在直播']],s.filter,'feedTab')+(filtered.length?'<div class="feedGrid">'+filtered.map(feedCard).join('')+'</div>':r.ready?empty('这批动态中没有符合条件的内容'):'')+status(r));
  };
  function authorRooms(items) {
    return '<div class="roomGrid">'+items.map((item,i)=>{
      const r=register(item); if(!r)return '';
      return b('room-'+r.id,'rooms'+Math.floor(i/3),'room',r.id,paint('room',publicArt(r.cover||r.wide),r.title,'thumb')+'<span class="roomBody"><small class="onAir '+(r.on?'':'off')+'"><i></i>'+esc(r.on===null?'直播间':r.on?'直播中':'未开播')+'</small><strong>'+esc(r.title)+'</strong><small>'+esc(r.artist)+'</small></span>','roomCard');
    }).join('')+'</div>';
  }
  authorScreen=function(s) {
    const mid=String(s.id),card=resource('author',{mid}),author=card.value?register(card.value):null;
    if(author && signed && markValue('follow',mid)==null) mark('follow',mid,author.following);
    s.tab||='video';
    const r=resource(({video:'authorVideos',post:'feed',live:'authorLive'})[s.tab]||'authorVideos',{mid});
    const display=author?.title||C[mid]?.[0]||'UP 主空间';
    const header='<div class="profileBar">'+(C[mid]?avatar(mid):'<i class="avatar">U</i>')+'<div><h1>'+esc(display)+'</h1><small>'+esc(author?.desc||'')+'</small></div>'+b('follow-toggle','authorHead','follow',mid,markValue('follow',mid)?'✓ 已关注':'＋ 关注','secondary')+'</div>';
    let body='';
    if(r.items.length){
      if(s.tab==='video')body=tileList(r.items.map(register).filter(Boolean),'uploads');
      else if(s.tab==='live')body=authorRooms(r.items);
      else body='<div class="feedGrid">'+r.items.map(feedCard).join('')+'</div>';
    } else if(r.ready)body=empty(s.tab==='live'?'暂无直播间':'暂无内容');
    return wrap(header+(card.error?status(card):'')+subTabs([['video','投稿'],['post','动态'],['live','直播间']],s.tab,'authorTab','authorTab')+body+status(r));
  };
  function postScreen(s) {
    const r=resource('post',{id:s.id}),p=r.value;
    if(!p)return wrap(status(r));
    function article(post) {
      const target=post.target?register(post.target):null;
      const images=(post.images || []).filter(x=>publicArt(x)).map((x,i)=>'<figure tabindex="0" data-k="post-image-'+post.id+'-'+i+'" data-row="postImage'+post.id+'-'+i+'">'+paint('post',publicArt(x),'动态图片','postPicture')+'</figure>').join('');
      const date=post.published?new Date(post.published*1000).toLocaleString('zh-CN',{hour12:false}):'';
      return '<header class="postByline">'+(post.mid?b('post-author-'+post.id,'postAuthor'+post.id,'author',post.mid,byline(post),'creatorChip'):'')+'<time>'+esc(date)+'</time></header>'+
        (post.title&&post.title!==post.desc?'<h2>'+esc(post.title)+'</h2>':'')+
        '<div class="postCopy" tabindex="0" data-k="post-body-'+post.id+'" data-row="postBody'+post.id+'"><p>'+esc(post.desc||'')+'</p></div>'+
        (images?'<div class="postPictures">'+images+'</div>':'')+
        (target?b('post-open-'+post.id,'postTarget'+post.id,'live'===target.kind?'room':target.kind==='video'?'play':'item',target.id,paint('post-target',publicArt(target.wide||target.cover),target.title,'postTargetArt')+'<strong>'+esc(target.title||'打开相关内容')+'</strong>','postTarget'):'');
    }
    const params={oid:p.commentId,type:p.commentType};
    const comments=p.commentId&&p.commentType?resource('comments',params):null;
    function comment(c,index,nested=false) {
      const date=c.published?new Date(c.published*1000).toLocaleDateString('zh-CN'):'';
      const images=(c.images || []).map(url=>paint('comment',publicArt(url),'评论图片','replyPicture')).join('');
      const text='<div class="replyAuthor">'+faceIcon(c.author,publicArt(c.face),'avatar')+'<strong>'+esc(c.author||'用户')+'</strong></div><p>'+esc(c.message)+'</p>'+images+'<small>'+esc([date,c.likes?c.likes+' 赞':''].filter(Boolean).join(' · '))+'</small>';
      let children='';
      if(!nested && c.count){
        const opened=s.commentRoot===c.id;
        const replies=opened?resource('commentReplies',{...params,root:c.id}):null;
        const list=opened?replies.items:c.replies || [];
        children='<div class="replyChildren">'+list.map((x,i)=>comment(x,i,true)).join('')+
          (replies?status(replies,'更多回复'):'')+b('thread-'+c.id,'commentThread'+index,'commentThread',c.id,opened?'收起回复':'查看 '+c.count+' 条回复','textBtn')+'</div>';
      }
      return '<article class="replyCard'+(nested?' nested':'')+'"><div tabindex="0" data-k="reply-'+c.id+'" data-row="'+(nested?'nestedReply':'reply')+c.id+'">'+text+'</div>'+children+'</article>';
    }
    const count=comments?.total??p.commentCount;
    const body=comments?comments.items.map((c,i)=>comment(c,i)).join('')+(comments.ready&&!comments.items.length?empty('暂无评论'):'')+status(comments,'更多评论'):empty('该动态暂未提供评论区');
    return wrap('<div class="postLayout" data-post="'+esc(s.id)+'"><article class="postStory">'+article(p)+(p.original?'<blockquote>'+article(p.original)+'</blockquote>':'')+'</article><aside class="postComments"><h2>评论'+(count?' <small>'+esc(count)+'</small>':'')+'</h2>'+body+'</aside></div>');
  }
  const baseSubpage=subPage;
  subPage=function(s){
    if(s.name==='post')return postScreen(s);
    if(s.name==='shelf')return signedShelf(s);
    return baseSubpage(s);
  };
  const baseRender=render;
  render=function(){
    const s=current();
    const reading=s.name==='post' && view.querySelector('.postLayout')?.dataset.post===String(s.id)
      ? new Map([...view.querySelectorAll('.postCopy,.replyCard>[data-k]')].map(n=>[n.dataset.k,n.scrollTop])):null;
    if(qrSession && qrSession.route!==s)cancelQr();
    const result=baseRender();
    if(reading)for(const node of view.querySelectorAll('.postCopy,.replyCard>[data-k]')){
      if(reading.has(node.dataset.k))node.scrollTop=reading.get(node.dataset.k);
    }
    return result;
  };
  const baseAfter=afterRender;
  afterRender=function(s) {
    if (qrSession && s!==qrSession.route) cancelQr();
    baseAfter(s);
    if(s.name==='shelf')syncShelfFocus();
    if(firstShelfFocus) {
      const f=firstShelfFocus;
      if(s!==f.route || s.filter!==f.mode) firstShelfFocus=null;
      else if(cached('shelf',{kind:f.mode})?.ready){
        firstShelfFocus=null;
        if(document.activeElement?.dataset.k==='shelfTab-'+f.mode && collection[f.mode].length)focus('s-'+collection[f.mode][gallery[f.mode]]);
      }
    }
    if(s.root==='mine')$('footContext').textContent=signed?'当前账号 · '+(account.name||account.mid):'游客模式';
    if(s.name==='login' && qrSession)updateQrText(qrSession);
  };

  async function loadFolderPicker(o) {
    const epoch=generation;
    o.fetching=true; o.error='';
    try {
      let aid=V[o.id]?.aid;
      if(!aid && V[o.id]?.bvid){const detail=await api('video',{bvid:V[o.id].bvid});if(generation!==epoch||overlay!==o)return;aid=register(detail)?.aid;}
      if(!aid)throw new Error('缺少视频编号');
      const result=await api('folders',{aid});
      if(epoch!==generation||overlay!==o)return;
      o.choices=result.items;
    } catch(e){if(epoch===generation&&overlay===o){o.error=e.message||'读取收藏夹失败';failSession(e);}}
    finally {o.fetching=false;if(overlay===o)drawOverlay();}
  }
  mediaActions=function(v) {
    const id=v.id,mid=v.mid||v.author;
    return [
      mid?op('m-author','m0','author',mid,'进入 '+(C[mid]?.[0]||'UP 主')+' 的空间'):'',
      op('m-like','m1','mediaLike',id,markValue('like',id)?'取消点赞':'点赞'),
      op('m-save','m2','saveFolder',id,'存入收藏夹'),
      op('m-later','m3','mediaLater',id,markValue('later',id)?'移出稍后再看':'加入稍后再看'),
      mid?op('m-follow','m4','follow',mid,markValue('follow',mid)?'取消关注 UP 主':'关注 UP 主'):''
    ].join('');
  };
  const baseDrawOverlay=drawOverlay;
  drawOverlay=function(target){
    const o=overlay;
    if(o?.kind==='videoMenu' && signed && !o.loadedRelations) {
      o.loadedRelations=true;
      const id=o.id;
      Promise.all([loadRelations({id}), (async()=>{
        const epoch=generation;
        try{
          if(markValue('later',id)!=null)return;
          const list=await api('later');
          if(epoch!==generation)return;
          const found=list.items.some(x=>String(x.id)===String(id)||x.aid&&String(x.aid)===String(V[id]?.aid));
          if(found||list.next==null && (list.total==null || list.items.length>=list.total))mark('later',id,found);
        }catch(e){failSession(e);}
      })()]).then(()=>{if(overlay===o)baseDrawOverlay(document.activeElement?.dataset.k);});
    }
    if(o?.kind!=='onlineFolders')return baseDrawOverlay(target);
    modal.dataset.transport=current().type==='player'?'on':'off';modal.dataset.mode='folders';modal.dataset.kind='folders';
    const rows=o.choices?.map((f,i)=>{
      const on=f.selected===true,known=typeof f.selected==='boolean';
      return b('mf-'+f.folderId,'mf'+i,'onlinePutFolder',f.folderId,esc((on?'✓　':'＋　')+f.title),'op'+(on?' chosen':''),known?'aria-pressed="'+on+'"':'disabled');
    }).join('');
    const message=o.error||(!o.choices?'正在读取收藏夹…':o.choices.length?'':'还没有收藏夹');
    const body=(message?'<p role="status">'+esc(message)+'</p>':'')+(rows||'')+(o.error?op('folder-retry','retry','onlineFolderRetry','','重试'):'')+op('folder-close','bottom','dismiss','','关闭');
    modal.innerHTML=drawer('存入收藏夹',V[o.id]?.title||'',body);
    const n=(target?node(target):null)||modal.querySelector('button[data-k]:not(:disabled)');
    n?.focus({preventScroll:true});
    if(!o.fetching && !o.choices && !o.error)loadFolderPicker(o);
  };
  async function finalizeAction(kind,options) {
    const origin=current(),originalOverlay=overlay;
    if(await action(kind,options) && current()===origin && overlay===originalOverlay) {
      if(overlay)completeOverlay(updateBehind);else updateBehind();
    }
  }
  async function guardedWrite(op,params,whenDone) {
    const epoch=generation,oldOverlay=overlay;
    if(!signed){needUser();return;}
    if(pendingWrites.has(op))return;
    pendingWrites.add(op);
    try {
      const result=await api(op,{...params,userAction:true});
      if(epoch!==generation)return;
      if(!result || (op==='createFolder'?!result.id&&!result.folderId:result.ok!==true))throw new Error('平台尚未确认操作');
      // An acknowledged backend mutation must invalidate even if its dialog was closed.
      whenDone(result,oldOverlay===overlay);
    }catch(e){if(epoch===generation){failSession(e);notice(e.message||'操作失败');}}
    finally {if(epoch===generation)pendingWrites.delete(op);}
  }
  const baseDispatch=revisedDispatch;
  const personalArrow=revisedArrow;
  revisedArrow=function(s,el,key) {
    if(s.name==='post'){
      if(['ArrowDown','ArrowUp'].includes(key) && el.matches('.postCopy,.replyCard>[data-k]')){
        const down=key==='ArrowDown';
        if(down?el.scrollTop+el.clientHeight<el.scrollHeight-2:el.scrollTop>0){el.scrollTop+=down?120:-120;return true;}
      }
      if(key==='ArrowRight' && el.closest('.postStory'))return firstKey('.postComments [data-k]');
      if(key==='ArrowLeft' && el.closest('.postComments'))return focus('post-body-'+s.id);
    }
    return personalArrow(s,el,key);
  };
  revisedDispatch=function(a,id,s) {
    if(a==='commentThread') {s.commentRoot=s.commentRoot===id?null:id;redraw('thread-'+id);return true;}
    if(a==='authRetry'){refreshAccount();redrawPersonal();return true;}
    if(a==='onlineRenew'){beginQr(s);redraw('pair-renew');return true;}
    if(a==='pairConfirm'||a==='renew')return true;
    if(a==='personalRetry'||a==='personalMore'){
      const r=cache.get(id);
      if(r){
        const count=r.items.length,route=current(),key=document.activeElement?.dataset.k;
        request(r,a==='personalMore'||(r.ready&&r.more!=null)).then(()=>{
          if(['comments','commentReplies'].includes(r.op) && current()===route && route.focus===key && r.items.length>count){
            const target='reply-'+r.items[count].id;
            redraw(target);
          }
        });
        redrawPersonal();
      }
      return true;
    }
    if(a==='onlineFolder'){page('folder',{folder:id});return true;}
    if(a==='cloudResume'||a==='cloudRestart'){
      const item=cached('history')?.items[Number(id)];
      if(item){const p=histRecord(item);if(p)playRecord(p.w,p,a==='cloudRestart');}
      return true;
    }
    if(['resume','historyPlay','restart'].includes(a)){
      const p=progress[id],mediaId=id.slice(0,id.lastIndexOf(':')),w=W[mediaId]||V[mediaId]||register(p?.w);
      if(w&&p)playRecord(w,p,a==='restart');
      return true;
    }
    if(a==='mineResume'){if(continueItem)playRecord(continueItem.w,continueItem);return true;}
    if(a==='pickShelf'){const w=W[id];if(w)playRecord(w,shelfRecord(w),false,true);return true;}
    if(['mediaLike','mediaLater','follow','collect','watchCollect'].includes(a)) {
      finalizeAction(({mediaLike:'like',mediaLater:'later',follow:'follow',collect:'collect',watchCollect:'collect'})[a],{id});
      return true;
    }
    if(a==='doConfirm'&&id==='logout') {
      guardedWrite('logout',{},(_,same)=>{
        ++authAttempt;assignAccount(null,true);cancelQr();authBusy=false;authError='';
        const done=()=>{if(current().type==='player')updateControls();else redraw(current().focus);notice('已退出账号');};
        if(same&&overlay)completeOverlay(done);else done();
      });
      return true;
    }
    if(a==='doConfirm'&&id==='clear-history'&&s.origin==='cloud'){
      guardedWrite('clearHistory',{},(_,same)=>{clearResources('history');if(same&&overlay)completeOverlay(()=>{redraw('historyOrigin-cloud');notice('云端记录已清空');});});
      return true;
    }
    if(a==='folderCreate'){
      const title=($('folderInput')?.value||'').trim().normalize('NFC');
      if(!title||Array.from(title).length>18||cached('folders')?.items.some(f=>f.title===title)){notice('请输入 1 至 18 个字符的新收藏夹名称');return true;}
      guardedWrite('createFolder',{title},(f,same)=>{clearResources('folders');if(same&&overlay)completeOverlay(()=>{redraw('folder-'+(f.folderId||f.id));notice('已创建收藏夹');});});
      return true;
    }
    if(a==='saveFolder'){
      if(!needUser())openOverlay('onlineFolders',{id},true);
      return true;
    }
    if(a==='onlineFolderRetry'){if(overlay?.kind==='onlineFolders')loadFolderPicker(overlay);return true;}
    if(a==='onlinePutFolder'){
      const f=overlay?.choices?.find(x=>String(x.folderId)===String(id));
      if(f && typeof f.selected==='boolean')finalizeAction('favorite',{id:overlay.id,folderId:id,enabled:!f.selected});
      return true;
    }
    return baseDispatch(a,id,s);
  };
  window.BSPersonal=Object.freeze({
    get account(){return account ? {...account} : null;},
    isMarked:(kind,id)=>markValue(kind,id)===true,
    loadRelations, action,
    invalidateHistory:()=>clearResources('history'),
    refresh:refreshAccount
  });
  queueMicrotask(()=>{restoreHistory();refreshAccount();});
}

(()=>{
"use strict";
const bsOnline = window.BS_MODE === 'online';
const data = bsOnline ? {
  works: Object.create(null), videos: [], creators: Object.create(null), rooms: [], clipIds: {}, 
  media: {}, low: {}, pinyin: window.BS_SEARCH_WORDS || {}, pair: [], meta: {}, variants: {}, variantMedia: {}
} : window.BILIBS_FIXTURE;
const W=data.works,V=Object.fromEntries(data.videos.map(v=>[v.id,v])),C=data.creators,R=Object.fromEntries(data.rooms.map(r=>[r.id,r]));
const $=id=>document.getElementById(id),view=$('view'),video=$('video'),player=$('player');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0'),clock=t=>Math.floor((t||0)/60)+':'+pad(Math.floor((t||0)%60));
const roots={home:'首页',feed:'动态',cinema:'影视',mine:'我的'},types={anime:'番剧',drama:'电视剧',movie:'电影',doc:'纪录片',variety:'综艺'};
const starters={anime:['46089','43164','41410','39462','21542','1733','26801','26274','25681','3312'],drama:['33981','24053','42962','33626']};
const gallery={anime:0,drama:0};
const allCats=['知识','科技','数码','影视','动画','游戏','音乐','生活','美食','舞蹈','体育运动','汽车','旅游','娱乐','动物','时尚','鬼畜','资讯','纪录片','综艺'];
const homeFeed=['keys','pv'+data.clipIds['48416'],'coffee','orbit','terrain','pinball','cut','pv'+data.clipIds['46089'],'lake','steps','micro','cat',...Object.keys(V)].filter((x,i,a)=>V[x]&&a.indexOf(x)===i);
const fresh=()=>({type:'browse',root:'home',filter:'rec',focus:bsOnline?'nav-home':'hero-primary',scroll:0});
let pages=[fresh()],scale=1,toastTimer,batch=0,restoring=false,overlay=null,countdown=null,queuedEpisode=null;
let focusStructureVersion=0;
const focusStructures=new WeakMap();
const current=()=>pages.at(-1),base=()=>pages[0];
const storagePrefix = bsOnline ? 'bilibs-v1-online-' : 'bilibs-ui-1-';
function read(key,fallback){
 try{const saved=localStorage.getItem(storagePrefix+key);return saved===null?fallback:(JSON.parse(saved)??fallback)
 }catch{return fallback}}
function save(key,value){try{localStorage.setItem(storagePrefix+key,JSON.stringify(value))}catch{}}
let signed=bsOnline?false:read('signed',true),profile=bsOnline?{
 follows:[], likes:[], later:[], folders:Object.create(null), shelf:{anime:[],drama:[]}, cloud:{}
}:read('profile',{follows:['shan','zuo','ying','wu'],likes:['coffee','orbit'],later:['keys','cut','pinball'],folders:{'默认收藏夹':['eclipse','terrain','coffee'],'周末想看':['map','pinball']},shelf:structuredClone(starters),cloud:{'eclipse:0':{t:9,d:30,ep:0,recent:Date.now()-3800000}}});
const collection=profile.shelf;
const prefs=Object.assign({theme:'ink',layout_anime:'edition',layout_drama:'edition',codec:'auto',audio:'auto',fitMode:'contain',speed:1,quality:'auto',dm:true,opacity:.85,dmSize:24,density:2,autonext:false,large:false,reduced:false,cats:allCats.slice(),wake:false},read('prefs',{}));
let progress=read('history',bsOnline?{}:{'46089:1':{t:7,d:18,ep:1,recent:Date.now()-4200000},'terrain:0':{t:8,d:22,ep:0,recent:Date.now()-90000000}}),searchHistory=read('searches',bsOnline?[]:['芙莉莲','键盘']);
let speed=prefs.speed,commentsOn=prefs.dm;
const storeProfile=()=>{if(!bsOnline)save('profile',profile)},storePrefs=()=>save('prefs',prefs);
const labels={search:'搜索',results:'搜索结果',history:'观看历史',shelf:'追看片单',folders:'收藏夹',folder:'收藏夹',later:'稍后再看',likes:'最近点赞',follows:'我的关注',author:'UP 主空间',live:'直播',settings:'设置',account:'账户',login:'登录',about:'关于',licenses:'开源许可',guide:'使用指南',catalog:'作品库',ranking:'榜单',detail:'作品详情',post:'动态正文',cats:'分区管理',states:'异常与权限状态',offlineRoom:'直播间'};
const branchDefaults={home:'rec',feed:'all',cinema:'movie',mine:'overview'};
function node(k){return Array.from(document.querySelectorAll('[data-k]')).find(n=>n.dataset.k===k&&!n.closest('[hidden]')&&!n.disabled)}
function latestFor(id){return Object.entries(progress).filter(([k,p])=>k.split(':')[0]===id&&!p.done&&p.t>0).sort((a,b)=>b[1].recent-a[1].recent)[0]?.[1]}
function epUnit(w){return w.kind==='anime'?'话':'集'} function epname(w,n){return '第 '+n+' '+epUnit(w)}
function fit(){
 const viewport=document.documentElement.getBoundingClientRect();
 scale=Math.min(viewport.width/1440,viewport.height/810);
 $('tv').style.transform='scale('+scale+')';
}
fit();addEventListener('resize',fit);
function updateClock(){const d=new Date();document.querySelectorAll('.time').forEach(n=>n.textContent=pad(d.getHours())+':'+pad(d.getMinutes()))}updateClock();setInterval(updateClock,10000);
function notice(t){clearTimeout(toastTimer);$('toast').textContent=t;$('toast').className='on';toastTimer=setTimeout(()=>$('toast').className='',1350)}

function btn(k,row,act,id,cls,inner,attrs=''){return '<button type="button" data-k="'+esc(k)+'" data-row="'+esc(row)+'" data-act="'+esc(act)+'" data-id="'+esc(id)+'" class="'+cls+'" '+attrs+'>'+inner+'</button>'}
function paint(container,key,title,cls=''){return '<span class="'+cls+'" data-art="'+esc(container)+'"><span class="missing" hidden>'+esc(title)+'</span>'+(key?'<img alt="" draggable="false" src="'+esc(key)+'">':'<span class="missing">'+esc(title)+'</span>')+'</span>'}
document.addEventListener('error',ev=>{if(ev.target.tagName==='IMG'){const box=ev.target.closest('[data-art]');ev.target.hidden=true;if(box?.querySelector('.missing'))box.querySelector('.missing').hidden=false}},true);
function hints(a,b){return '<span class="hint"><kbd>'+a+'</kbd>'+b+'</span>'}
function pointerBack(label){return '<button type="button" tabindex="-1" class="hint footBack" data-act="back" aria-label="'+esc(label)+'"><kbd>Esc / 返回</kbd>'+esc(label)+'</button>'}

function focus(k,reveal=true){const n=node(k);if(!n)return false;n.focus({preventScroll:true});if(reveal)bring(n);return true}
function bring(n){if(!view.contains(n))return;if(bsOnline&&((current().type==='detail'&&n.dataset.row==='hero')||(current().type==='browse'&&current().root==='cinema'&&n.dataset.row==='filmRail'))){view.scrollTop=0;return}alignStrip(n);const pane=bsOnline&&n.closest('.cinemaLibraryResults')||view,a=n.getBoundingClientRect(),b=pane.getBoundingClientRect(),pad=9*scale;if(a.top<b.top+pad)pane.scrollTop+=(a.top-b.top-pad)/scale;else if(a.bottom>b.bottom-pad)pane.scrollTop+=(a.bottom-b.bottom+pad)/scale}

function feature({w,kind='catalogFeature',tag,title,desc,source,scene,action='item',id,label='查看作品',extra='',meta=''}){
 const hero=scene==='hero',contained=scene==='small'||scene==='portrait';const cls='feature '+kind+(contained?' contained':'');const visual=paint('feature',source,title,'visual '+(hero?'approved':''));
 return '<article class="'+cls+'"'+(bsOnline?' style="--feature-art:url('+esc(source)+')"':'')+'>'+visual+'<div class="featureText"><div class="tag">'+esc(tag)+'</div><h1 class="'+(title.length>15?'long':'')+'">'+esc(title)+'</h1><p>'+esc(desc)+'</p><div class="actions">'+btn('feature','hero',action,id,'cta',(action==='play'||action==='playWork'?'<i class="playIcon" aria-hidden="true"></i>':'')+esc(label)+(action==='item'?' <span class="arrow">↗</span>':''))+extra+(meta?'<span class="mini">'+esc(meta)+'</span>':'')+'</div></div></article>'
}
function workMeta(w){return [types[w.kind],...(w.types||[]).slice(0,2),w.year].filter(Boolean).join(' · ')}
function release(w){return (w.release||'').replace(/已完结[,，]\s*/,'已完结 · ').replace(/\s*\|\s*/g,' · ')}
function tile(w,i,which,opt={}){
 const isVideo=w.kind==='video',k=opt.key||((isVideo?'v-':'w-')+w.id),thumb=w.wide||w.cover||w.still;
 const frame=paint('tile',thumb,w.title,'thumb');
 const art=isVideo?frame.slice(0,-7)+'<b class="stampTime">'+clock(w.duration)+'</b></span>':frame;
 return btn(k,which,isVideo?'play':'item',w.id,'tile',art+'<span class="tileName">'+esc(w.title)+'</span><span class="tileSub">'+esc(opt.sub??(isVideo?w.artist:workMeta(w)))+'</span>','aria-label="'+esc(w.title)+'"')
}

function b(k,row,act,id,text,cls='secondary',attrs=''){return btn(k,row,act,id,cls,text,attrs)}
function group(title,body,action=''){return '<section class="section"><div class="sectionHead"><h2>'+esc(title)+'</h2>'+action+'</div>'+body+'</section>'}
function empty(t,extra=''){return '<div class="empty">'+esc(t)+extra+'</div>'}
function actionLink(k,row,act,id,label){return b(k,row,act,id,esc(label)+' <span>›</span>','textBtn')}
function subTabs(opts,val,row='filter',act='filter'){return '<div class="switches" role="tablist">'+opts.map(([k,n])=>b(row+'-'+k,row,act,k,esc(n),'switch','role="tab" aria-selected="'+(k===val)+'"')).join('')+'</div>'}
function pageBar(title,opts,val,extra=''){return '<div class="pageBar"><h1>'+esc(title)+'</h1>'+subTabs(opts,val,'shelfTab','shelfTab')+'<span class="count">'+esc(extra)+'</span></div>'}
function wrap(body){return '<div class="content">'+body+'</div>'}
function top(title,action=''){return '<div class="pageBar"><h1>'+esc(title)+'</h1>'+action+'</div>'}
function avatar(id){const c=C[id];return '<i class="avatar" style="--avatar:'+c[2]+'">'+c[1]+'</i>'}
function tileList(items,row='cards',cols=4,opt={}){
 return '<div class="grid cols'+cols+'">'+items.map((w,i)=>{const line=row+Math.floor(i/cols);let result=tile(w,i,line,{key:(opt.prefix||row)+'-'+w.id,sub:w.kind==='video'?w.artist+'　·　'+w.cat:workMeta(w)});
 if(w.kind==='video'&&opt.menu!==false){result='<div class="tileWrap">'+result+'<button class="itemMore" tabindex="-1" data-act="videoMenu" data-id="'+esc(w.id)+'" aria-label="更多操作">•••</button></div>'}return result}).join('')+'</div>'
}
function nav(){const s=current(),inRoot=s.type==='browse';$('nav').innerHTML=inRoot?Object.entries(roots).map(([k,label])=>btn('nav-'+k,'nav','nav',k,'tab',label,k===s.root?'aria-current="page"':'')).join(''):'<span class="crumb">'+esc(roots[base().root])+'　/　'+esc(s.type==='detail'?'作品详情':labels[s.name]||'片单')+'</span>';
 $('quick').innerHTML=!['search','results'].includes(s.name)?b('search-global','nav','search','','<i class="mag"></i> 搜索','searchQuick'):'';
}
function stashScroll(s){s.scroll=view.scrollTop;const pane=bsOnline&&view.querySelector('.cinemaLibraryResults');if(pane){s.libraryScroll||={};s.libraryScroll[pane.dataset.scrollKey]=pane.scrollTop}}
function stash(){const s=current();if(s.type==='player'&&activeMedia&&video.readyState>=1){s.at=video.currentTime;s.restorePaused=video.paused&&!video.ended}const f=document.activeElement?.dataset.k;if(f&&!overlay)s.focus=f;if(s.type!=='player')stashScroll(s);if(s.name==='shelf')s.index=gallery[s.filter]}
function stamp(){history.replaceState({v:2,pages:structuredClone(pages)},'','')}
function go(s){if(overlay){finishOverlay(()=>go(s));return}stash();stamp();pages.push({scroll:0,...s});history.pushState({v:2,pages:structuredClone(pages)},'','');render()}
function page(name,props={}){go({type:'page',name,...(name==='search'?{focus:'osk-A'}:{}),...props})}
const branchSelection=new Map();
function rootTo(root){
 if(!roots[root])return;
 const old=base();
 if(bsOnline && old.type==='browse'){
  const {filter,cat,area,sectionByMode}=old;
  branchSelection.set(old.root,{filter,cat,area,sectionByMode});
 }
 pages=[{type:'browse',root,filter:branchDefaults[root],...(bsOnline?branchSelection.get(root):{}),focus:'nav-'+root,scroll:0}];stamp();render()
}
function redraw(k,zero=false){const s=current();s.focus=k||document.activeElement?.dataset.k;stashScroll(s);if(zero)s.scroll=0;render()}
function protect(name,props={}){if(signed)page(name,props);else page('login',{returnTarget:{name,props}})}
function render(){focusStructureVersion++;stopShelfPreview();setTheme(prefs.theme);
 const s=current();document.body.dataset.surface=getSurface(s);if(s.type==='player'){renderWatch(s);return}stopWatch();player.hidden=true;$('shell').hidden=false;restoring=true;nav();
 document.body.classList.toggle('large',prefs.large);document.body.classList.toggle('reduced',prefs.reduced);
 view.innerHTML=s.type==='detail'?renderDetail(s):s.type==='page'?subPage(s):rootPage(s);
 const usable=[...view.querySelectorAll('[data-k]')].filter(n=>!n.disabled);view.scrollTop=s.scroll||0;
 const library=bsOnline&&view.querySelector('.cinemaLibraryResults');if(library){view.scrollTop=0;library.scrollTop=s.libraryScroll?.[library.dataset.scrollKey]||0}
 let target=s.focus;if(s.name==='shelf'&&target?.startsWith('s-')&&!node(target))target='s-'+collection[s.filter][gallery[s.filter]];
 if(bsOnline && !node(target)){
   const selected=s.name==='author'?'authorTab-'+(s.tab||'video'):s.type==='browse'?(s.root==='home'?'homeTab-'+s.filter:s.root==='cinema'?'cinTab-'+s.filter:'nav-'+s.root):null;
   if(node(selected))target=selected;
 }
 if(!target||!node(target))target=usable[0]?.dataset.k||(s.type==='browse'?'nav-'+s.root:null);
 if(target)focus(target,false);if(view.contains(document.activeElement))bring(document.activeElement);
 const menuable=document.activeElement?.dataset.act==='play';$('hints').textContent=menuable?'方向键 移动　　确定 打开　　菜单键 更多':'方向键 移动　　确定 打开　　Esc 返回';$('footContext').textContent=s.root==='mine'?(signed?'体验账号':'游客模式'):'';
 restoring=false;afterRender(s)
}
// Resolve Back within this route before leaving its page stack.
function focusParent(s,el){
 if(!bsOnline || !el || s.type==='player')return false;
 stashScroll(s);
 const row=el.dataset.row, k=el.dataset.k;
 if(s.name==='shelf' && gallery[s.filter]>=shelfPageSize){
  stepGallery(-shelfPageSize);return true;
 }
 const pager=view.querySelector('[data-page-slot]');
 if(pager && (!el.closest?.('.hotDuo section')||el.closest('.hotDuo section').contains(pager)) && s.dcPages?.[pager.dataset.pageSlot]>1){
  const slot=pager.dataset.pageSlot, p=s.dcPages[slot];
  s.dcPages[slot]=p-1;
  const anchor=s.pageAnchors?.[slot]?.[p-1];
  s.focus=anchor?.focus || 'page-'+slot+'-next';s.scroll=anchor?.scroll||0;
  render();return true;
 }
 let parent;
 if(s.type==='browse' && row!=='nav'){
  if(s.root==='home'){
   parent='homeTab-'+s.filter;
   if(row==='homeTab')parent='nav-home';
   else if(s.filter==='zones' && row!=='zones')parent='zone-'+s.cat;
   else if(s.filter==='live' && row!=='area')parent='area-'+s.area;
  }else if(s.root==='cinema'){
   parent=row==='cinTab'?'nav-cinema':row==='filmRail'||row==='channelSub'?'cinTab-'+s.filter:'channelSub-'+(s.sectionByMode?.[s.filter]||cinSections[s.filter][0][0]);
  }else if(s.root==='feed'){
   parent=row==='authors'||k==='gate'?'nav-feed':row==='feedTab'?'creator-'+(s.creator||'all'):'feedTab-'+s.filter;
  }else parent='nav-'+s.root;
 }else if(s.type==='detail' && row!=='hero' && row!=='nav'){
  parent=node('feature')?'feature':'collect';
 }else if(s.name==='results'){
  if(row!=='resultType')parent=s.tab==='video'&&row!=='sort'?'sort-'+s.sort:'resultType-'+s.tab;
 }else if(s.name==='settings' && row?.startsWith('set'))parent='sg-'+s.group;
 else if(s.name==='catalog' && row?.startsWith('works'))parent='order-'+s.order;
 else if(s.name==='shelf' && row!=='shelfTab')parent='shelfTab-'+s.filter;
 else if(s.name==='author' && row!=='authorTab' && row!=='authorHead')parent='authorTab-'+s.tab;
 else if(s.name==='history' && row!=='historyOrigin')parent='historyOrigin-'+s.origin;
 else if(s.name==='live' && row!=='area')parent='area-'+s.area;
 if(!parent || parent===k || !node(parent))return false;
 if(parent.startsWith('nav-'))view.scrollTop=0;
 return focus(parent);
}
function back(){
 if(overlay){closeOverlay();return}if(countdown){cancelCountdown();return}
 const s=current(),k=document.activeElement?.dataset.k||'';
 if(bsOnline&&s.type==='player'&&!player.classList.contains('quiet')&&!player.classList.contains('loading')){clearTimeout(hudTimer);player.classList.add('quiet');return}
 if(focusParent(s,document.activeElement))return;
 if(s.name==='results'&&k.startsWith('hit-')){focus(s.tab==='video'?'sort-'+s.sort:'resultType-'+s.tab);return}
 if(s.name==='results'&&k.startsWith('sort-')){focus('resultType-'+s.tab);return}
 if(pages.length>1 || (!bsOnline && window.BS_EXAMPLE)){history.back();return}
 if(s.root!=='home'){if(!bsOnline)rootTo('home');return}
 if(!k.startsWith('nav-')){view.scrollTop=0;focus('nav-home')}
}
addEventListener('popstate',e=>{
 if(overlay){onOverlayPop();return}
 if(!e.state?.v)return;const previous=current();const activeKey=document.activeElement?.dataset.k||'';
 if(bsOnline && e.state.pages.length<pages.length && focusParent(previous,document.activeElement)){
 history.pushState({v:2,pages:structuredClone(pages)},'','');return}
 if(!bsOnline&&previous.name==='results'&&e.state.pages.length<pages.length&&(activeKey.startsWith('hit-')||activeKey.startsWith('sort-'))){const dest=activeKey.startsWith('hit-')&&previous.tab==='video'?'sort-'+previous.sort:'resultType-'+previous.tab;previous.focus=dest;history.pushState({v:2,pages:structuredClone(pages)},'','');focus(dest);return}
 pages=e.state.pages;const s=current();if(queuedEpisode==='unlock'&&s.type==='detail'){s.wall=null;queuedEpisode=null;stamp()}
 if(s.type==='detail'&&previous.type==='player'&&previous.id===s.id&&previous.ep){s.ep=previous.ep;if(s.focus?.startsWith('ep-'))s.focus='ep-'+s.ep}
 if(!bsOnline&&s.name==='results'&&(previous.type==='player'||previous.type==='detail'||['author','offlineRoom'].includes(previous.name))){
 s.focus=s.tab==='video'?'sort-'+s.sort:'resultType-'+s.tab;s.scroll=0}
 if(s.name==='shelf')gallery[s.filter]=s.index||0;render()
});

const filterNames=[['rec','推荐'],['hot','热门'],['zones','分区'],['live','直播']];
const movieTabs=[['movie','电影'],['drama','电视剧'],['anime','番剧'],['doc','纪录片'],['variety','综艺'],['commentary','影视解说']];
const rankedVideos=(items)=>[...items].sort((a,b)=>b.views-a.views);
const recentItems=(book=progress)=>Object.entries(book).sort((a,b)=>b[1].recent-a[1].recent).map(([key,p])=>{const [id,ep]=key.split(':');return {key,p,id,ep:Number(ep),w:W[id]||V[id]}}).filter(x=>x.w);
function entriesFor(ids){return ids.map(id=>V[id]||W[id]).filter(Boolean)}
function whichEpisode(w,ep){return w.kind==='video'&&parts[w.id]?'P'+(ep||1):ep?epname(w,ep):''}
function resumePanel(){const seen=new Set(),list=recentItems().filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return !x.p.done&&x.p.t>=1}).slice(0,2);
 if(!list.length)return group('本期热门','<div class="quickRows">'+rankedVideos(Object.values(V)).slice(0,2).map((v,i)=>b('lead-'+i,'lead','play',v.id,'<em>'+pad(i+1)+'</em><strong>'+esc(v.title)+'</strong>','quickItem')).join('')+'</div>');
 const items=list.map(({p,w,ep,key},i)=>b('lead-'+i,'lead','resume',key,paint('resume',w.still||w.wide||w.cover,w.title,'quickArt')+'<span><strong>'+esc(w.title)+'</strong><small>'+esc([whichEpisode(w,ep),clock(p.t)+' / '+clock(p.d)].filter(Boolean).join('　·　'))+'</small>'+lineProgress(p)+'</span><i class="playIcon"></i>','quickItem')).join('');
 return group('接着看','<div class="quickRows">'+items+'</div>',actionLink('all-history','historyLink','page','history','观看历史'))
}
function revealRefreshedBatch(){
 const section=node('refresh')?.closest('.section');
 if(section)view.scrollTop+=(section.getBoundingClientRect().top-view.getBoundingClientRect().top)/scale-12;
 notice('推荐已更新');
}
function homeVideos(){const n=batch*5%homeFeed.length;return entriesFor(homeFeed.slice(n).concat(homeFeed.slice(0,n))).slice(0,12)}
function homeScreen(s){
 const tabs=subTabs(filterNames,s.filter,'homeTab');
 if(s.filter==='zones')return wrap(tabs+zonesScreen(s));
 if(s.filter==='live')return wrap(tabs+liveScreen(s));
 if(s.filter==='hot'){
  const weekly=entriesFor(['eclipse','keys','cut','map','coffee','track','micro','terrain','lake','road','cat','orbit']);
  const board=(label,note,items,key)=>'<section><div class="boardHeading"><h1>'+label+'</h1><small>'+note+'</small></div>'+items.map((w,i)=>rankedLine(w,i,key)).join('')+'</section>';
  return wrap(tabs+'<div class="hotDuo">'+board('热门视频','按样例播放量',rankedVideos(Object.values(V)),'hot')+board('每周必看','本周精选 · 演示片单',weekly,'week')+'</div>');
 }
 const rec=group('为你推荐',tileList(homeVideos(),'rec'),b('refresh','refresh','refresh','','↻　换一批','textBtn'));
 return wrap(tabs+heroFilm(s)+rec);
}

function zoneTabs(s){
 const opts=prefs.cats.filter(x=>allCats.includes(x));if(!opts.includes(s.cat))s.cat=opts[0]||'知识';
 return '<div class="hStrip zoneRail">'+b('cat-manage','zones','page','cats','管理分区','manageChip')+opts.map(x=>b('zone-'+x,'zones','zone',x,esc(x),'zoneTag','aria-selected="'+(x===s.cat)+'"')).join('')+'</div>';
}

function zonesScreen(s){
 const strip=zoneTabs(s),arr=Object.values(V).filter(v=>v.cat===s.cat);
 return top('视频分区')+strip+(arr.length?tileList(arr,'zoneVideo'):empty('这个分区暂时没有视频'));
}

function roomTiles(arr){if(!arr.length)return empty('这里暂时没有直播间');
 return '<div class="roomGrid">'+arr.map((r,i)=>b('room-'+r.id,'rooms'+Math.floor(i/3),'room',r.id,paint('room',V[r.media].wide,r.title,'thumb')+'<span class="roomBody"><small class="onAir '+(r.on?'':'off')+'"><i></i>'+(r.on?'开播演示':'未开播')+'</small><strong>'+esc(r.title)+'</strong><small>'+esc(C[r.host][0])+'　·　'+esc(r.area)+'</small></span>','roomCard')).join('')+'</div>'
}
function liveScreen(s){const opts=['推荐','关注','知识','游戏','音乐','生活'];s.area||='推荐';const arr=Object.values(R).filter(r=>s.area==='推荐'||(s.area==='关注'?profile.follows.includes(r.host):r.area===s.area));
 return top('直播')+subTabs(opts.map(x=>[x,x]),s.area,'area','area')+(s.area==='关注'&&!signed?loginGate('登录查看关注的直播'):roomTiles(arr))}
function loginGate(label){return '<div class="empty">'+b('gate','gate','login','',esc(label),'cta')+'</div>'}
function dateAgo(index){return index===30?'今天':index===29?'昨天':(31-index)+' 天前'}
function authorNames(id){return C[id]?.[0]||''}
function feedScreen(s){
 if(!signed)return wrap(loginGate('登录查看动态'));
 const authors=profile.follows.filter(id=>C[id]);if(!authors.includes(s.creator))s.creator='all';
 const articles=new Set(['pv244794','weave','house','stage','micro','lake','pv477533']);
 const all=s.creator==='all',posts=Object.values(V).sort((a,b)=>b.published-a.published).map(v=>({v,isPost:articles.has(v.id)})).filter(({v})=>authors.includes(v.author)&&(all||v.author===s.creator));
 const chips=[['all','全部'],...authors.map(id=>[id,C[id][0]])].map(([id,label])=>b('creator-'+id,'authors','feedCreator',id,(id==='all'?'':avatar(id))+esc(label),'creatorChip','aria-selected="'+(s.creator===id)+'"')).join('');
 const strip='<div class="authorStrip hStrip">'+b('all-follows','authors','private','follows','全部关注　›','manageChip')+chips+'</div>';
 const opts=[['all','全部动态'],['video','视频投稿'],['post','图文'],['room','正在直播']];
 const entries=posts.filter(p=>s.filter==='all'||(s.filter==='post'?p.isPost:!p.isPost)).slice(0,15);
 const stream=s.filter==='room'?roomTiles(Object.values(R).filter(r=>r.on&&authors.includes(r.host)&&(all||r.host===s.creator))):entries.length?'<div class="feedGrid">'+entries.map(({v,isPost},i)=>postItem(v,i,isPost)).join('')+'</div>':empty('暂时没有符合条件的动态');
 return wrap(top('关注动态')+strip+subTabs(opts,s.filter,'feedTab')+stream);
}

function postItem(v,i,isPost){
 const info='<span class="feedBy">'+avatar(v.author)+esc(authorNames(v.author))+'<small>'+esc(dateAgo(v.published))+'</small></span>';
 return b('post-'+v.id,'journal'+Math.floor(i/4),isPost?'post':'play',v.id,paint('dynamic',v.wide,v.title,'feedArt')+'<span class="feedType">'+(isPost?'图文':clock(v.duration))+'</span><strong>'+esc(v.title)+'</strong>'+info,'feedCard');
}

function filmContent(mode){if(mode==='commentary')return Object.values(V).filter(v=>v.topic==='影视解说');return Object.values(W).filter(w=>w.kind===mode)}
function posterList(items,row='works'){return '<div class="posterGrid">'+items.map((w,i)=>b(row+'-'+w.id,row+Math.floor(i/6),'item',w.id,paint('poster',w.cover||w.wide,w.title,'thumb vertical')+'<span class="tileName">'+esc(w.title)+'</span>','tile')).join('')+'</div>'}
function cinemaScreen(s){
 const mode=s.filter,arr=filmContent(mode),w=arr.find(x=>x.id===s.featureId)||arr.find(x=>x.id===({movie:'42715',drama:'33981',anime:'46089'}[mode]))||arr[0];s.featureId=w?.id;
 const strip=arr.map(x=>b('film-'+x.id,'filmRail',x.kind==='video'?'play':'item',x.id,paint('rail',x.hero||x.still||x.wide||x.cover,x.title,'cinThumb')+'<span>'+esc(x.title)+'</span>','cinPick','aria-pressed="'+(x.id===w?.id)+'"')).join('');
 const options=cinSections[mode];s.sectionByMode||={};const sub=s.sectionByMode[mode]||options[0][0];
 const head='<div class="cinChannels">'+subTabs(movieTabs,mode,'cinTab')+'</div>';
 const showcase=w?'<div id="cinStage">'+cinemaFeature(w,mode)+'</div><div class="hStrip cinRail">'+strip+'</div>':'';
 return wrap('<div class="cinDesk">'+head+showcase+'<section class="channelBrowser">'+subTabs(options,sub,'channelSub','channelSub')+'<div id="channelResults">'+channelRows(mode,sub,arr)+'</div></section></div>');
}

function cinemaFeature(w,mode){
 const art=w.hero||w.still||w.wide||w.cover,tag=types[mode]||'影视解说';
 return '<article class="cinScene" data-scene="'+esc(w.id)+'" style="--backdrop:url('+art+')">'+paint('cinema',art,w.title,'cinBackdrop'+(!w.hero&&!w.still&&!w.wide?' portraitOnly':''))+'<div class="cinCopy"><span class="eyeline"><i></i>'+esc(tag)+'精选</span><h1>'+esc(w.title)+'</h1><small>'+esc(w.kind==='video'?w.artist:workMeta(w))+'</small><p>'+esc(w.desc||w.title)+'</p></div></article>';
}

function catalogScreen(s){const arr=filmContent(s.kind),genres=[...new Set(arr.flatMap(w=>w.types||[w.cat]))],years=[...new Set(arr.map(w=>w.year).filter(Boolean))].sort().reverse();
 s.origin||='全部';s.genre||='全部';s.year||='全部';s.order||='默认';let rows=arr.filter(w=>(s.genre==='全部'||(w.types||[w.cat]).includes(s.genre))&&(s.year==='全部'||w.year===s.year)&&(s.origin==='全部'||(s.origin==='国创'?w.id==='1733':w.id!=='1733')));
 if(s.name==='ranking'&&s.rankMode)rows=channelItems(s.kind,s.rankMode,rows);else if(s.name==='ranking'||s.order==='热度')rows.sort((a,b)=>score(b)-score(a));else if(s.order==='片名')rows.sort((a,b)=>a.title.localeCompare(b.title,'zh'));
 let controls=s.name==='ranking'?'<p class="submeta">本机样例排行</p>':(s.kind==='anime'?filterStrip('作品',['全部','国创','其他番剧'],s.origin,'origin'):'')+filterStrip('类型',['全部',...genres],s.genre,'genre')+(years.length?filterStrip('年份',['全部',...years],s.year,'year'):'')+filterStrip('排序',['默认','热度','片名'],s.order,'order');
 if(s.problem==='fail')return wrap(top((types[s.kind]||'影视解说')+'作品库')+controls+stateNote('作品库暂时无法加载','catalog'));if(s.problem==='stale')controls+=stateNote('更新失败，当前显示上次的作品。','catalog');
 return wrap(top((types[s.kind]||'影视解说')+(s.name==='ranking'?'榜单':'作品库'))+controls+(rows.length?(s.name==='ranking'?'<div class="rankBoard">'+rows.map((w,i)=>rankedLine(w,i)).join('')+'</div>':rows.every(w=>w.cover)?cinemaPlates(rows,'works'):tileList(rows)):empty('没有符合条件的作品')))
}
function score(w){return w.views??((Number(w.id.replace(/\D/g,''))||53)*719%180001)}
function filterStrip(label,opts,active,kind){return '<div class="filterStrip"><span>'+label+'</span>'+subTabs(opts.map(x=>[x,x]),active,kind,'criterion')+'</div>'}
const mineItems=[['history','观看历史','◷'],['shelfA','我的追番','▥'],['shelfD','我的追剧','▤'],['folders','收藏夹','▱'],['later','稍后再看','◴'],['likes','最近点赞','♡'],['follows','我的关注','◎'],['settings','设置','⚙']];
function mineScreen(){
 const h=recentItems().find(x=>!x.p.done&&x.p.t>0);
 const counts={history:recentItems().length,folders:Object.keys(profile.folders).length,likes:profile.likes.length,later:profile.later.length,follows:profile.follows.length},units={history:' 条',folders:' 个',likes:' 个',later:' 个',follows:' 位'};
 const items=mineItems.filter(([k])=>!k.startsWith('shelf')&&k!=='settings').map(([k,label],i)=>b('mine-'+k,'mytools'+Math.floor(i/3),'mineGo',k,tinyMark(k)+'<span>'+label+'</span><small>'+esc(counts[k]!=null&&(signed||k==='history')?counts[k]+units[k]:'›')+'</small>','menuCard')).join('');
 const account=b('my-account','side0','page',signed?'account':'login','<span class="accountAvatar">'+(signed?'映':'入')+'</span><strong>'+(signed?'本机体验账号':'登录账号')+'</strong><small>'+(signed?'管理账户　›':'扫码登录　›')+'</small>','accountBlock');
 const tools=[['settings','设置'],['about','关于 BiliBS'],['guide','使用指南']].map(([id,name],i)=>b('mine-'+id,'side'+(i+1),'page',id,name+' <span>›</span>','sideOption')).join('');
 const cont=h?group('继续观看',b('my-resume','resume','resume',h.key,paint('resume',h.w.still||h.w.wide||h.w.cover,h.w.title,'resArt')+'<strong>'+esc(h.w.title)+'</strong><span>'+esc(whichEpisode(h.w,h.ep))+'　'+clock(h.p.t)+' / '+clock(h.p.d)+'</span><i class="playIcon"></i>','continueLine')):'';
 return wrap('<div class="personalDesk"><aside class="personalSide">'+account+'<div class="systemLinks">'+tools+'</div></aside><section class="personalLibrary">'+top('我的片库')+'<div class="libraryPair">'+libraryEntry('anime')+libraryEntry('drama')+'</div>'+group('片库管理','<div class="menuGrid mytools">'+items+'</div>')+cont+'</section></div>');
}

function rootPage(s){return {home:homeScreen,feed:feedScreen,cinema:cinemaScreen,mine:mineScreen}[s.root](s)}
function historyScreen(s){s.origin||='local';const cloud=s.origin==='cloud',rec=recentItems(cloud?profile.cloud:progress),available=!cloud||signed;
 const head=top('观看历史',rec.length&&available?actionLink('clear-history','title','confirm','clear-history','清空记录'):'')+subTabs([['local','本机记录'],['cloud','云端记录']],s.origin,'historyOrigin','historyOrigin');
 if(!available)return wrap(head+loginGate('登录查看云端记录'));if(!rec.length)return wrap(head+empty('暂无观看记录'));
 let prev='';const rows=rec.map(({w,p,key,ep},i)=>{const day=timeDay(p.recent),label=prev===day?'':'<h2 class="day">'+day+'</h2>';prev=day;
 return label+'<div class="histRow">'+paint('history',w.still||w.wide||w.cover,w.title,'histArt')+'<div class="histMeta"><strong>'+esc(w.title)+'</strong><span>'+esc([whichEpisode(w,ep),p.done?'已看完':clock(p.t)+' / '+clock(p.d)].filter(Boolean).join('　·　'))+'</span>'+lineProgress(p)+'</div>'+b('history-'+key,'hist'+i,'historyPlay',key,p.done?'重播':'继续','secondary')+(p.done?'':b('start-'+key,'hist'+i,'restart',key,'从头播','textBtn'))+'</div>'}).join('');
 return wrap(head+'<div class="histList">'+rows+'</div>')
}
function libraryPage(s){
 if(!signed)return wrap(loginGate('登录查看'+(labels[s.name]||'片单')));
 if(s.name==='follows')return wrap(top('我的关注','<span class="submeta">'+profile.follows.length+' 位 UP 主</span>')+authorList(profile.follows));
 if(s.name==='folders')return wrap(top('收藏夹',actionLink('new-folder','title','newFolder','','＋ 新建收藏夹'))+'<div class="folderGrid">'+Object.entries(profile.folders).map(([name,ids],i)=>b('folder-'+name,'folders'+Math.floor(i/3),'folder',name,'<span class="folderMontage">'+entriesFor(ids).slice(0,2).map(w=>paint('folder',w.wide||w.cover,w.title,'folderPic')).join('')+'</span><strong>'+esc(name)+'</strong><small>'+ids.length+' 个视频</small>','folderCard')).join('')+'</div>');
 const ids=s.name==='folder'?profile.folders[s.folder]||[]:s.name==='likes'?profile.likes:profile.later,items=entriesFor(ids),head=top(s.folder||labels[s.name],'<span class="submeta">'+items.length+' 个视频</span>');
 if(!items.length)return wrap(head+empty(s.name==='likes'?'还没有点赞的视频':'这里暂时没有视频'));
 const list=s.name==='later'?'<div class="watchQueue">'+items.map((w,i)=>'<div class="queueRow">'+b('media-'+w.id,'queue'+i,'play',w.id,'<em>'+pad(i+1)+'</em>'+paint('queue',w.wide,w.title,'quickArt')+'<span><strong>'+esc(w.title)+'</strong><small>'+esc(w.artist)+'　·　'+clock(w.duration)+'</small></span>','queuePlay')+b('later-menu-'+w.id,'queue'+i,'videoMenu',w.id,'•••','textBtn','aria-label="更多操作"')+'</div>').join('')+'</div>':tileList(items,'media',4,{menu:s.name!=='likes'});
 return wrap(head+list)
}
function authorList(ids){return ids.length?'<div class="authorGrid">'+ids.map((id,i)=>b('person-'+id,'people'+Math.floor(i/3),'author',id,avatar(id)+'<span><strong>'+esc(C[id][0])+'</strong><small>'+esc(C[id][3])+'</small></span>','personCard')).join('')+'</div>':empty('暂时没有关注的 UP 主')}
function authorScreen(s){const id=s.id,c=C[id],arr=Object.values(V).filter(v=>v.author===id);s.tab||='video';const subscribed=signed&&profile.follows.includes(id);
 return wrap('<div class="profileBar">'+avatar(id)+'<div><h1>'+esc(c[0])+'</h1><small>'+esc(c[3])+'</small></div>'+b('follow-toggle','authorHead','follow',id,subscribed?'✓ 已关注':'＋ 关注','secondary')+'</div>'+subTabs([['video','投稿'],['post','动态'],['live','直播间']],s.tab,'authorTab','authorTab')+(s.tab==='video'?tileList(arr,'uploads'):s.tab==='post'?'<div class="feedGrid">'+arr.slice(0,4).map((v,i)=>postItem(v,i,true)).join('')+'</div>':roomTiles(Object.values(R).filter(r=>r.host===id))))
}
function renderDetail(s){
 const w=W[s.id],serial=w.count>1,canFollow=['anime','drama'].includes(w.kind),subscribed=canFollow&&signed&&collection[w.kind].includes(w.id);s.ep=Math.max(1,Math.min(w.count||1,s.ep||latestFor(w.id)?.ep||1));const ep=serial?s.ep:0,p=progress[w.id+':'+ep];
 const extra=canFollow?b('collect','hero','collect',w.id,(subscribed?'✓ 已追':'＋ 追')+(w.kind==='anime'?'番':'剧'),'secondary'):'';
 let stage=feature({kind:'detailFeature',tag:workMeta(w),title:w.title,desc:w.desc,source:w.hero||w.cover||w.wide,scene:w.hero?'hero':w.cover?'portrait':'small',id:w.id,action:'playWork',label:p?.done?'重播样片':p?.t?'继续样片':'播放样片',extra,meta:serial?epname(w,s.ep):''});
 if(s.wall){const t={'member-wall':'此片源需要大会员','region-wall':'当前地区无法观看','login-wall':'登录后可播放'}[s.wall];const action=s.wall==='login-wall'?b('feature','hero','wallLogin','','体验登录','cta'):b('feature','hero','previewInstead',s.id,'观看公开样片','cta');stage=stage.replace(/<div class="actions">[\s\S]*?<\/div><\/div><\/article>$/, '<div class="actions">'+action+'<span class="mini">'+t+' · 状态演示</span></div></div></article>')}
 const rel=Object.values(W).filter(x=>x.kind===w.kind&&x.id!==w.id).slice(0,4);
 const eps=serial?group('选集','<div class="epGrid">'+Array.from({length:w.count},(_,i)=>b('ep-'+(i+1),'ep'+Math.floor(i/8),'episode',i+1,epname(w,i+1),'ep'+(s.ep===i+1?' current':''))).join('')+'</div>','<span class="submeta">'+esc(release(w))+'</span>'):'';
 return wrap(stage+(s.wall?'':eps)+(rel.length?group('相关作品',tileList(rel,'related')):''))
}
const searchTypes=[['video','视频'],['anime','番剧'],['film','影视'],['person','UP 主'],['room','直播']];
function matches(q,words){const toks=q.toLowerCase().trim().split(/\s+/);const pool=words.filter(Boolean).map(x=>String(x).toLowerCase()+' '+(data.pinyin[x]||'')).join(' ');return toks.every(t=>pool.includes(t))}
function searchScreen(s){
 const suggestions=['芙莉莲','机械键盘','山川观测','日食','预告','影视解说'];
 const field='<div class="searchBox"><i class="mag"></i><input type="text" aria-label="搜索关键词" id="query" data-k="query" data-row="query" maxlength="60" placeholder="输入片名、UP 主、拼音或首字母" value="'+esc(s.q||'')+'">'+b('submit','query','submit','','搜索','cta')+'</div>';
 const keys=Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',(ch,i)=>b('osk-'+ch,'osk'+Math.floor(i/9),'oskLetter',ch,ch,'letter')).join('');
 const actions=[['del','删除'],['clear','清空'],['go','搜索']].map(([id,label])=>b('osk-'+id,'oskActions','oskOp',id,label,'letter opKey')).join('');
 const recent=group('最近搜索',searchHistory.length?'<div class="terms">'+searchHistory.map((x,i)=>b('past-'+i,'past'+Math.floor(i/2),'queryWord',x,esc(x),'word')).join('')+'</div>':'<p class="submeta">还没有搜索记录</p>',searchHistory.length?actionLink('clear-queries','clear','confirm','queries','清空'):'');
 const suggested=group('试试这些','<div class="terms">'+suggestions.map((x,i)=>b('suggest-'+i,'suggest'+Math.floor(i/2),'queryWord',x,esc(x),'word')).join('')+'</div>');
 return wrap('<div class="searchDesk searchV5">'+top('搜索')+field+'<div class="typingDesk"><section class="keyPanel"><h2>遥控器键盘</h2><div class="letterGrid">'+keys+'</div><div class="letterOps">'+actions+'</div><div id="wordCandidates" class="terms">'+candidateMarkup(s.q)+'</div></section><aside>'+recent+suggested+'</aside></div></div>');
}

function submitQuery(q){q=String(q||'').trim().slice(0,60);if(!q){notice('先输入关键词');return}searchHistory=[q,...searchHistory.filter(t=>t!==q)].slice(0,10);save('searches',searchHistory);const s=current();if(s.name==='search')s.q=q;page('results',{q,sort:'综合排序',tab:'video',focus:'resultType-video'})}
const cachedResults=new Map(read('result-cache',[]).slice(-60));
function resultRows(s){const q=s.q,tab=s.tab,cacheKey=JSON.stringify([q,tab,s.sort]);
 const resolve=id=>tab==='room'?R[id]:tab==='person'?(C[id]?{id,title:C[id][0]}:null):W[id]||V[id];
 if(cachedResults.has(cacheKey))return cachedResults.get(cacheKey).map(resolve).filter(Boolean);
 let rows=[];
 if(tab==='person')rows=Object.entries(C).filter(([id,c])=>matches(q,[c[0],c[3]])).map(([id,c])=>({id,title:c[0]}));
 else if(tab==='room')rows=Object.values(R).filter(r=>matches(q,[r.title,r.area,C[r.host][0]]));
 else rows=(tab==='video'?Object.values(V):Object.values(W).filter(x=>tab==='anime'?x.kind==='anime':x.kind!=='anime')).filter(x=>matches(q,[x.title,x.artist,x.cat,x.topic,types[x.kind],...(x.types||[])]));
 if(tab==='video'&&s.sort==='最多播放')rows.sort((a,b)=>b.views-a.views);if(tab==='video'&&s.sort==='最新发布')rows.sort((a,b)=>b.published-a.published);
 cachedResults.set(cacheKey,rows.map(x=>x.id));if(cachedResults.size>60)cachedResults.delete(cachedResults.keys().next().value);save('result-cache',[...cachedResults]);return rows}
function resultsScreen(s){const rows=resultRows(s),ctrl=s.tab==='video'?subTabs(['综合排序','最多播放','最新发布'].map(x=>[x,x]),s.sort,'sort','sort'):'';
 let body=!rows.length?empty('没有找到相关内容','<p>换个关键词，或切换上方的结果类型。</p>'):s.tab==='person'?authorList(rows.map(r=>r.id)).replaceAll('data-k="person-','data-k="hit-'):s.tab==='room'?roomTiles(rows).replaceAll('data-k="room-','data-k="hit-'):s.tab==='anime'?posterList(rows,'hit'):tileList(rows,'hit',4,{prefix:'hit'});
 if(s.problem==='fail')body=stateNote('搜索结果暂时无法加载','search');
 return wrap(top('“'+s.q+'”',actionLink('change-query','title','editQuery','','修改搜索词'))+subTabs(searchTypes,s.tab,'resultType','resultType')+ctrl+(s.problem==='fail'?body:group('找到 '+rows.length+' 个结果',body)))}
const settingGroups=['显示','播放','音视频进阶','弹幕','分区','存储','账户与关于'];
const prefOpts={large:[[false,'标准字号'],[true,'大字号']],reduced:[[false,'标准动效'],[true,'减少动效']],quality:[['auto','原片'],['low','省流 · 180p']],speed:[[.75,'0.75×'],[1,'1×'],[1.25,'1.25×'],[1.5,'1.5×'],[2,'2×']],autonext:[[false,'关闭'],[true,'开启']],dm:[[false,'关闭'],[true,'开启']],opacity:[[.55,'55%'],[.85,'85%'],[1,'100%']],dmSize:[[20,'小'],[24,'标准'],[32,'大']],density:[[1,'疏'],[2,'适中'],[3,'密']]};
const prefLabels={large:'界面字号',reduced:'界面动效',quality:'默认画质',speed:'播放倍速',autonext:'自动连播',dm:'显示弹幕',opacity:'弹幕不透明度',dmSize:'弹幕字号',density:'弹幕密度'};
function prefLabel(k){return prefOpts[k]?.find(([v])=>v===prefs[k])?.[1]||''}
function settingLine(k,i,act,id,title,val){return b('set-'+k,'set'+i,act,id,'<span>'+esc(title)+'</span><strong>'+esc(val||'')+'　›</strong>','settingLine')}
function settingsScreen(s){s.group||='显示';let rows=[];
 const keys={'显示':['large','reduced'],'播放':['quality','speed','autonext'],'弹幕':['dm','opacity','dmSize','density']}[s.group];
 if(s.group==='音视频进阶')rows=advancedRows();else if(keys)rows=keys.map((k,i)=>settingLine(k,i,'pref',k,prefLabels[k],prefLabel(k)));
 else if(s.group==='分区')rows=[settingLine('cats',0,'page','cats','首页显示的分区',prefs.cats.length+' 个')];
 else if(s.group==='存储')rows=[settingLine('local',0,'confirm','clear-local','清空本机观看记录',Object.keys(progress).length+' 条'),settingLine('queries',1,'confirm','queries','清空搜索记录',searchHistory.length+' 条'),settingLine('cache',2,'confirm','clear-cache','清理搜索结果缓存',cachedResults.size+' 条'),settingLine('pref',3,'confirm','defaults','恢复播放与显示设置','')];
 else rows=[['account','账户管理'],['guide','遥控器与功能导览'],['about','关于 BiliBS'],['licenses','素材与组件说明']].map(([id,l],i)=>settingLine(id,i,'page',id,l,''));
 if(s.group==='显示')rows.unshift(settingLine('theme','Theme','themes','','界面背景',themes[prefs.theme]?.name||themes.ink.name));
 const sample=s.group==='显示'?'<div class="settingPreview"><i class="previewMotif"></i><span><small>当前背景</small><strong>'+esc(themes[prefs.theme]?.name||themes.ink.name)+'</strong></span></div>':'';return wrap(top('设置')+'<div class="settingSplit"><div class="settingNav">'+settingGroups.map((g,i)=>b('sg-'+g,'sg'+i,'settingGroup',g,g,'sideTab','aria-selected="'+(s.group===g)+'"')).join('')+'</div><section class="settingsPane"><h2>'+s.group+'</h2>'+sample+rows.join('')+'</section></div>')}
function catsScreen(){const order=[...prefs.cats,...allCats.filter(k=>!prefs.cats.includes(k))];return wrap(top('分区管理','<small class="submeta">已显示 '+prefs.cats.length+' 个分区</small>')+'<div class="catList">'+order.map((k,i)=>'<div class="catEdit"><span>'+esc(k)+'</span>'+b('visible-'+k,'cat'+i,'catVisible',k,prefs.cats.includes(k)?'✓ 显示':'已隐藏','chip')+(prefs.cats.includes(k)&&(bsOnline||prefs.cats.indexOf(k)>0)?b('raise-'+k,'cat'+i,'raiseCat',k,'上移','textBtn'):'')+'</div>').join('')+'</div>')}
function accountScreen(){return wrap(top('账户')+'<div class="accountPanel"><i class="profileIcon">'+(signed?'映':'客')+'</i><h2>'+(signed?'本机体验账号':'游客模式')+'</h2><p>'+(signed?'追番、收藏和关注会保存在当前浏览器。':'可以搜索、浏览和播放，也可以查看本机观看历史。')+'</p>'+b('account-action','account','accountAct','',signed?'退出体验账号':'登录体验账号','secondary')+'</div>')}
function loginScreen(s){if(s.pair==null){s.pair=Math.floor(Math.random()*data.pair.length);s.exp=Date.now()+120000}const pair=data.pair[s.pair];return wrap(top('登录')+'<div class="pairBox"><div class="pairArt"><img src="'+pair[1]+'" alt="体验配对码"><strong>'+pair[0].slice(0,3)+'　'+pair[0].slice(3)+'</strong></div><article><div class="tag">电视端配对演示</div><h2>在手机上确认登录</h2><p>此码仅含本次体验编号。选择下方按钮可体验手机确认后的页面。</p><p id="expires"></p>'+b('pair-confirm','pair','pairConfirm','','模拟手机确认','cta')+b('pair-renew','pair','renew','','换一个码','textBtn')+'</article></div>')}
function updatePair(){const s=current();if(s.name!=='login'||!$('expires'))return;const sec=Math.max(0,Math.ceil((s.exp-Date.now())/1000));$('expires').textContent=sec?'有效时间　'+clock(sec):'配对码已过期，请换一个码';const n=node('pair-confirm')||document.querySelector('[data-k="pair-confirm"]');if(n){if(!sec&&n===document.activeElement)focus('pair-renew');n.disabled=!sec}}
setInterval(updatePair,1000);
const scenarios=[['catalog-fail','作品库读取失败'],['catalog-stale','作品库保留旧数据'],['search-fail','搜索读取失败'],['login-wall','登录限制'],['member-wall','会员限制'],['region-wall','地区限制'],['tier-wall','画质受限']];
function stateNote(label,id){return '<div class="stateNote"><span>'+esc(label)+'</span>'+b('retry','state','recover',id,'重试','secondary')+'</div>'}
function infoScreen(s){if(s.name==='states')return wrap(top('异常与权限状态')+'<p class="submeta">以下入口使用本机测试条件演示界面，不代表示例作品的实际播放权限。</p>'+group('选择一种情况','<div class="guideGrid">'+scenarios.map(([id,l],i)=>b('scenario-'+id,'scenario'+Math.floor(i/4),'scenario',id,l,'secondary')).join('')+'</div>'));if(s.name==='guide'){const links=[['search','搜索'],['zones','视频分区'],['live','直播'],['feed','关注动态'],['cinema','影视与番剧'],['shelfA','我的追番'],['shelfD','我的追剧'],['history','观看历史'],['folders','收藏夹'],['follows','我的关注'],['later','稍后再看'],['likes','最近点赞']];return wrap(top('遥控器与功能导览',actionLink('status-demo','title','page','states','异常与权限状态'))+'<article class="note"><h2>方向键移动，确定键打开</h2><p>顶部栏目、筛选和排序随焦点切换。返回键逐层返回；视频卡上按菜单键或 M 打开操作。电脑也可用鼠标和 Esc。</p></article>'+group('功能入口','<div class="guideGrid">'+links.map(([k,l],i)=>b('guide-'+k,'guide'+Math.floor(i/4),'guideGo',k,l,'secondary')).join('')+'</div>'))}
 if(bsOnline&&s.name==='licenses')return wrap(top('素材与组件说明')+'<article class="note"><h2>内容与美术</h2><p>在线内容、封面、字幕和弹幕由对应创作者及平台提供。作品展示使用当前接口返回的授权资源。</p><h2>播放组件</h2><p>使用系统 WebView 与 HTML 媒体解码能力。分轨点播使用 Shaka Player，HLS 直播使用 hls.js，HTTP-FLV 直播使用 mpegts.js。各组件的完整开源许可随安装包分发。</p><h2>本机测试素材</h2><p>高级设置提供独立测试短片，供检查本机解码和声音。原型内容仅出现在单独的演示模式中。</p></article>');
 if(s.name==='licenses')return wrap(top('素材与组件说明')+'<article class="note"><h2>画面来源</h2><p>作品封面与预告静帧来自对应作品的哔哩哔哩公开展示素材，权利归各自权利人。本稿用于设计评审。日食、地形、键盘等图形短片为原型自制。</p><h2>播放与文字</h2><p>使用浏览器原生 HTML 视频播放器和设备系统字体。分集样片使用同一作品的展示画面。</p></article>');
 return aboutCard()}
function subPage(s){switch(s.name){case 'shelf':return signed?shelf():wrap(loginGate('登录查看片单'));case 'history':return historyScreen(s);case 'catalog':case 'ranking':return catalogScreen(s);case 'author':return authorScreen(s);case 'folders':case 'folder':case 'follows':case 'later':case 'likes':return libraryPage(s);case 'search':return searchScreen(s);case 'results':return resultsScreen(s);case 'settings':return settingsScreen(s);case 'cats':return catsScreen(s);case 'account':return accountScreen();case 'login':return loginScreen(s);case 'about':case 'licenses':case 'guide':case 'states':return infoScreen(s);case 'live':return wrap(liveScreen(s));case 'offlineRoom':{const r=R[s.id];return wrap(top(r.title)+'<div class="accountPanel">'+avatar(r.host)+'<h2>直播尚未开始</h2><p>'+esc(authorNames(r.host))+'</p>'+b('room-follow','room','follow',r.host,signed&&profile.follows.includes(r.host)?'✓ 已关注':'关注主播','secondary')+'</div>')}case 'post':{const v=V[s.id];return wrap(top('动态正文')+'<article class="article">'+b('post-author','author','author',v.author,avatar(v.author)+esc(authorNames(v.author)),'creatorChip')+'<h2>'+esc(v.title)+'</h2><p>'+esc(v.cat+'创作手记 · '+v.topic)+'</p>'+paint('post',v.wide,v.title,'articleArt')+b('post-play','article','play',v.id,'看相关视频','cta')+'</article>')}default:return wrap(top(labels[s.name]||'BiliBS'))}}
function afterRender(s){syncHints();if(s.name==='shelf'&&document.activeElement.closest('.shelfCell'))scheduleShelfPreview(document.activeElement.closest('.shelfCell').dataset.work);if(s.name==='login')updatePair();if(s.type==='page'&&s.name==='shelf'&&signed&&!s.focus){const id=collection[s.filter][gallery[s.filter]||0];if(id)focus('s-'+id)}}

let afterClose=null,layerLevelBack=false;
const modal=$('layer');
function openOverlay(kind,props={},nested=false){stopShelfPreview();
 const source=document.activeElement?.dataset.k||current().focus;
 if(!overlay){stash();stamp();history.pushState({v:2,pages:structuredClone(pages),modal:true},'','')}
 const anchor=overlay?.anchor||source,prior=nested&&overlay?{...overlay,remember:source}:null;
 const inline=bsOnline&&current().type==='player'&&kind==='watch'&&['episodes','queue'].includes(props.mode);
 overlay={kind,anchor,prior,...props,inline};modal.hidden=false;$('shell').inert=true;player.inert=!inline;player.classList.toggle('withShelf',inline);if(current().type==='player')wake(false);
 if(kind==='watch'&&props.mode==='episodes'&&!inline){overlay.resumeMain=!video.paused&&!video.ended;overlay.playingKey=activeMedia;video.pause()}
 drawOverlay()
}
function finishOverlay(fn=null){if(!overlay){if(fn)fn();return}afterClose=fn;layerLevelBack=false;history.back()}
function closeOverlay(){if(!overlay)return;if(overlay.prior){const next=overlay.prior;overlay=next;drawOverlay(next.remember);return}finishOverlay()}
function onOverlayPop(){stopEpisodePreview();const old=overlay;if(!afterClose&&old.prior&&!layerLevelBack){overlay=old.prior;history.pushState({v:2,pages:structuredClone(pages),modal:true},'','');drawOverlay(overlay.remember);return}
 overlay=null;setTheme(prefs.theme);modal.hidden=true;modal.innerHTML='';$('shell').inert=false;player.inert=false;player.classList.remove('withShelf');layerLevelBack=false;
 if(old.anchor)focus(old.anchor,false);if(current().type==='player')wake();const fn=afterClose;afterClose=null;if(fn)fn();if(old.resumeMain&&current().type==='player'&&old.playingKey===activeMedia&&video.paused&&!video.ended)doPlay()}
function completeOverlay(fn=()=>{}){layerLevelBack=true;afterClose=fn;history.back()}
function drawer(title,desc,body,cls=''){return '<div class="scrim" data-act="dismiss"></div><section class="drawer '+cls+'" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><button type="button" class="closeX" tabindex="-1" data-act="dismiss" aria-label="关闭">×</button><h2>'+esc(title)+'</h2>'+(desc?'<p>'+esc(desc)+'</p>':'')+body+'</section>'}
const op=(k,row,act,id,label,selected=false)=>b(k,row,act,id,esc(label),'op'+(selected?' chosen':''),'aria-pressed="'+selected+'"');
function flip(list,id){const i=list.indexOf(id);if(i<0)list.push(id);else list.splice(i,1);return i<0}
function updateBehind(){if(current().type==='player'){updateControls();return}redraw(current().focus)}
function needUser(){if(signed)return false;if(overlay)completeOverlay(()=>page('login'));else page('login');return true}
function mediaActions(v){const id=v.id;return [op('m-author','m0','author',v.author,'进入 '+C[v.author][0]+' 的空间'),op('m-like','m1','mediaLike',id,signed&&profile.likes.includes(id)?'取消点赞':'点赞'),op('m-save','m2','saveFolder',id,'存入收藏夹'),op('m-later','m3','mediaLater',id,signed&&profile.later.includes(id)?'移出稍后再看':'加入稍后再看'),op('m-follow','m4','follow',v.author,signed&&profile.follows.includes(v.author)?'取消关注 UP 主':'关注 UP 主')].join('')}
const confirms={'clear-cache':['清理搜索结果缓存？','下次搜索时会重新建立索引，收藏和观看记录会保留。','清理缓存'],'logout':['退出体验账号？','退出后仍可查看本机历史，重新登录可打开原有片单。','退出账号'],queries:['清空搜索记录？','将清除当前浏览器中的最近搜索。','清空搜索'], 'clear-history':['清空这一栏的历史？','所选来源的观看记录和进度将被移除。','清空记录'],'clear-local':['清空本机观看记录？','本机的观看进度也会一并清除。','清空记录'],defaults:['恢复默认设置？','播放、弹幕和界面字号将恢复默认。','恢复默认']};
function drawOverlay(target){stopEpisodePreview();const o=overlay;let title='',desc='',body='',cls='',initial;
 if(o.kind==='themes'||o.kind==='layouts')({title,desc,body,initial}=themeChoices(o));
 if(o.kind==='videoMenu'){const v=V[o.id];title='视频操作';desc=v.title;body=mediaActions(v)}
 if(o.kind==='folders'){title='存入收藏夹';desc=V[o.id].title;body=Object.entries(profile.folders).map(([f,ids],i)=>op('mf-'+f,'mf'+i,'putFolder',f,(ids.includes(o.id)?'✓　':'＋　')+f,ids.includes(o.id))).join('')}
 if(o.kind==='folderName'){title='新建收藏夹';body='<input data-k="folder-input" data-row="fi" aria-label="收藏夹名称" id="folderInput" placeholder="输入名称" maxlength="18">'+op('folder-create','fc','folderCreate','','创建')}
 if(o.kind==='confirm'){[title,desc]=confirms[o.id];body=op('safe','confirmActions','dismiss','','取消')+op('yes','confirmActions','doConfirm',o.id,confirms[o.id][2]);initial='safe'}
 if(o.kind==='pref'){title=prefLabels[o.id];desc=extraPreferences[o.id]?.help||'';body=prefOpts[o.id].map(([v,l],i)=>op('opt-'+i,'opt'+i,'setPref',i,l,prefs[o.id]===v)).join('');initial='opt-'+prefOpts[o.id].findIndex(([v])=>v===prefs[o.id])}
 if(o.kind==='keyboard'){title='遥控器键盘';desc='输入拼音、拼音首字母或数字，选择候选词或直接搜索。';cls='wideDrawer';const q=o.q||'',tokens=q.trim()?Object.keys(data.pinyin).filter(t=>matches(q,[t])).slice(0,4):['芙莉莲','机械键盘','山川观测','预告'];
 body='<div class="keyBuffer">'+esc(q||'输入关键词')+'</div><div class="candidates">'+tokens.map((t,i)=>op('kc-'+i,'candidates','keyCandidate',t,t)).join('')+'</div><div class="keyGrid">'+'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').map((k,i)=>op('key-'+k,'keys'+Math.floor(i/9),'keyChar',k,k)).join('')+'</div><div class="keyActions">'+op('key-del','keyActions','keyDel','','删除')+op('key-clear','keyActions','keyClear','','清空')+op('key-go','keyActions','keyGo','','搜索')+'</div>';initial='key-A'}
 if(o.kind==='watch'){const p=watchPanel(o);({title,desc,body,initial,cls}=p)}
 focusStructureVersion++;modal.dataset.transport=current().type==='player'?'on':'off';modal.dataset.mode=o.mode||o.kind;modal.dataset.kind=o.kind;modal.dataset.inline=String(!!o.inline);modal.innerHTML=drawer(title,desc,body,cls||'');if(o.inline){const panel=modal.querySelector('.drawer');panel.removeAttribute('aria-modal');panel.setAttribute('role','region')}const n=(target||initial?modal.querySelector('[data-k="'+CSS.escape(target||initial)+'"]'):null)||modal.querySelector('[data-k]');n?.focus({preventScroll:true});n?.scrollIntoView({block:'nearest',inline:'nearest'});if(bsOnline)window.BSEpisodeArt?.observe();
}
function setPreference(k,val){prefs[k]=val;speed=prefs.speed;commentsOn=prefs.dm;storePrefs();if(current().type==='player'){video.playbackRate=current().room?1:speed;if(['quality','codec','audio'].includes(k))changeSource();if(k==='fitMode')video.style.objectFit=val;updateControls();paintComments()}else redraw(current().focus)}
function confirmDo(id){completeOverlay(()=>{if(id==='logout'){signed=false;save('signed',false)}
 if(id==='clear-cache'){cachedResults.clear();save('result-cache',[])}
 if(id==='queries'){searchHistory=[];save('searches',searchHistory)}
 if(id==='clear-local'||id==='clear-history'){if(id==='clear-history'&&current().origin==='cloud'){profile.cloud={};storeProfile()}else{progress={};save('history',progress)}}
 if(id==='defaults'){Object.assign(prefs,{theme:'ink',codec:'auto',audio:'auto',fitMode:'contain',speed:1,quality:'auto',dm:true,opacity:.85,dmSize:24,density:2,autonext:false,large:false,reduced:false});speed=1;commentsOn=true;storePrefs()}
 redraw(current().focus);notice(id==='logout'?'已退出':'已完成')})}
function mineGo(id){if(id==='shelfA'||id==='shelfD')protect('shelf',{filter:id==='shelfA'?'anime':'drama'});else if(['history','settings'].includes(id))page(id);else protect(id)}
function goAuthor(id){if(overlay)completeOverlay(()=>page('author',{id}));else page('author',{id})}
function selectTab(act,id,k,row){const s=current();const prop={filter:'filter',shelfTab:'filter',area:'area',zone:'cat',topic:'topic',criterion:row,authorTab:'tab',feedCreator:'creator',resultType:'tab',sort:'sort',historyOrigin:'origin',settingGroup:'group'}[act];if(!prop||s[prop]===id)return false;
 s[prop]=id;if(act==='shelfTab')s.index=gallery[id]||0;if(act==='filter'&&s.root==='home')s.pinRec=false;if(act==='zone')s.topic='全部';if(act==='feedCreator'&&!profile.follows.includes(id)&&id!=='all')s.creator='all';if(act==='resultType')s.sort='综合排序';
 redraw(k,true);return true}
const immediate=['filter','shelfTab','area','zone','topic','criterion','authorTab','feedCreator','resultType','sort','historyOrigin','settingGroup'];
function dispatch(el){const {act:a,id,k,row}=el.dataset,s=current();
 if(bsOnline && (a==='demoTracks' || (a==='scenario' && scenarios.some(x=>x[0]===id)))){
  const example=a==='demoTracks'?'decoder':id;
  s.focus=k||s.focus;stash();stamp();
  history.replaceState({...history.state,exampleOrigin:true},'','');
  const url=new URL(location.href);url.search='';url.searchParams.set('mode','demo');url.searchParams.set('example',example);
  location.assign(url.href);return;
 }
 if(revisedDispatch(a,id,s))return;
 if(a==='themes'){openOverlay('themes');return}if(a==='themeSet'){prefs.theme=id;storePrefs();completeOverlay(()=>redraw('set-theme'));return}
 if(a==='layoutChooser'){openOverlay('layouts',{mode:id});return}if(a==='layoutSet'){const m=overlay.mode;prefs['layout_'+m]=id;storePrefs();completeOverlay(()=>redraw('s-'+collection[m][gallery[m]||0]));return}
 if(a==='spot'){if(s.spot!==id){s.spot=id;redraw(k)}return}
 if(a==='galleryStep'){stepGallery(Number(id));return}
 if(a==='demoTracks'){startWatch('orbit');return}
 if(a==='nav'){if(s.root!==id)rootTo(id);return}if(immediate.includes(a)){selectTab(a,id,k,row);return}
 if(a==='back'){back();return}if(a==='dismiss'){closeOverlay();return}
 if(a==='recover'){s.problem=null;redraw(null,true);notice('已重新加载');return}
 if(a==='scenario'){if(id.startsWith('catalog-'))page('catalog',{kind:'anime',problem:id.split('-')[1],focus:'retry'});else if(id==='search-fail')page('results',{q:'预告',tab:'video',sort:'综合排序',problem:'fail',focus:'retry'});else if(id==='tier-wall')startWatch('eclipse',0,{restricted:true});else go({type:'detail',id:'48416',wall:id,focus:'feature'});return}
 if(a==='wallLogin'){page('login',{unlock:true});return}if(a==='previewInstead'){startWatch(id);return}
 if(a==='page'){page(id);return}if(a==='private'){protect(id);return}if(a==='mineGo'){mineGo(id);return}
 if(a==='guideGo'){if(id==='search'){page('search');return}if(['zones','live','feed','cinema'].includes(id)){rootTo(['zones','live'].includes(id)?'home':id);if(['zones','live'].includes(id)){base().filter=id;redraw('homeTab-'+id,true)}return}mineGo(id);return}
 if(a==='search'){page('search',{focus:'osk-A'});return}if(a==='editQuery'){if(pages.at(-2)?.name==='search'){history.back()}else page('search',{q:s.q});return}
 if(a==='clearInput'){current().q='';$('query').value='';redraw('query');return}
 if(a==='keyboard'){openOverlay('keyboard',{q:$('query').value});return}if(a==='submit'||a==='queryWord'){submitQuery(a==='submit'?$('query').value:id);return}
 if(a?.startsWith('key')){const o=overlay;if(a==='keyCandidate'||a==='keyGo'){const v=a==='keyCandidate'?id:o.q;if(!v?.trim()){notice('先输入关键词');return}completeOverlay(()=>{current().q=v;submitQuery(v)});return}o.q=a==='keyDel'?o.q.slice(0,-1):a==='keyClear'?'':(o.q+id.toLowerCase()).slice(0,60);current().q=o.q;$('query').value=o.q;drawOverlay(k);return}
 if(a==='refresh'){batch++;redraw('refresh',true);revealRefreshedBatch();return}
 if(a==='item'){go({type:'detail',id,ep:latestFor(id)?.ep||1,focus:'feature'});return}
 if(a==='play'){startWatch(id);return}if(a==='playWork'||a==='episode'){if(a==='episode')s.ep=Number(id);startWatch(s.id,W[s.id].count>1?s.ep:0);return}
 if(['resume','historyPlay','restart'].includes(a)){const [mid,ep]=id.split(':');const book=s.origin==='cloud'?profile.cloud:progress;const record=book[id];startWatch(mid,Number(ep),{at:a==='restart'||record?.done?0:record?.t||0});return}
 if(a==='collect'){if(needUser())return;const w=W[id];const on=flip(collection[w.kind],id);storeProfile();redraw(k);notice(on?'已加入片单':'已移出片单');return}
 if(a==='shelfPage'){const m=s.filter,size=m==='anime'?8:6;gallery[m]=Math.min(collection[m].length-1,Math.max(0,(Math.floor(gallery[m]/size)+Number(id))*size));redraw('s-'+collection[m][gallery[m]]);return}
 if(a==='cinPage'){if(id==='shelf')protect('shelf',{filter:s.filter});else page(id,{kind:s.filter,rankMode:s.sectionByMode?.[s.filter]});return}
 if(a==='room'){const r=R[id];if(r.on)startWatch(r.media,0,{room:id});else page('offlineRoom',{id});return}
 if(a==='post'){page('post',{id});return}if(a==='author'){goAuthor(id);return}
 if(a==='follow'){if(needUser())return;const on=flip(profile.follows,id);storeProfile();const fn=()=>{updateBehind();notice(on?'已关注':'已取消关注')};if(overlay)completeOverlay(fn);else fn();return}
 if(a==='folder'){protect('folder',{folder:id});return}if(a==='newFolder'){openOverlay('folderName');return}
 if(a==='folderCreate'){const n=$('folderInput').value.trim();if(!n||Object.hasOwn(profile.folders,n)||['__proto__','constructor','prototype'].includes(n)){notice('请使用新的收藏夹名称');return}profile.folders[n]=[];storeProfile();completeOverlay(()=>redraw('folder-'+n));return}
 if(a==='videoMenu'){if(s.name==='likes')return;const main=el.closest('.tileWrap')?.querySelector('[data-k]');if(main)main.focus({preventScroll:true});openOverlay('videoMenu',{id});return}
 if(a==='saveFolder'){if(needUser())return;openOverlay('folders',{id},true);return}
 if(a==='putFolder'){const on=flip(profile.folders[id],overlay.id);storeProfile();completeOverlay(()=>{updateBehind();notice(on?'已存入「'+id+'」':'已移出「'+id+'」')});return}
 if(a==='mediaLike'||a==='mediaLater'){if(needUser())return;const on=flip(a==='mediaLike'?profile.likes:profile.later,id);storeProfile();completeOverlay(()=>{updateBehind();notice(a==='mediaLike'?(on?'已点赞':'已取消点赞'):(on?'已加入稍后再看':'已移出稍后再看'))});return}
 if(a==='pref'){openOverlay('pref',{id});return}if(a==='setPref'){const x=overlay.id,v=prefOpts[x][Number(id)][0];completeOverlay(()=>setPreference(x,v));return}
 if(a==='catVisible'){if(prefs.cats.includes(id)&&prefs.cats.length===1){notice('至少保留一个分区');return}flip(prefs.cats,id);storePrefs();redraw(k);return}
 if(a==='raiseCat'){const pos=prefs.cats.indexOf(id);if(pos>0)[prefs.cats[pos-1],prefs.cats[pos]]=[id,prefs.cats[pos-1]];storePrefs();redraw(bsOnline?'raise-'+id:'visible-'+id);return}
 if(a==='confirm'){openOverlay('confirm',{id});return}if(a==='doConfirm'){confirmDo(id);return}
 if(a==='accountAct'){if(signed)openOverlay('confirm',{id:'logout'});else page('login');return}
 if(a==='login'){page('login');return}if(a==='renew'){s.pair=(s.pair+1)%data.pair.length;s.exp=Date.now()+120000;redraw('pair-confirm');return}
 if(a==='pairConfirm'){if(Date.now()>=s.exp){updatePair();return}signed=true;save('signed',true);if(s.unlock&&pages.at(-2)?.wall==='login-wall'){pages.at(-2).wall=null;queuedEpisode='unlock';history.back()}else if(s.returnTarget){pages[pages.length-1]={type:'page',name:s.returnTarget.name,...s.returnTarget.props,scroll:0};stamp();render()}else if(pages.length>1)history.back();else rootTo('mine');notice('已登录体验账号');return}
 watchAction(a,id,k)
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&!b.disabled)dispatch(b)});
document.addEventListener('input',e=>{if(e.target.id==='query'){current().q=e.target.value;updateSearchSide(current().q);const c=document.querySelector('.clearInput');if(c){c.disabled=!current().q;c.setAttribute('aria-hidden',String(!current().q))}}});
document.addEventListener('focusin',e=>{const el=e.target;if(overlay?.mode==='episodes'&&el.dataset.act==='watchEpisode')showEpisodePreview(Number(el.dataset.id));if(overlay?.kind==='themes'&&el.dataset.act==='themeSet')setTheme(el.dataset.id);if(!el.dataset.k||restoring||overlay||current().type==='player')return;
 const {act,id,k,row}=el.dataset;current().focus=k;if(act==='nav'&&current().type==='browse'&&current().root!==id){rootTo(id);return}
 if(act==='spot'&&current().spot!==id){current().spot=id;redraw(k);return}
 if(act==='channelSub'){applyChannelSub(id);return}
 if(immediate.includes(act)){selectTab(act,id,k,row);return}
 if(current().root==='cinema'&&row==='filmRail'&&$('cinStage')){if(bsOnline)view.scrollTop=0;const w=W[id]||V[id];if(w){current().featureId=id;$('cinStage').innerHTML=cinemaFeature(w,current().filter);for(const pick of view.querySelectorAll('.cinPick'))pick.setAttribute('aria-pressed',String(pick.dataset.id===id))}}
 if(current().name==='shelf'){if(k.startsWith('s-'))updateGallery(id);else if(el.closest('.shelfCell'))scheduleShelfPreview(id);else stopShelfPreview()}
 alignStrip(el);
 syncHints()});

const parts={terrain:[['terrain','山脉的轮廓'],['map','山脊的等高线']]};
let activeMedia=null,playingRoute=null,mediaDuration=0,previewSeek=null,lastWrite=0,hudTimer=null,startPaused=false,sourceVersion=0;
function mediaId(s){return parts[s.id]?.[Math.max(0,(s.ep||1)-1)]?.[0]||W[s.id]?.mediaRef||s.id}
function playKey(s){return s.id+':'+(s.ep||0)}
function startWatch(id,ep=0,opts={}){if(!V[id]&&!W[id])return;const visible=[...view.querySelectorAll('[data-act="play"]')].map(n=>n.dataset.id);
 const queue=[...new Set([id,...visible.filter(x=>V[x]),...homeFeed])];const state={type:'player',id,ep,queue,focus:opts.room?'toggle':'seek',...opts};
 if(current().type==='player'){rememberPlayback();pages[pages.length-1]=state;stamp();render()}else go(state)}
function rememberPlayback(){if(!playingRoute||playingRoute.room||!Number.isFinite(video.duration)||previewSeek!==null||video.readyState<1)return;
 const k=playKey(playingRoute),t=video.currentTime||0;if(t<.15&&!video.ended)return;
 progress[k]={t,d:video.duration,ep:playingRoute.ep||0,done:video.ended||t>=video.duration-.35,recent:Date.now()};save('history',progress);if(signed){profile.cloud[k]={...progress[k]};storeProfile()}lastWrite=Date.now()}
function stopWatch(){stopEpisodePreview();if(!activeMedia)return;rememberPlayback();clearTimeout(hudTimer);cancelCountdown();playingRoute=null;activeMedia=null;sourceVersion++;video.pause();video.removeAttribute('src');video.load();player.classList.remove('quiet')}
function doPlay(){const token=sourceVersion;video.play().catch(()=>{if(token===sourceVersion&&current().type==='player'){wake(false);updateControls()}})}
function toggle(){lastIntentPaused=!video.paused&&!video.ended;wake(false);if(video.paused||video.ended){cancelCountdown();if(video.ended)video.currentTime=0;doPlay()}else video.pause()}
function wake(arm=true){player.classList.remove('quiet');clearTimeout(hudTimer);if(arm)armHud()}
function armHud(){clearTimeout(hudTimer);if(video.paused||overlay||countdown||current().type!=='player')return;hudTimer=setTimeout(()=>{if(!overlay&&!countdown&&!video.paused&&current().type==='player')player.classList.add('quiet')},4200)}
function changeSource(initial=false){useTrack(initial)}
function renderWatch(s){const key=playKey(s)+'|'+(s.room||''),w=W[s.id]||V[s.id];if(!w){back();return}
 $('shell').hidden=true;player.hidden=false;if(key!==activeMedia){stopWatch();activeMedia=key;playingRoute=s;const p=progress[playKey(s)];previewSeek=s.room?0:s.at??(p&&!p.done?p.t:0);mediaDuration=w.duration||18;startPaused=!!s.restorePaused;lastIntentPaused=startPaused;changeSource(true)}
 $('pKind').textContent=s.room?'直播间 · 本地循环演示':w.original||w.mediaRef?'原创演示短片':'本作画面样片';
 $('pTitle').textContent=s.room?R[s.room].title:w.title;$('pSub').textContent=s.room?C[R[s.room].host][0]+'　·　'+R[s.room].area:W[s.id]?(types[w.kind]+(w.count>1?'　/　'+epname(w,s.ep):'')):parts[s.id]?w.artist+'　/　P'+(s.ep||1)+' '+parts[s.id][(s.ep||1)-1][1]:w.artist;
 document.querySelector('.timelineRow').hidden=!!s.room;$('seek').dataset.row='seek';$('pFoot').innerHTML=hints('确定',s.room?'直播控制':'播放 / 暂停')+(s.room?'':hints('← →','在进度条上跳转 5 秒'))+hints('Esc','返回');
 wake(false);updateControls();updateProgress();paintComments();focus(s.focus||(s.room?'toggle':'seek'),false);if(!video.paused)armHud()
}
function updateControls(){focusStructureVersion++;
 const s=current();if(s.type!=='player')return;
 const room=R[s.room],work=W[s.id],v=V[s.id],was=$('pControls').contains(document.activeElement)?document.activeElement.dataset.k:null;
 const ctrl=(key,txt,symbol,secondary=false,lit=false)=>b(key,'tools','dockAction',key,(symbol?'<i aria-hidden="true">'+symbol+'</i>':'')+'<span>'+esc(txt)+'</span>','dockKey'+(secondary?' secondaryKey':'')+(lit?' lit':'')+(key==='toggle'?' mainKey':''));
 const left=[ctrl('toggle',video.paused?(video.ended?'重播':'播放'):'暂停',video.paused?'▶':'Ⅱ')];
 if(room){left.push(ctrl('roomFollow',signed&&profile.follows.includes(room.host)?'已关注':'关注主播','＋'),ctrl('up','主播空间','◎'))}
 else{
  if(hasEpisodes(s))left.push(ctrl('episodes',work?'选集':'分 P','▦'));
  if(v)left.push(ctrl('like',signed&&profile.likes.includes(v.id)?'已点赞':'点赞','♡',false,signed&&profile.likes.includes(v.id)),ctrl('up','UP 主','◎'));
  if(work&&['anime','drama'].includes(work.kind))left.push(ctrl('collectWork',(signed&&collection[work.kind].includes(work.id)?'已追':'追')+(work.kind==='anime'?'番':'剧'),'＋'));
  left.push(ctrl('recommend','推荐视频','▤'));
 }
 const right=[ctrl('quality','画质','',true),room?ctrl('line','线路','',true):ctrl('speed',prefs.speed+'×','',true),ctrl('dm',prefs.dm?'弹幕开':'弹幕关','',true,prefs.dm),ctrl('playPrefs','播放设置','',true)];
 $('pControls').innerHTML='<div class="dockLeft">'+left.join('')+'</div><div class="dockRight">'+right.join('')+'</div>';
 if(was&&!overlay)focus(was,false);
 if($('pFoot'))$('pFoot').textContent=room?'确定 控制　　返回 退出直播':hasEpisodes(s)?'← → 调进度　　↓ ↓ '+(work?'预览选集':'预览分 P')+'　　返回 退出播放':'← → 调进度　　↓ ↓ 看推荐　　返回 退出播放';
}

function updateProgress(){const d=Number.isFinite(video.duration)?video.duration:mediaDuration,t=video.currentTime||0;$('trackFill').style.width=(d?Math.min(100,t/d*100):0)+'%';$('pTime').textContent=clock(t)+' / '+clock(d);$('seek').setAttribute('aria-valuemax',Math.floor(d));$('seek').setAttribute('aria-valuenow',Math.floor(t));$('seek').setAttribute('aria-valuetext',clock(t)+' / '+clock(d));if(activeMedia&&!video.paused&&Date.now()-lastWrite>3000)rememberPlayback()}
function jump(t){if(current().room||!Number.isFinite(t))return;if(!Number.isFinite(video.duration))previewSeek=Math.max(0,t);else video.currentTime=Math.max(0,Math.min(video.duration-.05,t));updateProgress();wake()}
function nextItem(){const s=current(),w=W[s.id];if(w?.count>1&&w.count>s.ep)return {id:s.id,ep:s.ep+1};if(parts[s.id]&&(s.ep||1)<parts[s.id].length)return {id:s.id,ep:(s.ep||1)+1};if(!w){const i=(s.queue||[]).indexOf(s.id),id=s.queue?.[i+1];if(id)return {id,ep:0}}return null}
function nextVideo(next){if(!next)return;const q=current().queue;cancelCountdown();startWatch(next.id,next.ep,{at:0,queue:q})}
// A queued ended event can arrive after the Android host has paused the player.
let autoNextSuspended=false;
window.addEventListener('pagehide',()=>{
 if(current().type!=='player')return;
 autoNextSuspended=true;
 if(countdown){cancelCountdown();focus('toggle',false)}
});
function cancelCountdown(){if(countdown){clearInterval(countdown.timer);countdown=null}document.getElementById('nextPrompt')?.remove()}
document.addEventListener('keydown',event=>{
 if(!countdown || !(event.key==='MediaPlay' || (event.key==='MediaPlayPause' && video.paused)))return;
 event.preventDefault();
 cancelCountdown();
 focus('toggle',false);
 if(video.ended||video.paused)toggle();
});
function autoNext(){const n=nextItem();if(autoNextSuspended||!prefs.autonext||!n||overlay||current().room)return;cancelCountdown();countdown={n,seconds:5};const box=document.createElement('div');box.id='nextPrompt';box.innerHTML='<strong id="tick"></strong>'+b('next-now','next','nextNow','','立即播放','secondary')+b('next-cancel','next','nextCancel','','取消','secondary');player.append(box);
 const tick=()=>{if(!countdown)return;$('tick').textContent=countdown.seconds+' 秒后播放　'+(n.id===current().id?(W[n.id]?epname(W[n.id],n.ep):'P'+n.ep):(W[n.id]||V[n.id]).title)};tick();focus('next-cancel',false);countdown.timer=setInterval(()=>{if(!countdown)return;if(--countdown.seconds<=0)nextVideo(n);else tick()},1000)}
const dmTexts=['喜欢这一帧的光影','在电视上看正合适','这一段值得再看一遍'];let lastAnim=0;
function paintComments(){const box=player.querySelector('.comments');if(!activeMedia||!prefs.dm){box.hidden=true;return}box.hidden=false;box.style.opacity=prefs.opacity;const amount=prefs.density;if(box.children.length!==amount){box.innerHTML=dmTexts.slice(0,amount).map((t,i)=>'<span style="top:'+i*40+'px">'+t+'</span>').join('')}
 [...box.children].forEach((n,i)=>{const phase=((video.currentTime||0)+[3,6.1,.6][i])%12;n.style.fontSize=prefs.dmSize+'px';n.style.transform='translateX('+(1435-phase*159)+'px)'})}
function anim(ms){if(!player.hidden&&(bsOnline||ms-lastAnim>40)){paintComments();lastAnim=ms}requestAnimationFrame(anim)}requestAnimationFrame(anim);
video.addEventListener('loadedmetadata',()=>{if(!activeMedia)return;mediaDuration=video.duration;const t=previewSeek;previewSeek=null;if(Number.isFinite(t)&&t>0)video.currentTime=Math.min(t,Math.max(0,mediaDuration-.05));video.playbackRate=current().room?1:prefs.speed;updateProgress();if(startPaused)video.pause()});
video.addEventListener('seeked',()=>{updateProgress();updateControls();paintComments()});
video.addEventListener('timeupdate',updateProgress);video.addEventListener('play',()=>{
 if(!video.paused)autoNextSuspended=false;
 updateControls();armHud()
});video.addEventListener('pause',()=>{if(activeMedia){rememberPlayback();wake(false);updateControls();paintComments()}});
video.addEventListener('ended',()=>{if(!activeMedia)return;rememberPlayback();wake(false);updateControls();if(!overlay){focus('toggle',false);autoNext()}});
video.addEventListener('error',onTrackError);
player.addEventListener('pointermove',()=>{if(current().type==='player'&&!overlay)wake()});
video.addEventListener('click',()=>{if(current().type==='player'&&!overlay)toggle()});
$('seek').addEventListener('click',e=>{if(!e.detail){toggle();return}const r=$('seek').getBoundingClientRect();jump((e.clientX-r.left)/r.width*video.duration)});
function watchPanel(o){const s=current(),w=W[s.id]||V[s.id],mode=o.mode;let title,desc=w.title,body='',initial,cls='';
 if(mode==='tech')return detailsPanel();if(['quality','speed','line'].includes(mode)){title={quality:'播放画质',speed:'播放倍速',line:'直播线路'}[mode];const entries=mode==='line'?[['auto','主线路 · 原片'],['low','低带宽线路 · 180p']]:prefOpts[mode],sel=mode==='line'?(s.line||'auto'):prefs[mode];body=entries.map(([v,l],i)=>op('wp-'+i,'wp'+i,'watchPick',String(v),l,sel===v)).join('');initial='wp-'+entries.findIndex(([v])=>v===sel);
 if(mode==='quality'&&s.restricted)body+='<div class="lockedTier">1080P · 大会员专享<small>权限状态演示</small></div>';if(mode==='quality')desc='可选档位取决于片源。离线样片提供原片和 180p 两档。';if(mode==='line')desc='用两份本地编码样片演示切换线路。'}
 if(mode==='episodes')return episodePanel(s);
 if(mode==='settings'||mode==='more')return watchPreferences(s);
 if(mode==='queue')return recommendationPanel(s);
 if(mode==='dm'){title='弹幕设置';body=['dm','opacity','dmSize','density'].map((k,i)=>op('dm-'+k,'dm'+i,'watchPref',k,prefLabels[k]+'　'+prefLabel(k))).join('')}
 return {title,desc,body,initial,cls}}
function watchAction(a,id,k){const s=current();if(s.type!=='player')return;
 if(a==='retryMedia'){changeSource();doPlay();return}
 if(a==='watchTool'){if(id==='toggle')toggle();else if(id==='dm')setPreference('dm',!prefs.dm);else if(id==='roomFollow')dispatch({dataset:{act:'follow',id:R[s.room].host}});else openOverlay('watch',{mode:id});return}
 if(a==='watchSub'){if(id==='autonext')openOverlay('pref',{id},true);else openOverlay('watch',{mode:id},true);return}
 if(a==='watchPref'){openOverlay('pref',{id},true);return}
 if(a==='watchPick'){const m=overlay.mode;completeOverlay(()=>{if(m==='line'){s.line=id;changeSource()}else setPreference(m,m==='speed'?Number(id):id);wake();notice('已切换')});return}
 if(a==='watchEpisode'){completeOverlay(()=>{if((s.ep||1)!==Number(id))startWatch(s.id,!W[s.id]&&Number(id)===1?0:Number(id),{queue:s.queue});else wake()});return}
 if(a==='watchCollect'){if(needUser())return;const on=flip(collection[W[id].kind],id);storeProfile();completeOverlay(()=>notice(on?'已加入片单':'已移出片单'));return}
 if(a==='nextCancel'){cancelCountdown();focus('toggle',false);return}if(a==='nextNow'||a==='queuePlay'){const n=a==='queuePlay'?{id,ep:0}:nextItem();const fn=()=>nextVideo(n);if(overlay)completeOverlay(fn);else fn()}
}

const themes={
 ink:{name:'墨青放映室',colors:['#12191f','#243335','#ffa78c']},
 amber:{name:'琥珀灯影',colors:['#231917','#523629','#ffc48c']},
 blue:{name:'午夜靛蓝',colors:['#121829','#263955','#a8ceff']},
 jade:{name:'雨后松林',colors:['#101f1c','#28483d','#a8ddae']}
};
const layouts={edition:'展架',folio:'旅行手账',film:'胶片放映台',case:'典藏书匣'};
const viewStyle=m=>(Object.hasOwn(layouts,prefs['layout_'+m])?prefs['layout_'+m]:'edition');
function setTheme(key){document.body.dataset.theme=Object.hasOwn(themes,key)?key:'ink'}
function themeChoices(o){
 const isTheme=o.kind==='themes',opts=isTheme?Object.entries(themes):Object.entries(layouts);
 const selected=isTheme?prefs.theme:viewStyle(o.mode);
 const body=opts.map(([id,val],i)=>{
  const mark=isTheme?'<i class="themeSwatch" style="--sample0:'+val.colors[0]+';--sample1:'+val.colors[1]+';--sample2:'+val.colors[2]+'"><i></i></i>':'<i class="layoutSwatch '+id+'"><i></i><i></i><i></i></i>';
  return b('style-'+id,'style'+i,isTheme?'themeSet':'layoutSet',id,mark+'<span>'+(isTheme?val.name:shelfName(o.mode,id))+'</span>'+(id===selected?'<em>已选</em>':''),'styleChoice','aria-pressed="'+(id===selected)+'"')
 }).join('');
 return {title:isTheme?'界面背景':'片单陈列',desc:isTheme?'移动焦点预览，按确定保存。':o.mode==='anime'?'为我的追番选择一种陈列方式。':'为我的追剧选择一种陈列方式。',body,initial:'style-'+selected}
}
function libraryArt(w,prefer='scene'){
 // All fields remain optional and the picture is always contained within its slot.
 return prefer==='cover'?(w.cover||w.wide||w.still||w.hero):(w.still||w.wide||w.hero||w.cover)
}
const palette=['#889988','#c79a73','#9d9cb5','#83a6af','#bf8a8a','#a79070','#82998e'];
const colorFor=w=>palette[(Number(w.id.replace(/\D/g,''))||3)%palette.length];
function sheetData(mode,i){const ids=collection[mode],w=W[ids[i]],p=latestFor(w.id);
 return {w,index:i,ids,meta:workMeta(w),progress:p?((p.ep?'第 '+p.ep+' '+epUnit(w)+' · ':'')+clock(p.t)):release(w)||'已收入片单',hint:p?'上次观看':'收录信息'}}
function serial(n){return String(n).padStart(2,'0')}
function galleryCaption(d){return '<div class="galleryCaption"><span>'+esc(d.meta)+'</span><h2>'+esc(d.w.title)+'</h2><p>'+esc(d.w.desc||'')+'</p><div class="recordLine"><small>'+d.hint+'</small>'+esc(d.progress)+'</div></div>'}
function folioStage(d){const w=d.w;
 return '<div class="bookSurface"><div class="bookPrint"><small>'+esc(w.kind==='anime'?'动画手账':'剧集手账')+'</small>'+galleryCaption(d)+'<span class="pageNumber">'+serial(d.index+1)+' / '+serial(d.ids.length)+'</span></div><div class="bookPhoto"><div class="mounted">'+paint('book',libraryArt(w,'scene'),w.title,'mountArt')+'</div></div></div>'}
function caseStage(d){return '<div class="caseReport"><div class="casePlate">'+paint('case',libraryArt(d.w,'cover'),d.w.title,'caseArt')+'</div>'+galleryCaption(d)+'</div>'}
function collectionCard(m,style,id,i,active){
 const w=W[id],isActive=i===active;
 let inside;if(style==='folio')inside='<span class="thumbPrint">'+paint('folio-tab',libraryArt(w,'cover'),w.title,'slipArt')+'</span><span class="folioIndex">'+serial(i+1)+'</span><strong>'+esc(w.title)+'</strong>';
 if(style==='film')inside='<div class="filmPhoto">'+paint('cell',libraryArt(w),w.title,'frameArt')+'</div><div class="filmLabel"><b>'+serial(i+1)+'</b><strong>'+esc(w.title)+'</strong></div>';
 if(style==='case')inside='<i class="spineRule"></i><b>'+serial(i+1)+'</b><strong>'+esc(w.title)+'</strong><i class="spineRule"></i>';
 return b('s-'+id,'collectionItems','item',id,inside,'collectCard '+style+'Card'+(isActive?' picked':''),'aria-label="'+esc(w.title)+'" aria-pressed="'+isActive+'" style="--bookTint:'+colorFor(w)+'"')
}
function shelf(){
 const s=current(),mode=s.filter,ids=collection[mode],total=ids.length;
 const i=gallery[mode]=Math.max(0,Math.min(gallery[mode]||0,total-1)),start=Math.floor(i/shelfPageSize)*shelfPageSize;
 const pages=Math.max(1,Math.ceil(total/shelfPageSize)),pageNo=1+Math.floor(i/shelfPageSize);
 const pager=pages>1?b('shelf-prev','shelfTab','densePage','-1','‹','pageMove',pageNo===1?'disabled aria-label="上一页"':'aria-label="上一页"')+'<span>'+pageNo+' / '+pages+' 页</span>'+b('shelf-next','shelfTab','densePage','1','›','pageMove',pageNo===pages?'disabled aria-label="下一页"':'aria-label="下一页"'):'';
 const head='<div class="shelfHeading denseHead">'+subTabs([['anime','我的追番'],['drama','我的追剧']],mode,'shelfTab','shelfTab')+'<span class="collectionCount">'+total+' 部作品</span><div class="shelfTools">'+pager+(total?b('shelf-more','shelfTab','shelfMenu','','作品详情　›','textBtn'):'')+'</div></div>';
 if(!total)return wrap(head+empty('片单里还没有作品','<p>从作品详情加入追番或追剧。</p>'));
 let rows='';
 for(let offset=start;offset<Math.min(start+shelfPageSize,total);offset+=shelfCols){
  const row=ids.slice(offset,offset+shelfCols),selected=!bsOnline || s.focus==='s-'+ids[i],expanded=selected&&i>=offset&&i<offset+row.length?i-offset:-1;
  rows+='<div class="denseRow" style="grid-template-columns:'+shelfTracks(expanded)+'">'+row.map((id,j)=>shelfCell(id,offset+j,selected&&offset+j===i)).join('')+'</div>';
 }
 return wrap(head+'<div class="denseWall">'+rows+'</div>');
}

function updateGallery(id){
 const s=current(),ids=collection[s.filter],i=ids.indexOf(id);if(i<0)return;
 gallery[s.filter]=i;s.index=i;
 for(const row of view.querySelectorAll('.denseRow')){
  let col=-1;Array.from(row.children).forEach((cell,j)=>{
   const selected=cell.dataset.work===id;if(selected)col=j;
   cell.classList.toggle('expanded',selected);
   cell.querySelector('.coverKey').setAttribute('aria-pressed',String(selected));

  });row.style.gridTemplateColumns=shelfTracks(col);
 }
 scheduleShelfPreview(id);
}

function stepGallery(delta){
 const s=current(),ids=collection[s.filter],next=Math.max(0,Math.min(ids.length-1,gallery[s.filter]+delta));if(!ids.length)return;
 const k='s-'+ids[next];if(node(k)){focus(k);return}gallery[s.filter]=next;s.index=next;redraw(k,true);
}

function galleryKeys(key,r){
 const s=current(),ids=collection[s.filter],i=gallery[s.filter],el=document.activeElement;
 if(!ids.length)return false;
 if(r==='shelfTab'&&key==='ArrowDown'){focus('s-'+ids[i]);return true}
 if(!(el.closest('.shelfCell')))return false;
 if(key==='ArrowLeft'||key==='ArrowRight'){stepGallery(key==='ArrowRight'?1:-1);return true}
 if(key==='ArrowUp'){if(i<shelfCols)focus('shelfTab-'+s.filter);else stepGallery(-shelfCols);return true}
 if(key==='ArrowDown'){if(Math.floor(i/shelfCols)<Math.floor((ids.length-1)/shelfCols))stepGallery(Math.min(shelfCols,ids.length-1-i));return true}
 return false;
}

const codecNames={avc:'AVC / H.264',hevc:'HEVC / H.265',av1:'AV1'};
const extraPreferences={
 codec:{name:'视频编码偏好',options:[['auto','自动兼容'],['avc','优先 AVC / H.264'],['hevc','优先 HEVC / H.265'],['av1','优先 AV1']],help:'在当前画质可用的轨道中优先选择；片源缺少该编码或设备解码失败时回退。'},
 audio:{name:'音轨码率偏好',options:[['auto','优先较高码率'],['std','优先节省带宽']],help:'有多条可播放音轨时按码率选择。单轨使用原音轨，无音轨的样片保持静音。'},
 fitMode:{name:'画面适配',options:[['contain','完整显示'],['cover','等比铺满']],help:'等比铺满会裁掉部分画面边缘。电影和竖屏视频默认完整显示。'}
};
for(const [k,p] of Object.entries(extraPreferences)){prefOpts[k]=p.options;prefLabels[k]=p.name}
function advancedRows(){return ['codec','audio','fitMode'].map((k,i)=>settingLine(k,i,'pref',k,prefLabels[k],prefLabel(k))).concat(settingLine('avDemo',3,'demoTracks','','播放多编码测试片','图形短片 · 24 秒'))}
const codecMimes={avc:'video/mp4; codecs="avc1.42E01E"',hevc:'video/mp4; codecs="hvc1.1.6.L93.B0"',av1:'video/mp4; codecs="av01.0.05M.08"'};
let selectedTrack=null,trackNote='',failedTracks=new Set();
function trackList(id,low){const group=data.variants[id]?.[low?'low':'full'];if(group)return group;
 const meta=data.meta[id]?.[low?'low':'full'];if(!meta)return [];return [{...meta,codec:'avc',bank:low?'low':'media'}]}
function orderedDecodable(candidates,want,audioPreference,canPlay){
 const priority=[...new Set([want==='auto'?'avc':want,'avc','hevc','av1'])];
 return candidates.filter(t=>canPlay(t.codec)).sort((a,b)=>priority.indexOf(a.codec)-priority.indexOf(b.codec)||(audioPreference==='std'?1:-1)*((a.ab||0)-(b.ab||0)))
}
function useTrack(initial=false,retry=false){
 const s=current();if(s.type!=='player')return;sourceVersion++;const id=mediaId(s),low=prefs.quality==='low'||(s.room&&s.line==='low');
 if(!retry)failedTracks=new Set();const tracks=trackList(id,low);const want=s.room?'auto':prefs.codec;
 const ranked=orderedDecodable(tracks,want,prefs.audio,c=>!!video.canPlayType(codecMimes[c])).filter(t=>!failedTracks.has(t.asset||t.bank));
 if(!initial&&!retry){previewSeek=Number.isFinite(video.currentTime)?video.currentTime:0;startPaused=video.paused}
 if(retry&&previewSeek===null){previewSeek=s.room?0:Math.max(0,video.currentTime||0);startPaused=lastIntentPaused}
 const t=ranked[0];selectedTrack=t||null;
 if(!t){$('mediaError').hidden=false;wake(false);return}const src=t.asset?data.variantMedia[t.asset]:data[t.bank][id];
 trackNote=want!=='auto'&&want!==t.codec?(tracks.some(x=>x.codec===want)?'设备不支持或解码失败，已改用 '+codecNames[t.codec]:'此档片源无 '+codecNames[want]+'，已用 '+codecNames[t.codec]):'';
 $('mediaError').hidden=!!src;if(!src)return;video.src=src;video.loop=!!s.room;video.style.objectFit=prefs.fitMode;video.playbackRate=s.room?1:speed;video.load();if(!startPaused)doPlay()
}
let lastIntentPaused=false;
function onTrackError(){
 if(!activeMedia||current().type!=='player')return;
 if(selectedTrack){failedTracks.add(selectedTrack.asset||selectedTrack.bank);useTrack(false,true);if(selectedTrack)return}
 $('mediaError').hidden=false;wake(false);if(!overlay)focus('media-retry',false)
}
function detailsPanel(){
 const t=selectedTrack,stat=video.getVideoPlaybackQuality?.(),info=t?[['实际视频编码',codecNames[t.codec]],['解码画面',(video.videoWidth||t.w)+' × '+(video.videoHeight||t.h)],['片源帧率',t.fps+' fps'],['视频平均码率',Math.round(t.vb/1000)+' kb/s'],['实际音轨',t.ab?'AAC · 双声道 · '+Math.round(t.ab/1000)+' kb/s':'本样片无音轨'],['本次丢帧',stat?stat.droppedVideoFrames+' / '+stat.totalVideoFrames+' 帧':'设备未提供'],['解码器实现','浏览器未公开软／硬解类型']]:[['片源','暂无可播放轨道']];
 const s=current(),body='<dl class="trackInfo">'+info.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>'+(trackNote?'<p class="choiceHelp">'+esc(trackNote)+'</p>':'')+(s.room?'':['codec','audio','fitMode'].map((k,i)=>op('ap-'+k,'av'+i,'watchPref',k,prefLabels[k]+'　'+prefLabel(k))).join(''));
 return {title:'播放信息',desc:s.room?'本地直播演示片源':'当前实际使用的本地片源',body,initial:s.room?undefined:'ap-codec'}
}

// Reuse row membership until controls change; a D-pad key must not measure
// every card in a long list. Geometry is needed only for the destination row.
function focusRows(scope){
 let cached=bsOnline&&focusStructures.get(scope);
 if(cached&&cached.version===focusStructureVersion)return cached;
 const elements=[...scope.querySelectorAll('[data-k]')].filter(n=>!n.disabled&&n.offsetWidth&&n.offsetHeight&&!n.closest('[hidden]'));
 const groups=new Map();for(const n of elements){const key=n.dataset.row||'single';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n)}
 cached={elements,groups,version:focusStructureVersion};if(bsOnline)focusStructures.set(scope,cached);return cached;
}
function appendRenderedList(existing,markup){
 if(!bsOnline||!existing||!document.createElement||!existing.matches('.grid,.roomGrid,.subGrid,.posterGrid,.feedGrid'))return false;
 const template=document.createElement('template');template.innerHTML=markup;
 const next=template.content.firstElementChild;if(!next||next.className!==existing.className)return false;
 const old=[...existing.children],fresh=[...next.children],key=n=>n.dataset.k||n.querySelector('[data-k]')?.dataset.k;
 if(fresh.length<old.length||old.some((n,i)=>!key(n)||key(n)!==key(fresh[i])))return false;
 if(fresh.length>old.length){existing.append(...fresh.slice(old.length));focusStructureVersion++;}
 return true;
}
function moveFocus(el,dir,scope){const {elements,groups}=focusRows(scope);if(!elements.length)return;
 if(!elements.includes(el)){focus(elements[0].dataset.k);return}
 const rows=[...groups.values()],idx=rows.findIndex(r=>r.includes(el)),r=rows[idx],col=r.indexOf(el),x=n=>{const b=n.getBoundingClientRect();return b.x+b.width/2},to=n=>{if(!n)return;n.focus({preventScroll:true});if(overlay)n.scrollIntoView({block:'nearest'});else bring(n)};
 if(dir==='ArrowLeft'||dir==='ArrowRight'){to(r[col+(dir==='ArrowLeft'?-1:1)]);return}
 const dr=dir==='ArrowDown'?1:-1,line=rows[idx+dr];if(!line)return;
 const selected=line.find(n=>n.getAttribute('aria-selected')==='true'||n.getAttribute('aria-current')==='page');
 if(selected){to(selected);return}if(el.dataset.row==='nav'||el.dataset.row==='refresh'||el.dataset.row==='sort'||el.dataset.row==='resultType'||line[0].dataset.row==='nav'){to(line[0]);return}
 to(line.reduce((best,n)=>Math.abs(x(n)-x(el))<Math.abs(x(best)-x(el))?n:best,line[0]))
}
function arrow(key){
 if(bsOnline&&overlay?.inline){
  if(key==='ArrowUp'){const anchor=overlay.mode==='episodes'?'episodes':'recommend';completeOverlay(()=>focus(anchor,false));return}
  if(key==='ArrowDown')return;
 }
 if(overlay){moveFocus(document.activeElement,key,modal);return}const s=current(),el=document.activeElement,k=el?.dataset.k||'',r=el?.dataset.row||'';
 if(s.type==='player'){playerArrows(el,key);return}
 if(revisedArrow(s,el,key))return;
 if(s.name==='settings'){if(r.startsWith('sg')&&key==='ArrowRight'){focus(document.querySelector('.settingsPane [data-k]')?.dataset.k);return}if(r.startsWith('set')&&key==='ArrowLeft'){focus('sg-'+s.group);return}if(r.startsWith('sg')&&['ArrowUp','ArrowDown'].includes(key)){const i=settingGroups.indexOf(s.group)+(key==='ArrowDown'?1:-1);if(i<0)focus('search-global');else if(settingGroups[i])focus('sg-'+settingGroups[i]);return}if(r==='nav'&&key==='ArrowDown'){focus('sg-'+s.group);return}}
 if(s.name==='shelf'&&galleryKeys(key,r))return;
 moveFocus(el,key,$('shell'))
}
function menuFor(el){if(overlay)return;if(current().name==='shelf'){shelfDetails();return}if(current().type==='player'){openOverlay('watch',{mode:'settings'});return}
 if(el?.dataset.act==='play'&&current().name!=='likes'){openOverlay('videoMenu',{id:el.dataset.id})}}
document.addEventListener('keydown',e=>{if(e.isComposing)return;const k=e.key,el=document.activeElement,input=el?.tagName==='INPUT';if(k==='Escape'||k==='BrowserBack'||k==='GoBack'||(k==='Backspace'&&!input)){e.preventDefault();back();return}
 if(input&&k==='Enter'){e.preventDefault();if(el.id==='query'){if(el.value.trim())submitQuery(el.value);else focus('osk-A')}else if(el.id==='folderInput')dispatch({dataset:{act:'folderCreate'}});return}
 if(input&&['ArrowLeft','ArrowRight'].includes(k)){if((k==='ArrowLeft'&&el.selectionStart>0)||(k==='ArrowRight'&&el.selectionEnd<el.value.length))return}
 if(!overlay&&current().name==='shelf'&&['PageUp','PageDown'].includes(k)){e.preventDefault();const i=gallery[current().filter];stepGallery((Math.max(0,Math.floor(i/shelfPageSize)+(k==='PageDown'?1:-1)))*shelfPageSize-i);return}
 if(k.startsWith('Arrow')){e.preventDefault();arrow(k);return}
 if(input)return;if(k==='ContextMenu'||k.toLowerCase()==='m'){e.preventDefault();menuFor(el);return}
 if((k===' '||k==='Enter')&&current().type==='player'&&!overlay&&(!el?.dataset.k||player.classList.contains('quiet')||el.id==='seek')){e.preventDefault();toggle();return}
 if(k==='Tab'&&overlay){const ns=[...modal.querySelectorAll('[data-k]')].filter(n=>!n.disabled),i=ns.indexOf(el);e.preventDefault();ns[(i+(e.shiftKey?-1:1)+ns.length)%ns.length]?.focus();return}
 if(k==='/'&&!overlay&&current().type!=='player'&&current().name!=='search'){e.preventDefault();page('search',{focus:'osk-A'})}});
document.addEventListener('contextmenu',e=>{if(e.target.closest('[data-act="play"],#player')){e.preventDefault();menuFor(e.target.closest('[data-act="play"]')||e.target)}});
const spotlights=['42715','48416','46089'];
const spotColors={'42715':'#453723','48416':'#2e263d','46089':'#273e38'};
function pct(p){return p?.d?Math.max(0,Math.min(100,100*p.t/p.d)):0}
function lineProgress(p){return '<i class="vProgress"><b style="width:'+pct(p)+'%"></b></i>'}
function getSurface(s){if(s.type==='browse')return s.root==='home'?(s.filter||'rec'):s.root;if(s.type==='detail')return 'detail';return s.name||s.type}
function durationText(w){return w.kind==='video'?clock(w.duration):release(w)||workMeta(w)}
function imageLine(w){return w?.cover||w?.wide||w?.still}
function tinyMark(key){
 const glyph={history:'◷',folders:'▤',later:'◴',likes:'♡',follows:'◎',settings:'⚙'};
 return '<i aria-hidden="true">'+(glyph[key]||'·')+'</i>'
}
function heroFilm(s){
 const w=W[spotlights.includes(s.spot)?s.spot:spotlights[0]],i=spotlights.indexOf(w.id);
 const dots=spotlights.map((id,n)=>'<i class="'+(i===n?'active':'')+'"></i>').join('');
 return b('hero-primary','hero','item',w.id,paint('spotlight',w.hero,w.title,'openingArt')+'<span class="openingCopy"><span class="eyeline"><i></i>今日精选<span></span>'+esc(types[w.kind])+'</span><strong>'+esc(w.title)+'</strong><span class="intro">'+esc(w.desc)+'</span></span><span class="spotPicker" aria-hidden="true">'+dots+'</span>','opening','data-film="'+w.id+'" style="--washArt:'+spotColors[w.id]+'" aria-label="'+esc(w.title)+'，左右切换，确定打开"');
}

function rankedLine(w,i,row='rank'){
 const vid=w.kind==='video',art=vid?w.wide:w.cover||w.wide;
 return b(row+'-'+w.id,row+i,vid?'play':'item',w.id,'<b class="rankNum">'+pad(i+1)+'</b>'+paint('ranking',art,w.title,'rankArt '+(vid?'':'posterRank'))+'<span class="rankTitle"><strong><span>'+esc(w.title)+'</span></strong><small>'+esc(vid?w.artist+' · '+w.cat:workMeta(w))+'</small></span><small class="rankStat">'+esc(vid?clock(w.duration):release(w)||types[w.kind])+'</small><span aria-hidden="true">›</span>','rankLine')
}
function cinemaPlates(items,row){
 return '<div class="posterGrid">'+items.map((w,i)=>b(row+'-'+w.id,row+Math.floor(i/6),w.kind==='video'?'play':'item',w.id,paint('folio',imageLine(w),w.title,'thumb vertical')+'<span class="tileName">'+esc(w.title)+'</span>','tile')).join('')+'</div>'
}
function timeDay(v){const d=new Date(v),today=new Date();const y=new Date(today);y.setDate(y.getDate()-1);return d.toDateString()===today.toDateString()?'今天':d.toDateString()===y.toDateString()?'昨天':(d.getMonth()+1)+' 月 '+d.getDate()+' 日'}
function editionStage(d,m){
 const w=d.w,personal=latestFor(w.id);
 return '<div class="editionInfo"><span class="eyeline">'+esc(d.meta)+'</span><h2>'+esc(w.title)+'</h2><div class="sRecord"><strong>'+esc(personal?'上次观看':'收录信息')+'</strong><span>'+esc(d.progress)+'</span></div><p>'+esc(w.desc||'')+'</p></div>'+ (m==='drama'?paint('episode-art',w.hero||w.still||w.wide||w.cover,w.title,'episodeScene'):'')
}
function editionShelf(mode,ids,index,head){
 const drama=mode==='drama',size=drama?4:6,start=Math.floor(index/size)*size,d=sheetData(mode,index);
 const rail='<div class="editionRail">'+ids.slice(start,start+size).map((id,j)=>{const w=W[id],active=id===ids[index],n=start+j;return b('s-'+id,'collectionItems','item',id,paint('collection-print',drama?w.wide||imageLine(w):imageLine(w),w.title,'editionPrint')+'<strong>'+esc(w.title)+'</strong>','collectCard exhibitionCard'+(active?' picked':''),'aria-pressed="'+active+'" aria-label="'+esc(w.title)+'"')}).join('')+'</div>';
 const tools='<div class="galleryFoot"><span>'+serial(index+1)+' / '+serial(ids.length)+'</span><div>'+[-1,1].map(step=>'<button type="button" class="galleryArrow" tabindex="-1" data-act="galleryStep" data-id="'+step+'" aria-label="'+(step<0?'上一部':'下一部')+'" '+(step<0&&index===0||step>0&&index===ids.length-1?'disabled':'')+'>'+(step<0?'‹':'›')+'</button>').join('')+'</div></div>';
 return wrap(head+'<section class="edition '+(drama?'screenRoom':'printRoom')+'">'+(drama?'<div class="editionStage" id="galleryStage">'+editionStage(d,mode)+'</div>'+rail:rail+'<div class="editionStage" id="galleryStage">'+editionStage(d,mode)+'</div>')+tools+'</section>')
}
function shelfName(mode,id){return id==='edition'?(mode==='anime'?'原画展架':'剧集放映厅'):layouts[id]}
function libraryEntry(mode){
 const anime=mode==='anime',key=anime?'shelfA':'shelfD',ids=signed?collection[mode]:[],works=ids.slice(0,3).map(id=>W[id]).filter(Boolean);
 const art=works.map((w,i)=>paint('shelf-cover',imageLine(w),w.title,'libraryCover pic'+i)).join('');
 return b('mine-'+key,'library','mineGo',key,'<span class="libraryWords"><small>'+esc(signed?ids.length+' 部作品':'登录后查看')+'</small><strong>'+ (anime?'我的追番':'我的追剧')+'</strong><span>打开片单　›</span></span><span class="libraryPrints">'+art+'</span>','libraryEntry '+(anime?'animeEntry':'dramaEntry'))
}
function aboutCard(){
 if(bsOnline)return wrap('<article class="aboutIdentity"><div class="aboutBrand">Bili<span>BS</span></div><div><span class="eyeline">Bili Big Screen · B站大屏幕版</span><h1>关于 BiliBS</h1><p>在电视上浏览哔哩哔哩、追新番，或从上一次停下的地方继续看。</p><p class="fineprint">BiliBS 是独立第三方项目，与哔哩哔哩及其关联公司无隶属、合作或背书关系。</p><p class="fineprint">仅供个人学习、研究与非商业使用。禁止销售、付费分发、广告变现、商业预装及其他商业用途。第三方组件按各自许可证使用。</p><p class="fineprint">视频、音频、图片、文字与商标等权利归原权利人所有。使用本项目须遵守适用法律及平台规则，内容访问以平台授权、账号权限和所在地区为准。</p><p class="fineprint">权利人如对本项目有异议，可通过 github.com/HAHAHAMMER/BiliBS/issues 联系维护者，我们将及时核查，并按核查结果处理相关内容或功能。</p>'+actionLink('license','about','page','licenses','素材与组件说明')+'</div></article>');
 return wrap('<article class="aboutIdentity"><div class="aboutBrand">Bili<span>BS</span></div><div><span class="eyeline">Bili Big Screen · B站大屏幕版</span><h1>关于 BiliBS</h1><p>一个在客厅里找片、追更和收藏作品的电视端原型。</p><p class="fineprint">独立第三方设计。播放使用离线样片，账号、动态、热度、直播和云端历史采用本机演示数据。</p>'+actionLink('license','about','page','licenses','素材与组件说明')+'</div></article>')
}

const cinSections={
 movie:[['rec','推荐'],['all','全部'],['rank','热播榜'],['opening','上映时间']],
 drama:[['rec','热播推荐'],['all','全部'],['rank','排行'],['cn','国产剧'],['overseas','海外剧'],['mine','我的追剧']],
 anime:[['rec','推荐'],['all','全部'],['followers','追番人数'],['rating','最高评分'],['mine','我的追番']],
 doc:[['rec','热播推荐'],['all','全部'],['rank','排行'],['nature','动物·自然·探索']],
 variety:[['rec','推荐'],['all','全部'],['music','音乐'],['rank','播放排行']],
 commentary:[['rec','综合排序'],['all','全部'],['views','最多播放'],['new','最新发布'],['danmaku','最多弹幕']]
};
const domesticSeries=new Set(['33981','33626','42962']);
const debutYears={'12548':2010,'48416':2025,'42715':2022,'25812':1998,'44847':2023};
// Ordinal fixtures for the offline sample. They are never presented as platform ratings or follower totals.
const sampleFanOrder={
 followers:['26801','41410','46089','43164','26274','39462','21542','1733','25681','33378','3312'],
 rating:['46089','43164','25681','21542','26274','26801','1733','41410','39462','3312','33378']
};
function channelItems(mode,sub,works){
 if(sub==='mine')return signed?entriesFor(collection[mode]).filter(w=>w.kind===mode):[];
 if(sub==='cn'||sub==='overseas')return works.filter(w=>domesticSeries.has(w.id)===(sub==='cn'));
 if(sub==='nature')return works.filter(w=>w.types?.some(t=>['自然','动物','探索','科学','探险'].includes(t)));
 if(sub==='music')return works.filter(w=>w.types?.some(t=>t.includes('音乐')));
 if(sampleFanOrder[sub]){const ids=sampleFanOrder[sub];return works.slice().sort((a,b)=>(ids.includes(a.id)?ids.indexOf(a.id):999)-(ids.includes(b.id)?ids.indexOf(b.id):999))}
 if(sub==='rank')return works.slice().sort((a,b)=>score(b)-score(a));
 if(sub==='opening')return works.slice().sort((a,b)=>(debutYears[b.id]||0)-(debutYears[a.id]||0));
 const field={views:'views',new:'published',danmaku:'dm'}[sub];if(field)return works.slice().sort((a,b)=>(b[field]||0)-(a[field]||0));
 if(sub==='rec'&&mode!=='commentary'){const picks={movie:['42715','48416','44847'],drama:['33981','24053','42962'],anime:['46089','43164','41410','39462']}[mode];if(picks)return picks.map(id=>works.find(w=>w.id===id)).filter(Boolean)}
 return works;
}
function channelRows(mode,sub,works){
 if(sub==='mine'&&!signed)return loginGate('登录查看个人片单');
 const arr=channelItems(mode,sub,works);
 const link=sub==='all'?actionLink('channel-index','subResultsHead','cinPage','catalog','打开完整索引'):sub==='mine'?actionLink('channel-library','subResultsHead','cinPage','shelf','打开我的片单'):['rank','followers','rating','views'].includes(sub)?actionLink('channel-rank','subResultsHead','cinPage','ranking','查看完整榜单'):'';
 const note=['rank','followers','rating','views','danmaku','new'].includes(sub)?'样例排序':sub==='opening'?'按上映年份':'';
 const meta=(link||note)?'<div class="listContext">'+link+(note?'<small>'+note+'</small>':'')+'</div>':'';
 const grid=arr.length?'<div class="subGrid">'+arr.map((w,i)=>b('subwork-'+w.id,'subWorks'+Math.floor(i/5),w.kind==='video'?'play':'item',w.id,paint('section',w.kind==='video'?w.wide:(w.wide||w.still||w.cover),w.title,'subThumb')+'<strong>'+(['rank','rating','followers'].includes(sub)?'<em>'+pad(i+1)+'</em>':'')+esc(w.title)+'</strong>'+(sub==='opening'?'<small>'+esc(debutYears[w.id]||'')+'</small>':''),'subWork')).join('')+'</div>':empty('这里还没有作品');
 return meta+grid;
}
function applyChannelSub(id){
 const s=current();if(s.root!=='cinema'||s.sectionByMode[s.filter]===id)return;
 s.sectionByMode[s.filter]=id;$('channelResults').innerHTML=channelRows(s.filter,id,filmContent(s.filter));
 for(const tab of view.querySelectorAll('[data-act="channelSub"]'))tab.setAttribute('aria-selected',String(tab.dataset.id===id));
}
function cinemaArrows(s,el,key){
 const r=el.dataset.row,up=key==='ArrowUp',down=key==='ArrowDown',sub=s.sectionByMode[s.filter]||cinSections[s.filter][0][0];
 if(r==='nav'&&down){focus('cinTab-'+s.filter);return true}
 if(r==='cinTab'&&(up||down)){focus(up?'nav-cinema':'film-'+s.featureId);return true}
 if(r==='filmRail'&&(up||down)){if(up)focus('cinTab-'+s.filter);else nearKey(el,'[data-row="channelSub"]','channelSub-'+sub);return true}
 if(r==='channelSub'&&up){focus('film-'+s.featureId);return true}
 if(r==='channelSub'&&down){firstKey('#channelResults [data-k]');return true}
 if((r==='subResultsHead'||r==='subWorks0')&&up){if(r==='subWorks0'&&firstKey('#channelResults [data-row="subResultsHead"]'))return true;focus('channelSub-'+sub);return true}
 return false;
}
function personalArrows(el,key){
 const k=el.dataset.k,r=el.dataset.row,up=key==='ArrowUp',down=key==='ArrowDown',left=key==='ArrowLeft',right=key==='ArrowRight';
 const rail=['my-account','mine-settings','mine-about','mine-guide'];
 if(r==='nav'&&down){focus('mine-shelfA');return true}
 if(rail.includes(k)){
  const i=rail.indexOf(k);if(up)focus(i?rail[i-1]:'nav-mine');if(down&&i+1<rail.length)focus(rail[i+1]);if(right)focus(['mine-shelfA','mine-history','mine-likes',node('my-resume')?'my-resume':'mine-likes'][i]);return true;
 }
 if(r==='library'){
  if(up)focus('nav-mine');else if(down)focus(k==='mine-shelfA'?'mine-history':'mine-later');else if(left)focus(k==='mine-shelfA'?'my-account':'mine-shelfA');else if(right&&k==='mine-shelfA')focus('mine-shelfD');return true;
 }
 if(r?.startsWith('mytools')){
  const buttons=[...view.querySelectorAll('[data-row="'+r+'"]')],i=buttons.indexOf(el);
  if(left&&i===0){focus(r==='mytools0'?'mine-settings':'mine-about');return true}
  if(r==='mytools0'&&up){focus(i<2?'mine-shelfA':'mine-shelfD');return true}
  if(down&&r==='mytools1'){focus('my-resume');return true}
 }
 if(k==='my-resume'&&left){focus('mine-guide');return true}
 return false;
}

function hasEpisodes(s){return !s.room&&(W[s.id]?.count>1||(parts[s.id]?.length||0)>1)}
function dockAction(id){
 const s=current(),v=V[s.id],w=W[s.id],room=R[s.room];
 if(id==='toggle'){toggle();return}
 if(id==='up'){const up=room?.host||v?.author;if(up)goAuthor(up);return}
 if(id==='like'||id==='collectWork'){
  if(needUser())return;
  if(id==='like'&&v){const on=flip(profile.likes,s.id);notice(on?'已点赞':'已取消点赞')}
  if(id==='collectWork'&&w&&collection[w.kind]){const on=flip(collection[w.kind],s.id);notice(on?'已加入片单':'已移出片单')}
  storeProfile();updateControls();return;
 }
 if(id==='roomFollow'){dispatch({dataset:{act:'follow',id:room.host}});return}
 if(id==='dm'){setPreference('dm',!prefs.dm);return}
 openOverlay('watch',{mode:({playPrefs:'settings',recommend:'queue'})[id]||id});
}
function playerArrows(el,key){
 const s=current(),k=el.dataset.k,down=key==='ArrowDown',up=key==='ArrowUp',quiet=player.classList.contains('quiet');
 if(countdown){moveFocus(el,key,$('nextPrompt'));return}
 wake();
 if(k==='media-retry')return;
 if(!s.room&&(quiet||k==='seek'||!player.contains(el))){
  if(down)focus(hasEpisodes(s)?'episodes':'toggle',false);
  else if(up)focus('seek',false);
  else{focus('seek',false);jump((previewSeek??video.currentTime)+(key==='ArrowRight'?5:-5))}
  return;
 }
 if(up&&!s.room){focus('seek',false);return}
 if(down&&!s.room){dockAction(hasEpisodes(s)?'episodes':'recommend');return}
 moveFocus(el,key,$('pControls'));
}
function watchPreferences(s){
 const v=V[s.id],room=R[s.room],options=[
 ['tech-info','watchSub','tech','播放信息','编码、音轨与画面'],
 ['wdm','watchSub','dm','弹幕样式','字号、密度与透明度']
 ];
 if(!room){
  options.push(['wnext','watchSub','autonext','自动连播',prefLabel('autonext')]);
  if(nextItem())options.push(['wnow','nextNow','','播放下一个',W[s.id]?'下一集或下一话':'下一条视频']);
  if(v)options.push(['m-save','saveFolder',v.id,'存入收藏夹','选择收藏夹'],['m-later','mediaLater',v.id,profile.later.includes(v.id)?'移出稍后再看':'加入稍后再看','个人片库'],['m-follow','follow',v.author,profile.follows.includes(v.author)?'取消关注 UP 主':'关注 UP 主',authorNames(v.author)]);
 }
 const body='<div class="dockOptions">'+options.map(([key,act,id,label,note],i)=>b(key,'prefRow'+Math.floor(i/3),act,id,'<strong>'+esc(label)+'</strong><small>'+esc(note)+'</small>','dockOption')).join('')+'</div>';
 return {title:'播放设置',desc:'',body,initial:'tech-info',cls:'settingsDock'};
}
function relatedVideos(s){
 const work=W[s.id],v=V[s.id],base=(s.queue||[]).map(id=>V[id]).filter(Boolean);
 if(!v&&!work)return [];
 const all=[...base,...Object.values(V)].filter(x=>x.id!==s.id);
 const score=x=>(work&&x.show===work.id?12:0)+(v&&v.topic===x.topic?6:0)+(v&&v.cat===x.cat?3:0)+(v&&v.author===x.author?1:0);
 return [...new Map(all.map(x=>[x.id,x])).values()].sort((a,b)=>score(b)-score(a)).slice(0,12);
}
function recommendationPanel(s){
 const arr=relatedVideos(s),cards=arr.map((v,i)=>b('queue-'+v.id,'queue'+Math.floor(i/4),'queuePlay',v.id,paint('recommendation',v.wide,v.title,'recThumb')+'<strong>'+esc(v.title)+'</strong><small>'+esc(v.artist)+' · '+clock(v.duration)+'</small>','recPick')).join('');
 return {title:'推荐视频',desc:'',body:arr.length?'<div class="recDockGrid">'+cards+'</div>':empty('暂时没有推荐视频'),initial:arr[0]?'queue-'+arr[0].id:undefined,cls:'recDock'};
}
function episodeLabel(s,n){
 const w=W[s.id];if(!w)return parts[s.id][n-1][1];
 if(n===1&&w.episode)return w.episode.replace(/^第\s*1\s*[集话]\s*[·：:\-]?\s*/,'');
 return w.title;
}
function episodePanel(s){
 const w=W[s.id],amount=w?w.count:parts[s.id].length,ep=s.ep||1;
 const choices=Array.from({length:amount},(_,i)=>{const n=i+1;return b('wep-'+n,'epRow'+Math.floor(i/6),'watchEpisode',n,(w?epname(w,n):'P'+n)+(n===ep?'<i>播放中</i>':''),'epChoice','aria-pressed="'+(n===ep)+'"')}).join('');
 const body='<div class="epDockBody"><div class="episodePreview"><div id="epVisual"></div><strong id="epName"></strong><small id="epStatus"></small></div><div class="epChoices">'+choices+'</div></div>';
 return {title:w?'选集':'分 P',desc:s.room?'':(w||V[s.id]).title,body,initial:'wep-'+ep,cls:'episodeDock'};
}
let episodePreviewTimer=0,episodeVideo=null;
function stopEpisodePreview(){
 clearTimeout(episodePreviewTimer);
 if(!episodeVideo)return;const v=episodeVideo;episodeVideo=null;v.onloadedmetadata=v.onplaying=v.onerror=null;v.pause();v.removeAttribute('src');v.load();v.remove();
}
function showEpisodePreview(n){
 const visual=$('epVisual'),s=current(),w=W[s.id];if(!visual||s.type!=='player')return;
 stopEpisodePreview();const part=!w&&parts[s.id][n-1],p=progress[s.id+':'+(!w&&n===1?0:n)],art=w?(w.still||w.wide||w.cover):V[part[0]].wide;
 visual.innerHTML=paint('episode',art,(w||V[s.id]).title,'episodeStill');$('epName').textContent=(w?epname(w,n):'P'+n)+' · '+episodeLabel(s,n);
 $('epStatus').textContent=(p?.done?'已看完':p?.t?'上次看到 '+clock(p.t):'尚未观看')+'　·　确定播放';
 episodePreviewTimer=setTimeout(()=>{
  if(overlay?.mode!=='episodes'||!visual.isConnected)return;
  const v=document.createElement('video'),mid=mediaId({id:s.id,ep:n}),track=orderedDecodable(trackList(mid,true).concat(trackList(mid,false)),'auto','std',c=>!!v.canPlayType(codecMimes[c]))[0];
  if(!track)return;const src=track.asset?data.variantMedia[track.asset]:data[track.bank]?.[mid];if(!src)return;
  episodeVideo=v;v.muted=true;v.defaultMuted=true;v.playsInline=true;v.setAttribute('aria-hidden','true');
  v.onloadedmetadata=()=>{if(episodeVideo!==v)return;v.currentTime=Math.min(Math.max(0,(p?.t||0)-5),Math.max(0,v.duration-.2));v.play().catch(()=>{})};
  v.onplaying=()=>{if(episodeVideo===v)v.classList.add('visible')};v.onerror=()=>v.classList.remove('visible');visual.append(v);v.src=src;v.load();
 },260);
}

const shelfCols=6,shelfPageSize=12;
const shelfHint='← → 选作品　↑ ↓ 换行　确定 继续播放　M 详情';
let previewTimer=0,previewOwner=null,previewVideo=null;
function shelfTracks(expanded){
 return Array.from({length:shelfCols},(_,i)=>'minmax(0,'+(i===expanded?'2.55':'1')+'fr)').join(' ');
}
function shelfRecord(w){
 const last=recentItems().find(x=>x.id===w.id),ep=w.count>1?Math.max(1,Math.min(w.count,last?.ep||1)):0;
 const saved=Math.max(0,Number(last?.p.t)||0);
 return {ep,at:last?.p.done?0:saved,preview:Math.max(0,saved-5),next:ep&&ep<w.count?ep+1:0,
  label:last?(ep?epname(w,ep)+' · ':'')+(last.p.done?'已看完':clock(saved)):(ep?'尚未观看 · '+epname(w,1):'尚未观看')};
}
function shelfCell(id,index,selected){
 const w=W[id],rec=shelfRecord(w);
 const card=paint('cover',w.cover||w.still||w.wide,w.title,'shelfPoster')+paint('still',libraryArt(w),w.title,'shelfScene')+'<span class="previewSlot"></span><span class="shelfLegend"><strong>'+esc(w.title)+'</strong><small>'+esc(rec.label)+'</small></span>';
 return '<article data-work="'+esc(id)+'" class="shelfCell'+(selected?' expanded':'')+'">'+b('s-'+id,'collectionItems','pickShelf',id,card,'coverKey','aria-pressed="'+selected+'" aria-label="'+esc(w.title+'，'+rec.label)+'"')+'</article>';
}
function stopShelfPreview(){
 clearTimeout(previewTimer);previewOwner=null;
 if(previewVideo){const v=previewVideo;previewVideo=null;v.onloadedmetadata=v.onplaying=v.onerror=null;v.pause();v.removeAttribute('src');v.load();v.remove()}
}
function scheduleShelfPreview(id){
 const cell=node('s-'+id)?.closest('.shelfCell');
 if(!cell||!cell.contains(document.activeElement)||overlay||document.hidden){stopShelfPreview();return}
 if(previewOwner===cell)return;
 stopShelfPreview();previewOwner=cell;
 previewTimer=setTimeout(()=>{
  if(previewOwner!==cell||!cell.isConnected||!cell.contains(document.activeElement))return;
  const w=W[id],rec=shelfRecord(w),mid=mediaId({id,ep:rec.ep}),v=document.createElement('video');
  const track=orderedDecodable(trackList(mid,true).concat(trackList(mid,false)),'auto','std',c=>!!v.canPlayType(codecMimes[c]))[0];
  if(!track)return;const src=track.asset?data.variantMedia[track.asset]:data[track.bank]?.[mid];if(!src)return;
  v.muted=true;v.defaultMuted=true;v.playsInline=true;v.preload='auto';v.setAttribute('aria-hidden','true');previewVideo=v;
  v.onloadedmetadata=()=>{
   if(previewVideo!==v)return;
   const start=Math.min(rec.preview,Math.max(0,v.duration-.25));if(Number.isFinite(start))v.currentTime=start;
   v.play().catch(()=>{if(previewVideo===v)v.classList.remove('on')});
  };
  v.onplaying=()=>{if(previewVideo===v)v.classList.add('on')};
  v.onerror=()=>{v.classList.remove('on')};
  cell.querySelector('.previewSlot').append(v);v.src=src;v.load();
 },380);
}
function shelfDetails(){
 const s=current(),id=collection[s.filter]?.[gallery[s.filter]];if(id)go({type:'detail',id,ep:shelfRecord(W[id]).ep||1,focus:'feature'});
}
function candidateMarkup(q){
 const terms=q?.trim()?Object.keys(data.pinyin).filter(t=>matches(q,[t])).slice(0,4):[];
 return terms.map((t,i)=>b('cand-'+i,'candidates','queryWord',t,esc(t),'word')).join('');
}
function updateSearchSide(q){
 const candidates=$('wordCandidates');if(!candidates)return;
 candidates.innerHTML=candidateMarkup(q);
 if($('recentSearch')){$('recentSearch').hidden=!!q.trim();$('suggestSearch').hidden=!q.trim()}
}
function typeSearch(value){
 const s=current();s.q=value.slice(0,60);$('query').value=s.q;updateSearchSide(s.q);
}
function alignStrip(el){
 const strip=el.closest?.('.hStrip');if(!strip)return;
 const a=el.getBoundingClientRect(),b=strip.getBoundingClientRect(),gap=8*scale;
 if(a.left<b.left+gap)strip.scrollLeft+=(a.left-b.left-gap)/scale;
 else if(a.right>b.right-gap)strip.scrollLeft+=(a.right-b.right+gap)/scale;
}
function nearKey(source,selector,preferred){
 const list=[...view.querySelectorAll(selector)].filter(n=>!n.disabled&&n.offsetWidth);
 if(!list.length)return false;
 const x=el=>{const r=el.getBoundingClientRect();return (r.left+r.right)/2};
 const distance=el=>Math.abs(x(source)-x(el)),fav=preferred&&list.find(n=>n.dataset.k===preferred);
 const dest=fav&&distance(fav)<130*scale?fav:list.reduce((a,b)=>distance(a)<=distance(b)?a:b);
 return focus(dest.dataset.k);
}
function firstKey(selector){const el=view.querySelector(selector);return el?focus(el.dataset.k):false}
function searchKeys(key,el){
 const k=el.dataset.k||'',r=el.dataset.row||'',up=key==='ArrowUp',down=key==='ArrowDown',left=key==='ArrowLeft',right=key==='ArrowRight';
 const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',char=k.startsWith('osk-')?k.slice(4):'',i=letters.indexOf(char),side=()=>{const n=[...view.querySelectorAll('aside [data-act="queryWord"]')].find(el=>el.offsetWidth);return n&&focus(n.dataset.k)};
 if(char.length===1&&i>=0){
  if(right&&(i+1)%9===0)side();else if(left&&i%9===0)return true;
  else if(up&&i<9)focus('query');else if(down&&i>=27)focus('osk-'+['del','clear','go'][Math.floor((i-27)/3)]);
  else focus('osk-'+letters[i+(up?-9:down?9:left?-1:1)]);
  return true;
 }
 if(r==='query'&&down){focus('osk-A');return true}
 if(r==='oskActions'){
  const ix=['del','clear','go'].indexOf(char);
  if(up){focus('osk-'+letters[27+ix*3]);return true}
  if(down){if(!bsOnline)firstKey('#wordCandidates [data-k]');return true}
  if(right&&ix===2){side();return true}
 }
 if(!bsOnline&&r==='candidates'&&up){focus('osk-del');return true}
 if(el.closest('aside')){
  const nodes=[...view.querySelectorAll('aside [data-k]')].filter(n=>n.offsetWidth),sections=[...new Set(nodes.map(n=>n.dataset.row))].map(row=>nodes.filter(n=>n.dataset.row===row));
  const ri=sections.findIndex(row=>row.includes(el)),col=sections[ri].indexOf(el);
  if(left&&col===0){focus('osk-'+letters[Math.min(3,ri)*9+8]);return true}
  if(up||down){const next=sections[ri+(down?1:-1)];if(next)focus(next[Math.min(col,next.length-1)].dataset.k);else if(up)focus('submit');return true}
 }
 return false;
}
function revisedArrow(s,el,key){
 const k=el.dataset.k||'',r=el.dataset.row||'',up=key==='ArrowUp',down=key==='ArrowDown',left=key==='ArrowLeft',right=key==='ArrowRight';
 if(s.name==='search')return searchKeys(key,el);if(s.type!=='browse')return false;
 if(s.root==='home'&&s.filter==='rec'){
  if(k==='nav-home'&&down){focus(bsOnline?'homeTab-rec':'hero-primary');return true}
  if(bsOnline&&r==='homeTab'&&down){focus('hero-primary')||focus('refresh');return true}
  if(r==='hero'){
   if(left||right){const i=spotlights.indexOf(s.spot||spotlights[0]);s.spot=spotlights[(i+(right?1:-1)+spotlights.length)%spotlights.length];redraw('hero-primary')}
   else focus(up?'homeTab-rec':'rec-'+homeVideos()[0].id);return true;
  }
  if(r==='rec0'&&up){focus(k==='rec-'+homeVideos()[3].id?'refresh':'hero-primary');return true}
  if(r==='refresh'&&(down||up)){focus(down?'rec-'+homeVideos()[0].id:'hero-primary');return true}
 }
 if(s.root==='home'&&s.filter==='hot'){
  const duo=view.querySelector('.hotDuo');
  if(r==='homeTab'&&down)return firstKey('.hotDuo section button');
  if(el.closest('.hotDuo')){
   const board=el.closest('section'),a=[...board.querySelectorAll('button')],i=a.indexOf(el),other=[...duo.children].find(n=>n!==board);
   if(up||down){if(i===0&&up)focus('homeTab-hot');else if(a[i+(down?1:-1)])focus(a[i+(down?1:-1)].dataset.k)}
   else if((right&&board===duo.firstElementChild)||(left&&board===duo.lastElementChild)){const b=other.querySelectorAll('button');focus(b[Math.min(i,b.length-1)].dataset.k)}
   return true;
  }
 }
 if(s.root==='home'&&s.filter==='zones'){
  if(r==='homeTab'&&down){focus('zone-'+s.cat);return true}
  if(r==='zones'&&down){firstKey('[data-row="zoneVideo0"]');return true}
  if(r==='zones'&&up){focus('homeTab-zones');return true}
  if(r==='zoneVideo0'&&up){focus('zone-'+s.cat);return true}
 }
 if(s.root==='feed'){
  if(r==='nav'&&down){focus('creator-'+(s.creator||'all'))||focus('gate');return true}
  if(r==='authors'&&up){focus('nav-feed');return true}
  if(r==='authors'&&down){if(k==='creator-all'||k==='all-follows')focus('feedTab-'+s.filter);else nearKey(el,'[data-row="feedTab"]','feedTab-'+s.filter);return true}
  if(r==='feedTab'&&up){focus('creator-'+(s.creator||'all'));return true}
  if(r==='feedTab'&&down){nearKey(el,'[data-row="journal0"],[data-row="rooms0"]');return true}
 }
 if(s.root==='cinema')return cinemaArrows(s,el,key);
 if(s.root==='mine')return personalArrows(el,key);
 return false;
}
function syncHints(){
 const s=current(),el=document.activeElement;if(overlay||s.type==='player')return;
 const shelf=s.name==='shelf',hero=el?.dataset.k==='hero-primary';
 $('hints').textContent=shelf?shelfHint:hero?'← → 切换精选　↓ 为你推荐　确定 打开作品':s.root==='cinema'&&el.dataset.row==='filmRail'?'← → 选片　↓ 子分区　确定 打开':el?.dataset.act==='play'&&s.name!=='likes'?'方向键 移动　确定 播放　菜单键 更多':'方向键 移动　确定 打开　Esc 返回';
}
function revisedDispatch(a,id,s){
 if(a==='channelSub'){applyChannelSub(id);return true}
 if(a==='dockAction'){dockAction(id);return true}
 if(a==='pickShelf'){const rec=shelfRecord(W[id]);startWatch(id,rec.ep,{at:rec.at});return true}
 if(a==='shelfMenu'){shelfDetails();return true}
 if(a==='densePage'){const i=gallery[s.filter];stepGallery((Math.floor(i/shelfPageSize)+Number(id))*shelfPageSize-i);return true}
 if(a==='oskLetter'){typeSearch((s.q||'')+id.toLowerCase());return true}
 if(a==='oskOp'){if(id==='go')submitQuery(s.q);else typeSearch(id==='del'?(s.q||'').slice(0,-1):'');return true}
 return false;
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopShelfPreview();else if(current().name==='shelf'&&document.activeElement.closest('.shelfCell'))scheduleShelfPreview(document.activeElement.closest('.shelfCell').dataset.work)});
window.addEventListener('pagehide',stopShelfPreview);

// Keep diagnostic examples inside the offline data and history namespace.
if (window.BS_EXAMPLE && !bsOnline) {
 const ex=window.BS_EXAMPLE;
 let route;
 if(ex==='decoder')route={type:'player',id:'orbit',ep:0,focus:'seek',queue:['orbit']};
 else if(ex==='tier-wall')route={type:'player',id:'eclipse',ep:0,focus:'seek',queue:['eclipse'],restricted:true};
 else if(ex==='search-fail')route={type:'page',name:'results',q:'预告',tab:'video',sort:'综合排序',problem:'fail',focus:'retry'};
 else if(ex==='catalog-fail'||ex==='catalog-stale')route={type:'page',name:'catalog',kind:'anime',problem:ex.split('-')[1],focus:'retry'};
 else if(['region-wall','login-wall','member-wall'].includes(ex))route={type:'detail',id:'48416',wall:ex,focus:'feature'};
 if(route)pages=[route];
} else if(bsOnline && history.state?.exampleOrigin && Array.isArray(history.state.pages)){
 pages=history.state.pages;
}

// src/features/discovery.js
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


// src/features/personal.js
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
  let redrawQueued = false, redrawFeedOnly=false, firstShelfFocus = null;
  const personalRoutes = new Set(['shelf','account','login','folders','folder','later','likes','follows','author','history','post']);
  signed = false;

  function redrawPersonal(resource) {
    if (overlay || document.hidden) return;
    if(redrawQueued){if(resource?.op!=='feed')redrawFeedOnly=false;return;}
    redrawFeedOnly=resource?.op==='feed';
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      const s = current();
      if(redrawFeedOnly&&s.root==='feed'&&patchFeed())return;
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
    if (r.ready && !r.error && !r.busy && !r.readBy.has(current()) && !(op==='feed'&&current().feedResource===key) && Date.now()-r.fetched>ttl) request(r);
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
      if (generation === epoch && cache.get(r.key) === r && r.readBy.has(current())) redrawPersonal(r);
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
  function status(r, moreLabel = '加载更多', automatic=false) {
    if (r.error) return '<div class="stateNote"><span>'+esc(r.error)+'</span>'+b('retry-'+r.op,'load','personalRetry',r.key,'重试','secondary')+'</div>';
    if (r.busy) return '<p class="submeta" role="status">正在读取…</p>';
    if (r.more != null&&!automatic) return b('more-'+r.op,'load','personalMore',r.key,esc(moreLabel),'secondary');
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
    s.feedResource=r.key;
    const chips=[['all','全部'],...authors.items.map(a=>{const c=register(a);return c?[c.id,c.title]:null;}).filter(Boolean)].map(([id,label])=>b('creator-'+id,'authors','feedCreator',id,(id==='all'?'':avatar(id))+esc(label),'creatorChip','aria-selected="'+(id===(selected||'all'))+'"')).join('');
    const strip='<div class="authorStrip hStrip">'+b('all-follows','authors','private','follows','全部关注　›','manageChip')+chips+'</div>';
    const filtered=feedItems(r.items,s.filter||'all',selected);
    return wrap(top('关注动态')+strip+(authors.error?status(authors):'')+subTabs([['all','全部动态'],['video','视频投稿'],['post','图文'],['room','正在直播']],s.filter,'feedTab')+'<section data-feed-key="'+esc(r.key)+'"><div class="feedGrid">'+filtered.map(feedCard).join('')+'</div><div data-feed-empty>'+(!filtered.length&&r.ready&&!r.more?empty('暂无符合条件的动态'):'')+'</div><div data-feed-state>'+status(r,'',true)+'</div><div data-feed-tail aria-hidden="true"></div></section>');
  };
  let feedQueued=false;
  function currentFeed(){return current().root==='feed'&&signed?cache.get(current().feedResource):null;}
  function updateFeedState(r){
    const host=view.querySelector('[data-feed-key]');if(!host||host.dataset.feedKey!==r.key)return;
    host.setAttribute('aria-busy',String(r.busy));
    const state=host.querySelector('[data-feed-state]'),html=status(r,'',true);
    if(state.innerHTML!==html){state.innerHTML=html;focusStructureVersion++;}
    const blank=host.querySelector('[data-feed-empty]');
    blank.innerHTML=!feedItems(r.items,current().filter||'all',current().creator==='all'?'':current().creator).length&&r.ready&&!r.more?empty('暂无符合条件的动态'):'';
  }
  function moreFeed(){
    const r=currentFeed();if(!r||!r.ready||r.busy||r.error||r.more==null||overlay)return false;
    request(r,true);updateFeedState(r);return true;
  }
  function scheduleFeed(){
    if(feedQueued||!currentFeed()||overlay||document.hidden)return;
    feedQueued=true;requestAnimationFrame(()=>{
      feedQueued=false;const tail=view.querySelector('[data-feed-tail]');
      if(tail&&tail.getBoundingClientRect().top<view.getBoundingClientRect().bottom+400*scale)moreFeed();
    });
  }
  function patchFeed(){
    const r=currentFeed(),host=view.querySelector('[data-feed-key]');if(!r||!host||host.dataset.feedKey!==r.key)return false;
    const rows=feedItems(r.items,current().filter||'all',current().creator==='all'?'':current().creator);
    if(!appendRenderedList(host.querySelector('.feedGrid'),'<div class="feedGrid">'+rows.map(feedCard).join('')+'</div>'))return false;
    updateFeedState(r);stashScroll(current());scheduleFeed();return true;
  }
  view.addEventListener('scroll',scheduleFeed,{passive:true});
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
    if(s.root==='feed')scheduleFeed();
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
    if(s.root==='feed'&&key==='ArrowDown'){
      const cards=view.querySelector('.feedGrid'),last=cards?.lastElementChild;
      if(!last||last.dataset.row===el.dataset.row){
        if(moreFeed()||currentFeed()?.busy)return true;
        if(currentFeed()?.error&&firstKey('[data-feed-state] [data-k]'))return true;
      }
    }
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


// src/features/player.js
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
    const p=session,box=player.querySelector('.comments');
    if(!p||!p.ready||!prefs.dm||!p.messages.length){box.hidden=true;if(p)p.dmState=null;box.replaceChildren();return;}
    const now=p.route.room?performance.now()/1000:position(p),messages=p.messages;
    const lanes=Math.min(3,Math.max(1,prefs.density)),size=prefs.dmSize;
    box.hidden=false;
    let state=p.dmState;
    if(!state||state.messages!==messages||state.lanes!==lanes||state.size!==size||now<state.last-.1||now-state.last>1.2){
      let lo=0,hi=messages.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(messages[mid].time<now-8)lo=mid+1;else hi=mid;}
      state=p.dmState={messages,lanes,size,cursor:lo,active:[],last:now,width:box.clientWidth||1440,height:box.clientHeight||600};
      box.replaceChildren();
    }
    state.last=now;box.style.opacity=prefs.opacity;
    state.active=state.active.filter(row=>{if(row.end>now)return true;row.node.remove();return false;});
    while(state.cursor<messages.length&&messages[state.cursor].time<=now){
      const m=messages[state.cursor++],mode=Number(m.mode),fixed=mode===4||mode===5,duration=fixed?5:8;
      if(m.time+duration<=now)continue;
      const band=mode===4?'bottom':'top';
      let lane=0;while(lane<lanes&&state.active.some(row=>row.band===band&&row.lane===lane))lane++;
      if(lane===lanes)continue;
      const n=document.createElement('span');n.textContent=m.text;
      n.style.fontSize=size+'px';n.style.top=(mode===4?Math.max(0,state.height-(lane+1)*(size+16)):lane*(size+16))+'px';
      n.style.color=typeof m.color==='string'&&/^#[\da-f]{6}$/i.test(m.color)?m.color:Number.isInteger(m.color)?'#'+(m.color&0xffffff).toString(16).padStart(6,'0'):'#fff';
      box.append(n);
      state.active.push({node:n,width:n.offsetWidth,start:m.time,end:m.time+duration,mode,band,lane});
    }
    for(const row of state.active){
      const fraction=(now-row.start)/8;
      const x=row.mode===4||row.mode===5?(state.width-row.width)/2:row.mode===6?-row.width+fraction*(state.width+row.width):state.width-fraction*(state.width+row.width);
      row.node.style.transform='translate3d('+x+'px,0,0)';
    }
  };
  window.addEventListener('resize',()=>{if(session)session.dmState=null;});

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


window.addEventListener('pagehide',rememberPlayback);history.scrollRestoration='manual';stamp();render();
window.BS_READY=true;

})();

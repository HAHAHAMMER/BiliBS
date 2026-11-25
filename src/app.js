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
const fresh=()=>({type:'browse',root:'home',filter:'rec',focus:'hero-primary',scroll:0});
let pages=[fresh()],scale=1,toastTimer,batch=0,restoring=false,overlay=null,countdown=null,queuedEpisode=null;
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
function bring(n){if(!view.contains(n))return;alignStrip(n);const a=n.getBoundingClientRect(),b=view.getBoundingClientRect(),pad=9*scale;if(a.top<b.top+pad)view.scrollTop+=(a.top-b.top-pad)/scale;else if(a.bottom>b.bottom-pad)view.scrollTop+=(a.bottom-b.bottom+pad)/scale}

function feature({w,kind='catalogFeature',tag,title,desc,source,scene,action='item',id,label='查看作品',extra='',meta=''}){
 const hero=scene==='hero',contained=scene==='small'||scene==='portrait';const cls='feature '+kind+(contained?' contained':'');const visual=paint('feature',source,title,'visual '+(hero?'approved':''));
 return '<article class="'+cls+'">'+visual+'<div class="featureText"><div class="tag">'+esc(tag)+'</div><h1 class="'+(title.length>15?'long':'')+'">'+esc(title)+'</h1><p>'+esc(desc)+'</p><div class="actions">'+btn('feature','hero',action,id,'cta',(action==='play'||action==='playWork'?'<i class="playIcon" aria-hidden="true"></i>':'')+esc(label)+(action==='item'?' <span class="arrow">↗</span>':''))+extra+(meta?'<span class="mini">'+esc(meta)+'</span>':'')+'</div></div></article>'
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
function stash(){const s=current();if(s.type==='player'&&activeMedia&&video.readyState>=1){s.at=video.currentTime;s.restorePaused=video.paused&&!video.ended}const f=document.activeElement?.dataset.k;if(f&&!overlay)s.focus=f;if(s.type!=='player')s.scroll=view.scrollTop;if(s.name==='shelf')s.index=gallery[s.filter]}
function stamp(){history.replaceState({v:2,pages:structuredClone(pages)},'','')}
function go(s){if(overlay){finishOverlay(()=>go(s));return}stash();stamp();pages.push({scroll:0,...s});history.pushState({v:2,pages:structuredClone(pages)},'','');render()}
function page(name,props={}){go({type:'page',name,...(name==='search'?{focus:'osk-A'}:{}),...props})}
function rootTo(root){if(!roots[root])return;pages=[{type:'browse',root,filter:branchDefaults[root],focus:'nav-'+root,scroll:0}];stamp();render()}
function redraw(k,zero=false){const s=current();s.focus=k||document.activeElement?.dataset.k;s.scroll=zero?0:view.scrollTop;render()}
function protect(name,props={}){if(signed)page(name,props);else page('login',{returnTarget:{name,props}})}
function render(){stopShelfPreview();setTheme(prefs.theme);
 const s=current();document.body.dataset.surface=getSurface(s);if(s.type==='player'){renderWatch(s);return}stopWatch();player.hidden=true;$('shell').hidden=false;restoring=true;nav();
 document.body.classList.toggle('large',prefs.large);document.body.classList.toggle('reduced',prefs.reduced);
 view.innerHTML=s.type==='detail'?renderDetail(s):s.type==='page'?subPage(s):rootPage(s);
 const usable=[...view.querySelectorAll('[data-k]')].filter(n=>!n.disabled);view.scrollTop=s.scroll||0;
 let target=s.focus;if(s.name==='shelf'&&target?.startsWith('s-')&&!node(target))target='s-'+collection[s.filter][gallery[s.filter]];
 if(!target||!node(target))target=usable[0]?.dataset.k||(s.type==='browse'?'nav-'+s.root:null);
 if(target)focus(target,false);if(view.contains(document.activeElement))bring(document.activeElement);
 const menuable=document.activeElement?.dataset.act==='play';$('hints').textContent=menuable?'方向键 移动　　确定 打开　　菜单键 更多':'方向键 移动　　确定 打开　　Esc 返回';$('footContext').textContent=s.root==='mine'?(signed?'体验账号':'游客模式'):'';
 restoring=false;afterRender(s)
}
function back(){
 if(overlay){closeOverlay();return}if(countdown){cancelCountdown();return}
 const s=current(),k=document.activeElement?.dataset.k||'';
 if(s.name==='results'&&k.startsWith('hit-')){focus(s.tab==='video'?'sort-'+s.sort:'resultType-'+s.tab);return}
 if(s.name==='results'&&k.startsWith('sort-')){focus('resultType-'+s.tab);return}
 if(pages.length>1 || (!bsOnline && window.BS_EXAMPLE)){history.back();return}
 if(s.root!=='home'){rootTo('home');return}
 if(!k.startsWith('nav-')){view.scrollTop=0;focus('nav-home')}
}
addEventListener('popstate',e=>{
 if(overlay){onOverlayPop();return}
 if(!e.state?.v)return;const previous=current();const activeKey=document.activeElement?.dataset.k||'';
 if(previous.name==='results'&&e.state.pages.length<pages.length&&(activeKey.startsWith('hit-')||activeKey.startsWith('sort-'))){const dest=activeKey.startsWith('hit-')&&previous.tab==='video'?'sort-'+previous.sort:'resultType-'+previous.tab;previous.focus=dest;history.pushState({v:2,pages:structuredClone(pages)},'','');focus(dest);return}
 pages=e.state.pages;const s=current();if(queuedEpisode==='unlock'&&s.type==='detail'){s.wall=null;queuedEpisode=null;stamp()}
 if(s.type==='detail'&&previous.type==='player'&&previous.id===s.id&&previous.ep){s.ep=previous.ep;if(s.focus?.startsWith('ep-'))s.focus='ep-'+s.ep}
 if(s.name==='results'&&(previous.type==='player'||previous.type==='detail'||['author','offlineRoom'].includes(previous.name))){
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
function catsScreen(){const order=[...prefs.cats,...allCats.filter(k=>!prefs.cats.includes(k))];return wrap(top('分区管理','<small class="submeta">已显示 '+prefs.cats.length+' 个分区</small>')+'<div class="catList">'+order.map((k,i)=>'<div class="catEdit"><span>'+esc(k)+'</span>'+b('visible-'+k,'cat'+i,'catVisible',k,prefs.cats.includes(k)?'✓ 显示':'已隐藏','chip')+(prefs.cats.includes(k)&&prefs.cats.indexOf(k)>0?b('raise-'+k,'cat'+i,'raiseCat',k,'上移','textBtn'):'')+'</div>').join('')+'</div>')}
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
 overlay={kind,anchor,prior,...props};modal.hidden=false;$('shell').inert=true;player.inert=true;if(current().type==='player')wake(false);
 if(kind==='watch'&&props.mode==='episodes'){overlay.resumeMain=!video.paused&&!video.ended;overlay.playingKey=activeMedia;video.pause()}
 drawOverlay()
}
function finishOverlay(fn=null){if(!overlay){if(fn)fn();return}afterClose=fn;layerLevelBack=false;history.back()}
function closeOverlay(){if(!overlay)return;if(overlay.prior){const next=overlay.prior;overlay=next;drawOverlay(next.remember);return}finishOverlay()}
function onOverlayPop(){stopEpisodePreview();const old=overlay;if(!afterClose&&old.prior&&!layerLevelBack){overlay=old.prior;history.pushState({v:2,pages:structuredClone(pages),modal:true},'','');drawOverlay(overlay.remember);return}
 overlay=null;setTheme(prefs.theme);modal.hidden=true;modal.innerHTML='';$('shell').inert=false;player.inert=false;layerLevelBack=false;
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
 modal.dataset.transport=current().type==='player'?'on':'off';modal.dataset.mode=o.mode||o.kind;modal.dataset.kind=o.kind;modal.innerHTML=drawer(title,desc,body,cls||'');const n=(target||initial?modal.querySelector('[data-k="'+CSS.escape(target||initial)+'"]'):null)||modal.querySelector('[data-k]');n?.focus({preventScroll:true});n?.scrollIntoView({block:'nearest'})
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
 if(a==='raiseCat'){const pos=prefs.cats.indexOf(id);if(pos>0)[prefs.cats[pos-1],prefs.cats[pos]]=[id,prefs.cats[pos-1]];storePrefs();redraw('visible-'+id);return}
 if(a==='confirm'){openOverlay('confirm',{id});return}if(a==='doConfirm'){confirmDo(id);return}
 if(a==='accountAct'){if(signed)openOverlay('confirm',{id:'logout'});else page('login');return}
 if(a==='login'){page('login');return}if(a==='renew'){s.pair=(s.pair+1)%data.pair.length;s.exp=Date.now()+120000;redraw('pair-confirm');return}
 if(a==='pairConfirm'){if(Date.now()>=s.exp){updatePair();return}signed=true;save('signed',true);if(s.unlock&&pages.at(-2)?.wall==='login-wall'){pages.at(-2).wall=null;queuedEpisode='unlock';history.back()}else if(s.returnTarget){pages[pages.length-1]={type:'page',name:s.returnTarget.name,...s.returnTarget.props,scroll:0};stamp();render()}else if(pages.length>1)history.back();else rootTo('mine');notice('已登录体验账号');return}
 watchAction(a,id,k)
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&!b.disabled)dispatch(b)});
document.addEventListener('input',e=>{if(e.target.id==='query'){current().q=e.target.value;if($('wordCandidates'))$('wordCandidates').innerHTML=candidateMarkup(current().q);const c=document.querySelector('.clearInput');if(c){c.disabled=!current().q;c.setAttribute('aria-hidden',String(!current().q))}}});
document.addEventListener('focusin',e=>{const el=e.target;if(overlay?.mode==='episodes'&&el.dataset.act==='watchEpisode')showEpisodePreview(Number(el.dataset.id));if(overlay?.kind==='themes'&&el.dataset.act==='themeSet')setTheme(el.dataset.id);if(!el.dataset.k||restoring||overlay||current().type==='player')return;
 const {act,id,k,row}=el.dataset;current().focus=k;if(act==='nav'&&current().type==='browse'&&current().root!==id){rootTo(id);return}
 if(act==='spot'&&current().spot!==id){current().spot=id;redraw(k);return}
 if(act==='channelSub'){applyChannelSub(id);return}
 if(immediate.includes(act)){selectTab(act,id,k,row);return}
 if(current().root==='cinema'&&row==='filmRail'&&$('cinStage')){const w=W[id]||V[id];if(w){current().featureId=id;$('cinStage').innerHTML=cinemaFeature(w,current().filter);for(const pick of view.querySelectorAll('.cinPick'))pick.setAttribute('aria-pressed',String(pick.dataset.id===id))}}
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
function updateControls(){
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
function anim(ms){if(!player.hidden&&ms-lastAnim>40){paintComments();lastAnim=ms}requestAnimationFrame(anim)}requestAnimationFrame(anim);
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
  const row=ids.slice(offset,offset+shelfCols),expanded=i>=offset&&i<offset+row.length?i-offset:-1;
  rows+='<div class="denseRow" style="grid-template-columns:'+shelfTracks(expanded)+'">'+row.map((id,j)=>shelfCell(id,offset+j,offset+j===i)).join('')+'</div>';
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

function moveFocus(el,dir,scope){const elements=[...scope.querySelectorAll('[data-k]')].filter(n=>!n.disabled&&n.offsetWidth&&n.offsetHeight&&!n.closest('[hidden]'));if(!elements.length)return;
 if(!elements.includes(el)){focus(elements[0].dataset.k);return}const groups=new Map();for(const n of elements){const key=n.dataset.row||'single';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n)}
 const rows=[...groups.values()],idx=rows.findIndex(r=>r.includes(el)),r=rows[idx],col=r.indexOf(el),x=n=>{const b=n.getBoundingClientRect();return b.x+b.width/2},to=n=>{if(!n)return;n.focus({preventScroll:true});if(overlay)n.scrollIntoView({block:'nearest'});else bring(n)};
 if(dir==='ArrowLeft'||dir==='ArrowRight'){to(r[col+(dir==='ArrowLeft'?-1:1)]);return}
 const dr=dir==='ArrowDown'?1:-1,line=rows[idx+dr];if(!line)return;
 const selected=line.find(n=>n.getAttribute('aria-selected')==='true'||n.getAttribute('aria-current')==='page');
 if(selected){to(selected);return}if(el.dataset.row==='nav'||el.dataset.row==='refresh'||el.dataset.row==='sort'||el.dataset.row==='resultType'||line[0].dataset.row==='nav'){to(line[0]);return}
 to(line.reduce((best,n)=>Math.abs(x(n)-x(el))<Math.abs(x(best)-x(el))?n:best,line[0]))
}
function arrow(key){
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
 return b(row+'-'+w.id,row+i,vid?'play':'item',w.id,'<b class="rankNum">'+pad(i+1)+'</b>'+paint('ranking',art,w.title,'rankArt '+(vid?'':'posterRank'))+'<span class="rankTitle"><strong>'+esc(w.title)+'</strong><small>'+esc(vid?w.artist+' · '+w.cat:workMeta(w))+'</small></span><small class="rankStat">'+esc(vid?clock(w.duration):release(w)||types[w.kind])+'</small><span aria-hidden="true">›</span>','rankLine')
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
 if(bsOnline)return wrap('<article class="aboutIdentity"><div class="aboutBrand">Bili<span>BS</span></div><div><span class="eyeline">Bili Big Screen · B站大屏幕版</span><h1>关于 BiliBS</h1><p>在电视上浏览哔哩哔哩、追新番，或从上一次停下的地方继续看。</p><p class="fineprint">独立第三方客户端。可观看的内容和画质取决于片源、所在地区与当前账号。</p>'+actionLink('license','about','page','licenses','素材与组件说明')+'</div></article>');
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
function typeSearch(value){
 const s=current();s.q=value.slice(0,60);$('query').value=s.q;$('wordCandidates').innerHTML=candidateMarkup(s.q);
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
 const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',char=k.startsWith('osk-')?k.slice(4):'',i=letters.indexOf(char),side=()=>firstKey('aside [data-k^="past-"], aside [data-k^="suggest-"]');
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
  if(down){firstKey('#wordCandidates [data-k]');return true}
  if(right&&ix===2){side();return true}
 }
 if(r==='candidates'&&up){focus('osk-del');return true}
 if(el.closest('aside')){
  const nodes=[...view.querySelectorAll('aside [data-k]')],sections=[...new Set(nodes.map(n=>n.dataset.row))].map(row=>nodes.filter(n=>n.dataset.row===row));
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
  if(k==='nav-home'&&down){focus('hero-primary');return true}
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
window.addEventListener('pagehide',rememberPlayback);history.scrollRestoration='manual';stamp();render();
window.BS_READY=true;

})();
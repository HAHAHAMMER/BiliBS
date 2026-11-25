// Exercise production renderers, asynchronous cache and action dispatch on Node.
// The companion Chromium journey uses the same records with actual DOM and key input.
const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const src=f=>fs.readFileSync(path.join(root,f),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const node=()=>({dataset:{},style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},
  querySelector(){return null},querySelectorAll(){return []},addEventListener(){},focus(){},contains(){return false}});
const elements=new Map();
const viewport = {width: 1440, height: 810};
const documentElement = {
  getBoundingClientRect() {
    const {width, height} = viewport;
    return {x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height};
  }
};
const document={documentElement,body:node(),activeElement:node(),getElementById(k){if(!elements.has(k))elements.set(k,node());return elements.get(k)},
  querySelector(){return null},querySelectorAll(){return []},addEventListener(){}};
const window={BS_MODE:'online',BS_SEARCH_WORDS:{'音乐':'yinyue yy'},addEventListener(){}};
const box={window,document,URL,URLSearchParams,CSS:{escape:x=>x},structuredClone,Date,console,innerWidth:viewport.width,innerHeight:viewport.height,
  history:{replaceState(){},pushState(){}},localStorage:{getItem(){return null},setItem(){}},setInterval(){},addEventListener(){},
  setTimeout,clearTimeout,clearInterval,queueMicrotask,requestAnimationFrame(){},location:{href:'https://app.invalid/'}};
vm.createContext(box);
vm.runInContext(src('verification/discovery_fixture.js'),box);
const hooks=`
let lastMarkup='', rendered=0, playRequest;
redraw=()=>{ const s=current(); lastMarkup=s.type==='browse'?rootPage(s):s.type==='detail'?renderDetail(s):subPage(s);rendered++; };
startWatch=(...args)=>{playRequest=args};
globalThis.probe={open(s){pages=[s];redraw();},html(){return lastMarkup;},dispatch(a,id){revisedDispatch(a,id,current());},
 page(){return current();},draw(){redraw()},args(){return playRequest},rendered(){return rendered;},work(id){return W[id]},
 allCats,cinSections,changeUser(on){signed=on;window.BSDiscovery.accountChanged()}};
`;
const marker="window.addEventListener('pagehide',rememberPlayback);history.scrollRestoration='manual';stamp();render();";
const app=src('src/app.js');
assert(app.includes(marker));
vm.runInContext(app.replace(marker,src('src/features/discovery.js')+'\n'+hooks),box);
const {probe:x}=box;
const br=(root,filter,extras={})=>({type:'browse',root,filter,...extras});
const pg=(name,extras={})=>({type:'page',name,...extras});
const results=(word,tab='video',sort='综合排序')=>pg('results',{q:word,tab,sort});
const has=t=>assert(x.html().includes(t),'missing '+t+' from '+x.html().slice(-550));
const lacks=t=>assert(!x.html().includes(t),'unexpected '+t);
const ids=()=>[...x.html().matchAll(/data-k="([^"]+)"/g)].map(m=>m[1]);
let routes=0;
async function settle(){for(let i=0;i<5;i++)await tick()}
async function open(s){x.open(s);await settle();assert.equal(new Set(ids()).size,ids().length,'duplicate focus IDs');routes++}
async function run(){
  await open(br('home','rec'));has('推荐第1批');has('data-k="hero-primary"');
  has('test-art.png@120w_90h.webp');lacks('重复稿件');
  x.dispatch('refresh','');await settle();has('推荐第2批');
  await open(br('home','hot'));has('本周投稿');has('本周刊');has('热门投稿');x.dispatch('dcPage','["hot",2]');await settle();has('>21<');
  for(const cat of x.allCats){await open(br('home','zones',{cat}));has('data-row="zoneVideo0"');if(cat==='旅游')has('旅游主题搜索');else has('分区排行榜')}
  await open(br('home','live',{area:'following'}));has('登录查看关注的直播');
  await open(br('home','live',{area:'game'}));has('房间86');has('直播中');
  x.dispatch('room','87');assert.deepEqual([...x.args()].slice(0,2),['87',0]);assert.equal(x.args()[2].room,'87');
  await open(pg('offlineRoom',{id:'86'}));has('直播尚未开始');has('关注主播');
  for(const [kind,subs] of Object.entries(x.cinSections)){
    for(const [sub] of subs){
      await open(br('cinema',kind,{sectionByMode:{[kind]:sub}}));
      has('class="channelBrowser"');
      if(sub==='mine')has('登录查看个人片单');else has('class="subWork"');
      if(sub==='cn')has('地区1');if(sub==='overseas')has('地区2');
      if(sub==='nature')has('类型17');if(sub==='music')has('类型15');
    }
    await open(pg('ranking',{kind}));has('class="rankLine"');
    await open(pg('catalog',{kind}));has('作品库');
  }
  await open(pg('catalog',{kind:'anime',origin:'国创',genre:'音乐',year:'2024',order:'片名'}));has('类型15');
  const requests=window.testRequests;
  assert(requests.some(([op,p])=>op==='catalog'&&p.kind==='guochuang'&&p.styleId===15&&p.year===2024));
  await open({type:'detail',id:'601',ep:2});has('第一集');has('第二集');has('相关季');has('data-act="dcPlaySelected"');
  x.dispatch('dcPlaySelected','601');assert.equal(x.args()[1],2);
  x.dispatch('dcPlayEp','1');assert.equal(x.args()[1],1);
  assert.equal(x.work('601').episodes[1].ep_id,'5002');
  await open({type:'detail',id:'801',ep:2});has('当前地区无法观看本集');lacks('data-act="dcPlaySelected"');has('aria-disabled="true"');
  const oldPlay=x.args();x.dispatch('dcPlayEp','2');assert.equal(x.args(),oldPlay);
  const library=pg('catalog',{kind:'movie',order:'热度'});
  await open(library);has('作品乙100');
  const originalNow=Date.now, later=originalNow()+600_000;
  try {
    window.testCatalogDown=true;Date.now=()=>later;
    await open(library);has('作品库更新不可用');has('保留');has('作品乙100');
    window.testCatalogDown=false;x.dispatch('dcRetry',x.html().match(/data-act="dcRetry" data-id="([^"]+)"/)[1]);
    await settle();lacks('更新不可用');has('作品乙100');
  } finally { Date.now=originalNow;window.testCatalogDown=false; }
  await open(pg('search',{q:'yy'}));has('热词');has('音乐');has('osk-A');has('osk-9');
  for(const [tab,t] of Object.entries({video:'普通 totalrank 1',anime:'番剧命中',film:'影视命中',person:'UP命中',room:'房间86'})){await open(results('普通',tab));has(t)}
  await open(results('普通','video','最多播放'));has('普通 click 1');
  x.dispatch('dcPage',JSON.stringify(['result-video-最多播放',2]));await settle();has('普通 click 2');
  window.testFail=true;await open(results('失败'));has('访问受限');lacks('没有找到相关内容');
  window.testFail=false;x.dispatch('dcRetry',x.html().match(/data-act="dcRetry" data-id="([^"]+)"/)[1]);await settle();has('失败 totalrank');
  await open(results('无结果'));has('没有找到相关内容');lacks('加载失败');
  await open(results('迟到'));await open(results('迟到','anime'));
  window.testPending.media_bangumi({items:[{kind:'anime',seasonId:'901',title:'最后的查询'}]});
  window.testPending.video({items:[{kind:'video',id:'BV9',title:'过时响应'}]});await settle();has('最后的查询');lacks('过时响应');
  assert.equal(window.BSDiscovery.register({kind:'video',id:'__proto__'}),null);
  assert.equal(window.BSDiscovery.register({kind:'live',id:'99',liveStatus:2}).on,true);
  const w=window.BSDiscovery.register({kind:'season',seasonId:'777',title:'分类待定'});assert.equal(w.kind,'season');
  window.BSDiscovery.register({kind:'anime',id:'601',following:true});x.changeUser(true);assert.equal(x.work('601').following,undefined);
  console.log(JSON.stringify({routes,checks:'navigation markup, real-data mapping, pagination, retry, distinct empty state, stale catalog recovery, explicitly restricted episode, stale response, artwork URL, episode dispatch, user isolation'}));
}
run().catch(e=>{console.error(e);process.exitCode=1});

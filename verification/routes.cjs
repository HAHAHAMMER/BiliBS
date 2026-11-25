const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const path=require('path'); const root=path.resolve(__dirname,'..');
const raw=fs.readFileSync(path.join(root,'baseline/UI-V6.html'),'utf8');
const payload=raw.match(/<script id="payload"[^>]*>([\s\S]*?)<\/script>/)[1];
const handlers=new Map();
const stub=()=>({dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},style:{},addEventListener(){},focus(){},scrollIntoView(){},contains(){return false},canPlayType(){return 'maybe'},querySelector(){return null},querySelectorAll(){return []}});
const nodes=new Map();
const viewport = {width: 1440, height: 810};
const documentElement = {
  getBoundingClientRect() {
    const {width, height} = viewport;
    return {x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height};
  }
};
const document={documentElement,getElementById(id){if(!nodes.has(id))nodes.set(id,stub());return nodes.get(id)},querySelector(id){return id==='#payload'?{textContent:payload}:null},querySelectorAll(){return []},addEventListener(k,f){handlers.set(k,f)},body:stub()};
const box={document,window:{BILIBS_FIXTURE:JSON.parse(payload),addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},history:{replaceState(){},pushState(){}},structuredClone,Set,Map,console,Date,innerWidth:viewport.width,innerHeight:viewport.height,requestAnimationFrame(){},setInterval(){},addEventListener(){},clearInterval(){},clearTimeout(){},setTimeout(){},CSS:{escape:x=>x}};
let script=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const injection=`
function testView(route){pages=[route];let res;if(route.type==='browse')res=rootPage(route);else if(route.type==='detail')res=renderDetail(route);else res=subPage(route);return res}
globalThis.probe={testView,settingGroups,allCats,filmTabs:movieTabs,types:searchTypes,layouts,scenarios,
 themeKeys:Object.keys(themes),methods:prefOpts,roomIds:Object.keys(R),setStyle(mode,id){prefs['layout_'+mode]=id},setSigned(v){signed=v},getRows:resultRows,watch:o=>watchPanel(o),setPlayer(p){pages=[p]},technical:()=>detailsPanel(),themes:themeChoices,
 sample:{works:Object.keys(W),videos:Object.keys(V),rooms:Object.keys(R),personal:Object.keys(profile.folders),firstAuthor:Object.keys(C)[0]}};`;
script=script.replace("history.scrollRestoration='manual';stamp();render();",injection);
vm.runInNewContext(script,box);
const x=box.probe;let tested=0;const names=[];
function check(s,contains){
 const markup=x.testView(s);assert(markup.includes(contains),JSON.stringify(s)+' expected '+contains);assert(!markup.includes('>undefined<'),JSON.stringify(s));
 const keys=Array.from(markup.matchAll(/data-k="([^"]+)"/g),m=>m[1]);assert(new Set(keys).size===keys.length,'duplicate key '+JSON.stringify(s));tested++;names.push([s.type,s.name||s.root||s.id,s.filter||s.group||s.tab||s.problem||'']);return markup
}
const browse=(root,filter,rest={})=>({type:'browse',root,filter,...rest});
const page=(name,rest={})=>({type:'page',name,...rest});
for(const filter of ['rec','hot','zones','live'])check(browse('home',filter), 'data-k=');
for(const cat of x.allCats)check(browse('home','zones',{cat}), '管理分区');
for(const filter of ['all','video','post','room'])check(browse('feed',filter),'关注动态');
for(const [kind] of x.filmTabs){check(browse('cinema',kind),'channelBrowser');check(page('catalog',{kind}),'作品库');check(page('ranking',{kind}),'榜单')}
check(browse('mine','overview'),'片库管理');
for(const [type] of x.types)check(page('results',{q:'预告',tab:type,sort:'综合排序'}),'修改搜索词');
for(const sort of ['综合排序','最多播放','最新发布'])check(page('results',{q:'预告',tab:'video',sort}), 'data-row="sort"');
for(const k of ['anime','drama'])check(page('shelf',{filter:k}),'denseWall');
for(const name of ['folders','likes','later','follows','history','settings','search','account','guide','about','licenses','states','cats','live'])check(page(name),'class="content"');
for(const name of x.sample.personal)check(page('folder',{folder:name}),name);
check(page('post',{id:x.sample.videos[0]}),'动态正文');for(const tab of ['video','post','live'])check(page('author',{id:x.sample.firstAuthor,tab}), 'follow-toggle');
for(const w of x.sample.works)check({type:'detail',id:w},'featureText');
for(const group of x.settingGroups)check(page('settings',{group}),group);
for(const problem of ['fail','stale'])check(page('catalog',{kind:'anime',problem}), '重试');
for(const wall of ['login-wall','member-wall','region-wall'])check({type:'detail',id:'48416',wall},'状态演示');
check(page('results',{q:'预告',tab:'video',sort:'最多播放',problem:'fail'}),'重试');check(page('offlineRoom',{id:x.roomIds[0]}),'尚未开始');check(page('login'),'模拟手机确认');
x.setSigned(false);for(const name of ['folders','later','likes','follows','shelf'])check(page(name,{filter:'anime'}),'登录');check(page('history',{origin:'cloud'}),'登录');check(browse('feed','all'),'登录');
for(const id of ['terrain','46089','orbit']){x.setPlayer({type:'player',id,ep:1,queue:['terrain','orbit']});for(const mode of ['more','quality','speed','dm','tech','queue',...(id!=='orbit'?['episodes']:[])]){assert(x.watch({mode}).body);tested++}}
x.setPlayer({type:'player',id:'orbit',room:x.roomIds[0]});for(const mode of ['more','line','tech']){assert(x.watch({mode}).body);tested++}
for(const kind of ['themes','layouts'])assert(x.themes({kind,mode:'anime'}).body.includes('style-'));
fs.writeFileSync(path.join(__dirname,'evidence/routes.json'),JSON.stringify({names,cases:tested,renderPaths:names.length,scope:'页面结构断言，不代表接口联调'}));
console.log(JSON.stringify({cases:tested,renderPaths:names.length,works:x.sample.works.length,videos:x.sample.videos.length,rooms:x.roomIds.length,categories:x.allCats.length,settings:x.settingGroups.length,states:x.scenarios.length}));

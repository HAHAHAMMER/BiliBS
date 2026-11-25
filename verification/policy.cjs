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
const memory=new Map();
const box={document,window:{BILIBS_FIXTURE:JSON.parse(payload),addEventListener(){}},localStorage:{getItem(k){return memory.get(k)??null},setItem(k,v){memory.set(k,v)}},history:{replaceState(){},pushState(){}},structuredClone,Set,Map,console,Date,innerWidth:viewport.width,innerHeight:viewport.height,requestAnimationFrame(){},setInterval(){},addEventListener(){},clearInterval(){},clearTimeout(){},setTimeout(){},CSS:{escape:x=>x}};
let script=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const injection=`
globalThis.policy={
 read,save,flip,orderedDecodable,trackList,shelfRecord,channelItems,resultRows,
 themes,ordered:s=>JSON.stringify(s),works:W,videos:V,
 snapshot:q=>resultRows(q).map(x=>x.id),setProgress(value){progress=value},
 getNext(q){pages=[q];return nextItem()}, tlist:k=>trackList('orbit',k),
 catalog:m=>filmContent(m), word:matches
};`;
script=script.replace("history.scrollRestoration='manual';stamp();render();",injection);
vm.runInNewContext(script,box);const p=box.policy,out=[];
function check(name,ids,fn){try{assert(fn());out.push({name,ids,pass:true})}catch(e){out.push({name,ids,pass:false,error:String(e)})}}
check('偏好写盘与命名空间隔离',['STORE','PREF'],()=>{p.save('prefs',{speed:1.5});return p.read('prefs',{}).speed===1.5&&memory.has('bilibs-ui-1-prefs')});
check('旧项目的身份键不会继承进新项目',['AUTH','STORE'],()=>{memory.set('bilitv-design4-signed','true');return p.read('signed',false)===false});
check('存储损坏回缺省值',['PREF','STORE'],()=>{memory.set('bilibs-ui-1-corrupt','{');return p.read('corrupt','fallback')==='fallback'});
check('同一关系可加可撤，计数稳定',['FAV','LIKE','LATER','FOLLOW','SHELF'],()=>{let a=['keep'];return p.flip(a,'change')&&!p.flip(a,'change')&&a.join()==='keep'});
check('搜索重复读同组结果，排序使用不同缓存键',['SEARCH','STORE'],()=>{let q={q:'预告',tab:'video',sort:'综合排序'};let a=p.snapshot(q),b=p.snapshot({...q,sort:'最多播放'}),c=p.snapshot(q);let keys=JSON.parse(memory.get('bilibs-ui-1-result-cache')).map(r=>r[0]);return a.join()===c.join()&&a.length>0&&b.length>0&&keys.some(k=>k.includes('最多播放'))&&keys.some(k=>k.includes('综合排序'))});
check('搜索最多播放单调不增，最新按发布时间倒序',['SEARCH'],()=>['最多播放','最新发布'].every(sort=>{const col=sort==='最多播放'?'views':'published';let a=p.resultRows({q:'预告',sort,tab:'video'});return a.every((x,i)=>!i||a[i-1][col]>=x[col])}));
check('拼音全拼、首字母和中文均匹配',['PINYIN'],()=>['fulilian','fll','芙莉莲'].every(q=>p.word(q,['葬送的芙莉莲'])));
check('仅一个未观看样本使用0秒',['HISTORY','PREVIEW'],()=>{p.setProgress({});let r=p.shelfRecord(p.works['46089']);return r.ep===1&&r.at===0&&r.preview===0});
check('早于5秒的断点预览取0',['HISTORY','PREVIEW'],()=>{p.setProgress({'46089:2':{t:3,d:18,ep:2,recent:12}});let r=p.shelfRecord(p.works['46089']);return r.ep===2&&r.at===3&&r.preview===0});
check('两集同时有记录，选择最近集',['HISTORY','SHELF'],()=>{p.setProgress({'46089:1':{t:14,d:18,ep:1,recent:12},'46089:2':{t:7,d:18,ep:2,recent:34}});let r=p.shelfRecord(p.works['46089']);return r.ep===2&&r.at===7&&r.preview===2});
check('末集不越界，多P先跳同片下一P',['PLAYER','UGC'],()=>p.getNext({id:'46089',ep:28,queue:[]})===null&&p.getNext({id:'terrain',ep:0,queue:[]}).ep===2);
check('普通稿件从队列读取下一条',['PLAYER','RELATED'],()=>p.getNext({id:'orbit',ep:0,queue:['orbit','keys']}).id==='keys');
check('地区筛选不混入另一组电视剧',['CATALOG'],()=>{let a=p.catalog('drama'),cn=p.channelItems('drama','cn',a),ab=p.channelItems('drama','overseas',a);return cn.length===3&&ab.length===2&&!cn.some(x=>ab.includes(x))});
check('电影上映时间、番剧两组排序独立',['RANK','CATALOG'],()=>p.channelItems('movie','opening',p.catalog('movie'))[0].id==='48416'&&p.channelItems('anime','rating',p.catalog('anime'))[0].id!==p.channelItems('anime','followers',p.catalog('anime'))[0].id);
check('只支持AVC时从HEVC偏好回退，所有候选可解码',['TRACK'],()=>{let a=p.orderedDecodable(p.tlist(false),'hevc','auto',c=>c==='avc');return a.length>0&&a.every(t=>t.codec==='avc')});
check('所有编码不可解时不返回伪可用轨',['TRACK'],()=>!p.orderedDecodable(p.tlist(false),'av1','auto',()=>false).length);
check('AAC两档按偏好选不同实际码率',['TRACK','DIAG'],()=>{let t=p.tlist(false);let get=a=>p.orderedDecodable(t,'avc',a,c=>c==='avc')[0].ab;return get('auto')>get('std')});
fs.writeFileSync(path.join(__dirname,'evidence/policy.json'),JSON.stringify(out,null,1));console.log(out.length,'checks',out.filter(x=>!x.pass));
if(out.some(x=>!x.pass))process.exitCode=1;

// Deterministic records for discovery tests. Loaded only by the test harness.
window.testRequests=[];
window.testFail=false;
window.testPending={};
const art='https://i0.hdslb.com/bfs/archive/test-art.png@120w_90h.webp';
const ugc=(id,title)=>({kind:'video',id,bvid:id,title,duration:66,wide:art,artist:'测试作者',mid:'9'});
const season=(kind,id,title)=>({kind,id,seasonId:id,title,desc:'本季简介',cover:art,wide:art,score:9.2,year:'2024',styles:['音乐']});
const room=(id,status)=>({kind:'live',id,roomId:id,liveStatus:status,title:'房间'+id,artist:'主播',mid:'9',cover:art});
const ids={movie:100,drama:200,anime:300,doc:400,variety:500,guochuang:600};
window.BS_HOME_CANDIDATES ||= Object.fromEntries(['anime','movie','drama'].map(kind=>[kind,[season(kind,String(ids[kind]+7),'随机精选'+kind)]]));
async function libraryBatch(kind,p,make){
 if(p.page===2 && window.testLibraryFailKind===kind){window.testLibraryFailKind=null;throw Error('模拟片库后续加载失败');}
 if(p.page===2 && window.testLibraryHoldKind===kind)await new Promise(resolve=>window.finishLibrary=()=>{window.testLibraryHoldKind=null;resolve()});
 return {items:[...(p.page>1?[make(1,0)]:[]),...Array.from({length:20},(_,n)=>make(p.page,n))],next:p.page<3?p.page+1:null};
}
window.BSApi={call:async(op,p={})=>{
 window.testRequests.push([op,{...p}]);
 if(op==='nav')return {loggedIn:false};
 if(op==='recommend')return {items:[ugc(p.page===1?'BV1':'BV1p'+p.page,'推荐第'+p.page+'批'),ugc('BV2','二号稿件'),ugc(p.page===1?'BV1':'BV1p'+p.page,'重复稿件')]};
 if(op==='popular')return window.testWeeklySize?{items:Array.from({length:20},(_,i)=>ugc('BVhot'+((p.page-1)*20+i),'热门'+((p.page-1)*20+i))),next:p.page===1?2:null}:{items:[ugc('BV3','热门投稿')],next:p.page===1?2:null};
 if(op==='weekly')return {items:window.testWeeklySize?Array.from({length:window.testWeeklySize},(_,i)=>ugc('BVweek'+i,'周刊'+i)):[ugc('BV4','本周投稿')],title:'本周刊'};
 if(op==='region')return {items:Array.from({length:15},(_,i)=>ugc('BVzone'+p.rid+'p'+p.page+'x'+i,'分区'+p.rid+' 视频'+i)),next:p.page<3?p.page+1:null};
 if(op==='catalog') {
   if(window.testHoldHomePool)return new Promise(()=>{});
   if(window.testLibraryPages && ['doc','variety'].includes(p.kind)){
     return libraryBatch(p.kind,p,(page,n)=>season(p.kind,String(ids[p.kind]+(page-1)*20+n+1),'片库作品'+n));
   }
   if(window.testCinemaPages && p.kind==='movie'){
     if(p.page===3)await new Promise(resolve=>window.finishCinemaPage=resolve);
     if(p.page===window.testCinemaFailPage){window.testCinemaFailPage=0;throw Error('模拟影视翻页失败');}
     return {items:Array.from({length:20},(_,i)=>season('movie',String(1000+p.page*20+i),'分页作品'+i)),next:p.page<4?p.page+1:null};
   }
   if(window.testCatalogDown) throw Object.assign(Error('作品库更新不可用'),{code:'NETWORK'});
   const i=ids[p.kind];
   const desc=p.area?' 地区'+p.area:p.styleId?' 类型'+p.styleId:'';
   return {items:[season(p.kind,String(i+1),'作品乙'+i+desc),season(p.kind,String(i+2),'作品甲'+i+desc),...Array.from({length:6},(_,n)=>season(p.kind,String(i+3+n),'作品'+i+'-'+n+desc))],next:null};
 }
 if(op==='channelPage'){
   const i=ids[p.kind];
   if(window.testCinemaPages&&['movie','drama'].includes(p.kind))return {items:Array.from({length:6},(_,n)=>season(p.kind,String(1020+n),'横幅作品'+n)),recommendations:Array.from({length:20},(_,n)=>season(p.kind,String(1026+n),'分页作品'+n)),hasMore:false,cursor:2};
   return {items:Array.from({length:6},(_,n)=>season(p.kind,String(i+1+n),'作品'+i+'-'+n)),recommendations:Array.from({length:8},(_,n)=>season(p.kind,String(i+1+n),'作品'+i+'-'+n)),hasMore:false};
 }
 if(op==='channelFeed'){
   if(!window.testCinemaPages||!['movie','drama'].includes(p.kind))return {items:[],hasMore:false,cursor:null};
   const pn=Number(p.cursor);
   if(pn===3&&p.kind==='movie')await new Promise(resolve=>window.finishCinemaPage=resolve);
   if(pn===window.testCinemaFailPage){window.testCinemaFailPage=0;throw Error('模拟影视翻页失败');}
   return {items:Array.from({length:20},(_,n)=>season(p.kind,String(1026+(pn-1)*20+n),'分页作品'+n)),cursor:pn+1,hasMore:pn<6};
 }
 if(op==='catalogOptions')return {items:[
   {id:'style_id',title:'类型',options:[{id:15,title:'音乐'},{id:17,title:'自然'}]},
   {id:'area',title:'地区',options:[{id:1,title:'中国大陆'},{id:2,title:'日本'}]},
   {id:'year',title:'年份',options:[{id:'[2024,2025)',title:'2024年'}]}
 ]};
 if(op==='ranking')return {items:[season(p.kind,String(ids[p.kind]+1),'排行作品')]};
 if(op==='season'){
   const kind=Object.keys(ids).find(k=>Number(p.seasonId)>ids[k]&&Number(p.seasonId)<ids[k]+100)||'movie';
   return {...season(kind,p.seasonId,'详情'+p.seasonId),
     episodes:[{epId:'5001',aid:'9001',cid:'7001',title:'1',longTitle:'第一集'},{epId:'5002',aid:'9002',cid:'7002',title:'2',longTitle:'第二集',areaRestricted:p.seasonId==='801'}]};
 }
 if(op==='videoShot')return {images:[art],columns:2,rows:2,times:[0,20,40,60]};
 if(op==='seasonRelated')return {items:[season('movie','999','相关季')]};
 if(op==='hotSearch')return {items:[{title:'热词'}]};
 if(op==='suggest')return {items:[{title:'候选'+p.keyword}]};
 if(op==='search'){
    if(window.testLibraryPages && p.keyword==='影视解说')return libraryBatch('commentary',p,(page,n)=>ugc('BVlib'+page+'x'+n,'解说作品'+n));
    if(p.keyword==='失败'&&window.testFail)throw Object.assign(Error('访问受限'),{code:-352});
    if(p.keyword==='无结果')return {items:[],total:0};
    if(p.keyword==='迟到')return new Promise(resolve=>window.testPending[p.type]=resolve);
    const types={video:[ugc('BV8',p.keyword+' '+p.order+' '+p.page)],media_bangumi:[season('anime','301','番剧命中')],
    media_ft:[season('movie','101','影视命中')],bili_user:[{kind:'author',id:'9',mid:'9',title:'UP命中'}],live_room:[room('86',0)]};
    return {items:types[p.type],next:p.page===1?2:null,total:2};
 }
 if(op==='liveAreas')return {items:[{id:'2',title:'游戏'}]};
 if(op==='liveRooms')return {items:p.page===1?[room('86',0),room('87',1),...Array.from({length:10},(_,i)=>room(String(100+i),1))]:Array.from({length:12},(_,i)=>room(String(p.page*100+i),1)),next:p.page<3?p.page+1:null};
 if(op==='liveRoom')return room(p.roomId,0);
 if(op==='relation')return {liked:false,following:false};
 return {items:[]};
}};

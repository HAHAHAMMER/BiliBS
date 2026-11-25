// Deterministic records for discovery tests. Loaded only by the test harness.
window.testRequests=[];
window.testFail=false;
window.testPending={};
const art='https://i0.hdslb.com/bfs/archive/test-art.png@120w_90h.webp';
const ugc=(id,title)=>({kind:'video',id,bvid:id,title,duration:66,wide:art,artist:'测试作者',mid:'9'});
const season=(kind,id,title)=>({kind,id,seasonId:id,title,desc:'本季简介',cover:art,wide:art,year:'2024',styles:['音乐']});
const room=(id,status)=>({kind:'live',id,roomId:id,liveStatus:status,title:'房间'+id,artist:'主播',mid:'9',cover:art});
const ids={movie:100,drama:200,anime:300,doc:400,variety:500,guochuang:600};
window.BSApi={call:async(op,p={})=>{
 window.testRequests.push([op,{...p}]);
 if(op==='nav')return {loggedIn:false};
 if(op==='recommend')return {items:[ugc(p.page===1?'BV1':'BV1p'+p.page,'推荐第'+p.page+'批'),ugc('BV2','二号稿件'),ugc(p.page===1?'BV1':'BV1p'+p.page,'重复稿件')]};
 if(op==='popular')return {items:[ugc('BV3','热门投稿')],next:p.page===1?2:null};
 if(op==='weekly')return {items:[ugc('BV4','本周投稿')],title:'本周刊'};
 if(op==='region')return {items:[ugc('BV5','分区'+p.rid)]};
 if(op==='catalog') {
   if(window.testCatalogDown) throw Object.assign(Error('作品库更新不可用'),{code:'NETWORK'});
   const i=ids[p.kind];
   const desc=p.area?' 地区'+p.area:p.styleId?' 类型'+p.styleId:'';
   return {items:[season(p.kind,String(i+1),'作品乙'+i+desc),season(p.kind,String(i+2),'作品甲'+i+desc)],next:null};
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
     episodes:[{epId:'5001',cid:'7001',title:'1',longTitle:'第一集'},{epId:'5002',cid:'7002',title:'2',longTitle:'第二集',areaRestricted:p.seasonId==='801'}]};
 }
 if(op==='seasonRelated')return {items:[season('movie','999','相关季')]};
 if(op==='hotSearch')return {items:[{title:'热词'}]};
 if(op==='suggest')return {items:[{title:'候选'+p.keyword}]};
 if(op==='search'){
    if(p.keyword==='失败'&&window.testFail)throw Object.assign(Error('访问受限'),{code:-352});
    if(p.keyword==='无结果')return {items:[],total:0};
    if(p.keyword==='迟到')return new Promise(resolve=>window.testPending[p.type]=resolve);
    const types={video:[ugc('BV8',p.keyword+' '+p.order+' '+p.page)],media_bangumi:[season('anime','301','番剧命中')],
    media_ft:[season('movie','101','影视命中')],bili_user:[{kind:'author',id:'9',mid:'9',title:'UP命中'}],live_room:[room('86',0)]};
    return {items:types[p.type],next:p.page===1?2:null,total:2};
 }
 if(op==='liveAreas')return {items:[{id:'2',title:'游戏'}]};
 if(op==='liveRooms')return {items:[room('86',0),room('87',1)]};
 if(op==='liveRoom')return room(p.roomId,0);
 if(op==='relation')return {liked:false,following:false};
 return {items:[]};
}};

// Normal entry point with deterministic upstream-shaped test responses. Never contacts a user account.
'use strict';
const assert = require('node:assert/strict');
global.window = global;
require('../src/services.js');
const policy = require('../src/transport-policy.json');
const call = (op, params) => BSApi.call(op, params);
const packets = [];
const observed = new Set();
const queued = [];
let cleared = 0;
global.BSTransport = {
  async request(req) {
    const u = new URL(req.url);
    assert.equal(u.protocol, 'https:');
    assert(policy[req.method]?.[u.hostname]?.includes(u.pathname), 'Route missing from native/web policy: '+u.pathname);
    observed.add(req.method + ' ' + u.pathname);
    const fields = new URLSearchParams(req.method === 'POST' ? req.body : u.search);
    for (const key of ['csrf', 'csrf_token', 'access_key', 'SESSDATA']) assert(!fields.has(key));
    packets.push({url:u, fields});
    assert(queued.length, 'Unexpected request ' + u.pathname);
    return queued.shift();
  },
  async clearSession() { cleared++; },
};
const packet = (body,status=200) => ({status,body:typeof body === 'string' ? body : JSON.stringify(body)});
const ok = data => packet({code:0,data});
const video = {bvid:'BV1jJs16WEfE',aid:123,cid:456,title:'<em class="keyword">样片</em> &amp; 声音',pic:'//i0.hdslb.com/bfs/test',duration:60,owner:{mid:42,name:'作者'}};
const season = {season_id:19,season_title:'季',season_type:1,cover:'//i0.hdslb.com/cover'};
const ep = {ep_id:111,title:'1',long_title:'首集',duration:96000,cid:456,aid:123,bvid:video.bvid};
const room = {room_id:7,uid:42,uname:'主播',title:'房间',live_status:1};
const dyn = {id_str:'931312132323233212',type:'DYNAMIC_TYPE_AV',modules:{module_author:{mid:42,name:'作者',pub_ts:432},
  module_dynamic:{major:{archive:{aid:123,bvid:video.bvid,title:'视频',duration_text:'1:25'}}}}};
const fl = {id:31,title:'我的收藏',media_count:1,fav_state:1};
const ids = {aid:123,mid:42,cid:456,seasonId:19,epId:111,roomId:7};
const media = 'https://cdn.bilivideo.com/test';
const track = {id:64,baseUrl:media,backupUrl:[],codecs:'avc1.4D4028',mime_type:'video/mp4',bandwidth:1200000,SegmentBase:{Initialization:'0-844',indexRange:'845-955'}};
async function check(op,params,raw,verify) {
  queued.push(...raw);
  const result = await call(op,params);
  if (verify) verify(result,packets.at(-1));
  assert.equal(queued.length,0,op+' did not use expected response');
}
async function expectFailure(op,params,raw,code) {
  queued.push(...raw);
  await assert.rejects(call(op,params),e=>e.code===code,op+' should fail '+code);
  assert.equal(queued.length,0);
}
async function main() {
  await check('recommend',{},[ok({item:[{...video,goto:'av'},{...video,goto:'ad'}]})],r=>{assert.equal(r.items.length,1);assert.equal(r.items[0].title,'样片 & 声音');});
  await check('popular',{},[ok({list:[video],no_more:true})],r=>assert.equal(r.next,null));
  await check('weekly',{},[ok({list:[{number:40}]}),ok({list:[video],config:{name:'第40期'}})],r=>assert.equal(r.number,'40'));
  await check('region',{rid:36},[ok({list:[video]})]);
  await check('catalog',{kind:'doc',year:2024,page:2},[ok({list:[{...season,season_type:3}],has_next:1,total:50})],(r,p)=>{
    assert.equal(r.items[0].kind,'doc'); assert.equal(r.next,3); assert.equal(p.fields.get('release_date'),'[2024-01-01 00:00:00,2025-01-01 00:00:00)');
  });
  await check('catalog',{kind:'anime',year:2024},[ok({list:[season],has_next:0})],(r,p)=>assert.equal(p.fields.get('year'),'[2024,2025)'));
  await check('catalogOptions',{kind:'anime'},[ok({filter:[{field:'area',name:'地区',values:[{keyword:'2',name:'日本'}]}]})],r=>assert.deepEqual(r.items[0].options[0],{id:'2',title:'日本'}));
  for (const kind of ['anime','movie']) await check('ranking',{kind},[ok({list:[season]})]);
  await check('video',ids,[ok({...video,pages:[{cid:456,page:1,part:'原片',duration:60}]})],r=>assert.equal(r.pages[0].cid,'456'));
  await check('season',ids,[packet({code:0,result:{...season,episodes:[ep,{...ep,ep_id:112,section_type:1,badge:'预告'},{...ep,ep_id:113,is_view_hide:true}],user_status:{follow:1,progress:{last_ep_id:111,last_time:-1}}}})],r=>{
    assert.equal(r.episodes.length,1); assert.equal(r.extras[0].epId,'112'); assert.equal(r.resume.time,-1); assert.equal(r.episodes[0].duration,96); assert.equal(r.following,true);
  });
  await check('related',ids,[ok([video])]); await check('seasonRelated',ids,[ok({season:[season]})]);
  await check('search',{keyword:'含 空格',type:'video'},[ok({result:[video],numPages:2,numResults:29})],(r,p)=>{
    assert.equal(p.fields.get('keyword'),'含 空格'); assert.equal(r.next,2);
  });
  await check('suggest',{keyword:'猫'},[packet({code:0,result:{tag:[{value:'猫咪'}]}})],r=>assert.equal(r.items[0].title,'猫咪'));
  await check('hotSearch',{},[ok({trending:{list:[{keyword:'热词'}]}})]);
  await check('liveAreas',{},[ok([{id:2,name:'游戏',list:[{id:50,parent_id:2,name:'综合'}]}])],r=>assert.equal(r.items[0].children[0].parentAreaId,'2'));
  await check('liveRooms',{},[ok({recommend_room_list:[room]})]);
  await check('liveRooms',{parentAreaId:2},[ok({list:[room]})]);
  await check('liveRooms',{followed:true},[ok({isLogin:true,mid:42}),ok({rooms:[room]})]);
  await check('liveRoom',ids,[ok(room)]); await check('authorLive',ids,[ok({'42':room})]);
  await check('nav',{},[packet({code:-101,message:'未登录'})],r=>assert.equal(r.loggedIn,false));
  await check('qrGenerate',{},[ok({url:'https://passport.bilibili.com/h5-app/test',qrcode_key:'qr'})],r=>assert.equal(r.key,'qr'));
  for (const [n,state] of [[86101,'waiting'],[86090,'scanned'],[86038,'expired'],[0,'confirmed']]) {
    await check('qrPoll',{key:'qr'},[ok({code:n})],r=>assert.deepEqual(r,{state}));
  }
  await expectFailure('logout',{},[],'USER_ACTION_REQUIRED');
  await check('logout',{userAction:true},[],r=>assert.equal(r.ok,true)); assert.equal(cleared,1);
  for(const p of [{},{mid:42}]) await check('feed',p,[ok({items:[dyn],has_more:true,offset:'n400'})],r=>{
    assert.equal(r.items[0].target.duration,85); assert.equal(r.items[0].id,dyn.id_str); assert.equal(r.next,'n400');
  });
  await check('post',{id:dyn.id_str},[ok({item:dyn})],r=>assert.equal(r.postType,'video'));
  await check('author',ids,[ok({card:{mid:42,name:'作者'},following:false})],r=>assert.equal(r.following,false));
  await check('authorVideos',ids,[ok({list:{vlist:[video]},page:{count:1}})]);
  await check('follows',ids,[ok({list:[{mid:14,uname:'UP'}],total:1})]); await check('likes',ids,[ok([video])]);
  await check('history',{},[ok({list:[{title:'视频',duration:100,progress:-1,history:{oid:123,bvid:video.bvid,cid:456,business:'archive'}}],
    cursor:{max:123,view_at:4444,business:'archive'}})],r=>{assert.equal(r.items[0].kid,'archive_123');assert.equal(r.items[0].progress,-1);assert.equal(r.next.max,123);});
  await check('later',{},[ok({list:[],count:0})]); await check('folders',ids,[ok({list:[fl],count:1})],r=>assert.equal(r.items[0].selected,true));
  await check('folder',{folderId:31},[ok({medias:[video],has_more:false})]); await check('shelf',{mid:42,kind:'anime'},[ok({list:[season],total:1})]);
  await check('relation',ids,[ok({like:true,favorite:false}),ok({attribute:6})],r=>assert.deepEqual(r,{liked:true,favorited:false,following:true}));
  const writes = [['like',{aid:123,enabled:true}],['follow',{mid:42,enabled:false}],['setLater',{aid:123,enabled:true}],
    ['setLater',{aid:123,enabled:false}],['setFavorite',{aid:123,addIds:[31,31],removeIds:[32]}],['setShelf',{seasonId:19,enabled:true}],
    ['setShelf',{seasonId:19,enabled:false}],['clearHistory',{}],['removeHistory',{kid:'archive_123'}],['reportProgress',{aid:123,cid:456,time:20}],['reportProgress',{...ids,time:-1}]];
  for (const [op,p] of writes) {
    await expectFailure(op,p,[],'USER_ACTION_REQUIRED');
    await check(op,{...p,userAction:true},[ok(null)],r=>assert.deepEqual(r,{ok:true}));
  }
  await check('createFolder',{title:'私密',userAction:true},[ok(fl)],(r,p)=>{assert.equal(r.folderId,'31');assert.equal(p.fields.get('privacy'),'1');});
  await expectFailure('like',{aid:123,enabled:true,userAction:true},[packet({code:-111,message:'令牌校验失败'})],-111);
  await expectFailure('setFavorite',{aid:123,addIds:[2],removeIds:[2],userAction:true},[],'INVALID_INPUT');
  await check('play',{bvid:video.bvid,cid:456},[ok({quality:64,dash:{duration:60,video:[track],audio:[]},accept_quality:[64],accept_description:['高清']})],r=>{
    assert.equal(r.video[0].segmentBase.indexRange,'845-955');assert.equal(r.duration,60);assert.equal(r.qualities[0].label,'高清');
  });
  await check('play',{aid:123,cid:456},[ok({dash:{video:[{...track,baseUrl:'',backupUrl:[media]}]}})],r=>assert.equal(r.video[0].url,media));
  await check('play',{epId:111,format:'progressive'},[packet({code:0,result:{durl:[{url:media,length:1000}],format:'mp4',timelength:1000}})],r=>assert.equal(r.segments[0].duration,1));
  await expectFailure('play',ids,[packet({code:-10403,message:'地区限制'})],-10403);
  await expectFailure('play',ids,[ok({is_drm:true,dash:{video:[track]}})],'DRM_REQUIRED');
  await expectFailure('play',ids,[ok({dash:{audio:[track]}})],'NO_STREAM');
  const stream={protocol_name:'http_hls',format:[{format_name:'ts',codec:[{codec_name:'avc',current_qn:150,accept_qn:[150],base_url:'/live.m3u8',url_info:[{host:'https://live.bilivideo.com',extra:'?p=42'}]}]}]};
  await check('livePlay',ids,[ok({live_status:1,playurl_info:{playurl:{stream:[stream],g_qn_desc:[{qn:150,desc:'高清'}]}}})],r=>assert.equal(r.streams[0].url,'https://live.bilivideo.com/live.m3u8?p=42'));
  await check('livePlay',ids,[ok({live_status:0,playurl_info:null})],r=>assert.equal(r.streams.length,0));
  await expectFailure('livePlay',ids,[ok({live_status:1,is_locked:1})],'ROOM_RESTRICTED');
  await check('liveChat',ids,[ok({room:[{uid:42,nickname:'观众',timeline:'2020-01-01 12:00:00',text:'好'}]})],r=>assert.equal(r.items[0].name,'观众'));
  await expectFailure('danmaku',ids,[packet('<!DOCTYPE i><i/>')],'BAD_RESPONSE'); // Safe pre-parse rejection.
  await expectFailure('search',{keyword:'限制'},[ok({v_voucher:'challenge'})],'PLATFORM_CHECK');
  await expectFailure('nav',{},[packet('Access denied',412)],412);
  await expectFailure('popular',{},[packet('<html>')],'BAD_RESPONSE');
  await expectFailure('video',{bvid:'invalid'},[],'INVALID_INPUT');
  await expectFailure('__proto__',{},[],'UNAVAILABLE');
  assert.equal(observed.size,Object.values(policy.GET).flat().length+Object.values(policy.POST).flat().length);
  console.log('Passed production adapter contract checks on '+observed.size+' allowlisted method/path pairs.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

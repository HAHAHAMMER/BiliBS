// Deterministic public cards and account feed for scroll/retention benchmarks.
const originalStreamCall=BSApi.call;
window.streamTest={calls:[],hold:false,release:null,serial:0};
const streamArt='https://i0.hdslb.com/bfs/archive/stream.jpg';
const streamVideo=(id)=>({kind:'video',id,bvid:id,title:'测试视频 '+id,aid:'27',cid:'201',artist:'作者',mid:'9',wide:streamArt,cover:streamArt,duration:300});
BSApi.call=async(op,p={})=>{
 streamTest.calls.push({op,...p});
 if(op==='nav')return {loggedIn:true,mid:'9',name:'测试账号'};
 if(op==='follows')return {items:[{kind:'author',id:'9',mid:'9',title:'作者'}],next:null};
 if(op==='recommend'){
  const serial=++streamTest.serial,count=new URLSearchParams(location.search).has('large')?300:20;
  return {items:Array.from({length:count},(_,i)=>streamVideo('BV'+serial+'x'+i)),next:(p.page||1)+1};
 }
 if(op==='video')return streamVideo(p.bvid||'BV1x0');
 if(op==='feed'){
  const page=Number(p.offset||1);
  if(streamTest.hold)await new Promise(resolve=>streamTest.release=()=>{streamTest.hold=false;streamTest.release=null;resolve()});
  const type=p.type==='video'?'video':page===1?'video':page%2===0?'image':'live';
  const items=p.type==='video'&&page===1?[]:Array.from({length:20},(_,i)=>{
   const id=String(page*100+i),target=type==='video'?streamVideo('BVfeed'+id):{kind:'live',id,roomId:id,title:'直播 '+id,cover:streamArt,wide:streamArt,mid:'9',liveStatus:1};
   return {id,kind:'post',postType:type,mid:'9',artist:'作者',title:'动态 '+id,desc:'正文',images:[streamArt],target,published:100};
  });
  return {items,next:page<5?String(page+1):null};
 }
 return originalStreamCall(op,p);
};

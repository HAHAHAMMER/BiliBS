window.addEventListener('load',async()=>{
 const out=document.createElement('pre');out.id='qa';out.style='position:fixed;z-index:9999;inset:1% 2% auto;max-height:54vh;overflow:auto;padding:12px;color:#183024;background:white;font:14px/1.3 monospace';document.body.append(out);
 const log=t=>out.textContent+=t+'\n',key=()=>document.activeElement?.dataset.k,press=key=>document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})),enter=()=>document.activeElement.click(),check=(ok,msg)=>{if(!ok)throw Error(msg+' | '+key());log('✓ '+msg)};
 const wait=async f=>{for(let i=0;i<120;i++){if(f())return true;await new Promise(r=>setTimeout(r,50))}return false};
 try{
 signed=true;prefs.autonext=false;profile.likes=[];progress={'46089:1':{ep:1,t:7,d:18,recent:Date.now()}};
 rootTo('cinema');press('ArrowDown');check(key()==='cinTab-movie','影视 → 电影频道');
 for(const [mode] of movieTabs){
  focus('cinTab-'+mode);const channel=node(key()).getBoundingClientRect();press('ArrowDown');
  const rail=document.activeElement.getBoundingClientRect(),stage=$('cinStage').getBoundingClientRect();check(key().startsWith('film-')&&channel.top<stage.top&&stage.top<rail.top,'上频道、中海报、下选片 · '+mode);
  press('ArrowDown');check(key().startsWith('channelSub-'),'从横排进入本频道子分区 · '+mode);
  for(const [sub] of cinSections[mode]){focus('channelSub-'+sub);check(node('channelSub-'+sub).getAttribute('aria-selected')==='true'&&!!$('channelResults').children.length,'子分区随焦点更新 · '+mode+'/'+sub)}
 }
 focus('cinTab-drama');focus('channelSub-cn');check(view.querySelectorAll('.subWork').length===3,'国产剧三部');focus('channelSub-overseas');check(view.querySelectorAll('.subWork').length===2,'海外剧两部');
 rootTo('mine');press('ArrowDown');check(key()==='mine-shelfA','我的下键直达片单');press('ArrowLeft');check(key()==='my-account','从片单一次左键进入账户');press('ArrowDown');press('ArrowDown');check(key()==='mine-about','账户下方进入软件信息');press('ArrowUp');press('ArrowUp');press('ArrowRight');enter();
 check(key()==='s-46089'&&!view.querySelector('.shelfActions')&&view.querySelectorAll('.denseRow').length===2,'追番一页两排，作品是唯一播放焦点');
 const area=view.getBoundingClientRect(),rows=view.querySelectorAll('.denseRow');check(rows[1].getBoundingClientRect().bottom<area.bottom,'第二排完全可见');
 check(await wait(()=>previewVideo?.readyState>=3&&!previewVideo.paused&&previewVideo.currentTime>=2&&previewVideo.currentTime<4),'聚焦静音预览从第 2 秒开始');check(progress['46089:1'].t===7,'预览保留原观看记录');
 enter();check(current().type==='player'&&await wait(()=>video.readyState>=3&&video.currentTime>=7&&video.currentTime<9),'确定一次正式续播第 1 话第 7 秒');
 press('ArrowDown');check(key()==='episodes','第一个下键到选集');press('ArrowDown');check(overlay.mode==='episodes'&&key()==='wep-1','第二个下键展开当前集');
 press('ArrowRight');check(key()==='wep-2'&&current().ep===1&&video.paused,'横移只预览，正片留在原集');
 check(await wait(()=>episodeVideo?.readyState>=3&&episodeVideo.muted&&!episodeVideo.paused),'集数预览静音实际播放');
 enter();check(await wait(()=>current().ep===2&&!overlay),'确定切到第 2 话');check(!episodeVideo,'换集后释放预览播放器');
 focus('seek');press('ArrowDown');press('ArrowDown');press('Escape');check(await wait(()=>!overlay&&key()==='episodes'),'返回关闭选集并保留焦点');
 back();check(await wait(()=>current().name==='shelf'&&key()==='s-46089'),'退出正片回到原作品');
 for(let i=0;i<35;i++){const id='stress'+i;W[id]={...W['46089'],id,mediaRef:'46089'};collection.anime.push(id)}redraw('s-46089');check(view.querySelectorAll('.coverKey').length===12,'大列表每页 12 部');press('PageDown');check(key()==='s-'+collection.anime[12],'翻至第 13 部');press('ArrowDown');check(key()==='s-'+collection.anime[18],'下一排同列');
 startWatch('terrain');check(!!node('episodes')&&!!node('like')&&!!node('up')&&!!node('recommend')&&!node('more'),'投稿外露点赞、UP 主、推荐与分 P');focus('like');enter();check(profile.likes.includes('terrain')&&key()==='like','点赞切换且焦点留在原位');
 focus('playPrefs');enter();check(overlay.mode==='settings'&&!!node('m-save')&&!!node('m-follow')&&!!node('tech-info'),'底部设置保留收藏、关注和技术信息');press('Escape');await wait(()=>!overlay);
 focus('recommend');enter();check(overlay.mode==='queue'&&modal.querySelectorAll('.recPick').length>0,'推荐视频打开可播放的封面列表');const sel=document.activeElement.dataset.id;enter();check(await wait(()=>!overlay&&current().id===sel),'推荐卡可直接播放');
 focus('up');enter();check(current().name==='author','打开 UP 主空间');back();check(await wait(()=>current().type==='player'),'作者空间返回播放');
 startWatch('terrain');press('ArrowDown');press('ArrowDown');press('ArrowRight');enter();check(await wait(()=>current().ep===2&&current().id==='terrain'&&!overlay),'分 P 走同样的两次下键路径');
 rootTo('mine');signed=false;redraw('my-account');enter();check(current().name==='login','游客从左栏直达登录');log('全部通过');
 }catch(e){log('失败 '+(e.stack||e))}
});

import {BOOKMARKS_KEY,PREFERENCES_KEY,READING_DEFAULTS,parseBookmarks,parsePreferences,type ReadingBookmark} from '../lib/reading';

const room=document.querySelector<HTMLElement>('[data-reading-room]');
const article=document.querySelector<HTMLElement>('.article-page');
const body=document.querySelector<HTMLElement>('.article-body');
if(room&&article&&body){
  const slug=room.dataset.publicSlug||'';
  const dialog=room.querySelector<HTMLDialogElement>('dialog')!;
  const openButton=room.querySelector<HTMLButtonElement>('[data-reading-open]')!;
  const focusInput=room.querySelector<HTMLInputElement>('[data-reading-focus]')!;
  const savedRow=room.querySelector<HTMLElement>('[data-saved-place]')!;
  const feedback=room.querySelector<HTMLElement>('[data-reading-feedback]')!;
  const safeRead=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
  const safeWrite=(key:string,value:string)=>{try{localStorage.setItem(key,value);return true;}catch{return false;}};
  const safeRemove=(key:string)=>{try{localStorage.removeItem(key);return true;}catch{return false;}};
  let preferences=parsePreferences(safeRead(PREFERENCES_KEY));
  let bookmarks=parseBookmarks(safeRead(BOOKMARKS_KEY));
  let bookmark=bookmarks.find(item=>item.slug===slug);
  let feedbackTimer:ReturnType<typeof setTimeout>|undefined;
  const say=(message:string)=>{
    clearTimeout(feedbackTimer);
    feedback.textContent=message;
    feedbackTimer=setTimeout(()=>{feedback.textContent='';},6500);
  };
  const applyPreferences=()=>{
    article.dataset.readingSize=preferences.size;
    article.dataset.readingWidth=preferences.width;
    document.body.classList.toggle('reading-focus-active',preferences.focus);
    focusInput.checked=preferences.focus;
    room.querySelectorAll<HTMLButtonElement>('[data-reading-size]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.readingSize===preferences.size)));
    room.querySelectorAll<HTMLButtonElement>('[data-reading-width]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.readingWidth===preferences.width)));
  };
  const persistPreferences=()=>{
    applyPreferences();
    if(!safeWrite(PREFERENCES_KEY,JSON.stringify(preferences)))say('本机储存暂时不可用；这次调整仍然生效。');
  };
  const syncBookmark=()=>{
    savedRow.hidden=!bookmark;
    room.querySelector('[data-save-place] span')!.textContent=bookmark?'更新书签':'留枚书签';
  };
  applyPreferences();syncBookmark();room.hidden=false;
  if(typeof dialog.showModal==='function'){
    openButton.addEventListener('click',()=>dialog.showModal());
    dialog.addEventListener('close',()=>openButton.focus({preventScroll:true}));
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const box=dialog.getBoundingClientRect();
      if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
    });
  }else openButton.hidden=true;
  room.querySelectorAll<HTMLButtonElement>('[data-reading-size]').forEach(button=>button.addEventListener('click',()=>{preferences.size=button.dataset.readingSize==='large'?'large':'normal';persistPreferences();}));
  room.querySelectorAll<HTMLButtonElement>('[data-reading-width]').forEach(button=>button.addEventListener('click',()=>{preferences.width=button.dataset.readingWidth==='wide'?'wide':'standard';persistPreferences();}));
  focusInput.addEventListener('change',()=>{preferences.focus=focusInput.checked;persistPreferences();});
  room.querySelector('[data-reading-reset]')!.addEventListener('click',()=>{
    preferences={...READING_DEFAULTS};applyPreferences();
    say(safeRemove(PREFERENCES_KEY)?'阅读设置已恢复默认。':'已恢复默认；本机储存暂时不可用。');
  });
  room.querySelector('[data-save-place]')!.addEventListener('click',()=>{
    if(!/^[a-z0-9-]{1,100}$/.test(slug))return;
    const top=body.getBoundingClientRect().top+window.scrollY;
    const readingLine=window.scrollY+room.getBoundingClientRect().height+30;
    const heading=[...body.querySelectorAll<HTMLElement>('h2[id],h3[id]')].reverse().find(item=>item.getBoundingClientRect().top+window.scrollY<=readingLine);
    const next:ReadingBookmark={slug,ratio:Math.max(0,Math.min(1,(readingLine-top)/Math.max(body.offsetHeight,1))),heading:heading?.id||null,updatedAt:Date.now()};
    const nextBookmarks=[next,...parseBookmarks(safeRead(BOOKMARKS_KEY)).filter(item=>item.slug!==slug)].slice(0,20);
    if(safeWrite(BOOKMARKS_KEY,JSON.stringify(nextBookmarks))){bookmarks=nextBookmarks;bookmark=next;syncBookmark();say('书签留好了。下次打开本篇，点「接着读」。');}
    else say('本机储存暂时不可用，书签没有保存；文章仍可正常阅读。');
  });
  room.querySelector('[data-resume-place]')!.addEventListener('click',()=>{
    if(!bookmark)return;
    const target=body.getBoundingClientRect().top+window.scrollY+bookmark.ratio*body.offsetHeight-room.getBoundingClientRect().height-30;
    window.scrollTo({top:Math.max(0,target),behavior:'instant'});
    body.focus({preventScroll:true});
    say('回到上次留下书签的附近。');
  });
  room.querySelector('[data-forget-place]')!.addEventListener('click',()=>{
    const next=parseBookmarks(safeRead(BOOKMARKS_KEY)).filter(item=>item.slug!==slug);
    const removed=next.length?safeWrite(BOOKMARKS_KEY,JSON.stringify(next)):safeRemove(BOOKMARKS_KEY);
    if(removed){bookmarks=next;bookmark=undefined;syncBookmark();say('本篇书签已从这台设备移除。');}
    else say('本机储存暂时不可用，书签没有移除。');
  });
  // Observe headings only. Native links/hash/history stay in the browser's hands.
  const tocLinks=[...document.querySelectorAll<HTMLAnchorElement>('[data-reading-toc] a[href^="#section-"]')];
  const toc=document.querySelector<HTMLDetailsElement>('[data-reading-toc]');
  if(toc&&window.matchMedia('(max-width:760px)').matches)toc.open=false;
  const headings=tocLinks.map(link=>document.getElementById(link.hash.slice(1))).filter((heading):heading is HTMLElement=>!!heading);
  if(headings.length){
    let pending=false;
    const updateSection=()=>{
      pending=false;
      const current=[...headings].reverse().find(heading=>heading.getBoundingClientRect().top<=window.innerHeight*.35)||headings[0];
      tocLinks.forEach(link=>{if(link.hash===`#${current.id}`)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
    };
    const requestUpdate=()=>{if(!pending){pending=true;requestAnimationFrame(updateSection);}};
    window.addEventListener('scroll',requestUpdate,{passive:true});
    window.addEventListener('resize',requestUpdate,{passive:true});
    updateSection();
  }
}

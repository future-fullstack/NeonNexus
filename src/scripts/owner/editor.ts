import type {Post} from '../../lib/contracts';
import {ownerRequest,jsonRequest,ownerStatus,getCSRF} from './api';
import {withBase} from '../../lib/paths';
import {errorText} from '../../lib/browser-api';
export function setupEditor(){
  const form=document.querySelector<HTMLFormElement>('[data-post-form]')!;
  const list=document.querySelector<HTMLElement>('[data-post-list]')!;
  const image=document.querySelector<HTMLInputElement>('[data-post-image]')!;
  const textarea=form.elements.namedItem('body') as HTMLTextAreaElement;
  const preview=document.querySelector<HTMLElement>('[data-post-preview-panel]')!;
  let current:Post|null=null,dirty=false,busy=false;
  function field(name:string){return form.elements.namedItem(name) as HTMLInputElement|HTMLTextAreaElement;}
  function lock(value:boolean){busy=value;form.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=value);}
  function setDirty(value:boolean){dirty=value;document.querySelector('[data-editor-dirty]')!.textContent=value?'有还没保存的修改。':'已保存到自己的文章架。';}
  function newPost(){
    current=null;form.reset();preview.hidden=true;
    const now=new Date();const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    field('pubDate').value=date;field('slug').value=`entry-${date.replaceAll('-','')}-${Date.now().toString(36).slice(-5)}`;
    displayState();setDirty(false);document.querySelector('[data-editor-dirty]')!.textContent='保存后只有你能看见；点击发布才会出现在网站上。';
  }
  function displayState(){
    document.querySelector('[data-editor-state]')!.textContent=current?.visibility==='public'?(current.pendingChanges?'已公开 · 有未发布修改':'已公开 · 修改可以先存为草稿'):'草稿 · 仅自己可见';
    const publish=document.querySelector<HTMLButtonElement>('[data-post-publish]')!;
    publish.hidden=false;publish.textContent=current?.visibility==='public'?'发布修改 →':'发布文章 →';
    (document.querySelector('[data-post-unpublish]') as HTMLElement).hidden=current?.visibility!=='public';
    (document.querySelector('[data-post-delete]') as HTMLElement).hidden=!current;
  }
  function fill(post:Post){current=post;for(const name of ['title','description','pubDate','slug','body'])field(name).value=String(post[name as keyof Post]||'');field('tags').value=post.tags.join('，');preview.hidden=true;displayState();setDirty(false);}
  function editable(){return{title:field('title').value.trim(),description:field('description').value.trim(),pubDate:field('pubDate').value,slug:field('slug').value.trim(),body:textarea.value,tags:field('tags').value.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean)};}
  async function refresh(){
    const result=await ownerRequest<{posts:Post[]}>('/posts');list.replaceChildren();
    for(const post of result.posts){const button=document.createElement('button');button.type='button';button.className='owner-list-entry';const title=document.createElement('strong');title.textContent=post.title;const meta=document.createElement('span');meta.textContent=`${post.visibility==='public'?(post.pendingChanges?'公开 · 有未发布修改':'公开'):'草稿'} · ${post.pubDate}`;button.append(title,meta);button.addEventListener('click',async()=>{if(busy||dirty&&!confirm('还有没保存的修改，确定切换文章吗？'))return;try{const detail=await ownerRequest<{post:Post}>(`/posts/${post.id}`);fill(detail.post);ownerStatus('文章已经放在书桌上了。');}catch(error){ownerStatus(errorText(error));}});list.append(button);}
    if(!result.posts.length){const empty=document.createElement('p');empty.textContent='文章架还是空的。写下第一篇吧。';list.append(empty);}
  }
  async function save(){
    if(!form.reportValidity())throw new Error('先把标题、简介、日期和网址填好吧。');
    const path=current?`/posts/${current.id}`:'/posts';
    const payload=editable();
    const result=await ownerRequest<{post:Post}>(path,jsonRequest(current?'PUT':'POST',payload));
    current=result.post;displayState();setDirty(JSON.stringify(editable())!==JSON.stringify(payload));await refresh();return current;
  }
  async function action(operation:()=>Promise<void>){if(busy)return;lock(true);try{await operation();}catch(error){ownerStatus(error instanceof Error&&error.name==='Error'?error.message:errorText(error));}finally{lock(false);}}
  form.addEventListener('input',()=>setDirty(true));
  form.addEventListener('submit',event=>{event.preventDefault();void action(async()=>{await save();ownerStatus(dirty?'已保存刚才那一版，你新补的文字还没保存。':current?.visibility==='public'?'修改已存为草稿，公开版本保持原样。准备好后再发布修改。':'已保存为草稿，只有你能看见。');});});
  document.querySelector('[data-post-new]')?.addEventListener('click',()=>{if(!busy&&(!dirty||confirm('还有没保存的修改，确定开始新文章吗？')))newPost();});
  document.querySelector('[data-post-publish]')?.addEventListener('click',()=>void action(async()=>{const post=await save();if(dirty)throw new Error('你又补了一点文字，先保存这一版，再发布吧。');const result=await ownerRequest<{post:Post}>(`/posts/${post.id}/publish`,jsonRequest('POST',{}));current=result.post;displayState();await refresh();ownerStatus('文章发布了，可以回到小站看看。');}));
  document.querySelector('[data-post-unpublish]')?.addEventListener('click',()=>void action(async()=>{if(!current)return;const result=await ownerRequest<{post:Post}>(`/posts/${current.id}/unpublish`,jsonRequest('POST',{}));current=result.post;displayState();await refresh();ownerStatus('文章已收回，公开网站上看不到它了。');}));
  document.querySelector('[data-post-delete]')?.addEventListener('click',()=>{if(!current||!confirm('确定把这篇文章从文章架上删除吗？'))return;void action(async()=>{await ownerRequest(`/posts/${current!.id}`,{method:'DELETE'});newPost();await refresh();ownerStatus('文章已删除，公开网址也收起来了。');});});
  document.querySelector('[data-post-preview]')?.addEventListener('click',()=>void action(async()=>{
    const response=await fetch(withBase('/admin/preview'),{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':getCSRF()},body:JSON.stringify({body:textarea.value}),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    const result=await response.json() as {html?:string;message?:string};if(!response.ok||typeof result.html!=='string')throw new Error(result.message||'暂时无法预览，正文还在。');
    document.querySelector('[data-preview-title]')!.textContent=field('title').value;document.querySelector('[data-post-rendered]')!.innerHTML=result.html;preview.hidden=false;preview.scrollIntoView({block:'nearest',behavior:'smooth'});ownerStatus('这就是阅读页的正文样式。预览不会发布文章。');
  }));
  document.querySelector('[data-preview-close]')?.addEventListener('click',()=>preview.hidden=true);
  document.querySelector('[data-image-choose]')?.addEventListener('click',()=>image.click());
  image.addEventListener('change',()=>void action(async()=>{
    const file=image.files?.[0];if(!file)return;
    if(!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)||file.size>4*1024*1024)throw new Error('请选择 4 MB 以内的 PNG、JPEG、GIF 或 WebP 图片。');
    if(!current)await save();const position=textarea.selectionStart;
    const result=await ownerRequest<{url:string}>('/media',{method:'POST',headers:{'Content-Type':file.type,'X-Post-Id':current!.id},body:file});
    const markdown=`\n\n![图片](${result.url})\n\n`;textarea.setRangeText(markdown,position,textarea.selectionEnd,'end');setDirty(true);image.value='';textarea.focus();ownerStatus('图片已放进正文，记得保存。');
  }));
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  newPost();
  return{refresh,clear:()=>{list.replaceChildren();newPost();document.querySelector('[data-post-rendered]')!.replaceChildren();}};
}

import {withBase} from '../../lib/paths';
import {getCSRF,notifyExpired} from './api';

export function setupLivePreview(){
  const form=document.querySelector<HTMLFormElement>('[data-post-form]')!;
  const body=form.elements.namedItem('body') as HTMLTextAreaElement;
  const title=form.elements.namedItem('title') as HTMLInputElement;
  const description=form.elements.namedItem('description') as HTMLTextAreaElement;
  const pane=document.querySelector<HTMLElement>('[data-post-preview-panel]')!;
  const rendered=document.querySelector<HTMLElement>('[data-post-rendered]')!;
  const status=document.querySelector<HTMLElement>('[data-preview-status]')!;
  const columns=document.querySelector<HTMLElement>('[data-editor-columns]')!;
  let active=false,revision=0,timer:number|undefined,controller:AbortController|null=null;
  function cancel(){revision++;window.clearTimeout(timer);timer=undefined;controller?.abort();controller=null;}
  function metadata(){
    document.querySelector('[data-preview-title]')!.textContent=title.value || '还没写标题';
    document.querySelector('[data-preview-description]')!.textContent=description.value;
  }
  function feedback(text:string,state:string){status.textContent=text;pane.dataset.previewState=state;}
  async function render(version:number){
    if(!active||version!==revision)return;
    const submitted=body.value;
    if(!submitted.trim()){rendered.replaceChildren();feedback('从一句话开始，预览会随着正文更新。','empty');return;}
    const attempt=new AbortController();controller=attempt;
    const timeout=window.setTimeout(()=>attempt.abort(),15000);
    feedback('正在更新预览…','pending');
    try{
      const response=await fetch(withBase('/admin/preview'),{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':getCSRF()},body:JSON.stringify({body:submitted}),credentials:'same-origin',cache:'no-store',signal:attempt.signal});
      if(!active||version!==revision)return;
      if(response.status===401){feedback('重新输入密码后，预览会接着更新。','paused');notifyExpired();return;}
      const result=await response.json() as {html?:unknown;message?:string};
      if(!active||version!==revision)return;
      if(!response.ok||typeof result.html!=='string')throw new Error(result.message || '预览暂时没连上。');
      // Only the shared owner-only renderer produces this sanitized HTML.
      rendered.innerHTML=result.html;feedback('预览已跟上当前正文。没有自动保存或发布。','ready');
    }catch{
      if(active&&version===revision)feedback('暂时无法更新预览，左边的文字还在。这里显示的是上一次预览。','error');
    }finally{window.clearTimeout(timeout);if(controller===attempt)controller=null;}
  }
  function schedule(delay=350){
    cancel();metadata();if(!active)return;
    feedback('等你写完这一小段，预览就会更新。','pending');
    const version=revision;timer=window.setTimeout(()=>{timer=undefined;void render(version);},delay);
  }
  function view(mode:'edit'|'preview'){
    columns.dataset.editorViewMode=mode;
    document.querySelectorAll<HTMLButtonElement>('[data-editor-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.editorView===mode)));
  }
  form.addEventListener('input',event=>{if([body,title,description].includes(event.target as HTMLInputElement))schedule();});
  document.querySelectorAll<HTMLButtonElement>('[data-editor-view]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.editorView==='preview'?'preview':'edit')));
  document.querySelector('[data-preview-refresh]')?.addEventListener('click',()=>schedule(0));
  return{
    schedule,
    now:()=>{view('preview');schedule(0);},
    reset:()=>{cancel();rendered.replaceChildren();metadata();view('edit');feedback('从一句话开始，预览会随着正文更新。','empty');if(active)schedule(0);},
    resume:()=>{active=true;schedule(0);},
    pause:()=>{active=false;cancel();feedback('重新打开书桌后，预览会接着更新。','paused');},
    clear:()=>{active=false;cancel();rendered.replaceChildren();metadata();feedback('','empty');},
  };
}

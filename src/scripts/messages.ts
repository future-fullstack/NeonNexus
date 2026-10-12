import {withBase} from '../lib/paths';

const form=document.querySelector<HTMLFormElement>('[data-message-form]');
const input=document.querySelector<HTMLTextAreaElement>('[data-message-input]');
const website=document.querySelector<HTMLInputElement>('[data-message-website]');
const submit=document.querySelector<HTMLButtonElement>('[data-message-submit]');
const status=document.querySelector<HTMLElement>('[data-message-status]');
const count=document.querySelector<HTMLElement>('[data-message-count]');
let sending=false,lastMessage='',requestId='';
if(submit)submit.disabled=false;

function updateCount(){if(count&&input)count.textContent=`${input.value.length} / 2000`;}
function feedback(text:string,state:'success'|'error'|'pending') {if(status){status.textContent=text;status.dataset.state=state;}}
// getRandomValues works on HTTP pages too; this ID deduplicates submissions, not identities.
function makeRequestId(){
  const bytes=window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
input?.addEventListener('input',updateCount);updateCount();
form?.addEventListener('submit',async event=>{
  event.preventDefault();if(sending||!input||!submit)return;
  const message=input.value.trim();
  if(!message||message.length>2000){feedback('先写下一句话吧，留言最多 2000 字。','error');input.focus();return;}
  if(message!==lastMessage||!requestId){lastMessage=message;requestId=makeRequestId();}
  sending=true;submit.disabled=true;submit.textContent='正在把留言放进去…';form.setAttribute('aria-busy','true');feedback('正在送出，等一会儿。','pending');
  const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),15_000);
  try{
    const response=await fetch(withBase('/api/messages'),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestId},body:JSON.stringify({message,website:website?.value||''}),signal:controller.signal});
    let result:{ok?:boolean;message?:unknown}|null=null;try{result=await response.json() as {ok?:boolean;message?:unknown};}catch{}
    if(!response.ok||result?.ok!==true){
      const text=response.status===429?'留言来得有点快，稍后再试吧。你写的内容还在。':typeof result?.message==='string'?`${result.message} 你写的内容还在。`:'留言箱暂时没连上，你写的内容还在。稍后可以再试。';
      feedback(text,'error');return;
    }
    feedback('留言已经放进我的留言箱了。谢谢你愿意说这些。','success');
    if(input.value.trim()===message)input.value='';lastMessage='';requestId='';updateCount();
  }catch{feedback('暂时没能确认留言是否送达，你写的内容还在。稍后可以再试。','error');}
  finally{window.clearTimeout(timeout);sending=false;submit.disabled=false;submit.textContent='把话留在这里 →';form.removeAttribute('aria-busy');}
});

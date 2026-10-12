import {withBase} from '../lib/paths';
import {randomHex,requestId,errorText} from '../lib/browser-api';
import {showReceipt} from './receipt';
const form=document.querySelector<HTMLFormElement>('[data-message-form]');
const input=document.querySelector<HTMLTextAreaElement>('[data-message-input]');
const website=document.querySelector<HTMLInputElement>('[data-message-website]');
const submit=document.querySelector<HTMLButtonElement>('[data-message-submit]');
const status=document.querySelector<HTMLElement>('[data-message-status]');
const count=document.querySelector<HTMLElement>('[data-message-count]');
interface Pending {message:string;key:string;secret:string;}
let pending:Pending|null=null,sending=false;
try{const value=sessionStorage.getItem('neonnexus-pending-message');if(value){const parsed=JSON.parse(value) as Pending;if(typeof parsed.message==='string'&&/^[a-f0-9]{64}$/.test(parsed.secret)&&/^[a-f0-9]{32}$/.test(parsed.key)){pending=parsed;if(input)input.value=parsed.message;}}}catch{}
function preserve(value:Pending|null){pending=value;try{if(value)sessionStorage.setItem('neonnexus-pending-message',JSON.stringify(value));else sessionStorage.removeItem('neonnexus-pending-message');}catch{}}
function update(){if(input&&count)count.textContent=`${input.value.length} / 2000`;}
function feedback(text:string,state:'success'|'error'|'pending'){if(status){status.textContent=text;status.dataset.state=state;}}
if(submit)submit.disabled=false;input?.addEventListener('input',update);update();
form?.addEventListener('submit',async event=>{
  event.preventDefault();if(sending||!input||!submit)return;
  const message=input.value.trim();
  if(!message||message.length>2000){feedback('留言需要 1 到 2000 个字。','error');input.focus();return;}
  if(!pending||pending.message!==message)preserve({message,key:requestId(),secret:randomHex()});
  const attempt=pending!;sending=true;submit.disabled=true;form.setAttribute('aria-busy','true');feedback('正在送出，等一会儿。','pending');
  try{
    const response=await fetch(withBase('/api/messages'),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:JSON.stringify({message,website:website?.value||'',threadSecret:attempt.secret}),signal:AbortSignal.timeout(15000),cache:'no-store'});
    const result=await response.json() as {ok?:boolean;threadId?:string;message?:string};
    if(!response.ok||!result.ok||!result.threadId)throw new Error(response.status===429?'留言来得有点快，稍后再试吧。':result.message || '留言箱暂时没连上。');
    const fragment=new URLSearchParams({thread:result.threadId,key:attempt.secret});
    const link=new URL(withBase('/thread/'),location.origin).href+'#'+fragment;
    showReceipt(link);feedback('留言已放进我的留言箱。保存回执，就能回来查看回复。','success');
    if(input.value.trim()===message)input.value='';preserve(null);update();
  }catch(error){feedback(`${error instanceof Error&&!['TimeoutError','AbortError','TypeError','SyntaxError'].includes(error.name)?error.message:errorText(error)} 你写的内容还在。`,'error');}
  finally{sending=false;submit.disabled=false;form.removeAttribute('aria-busy');}
});

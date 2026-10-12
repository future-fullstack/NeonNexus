import {requestJSON,requestId,beijingTime,errorText} from '../lib/browser-api';
import type {Thread} from '../lib/contracts';
const fragment=new URLSearchParams(location.hash.slice(1)),id=fragment.get('thread'),secret=fragment.get('key');
const status=document.querySelector<HTMLElement>('[data-thread-status]');
const messages=document.querySelector<HTMLElement>('[data-thread-messages]');
const form=document.querySelector<HTMLFormElement>('[data-thread-form]');
const input=document.querySelector<HTMLTextAreaElement>('[data-thread-input]');
const submit=document.querySelector<HTMLButtonElement>('[data-thread-submit]');
const refresh=document.querySelector<HTMLButtonElement>('[data-thread-refresh]');
let sending=false,last='',key='';
const pendingStorage=`neonnexus-thread-pending-${id||'missing'}`;
try{const raw=sessionStorage.getItem(pendingStorage);if(raw){const pending=JSON.parse(raw) as {message:string;key:string};if(typeof pending.message==='string'&&/^[a-f0-9]{32}$/.test(pending.key)){last=pending.message;key=pending.key;if(input)input.value=last;}}}catch{}
function feedback(text:string){if(status)status.textContent=text;}
async function load(){
  if(!id||!secret||!/^[a-f0-9]{64}$/.test(secret)){feedback('这张回执不完整。请使用最初保存的完整私密链接，链接里要带上井号后面的内容。');return;}
  try{
    const result=await requestJSON<{thread:Thread}>(`/threads/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${secret}`}});
    messages?.replaceChildren();
    for(const message of result.thread.messages){
      const item=document.createElement('article');item.className=`thread-message thread-message-${message.author}`;
      const label=document.createElement('p');label.className='thread-message-meta';label.textContent=`${message.author==='owner'?'窗边的我':'你的留言'} · ${beijingTime(message.createdAt)}`;
      const text=document.createElement('p');text.className='thread-message-body';text.textContent=message.body;item.append(label,text);messages?.append(item);
    }
    feedback(result.thread.messages.some(message=>message.author==='owner')?'回复在下面。我们可以接着聊。':'留言已收到。等我有空，就在这里回复你。');
    if(form)form.hidden=false;if(refresh)refresh.hidden=false;
  }catch(error){feedback(errorText(error));}
}
refresh?.addEventListener('click',()=>void load());void load();
form?.addEventListener('submit',async event=>{
  event.preventDefault();if(sending||!input||!submit||!id||!secret)return;
  const message=input.value.trim();if(!message||message.length>2000){feedback('留言需要 1 到 2000 个字。');return;}
  if(message!==last||!key){last=message;key=requestId();}try{sessionStorage.setItem(pendingStorage,JSON.stringify({message:last,key}));}catch{}sending=true;submit.disabled=true;feedback('正在送出，等一会儿。');
  try{await requestJSON(`/threads/${encodeURIComponent(id)}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({message})});if(input.value.trim()===message)input.value='';last='';key='';try{sessionStorage.removeItem(pendingStorage);}catch{}await load();}
  catch(error){feedback(errorText(error));}finally{sending=false;submit.disabled=false;}
});

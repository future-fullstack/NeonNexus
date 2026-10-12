import {ownerRequest,jsonRequest,ownerStatus} from './api';
import {errorText,beijingTime,requestId} from '../../lib/browser-api';
import type {Thread} from '../../lib/contracts';
interface Summary {id:string;createdAt:string;updatedAt:string;messageCount:number;preview:string;canReply:boolean;}
export function setupInbox(){
  const list=document.querySelector<HTMLElement>('[data-inbox-list]')!;
  const conversation=document.querySelector<HTMLElement>('[data-inbox-conversation]')!;
  const form=document.querySelector<HTMLFormElement>('[data-inbox-reply]')!;
  const input=document.querySelector<HTMLTextAreaElement>('[data-inbox-reply-input]')!;
  const submit=document.querySelector<HTMLButtonElement>('[data-inbox-reply-submit]')!;
  const note=document.querySelector<HTMLElement>('[data-inbox-note]')!;
  let selected:Summary|null=null,sending=false,last='',key='';
  async function open(summary:Summary){
    const result=await ownerRequest<{thread:Thread}>(`/threads/${summary.id}`);
    selected=summary;conversation.replaceChildren();
    for(const message of result.thread.messages){const item=document.createElement('article');item.className=`thread-message thread-message-${message.author}`;const meta=document.createElement('p');meta.className='thread-message-meta';meta.textContent=`${message.author==='owner'?'你的回复':'对方的留言'} · ${beijingTime(message.createdAt)}`;const text=document.createElement('p');text.className='thread-message-body';text.textContent=message.body;item.append(meta,text);conversation.append(item);}
    form.hidden=!summary.canReply;note.textContent=summary.canReply?'回复只放在对方的回执里。':'这封旧留言没有回执，无法直接回复对方。';
  }
  async function refresh(){
    const result=await ownerRequest<{threads:Summary[]}>('/threads');list.replaceChildren();
    for(const summary of result.threads){const button=document.createElement('button');button.type='button';button.className='owner-list-entry';const preview=document.createElement('strong');preview.textContent=summary.preview;const meta=document.createElement('span');meta.textContent=`${beijingTime(summary.updatedAt)} · ${summary.messageCount} 条`;button.append(preview,meta);button.addEventListener('click',()=>{if(sending)return;if(input.value.trim()&&!confirm('当前回复还没有发出，确定切换对话吗？'))return;input.value='';last='';key='';void open(summary).catch(error=>ownerStatus(errorText(error)));});list.append(button);}
    if(!result.threads.length){const empty=document.createElement('p');empty.textContent='还没有留言。';list.append(empty);}
  }
  document.querySelector('[data-inbox-refresh]')?.addEventListener('click',()=>void refresh().catch(error=>ownerStatus(errorText(error))));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending||!selected)return;const message=input.value.trim();if(!message||message.length>2000)return;
    if(message!==last||!key){last=message;key=requestId();}sending=true;submit.disabled=true;
    try{await ownerRequest(`/threads/${selected.id}`,{...jsonRequest('POST',{message}),headers:{'Content-Type':'application/json','Idempotency-Key':key}});if(input.value.trim()===message)input.value='';last='';key='';await open(selected);await refresh();ownerStatus('回复已经留在对方的回执里了。');}
    catch(error){ownerStatus(errorText(error));}finally{sending=false;submit.disabled=false;}
  });
  return{refresh,clear:()=>{selected=null;list.replaceChildren();conversation.replaceChildren();form.hidden=true;input.value='';}};
}

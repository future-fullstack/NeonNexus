import {requestJSON,RequestError,errorText} from '../../lib/browser-api';
import {withBase} from '../../lib/paths';
import {ownerRequest,jsonRequest,setCSRF,onExpired,ownerStatus} from './api';
import {setupOwnerLogin} from './login';
import {setupEditor} from './editor';
import {setupInbox} from './inbox';

const workbench=document.querySelector<HTMLElement>('[data-owner-workbench]');
const dialog=document.querySelector<HTMLDialogElement>('[data-owner-reauth]');
const connection=document.querySelector<HTMLElement>('[data-owner-connection]');
if(workbench&&dialog){
  const editor=setupEditor(),inbox=setupInbox();
  let phase:'opening'|'ready'|'reauth'|'closing'='opening';
  function unavailable(){
    workbench!.hidden=true;editor.pausePreview();
    if(connection)connection.hidden=false;
    ownerStatus('书桌暂时没连上。当前页面里没保存的文字还在，稍后可以重新连接。');
  }
  function expired(){
    if(phase==='closing')return;
    phase='reauth';setCSRF('');editor.pausePreview();workbench!.hidden=true;
    if(connection)connection.hidden=true;
    if(!dialog!.open)dialog!.showModal();
    ownerStatus('请重新输入密码，刚才没保存的文字还在。');
  }
  async function signedIn(token:string){
    setCSRF(token);phase='ready';if(dialog!.open)dialog!.close();
    if(connection)connection.hidden=true;workbench!.hidden=false;
    editor.resumePreview();
    try{await Promise.all([editor.refresh(),inbox.refresh()]);if(phase==='ready')ownerStatus('书桌已打开。左边写，右边看看效果。');}
    catch(error){ownerStatus(errorText(error));}
  }
  function closeDesk(){
    phase='closing';setCSRF('');editor.pausePreview();editor.clear();inbox.clear();workbench!.hidden=true;
    document.querySelector<HTMLFormElement>('[data-owner-password-form]')?.reset();
    dialog!.querySelector<HTMLFormElement>('form')?.reset();
    if(dialog!.open)dialog!.close();location.assign(withBase('/login/'));
  }
  async function reconnect(){
    workbench!.hidden=true;editor.pausePreview();
    try{
      const session=await requestJSON<{ok?:unknown;csrfToken?:unknown}>('/owner/session');
      if(session.ok!==true||typeof session.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(session.csrfToken))throw new Error('invalid session');
      if(phase!=='closing')await signedIn(session.csrfToken);
    }catch(error){if(phase==='closing')return;if(error instanceof RequestError&&error.status===401)expired();else unavailable();}
  }
  onExpired(expired);setupOwnerLogin(signedIn);
  dialog.addEventListener('cancel',event=>event.preventDefault());
  document.querySelector('[data-owner-retry]')?.addEventListener('click',()=>void reconnect());
  document.querySelector<HTMLButtonElement>('[data-owner-logout]')?.addEventListener('click',async event=>{
    const button=event.currentTarget as HTMLButtonElement;button.disabled=true;phase='closing';editor.pausePreview();
    try{await ownerRequest('/logout',jsonRequest('POST',{}));closeDesk();}
    catch(error){if(error instanceof RequestError&&error.status===401)closeDesk();else{phase='ready';editor.resumePreview();ownerStatus('还没能确认退出，请稍后再试。');}}
    finally{button.disabled=false;}
  });
  document.querySelector<HTMLFormElement>('[data-owner-password-form]')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget as HTMLFormElement;
    const currentPassword=(form.elements.namedItem('currentPassword') as HTMLInputElement).value,password=(form.elements.namedItem('password') as HTMLInputElement).value;
    const button=form.querySelector<HTMLButtonElement>('button')!;button.disabled=true;
    try{await ownerRequest('/password',jsonRequest('POST',{currentPassword,password}));closeDesk();}
    catch(error){ownerStatus(errorText(error));}finally{button.disabled=false;}
  });
  document.querySelectorAll<HTMLButtonElement>('[data-owner-tab]').forEach(button=>button.addEventListener('click',()=>{
    const isInbox=button.dataset.ownerTab==='inbox';
    document.querySelector<HTMLElement>('[data-owner-posts]')!.hidden=isInbox;document.querySelector<HTMLElement>('[data-owner-inbox]')!.hidden=!isInbox;
    document.querySelectorAll('[data-owner-tab]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    if(isInbox){editor.pausePreview();void inbox.refresh().catch(error=>ownerStatus(errorText(error)));}else editor.resumePreview();
  }));
  // Cover the page before it enters the back-forward cache; verify before restoring it.
  window.addEventListener('pagehide',()=>{workbench!.hidden=true;editor.pausePreview();});
  window.addEventListener('pageshow',event=>{if(event.persisted){if(phase==='closing')location.replace(withBase('/login/'));else void reconnect();}});
  void reconnect();
}

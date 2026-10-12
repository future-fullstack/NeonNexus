import {requestJSON,errorText} from '../../lib/browser-api';
import {ownerRequest,jsonRequest,setCSRF,onExpired,ownerStatus} from './api';
import {setupEditor} from './editor';
import {setupInbox} from './inbox';
const login=document.querySelector<HTMLElement>('[data-owner-login]');
const workbench=document.querySelector<HTMLElement>('[data-owner-workbench]');
const form=document.querySelector<HTMLFormElement>('[data-owner-login-form]');
if(login&&workbench&&form){
  const editor=setupEditor(),inbox=setupInbox();
  document.querySelector<HTMLButtonElement>('[data-owner-login-submit]')!.disabled=false;
  function signedOut(clear=true){setCSRF('');login!.hidden=false;workbench!.hidden=true;if(clear){editor.clear();inbox.clear();}document.querySelector<HTMLFormElement>('[data-owner-password-form]')?.reset();ownerStatus('书桌已关好。');}
  async function signedIn(token:string){setCSRF(token);login!.hidden=true;workbench!.hidden=false;await Promise.all([editor.refresh(),inbox.refresh()]);ownerStatus('书桌已打开，慢慢写吧。');}
  onExpired(()=>{signedOut(false);ownerStatus('请重新输入密码，刚才没保存的文字还留在书桌上。');});
  form.addEventListener('submit',async event=>{
    event.preventDefault();const password=document.querySelector<HTMLInputElement>('[data-owner-password]')!;const button=document.querySelector<HTMLButtonElement>('[data-owner-login-submit]')!;button.disabled=true;
    try{const result=await requestJSON<{csrfToken:string}>('/owner/login',jsonRequest('POST',{password:password.value}));password.value='';await signedIn(result.csrfToken);}
    catch(error){ownerStatus(errorText(error));}finally{button.disabled=false;}
  });
  document.querySelector('[data-owner-logout]')?.addEventListener('click',async()=>{try{await ownerRequest('/logout',jsonRequest('POST',{}));signedOut();}catch(error){ownerStatus(errorText(error));}});
  document.querySelector<HTMLFormElement>('[data-owner-password-form]')?.addEventListener('submit',async event=>{event.preventDefault();const passwordForm=event.currentTarget as HTMLFormElement;const currentPassword=(passwordForm.elements.namedItem('currentPassword') as HTMLInputElement).value;const password=(passwordForm.elements.namedItem('password') as HTMLInputElement).value;const button=passwordForm.querySelector<HTMLButtonElement>('button')!;button.disabled=true;try{await ownerRequest('/password',jsonRequest('POST',{currentPassword,password}));signedOut();ownerStatus('密码已更换，用新密码重新打开书桌吧。');}catch(error){ownerStatus(errorText(error));}finally{button.disabled=false;}});
  document.querySelectorAll<HTMLButtonElement>('[data-owner-tab]').forEach(button=>button.addEventListener('click',()=>{const isInbox=button.dataset.ownerTab==='inbox';document.querySelector<HTMLElement>('[data-owner-posts]')!.hidden=isInbox;document.querySelector<HTMLElement>('[data-owner-inbox]')!.hidden=!isInbox;document.querySelectorAll('[data-owner-tab]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));if(isInbox)void inbox.refresh().catch(error=>ownerStatus(errorText(error)));}));
  void requestJSON<{csrfToken:string}>('/owner/session').then(result=>signedIn(result.csrfToken)).catch(()=>{signedOut();ownerStatus('输入密码，回到自己的书桌。');});
}

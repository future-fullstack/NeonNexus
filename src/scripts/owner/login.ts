import {requestJSON,RequestError} from '../../lib/browser-api';
import {jsonRequest} from './api';

/** Shared by the dedicated login page and an already-authorized page's re-login dialog. */
export function setupOwnerLogin(signedIn:(csrfToken:string)=>Promise<void>|void){
  const form=document.querySelector<HTMLFormElement>('[data-owner-login-form]');
  if(!form)return;
  const password=form.querySelector<HTMLInputElement>('[data-owner-password]')!;
  const button=form.querySelector<HTMLButtonElement>('[data-owner-login-submit]')!;
  const status=form.querySelector<HTMLElement>('[data-owner-login-status]')!;
  let sending=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending)return;sending=true;button.disabled=true;status.textContent='正在打开书桌…';
    try{
      const result=await requestJSON<{ok?:boolean;csrfToken?:string}>('/owner/login',jsonRequest('POST',{password:password.value}));
      if(result.ok!==true||typeof result.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(result.csrfToken))throw new Error('invalid session');
      password.value='';await signedIn(result.csrfToken);status.textContent='';
    }catch(error){status.textContent=error instanceof RequestError?error.message:'书桌暂时没连上，请稍后重试。';}
    finally{sending=false;button.disabled=false;}
  });
  button.disabled=false;
}

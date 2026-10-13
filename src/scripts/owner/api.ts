import {requestJSON,RequestError} from '../../lib/browser-api';
let csrf='';let expired=()=>{};
export function setCSRF(value:string){csrf=value;}
export function getCSRF(){return csrf;}
export function onExpired(callback:()=>void){expired=callback;}
export function notifyExpired(){expired();}
export async function ownerRequest<T>(path:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);
  if(options.method&&options.method!=='GET')headers.set('X-CSRF-Token',csrf);
  try{return await requestJSON<T>(`/owner${path}`,{...options,headers});}
  catch(error){if(error instanceof RequestError&&error.status===401)notifyExpired();throw error;}
}
export function jsonRequest(method:string,value:unknown):RequestInit{return{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)};}
export function ownerStatus(text:string){const element=document.querySelector('[data-owner-status]');if(element)element.textContent=text;}

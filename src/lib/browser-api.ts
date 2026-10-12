import {withBase} from './paths';
export class RequestError extends Error {constructor(message:string,public status:number){super(message);}}
export async function requestJSON<T>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(withBase(`/api/v1${path}`),{...options,credentials:'same-origin',cache:'no-store',signal:options.signal || AbortSignal.timeout(15000)});
  let result:unknown;try{result=await response.json();}catch{throw new RequestError('暂时没能连上，写下的内容还在。',response.status);}
  if(!response.ok){const message=(result as {message?:string}).message;throw new RequestError(message || '暂时没能连上，请稍后再试。',response.status);}
  return result as T;
}
export function randomHex(bytes=32){return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');}
export function requestId(){return randomHex(16);}
export function beijingTime(date:string){return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(new Date(date));}
export function errorText(error:unknown){return error instanceof RequestError?error.message:'暂时没有确认送达，写下的内容还在。稍后再试。';}

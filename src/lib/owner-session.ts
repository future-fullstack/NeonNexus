import {backendURL} from './content-api';

export type OwnerSession =
  | {state:'authenticated';csrfToken:string}
  | {state:'anonymous'|'unavailable'|'insecure'};

export function isSecureOwnerRequest(request:Request) {
  const url=new URL(request.url);
  return ['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    || url.protocol==='https:' || request.headers.get('x-forwarded-proto')==='https';
}

/** A Cookie is only a claim. The existing owner service verifies the session. */
export async function readOwnerSession(request:Request):Promise<OwnerSession> {
  if(!isSecureOwnerRequest(request))return {state:'insecure'};
  try {
    const local=['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
    const response=await fetch(backendURL('/owner/session'),{
      headers:{Cookie:request.headers.get('cookie') || '','X-Forwarded-Proto':local?'http':'https'},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000),
    });
    if(response.status===401)return {state:'anonymous'};
    if(response.status!==200)return {state:'unavailable'};
    const session=await response.json() as {ok?:unknown;csrfToken?:unknown};
    if(session.ok!==true||typeof session.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(session.csrfToken))return {state:'unavailable'};
    return {state:'authenticated',csrfToken:session.csrfToken};
  }catch{return {state:'unavailable'};}
}

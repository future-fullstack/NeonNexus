/** Public reading preferences only; never pass article text or location.href here. */
export interface ReadingPreferences {size:'normal'|'large';width:'standard'|'wide';focus:boolean;}
export interface ReadingBookmark {slug:string;ratio:number;heading:string|null;updatedAt:number;}
export const READING_DEFAULTS:ReadingPreferences={size:'normal',width:'standard',focus:false};
export const PREFERENCES_KEY='neonnexus:reading:v1:preferences';
export const BOOKMARKS_KEY='neonnexus:reading:v1:bookmarks';
export function parsePreferences(raw:string|null):ReadingPreferences {
  try {
    const value=JSON.parse(raw||'null');
    return {size:value?.size==='large'?'large':'normal',width:value?.width==='wide'?'wide':'standard',focus:value?.focus===true};
  }catch{return {...READING_DEFAULTS};}
}
export function parseBookmarks(raw:string|null):ReadingBookmark[] {
  try {
    const values:unknown=JSON.parse(raw||'[]');
    if(!Array.isArray(values))return [];
    return values.filter((value):value is ReadingBookmark=>!!value&&typeof value==='object'
      &&typeof value.slug==='string'&&/^[a-z0-9-]{1,100}$/.test(value.slug)
      &&typeof value.ratio==='number'&&Number.isFinite(value.ratio)&&value.ratio>=0&&value.ratio<=1
      &&(value.heading===null||(typeof value.heading==='string'&&/^section-\d{1,6}$/.test(value.heading)))
      &&typeof value.updatedAt==='number'&&Number.isFinite(value.updatedAt)&&value.updatedAt>0)
      .map(({slug,ratio,heading,updatedAt})=>({slug,ratio,heading,updatedAt}))
      .sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,20);
  }catch{return [];}
}

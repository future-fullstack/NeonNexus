import {beijingParts,beijingDate,dateKey,seasonFor,weatherFor,calendarCells,validWeather,validSolar,solarIsDay,type CurrentWeather,type SolarDay} from '../lib/beijing';

const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
const motionButton=document.querySelector<HTMLButtonElement>('[data-motion-toggle]');
function setMotion(paused:boolean){document.body.dataset.motion=paused?'paused':'running';motionButton?.setAttribute('aria-pressed',String(paused));const label=document.querySelector('[data-motion-label]');if(label)label.textContent=paused?'恢复动态':'暂停动态';}
setMotion(motion.matches);
motionButton?.addEventListener('click',()=>setMotion(document.body.dataset.motion!=='paused'));
motion.addEventListener('change',()=>setMotion(motion.matches));

const seasonNames={spring:'春',summer:'夏',autumn:'秋',winter:'冬'};
let today=beijingDate(),view=beijingParts(),selected=today;
let shownYear=view.year,shownMonth=view.month,followingToday=true;
type CalendarPost={title:string;href:string;date:string};
let posts:CalendarPost[]=[];
try{posts=JSON.parse(document.getElementById('calendar-posts')?.textContent||'[]');}catch{ /* A missing index still leaves a usable calendar. */ }
const days=document.querySelector<HTMLElement>('[data-calendar-grid]');
function showEntries(){
  const heading=document.querySelector('[data-calendar-selected]');if(heading)heading.textContent=`${selected.replaceAll('-',' / ')} 的书页`;
  const entries=document.querySelector<HTMLElement>('[data-calendar-entries]');if(!entries)return;entries.replaceChildren();
  const matches=posts.filter(post=>post.date===selected);
  if(!matches.length){const p=document.createElement('p');p.textContent='这一天没有公开文章。留一页空白也很好。';entries.appendChild(p);}
  for(const post of matches){const a=document.createElement('a');a.href=post.href;a.textContent=post.title;entries.appendChild(a);}
}
function renderCalendar(){
  const label=document.querySelector('[data-calendar-month]');if(label)label.textContent=`${shownYear} 年 ${shownMonth} 月`;
  if(!days)return;const focusedDate=days.contains(document.activeElement)?(document.activeElement as HTMLButtonElement)?.dataset.date:undefined;days.replaceChildren();
  for(const day of calendarCells(shownYear,shownMonth)){
    if(day===null){const blank=document.createElement('span');blank.className='calendar-blank';blank.setAttribute('aria-hidden','true');days.appendChild(blank);continue;}
    const key=dateKey(shownYear,shownMonth,day),count=posts.filter(p=>p.date===key).length;
    const button=document.createElement('button');button.type='button';button.textContent=String(day);button.dataset.date=key;
    button.className=`calendar-day${count?' has-post':''}${key===today?' is-today':''}${key===selected?' is-selected':''}`;
    button.setAttribute('aria-label',`${shownYear}年${shownMonth}月${day}日${key===today?'，今天':''}${count?`，${count}篇文章`:''}`);
    button.setAttribute('aria-pressed',String(key===selected));if(key===today)button.setAttribute('aria-current','date');
    button.addEventListener('click',()=>{selected=key;followingToday=key===today;renderCalendar();showEntries();});days.appendChild(button);
  }
  // Keep keyboard readers on their chosen date after refreshing the grid.
  if(focusedDate)days.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)?.focus({preventScroll:true});
}
document.querySelectorAll<HTMLButtonElement>('[data-calendar-shift]').forEach(button=>button.addEventListener('click',()=>{
  const next=new Date(Date.UTC(shownYear,shownMonth-1+Number(button.dataset.calendarShift),1));shownYear=next.getUTCFullYear();shownMonth=next.getUTCMonth()+1;followingToday=false;renderCalendar();
}));
document.querySelector('[data-calendar-today]')?.addEventListener('click',()=>{updateDate();view=beijingParts();shownYear=view.year;shownMonth=view.month;selected=today;followingToday=true;renderCalendar();showEntries();});
function updateDate(){
  const p=beijingParts(),next=beijingDate(),season=seasonFor(p.month);document.body.dataset.season=season;
  updateDay();
  document.querySelectorAll('[data-beijing-date]').forEach(el=>{el.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date());});
  document.querySelectorAll('[data-season-label]').forEach(el=>{el.textContent=`北京 · ${seasonNames[season]}日窗边`;});
  if(next!==today){today=next;if(followingToday){shownYear=p.year;shownMonth=p.month;selected=today;}solar=null;paintWeather(null);renderCalendar();showEntries();void refreshWeather(true);}
}

const CACHE='neonnexus-beijing-weather-v2',TTL=30*60_000;
const URL='https://api.open-meteo.com/v1/forecast?latitude=39.9042&longitude=116.4074&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=Asia%2FShanghai&forecast_days=1';
const names={clear:'晴',partly:'晴间多云',cloud:'阴',fog:'雾',rain:'雨',snow:'雪',thunder:'雷雨',unknown:'天气暂不识别'};
let current:CurrentWeather|null=null,solar:SolarDay|null=null,lastAttempt=0,pending=false;
function updateDay(){
  const p=beijingParts();
  const modelAge=current?Date.now()-Date.parse(`${current.time}:00+08:00`):Infinity;
  const isDay=validSolar(solar)?solarIsDay(solar):current&&validWeather(current)&&modelAge<=20*60_000?current.is_day===1:p.hour>=6&&p.hour<18;
  document.body.dataset.day=isDay?'day':'night';
}
function paintWeather(c:CurrentWeather|null){
  current=c;const condition=c?weatherFor(c.weather_code):'unknown';document.body.dataset.weather=condition;
  updateDay();
  const text=document.querySelector('[data-weather-text]');if(text)text.textContent=c?`${names[condition]} · ${Math.round(c.temperature_2m)}°C`:'天气暂未连上';
  const update=document.querySelector('[data-weather-updated]');if(update)update.textContent=c?`北京 ${c.time.slice(11)} 更新`:'窗外等一会儿，文章一直在。';
}
function readCache(){try{const cached=JSON.parse(localStorage.getItem(CACHE)||'null');const age=Date.now()-cached?.fetchedAt;if(age>=0&&age<TTL&&validWeather(cached?.current)&&validSolar(cached?.solar))return cached as {current:CurrentWeather;solar:SolarDay;fetchedAt:number};}catch{}return null;}
async function refreshWeather(force=false){
  if(pending)return;if(!force&&Date.now()-lastAttempt<TTL)return;
  const cached=readCache();if(cached&&!force){solar=cached.solar;paintWeather(cached.current);lastAttempt=cached.fetchedAt;return;}
  pending=true;lastAttempt=Date.now();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{const response=await fetch(URL,{signal:controller.signal});if(!response.ok)throw new Error('weather');const data=await response.json() as {current?:unknown;daily?:{time?:string[];sunrise?:string[];sunset?:string[]}};if(!validWeather(data.current))throw new Error('stale');const nextSolar={date:data.daily?.time?.[0],sunrise:data.daily?.sunrise?.[0],sunset:data.daily?.sunset?.[0]};solar=validSolar(nextSolar)?nextSolar:null;paintWeather(data.current);try{localStorage.setItem(CACHE,JSON.stringify({current:data.current,solar,fetchedAt:Date.now()}));}catch{}}
  catch{const fallback=readCache();if(fallback){solar=fallback.solar;paintWeather(fallback.current);}else paintWeather(null);}
  finally{clearTimeout(timeout);pending=false;}
}
document.querySelector('[data-weather-retry]')?.addEventListener('click',()=>void refreshWeather(true));
document.querySelector('[data-lamp-toggle]')?.addEventListener('click',event=>{const scene=document.querySelector<HTMLElement>('.beijing-window');if(!scene)return;const on=scene.dataset.lamp!=='on';scene.dataset.lamp=on?'on':'off';const button=event.currentTarget as HTMLElement;button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'关掉窗台的灯':'打开窗台的灯');});
function toggleNote(open:boolean){const note=document.getElementById('window-envelope-note'),button=document.querySelector<HTMLElement>('[data-note-toggle]');if(!note||!button)return;note.hidden=!open;button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'合上窗台上的信封':'打开窗台上的信封');}
document.querySelector('[data-note-toggle]')?.addEventListener('click',()=>toggleNote(!!document.getElementById('window-envelope-note')?.hidden));
document.querySelector('[data-note-close]')?.addEventListener('click',()=>{toggleNote(false);document.querySelector<HTMLElement>('[data-note-toggle]')?.focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('window-envelope-note')?.hidden){toggleNote(false);document.querySelector<HTMLElement>('[data-note-toggle]')?.focus();}});
// Today's solar times remain useful offline even after cached weather expires.
try{const stored=JSON.parse(localStorage.getItem(CACHE)||'null');if(validSolar(stored?.solar))solar=stored.solar;}catch{}
updateDate();renderCalendar();showEntries();void refreshWeather();
setInterval(()=>{updateDate();if(current&&!validWeather(current))paintWeather(null);if(!document.hidden)void refreshWeather();},60_000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateDate();if(current&&!validWeather(current))paintWeather(null);void refreshWeather();}});


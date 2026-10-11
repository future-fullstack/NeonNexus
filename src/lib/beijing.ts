export const BEIJING_ZONE = 'Asia/Shanghai';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'thunder' | 'unknown';
export function beijingParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:BEIJING_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get = (name:string) => Number(parts.find(p=>p.type===name)?.value);
  return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute')};
}
export function dateKey(year:number, month:number, day:number) {return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
export function beijingDate(now = new Date()) {const p=beijingParts(now);return dateKey(p.year,p.month,p.day);}
export function seasonFor(month:number):Season {return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';}
export function weatherFor(code:number):Weather {
  if(code===0||code===1)return 'clear';if(code===2)return 'partly';if(code===3)return 'cloud';if(code===45||code===48)return 'fog';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return 'rain';
  if([71,73,75,77,85,86].includes(code))return 'snow';if([95,96,97,99].includes(code))return 'thunder';return 'unknown';
}
export function calendarCells(year:number,month:number) {
  const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
  const count=new Date(Date.UTC(year,month,0)).getUTCDate();
  const length=Math.ceil((offset+count)/7)*7;
  return Array.from({length},(_,i)=>i>=offset&&i<offset+count?i-offset+1:null);
}
export interface CurrentWeather {time:string;temperature_2m:number;weather_code:number;is_day:number;}
export interface SolarDay {date:string;sunrise:string;sunset:string;}
export function validSolar(value:unknown,now=new Date()):value is SolarDay {
  if(!value||typeof value!=='object')return false;
  const s=value as SolarDay;
  const format=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if(s.date!==beijingDate(now)||typeof s.sunrise!=='string'||typeof s.sunset!=='string'||!format.test(s.sunrise)||!format.test(s.sunset)||s.sunrise.slice(0,10)!==s.date||s.sunset.slice(0,10)!==s.date)return false;
  const rise=Date.parse(`${s.sunrise}:00+08:00`),set=Date.parse(`${s.sunset}:00+08:00`);
  return Number.isFinite(rise)&&Number.isFinite(set)&&rise<set;
}
export function solarIsDay(solar:SolarDay,now=new Date()) {
  const stamp=now.valueOf();return stamp>=Date.parse(`${solar.sunrise}:00+08:00`)&&stamp<Date.parse(`${solar.sunset}:00+08:00`);
}
export function validWeather(value:unknown,now=new Date()):value is CurrentWeather {
  if(!value||typeof value!=='object')return false;
  const c=value as CurrentWeather;
  if(typeof c.time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.time)||!Number.isFinite(c.temperature_2m)||!Number.isInteger(c.weather_code)||(c.is_day!==0&&c.is_day!==1))return false;
  const stamp=Date.parse(`${c.time}:00+08:00`),age=now.valueOf()-stamp;
  return Number.isFinite(stamp)&&c.time.slice(0,10)===beijingDate(now)&&age>=-15*60_000&&age<=90*60_000;
}

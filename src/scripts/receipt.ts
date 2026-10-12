export function showReceipt(link:string){
  const card=document.querySelector<HTMLElement>('[data-receipt-card]');
  const field=document.querySelector<HTMLInputElement>('[data-receipt-link]');
  const open=document.querySelector<HTMLAnchorElement>('[data-receipt-open]');
  const status=document.querySelector<HTMLElement>('[data-receipt-status]');
  if(card)card.hidden=false;if(field)field.value=link;if(open)open.href=link;
  const copy=document.querySelector<HTMLButtonElement>('[data-receipt-copy]');
  if(copy)copy.onclick=async()=>{
    try{await navigator.clipboard.writeText(link);if(status)status.textContent='回执链接已复制，记得放在自己能找到的地方。';}
    catch{field?.focus();field?.select();if(status)status.textContent='可以直接选中上面的链接复制，或下载回执。';}
  };
  const download=document.querySelector<HTMLButtonElement>('[data-receipt-download]');
  if(download)download.onclick=()=>{
    const text=`NeonNexus 私密回执\n\n${link}\n\n请自己保存，不要公开分享。拿到这个链接的人就能读这段对话。\n`;
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='NeonNexus-私密回执.txt';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    if(status)status.textContent='回执已准备下载。请保存好这个文件。';
  };
  card?.scrollIntoView({block:'nearest',behavior:'smooth'});
}

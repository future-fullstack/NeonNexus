export {};
const replies={cat:['摸摸猫，今天也辛苦了。','猫在窗边陪你。慢一点也很好。'],tea:['先喝口茶，再往下翻。','给自己留一口茶的时间。']};
const turns={cat:0,tea:0};
const status=document.querySelector<HTMLElement>('[data-window-moment-status]');
document.querySelectorAll<HTMLButtonElement>('[data-window-moment]').forEach(button=>button.addEventListener('click',()=>{
  const kind=button.dataset.windowMoment;
  if(!status||(kind!=='cat'&&kind!=='tea'))return;
  status.textContent=replies[kind][turns[kind]++%replies[kind].length];
}));

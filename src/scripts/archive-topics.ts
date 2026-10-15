const controls=document.querySelector<HTMLElement>('[data-archive-topics]');
if(controls){
  const posts=[...document.querySelectorAll<HTMLElement>('[data-topic-post]')].map(element=>({element,tags:JSON.parse(element.dataset.topics||'[]') as string[]}));
  const status=controls.querySelector<HTMLElement>('[data-topic-status]');
  const empty=document.querySelector<HTMLElement>('[data-topic-empty]');
  const buttons=[...controls.querySelectorAll<HTMLButtonElement>('button')];
  function filter(topic:string|null){
    let count=0;
    for(const post of posts){const show=topic===null||post.tags.includes(topic);post.element.hidden=!show;if(show)count++;}
    for(const button of buttons)button.setAttribute('aria-pressed',String(topic===null?button.hasAttribute('data-topic-all'):button.dataset.topic===topic));
    if(status)status.textContent=topic===null?`共 ${count} 篇文章`:`关于「${topic}」，有 ${count} 篇文章`;
    if(empty)empty.hidden=count!==0;
  }
  for(const button of buttons)button.addEventListener('click',()=>filter(button.hasAttribute('data-topic-all')?null:button.dataset.topic!));
  document.querySelector('[data-topic-clear]')?.addEventListener('click',()=>{filter(null);controls.querySelector<HTMLButtonElement>('[data-topic-all]')?.focus();});
  controls.hidden=false;
}

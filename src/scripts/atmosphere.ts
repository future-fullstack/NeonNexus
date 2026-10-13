import type {ShaderInstance} from 'shaders/js';

// The SVG is always present. WebGPU only adds two restrained, locally authored layers.
function mountAtmosphere(){
  const canvas=document.querySelector<HTMLCanvasElement>('[data-atmosphere]');
  if(!canvas)return ()=>{};
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const scene=canvas.closest<HTMLElement>('.landscape-frame');
  let instance:ShaderInstance|undefined,inView=false,disposed=false,starting=false,failed=false;
  let painting=false;
  let cancelIdle:(()=>void)|undefined;
  const anchor={x:.72,y:.21};
  let center={...anchor},target={...anchor},driftFrame:number|undefined;
  const allowed=()=>!disposed&&!failed&&inView&&!document.hidden&&!reduced.matches&&document.body.dataset.motion!=='paused';
  const palette=()=>{
    const night=document.body.dataset.day==='night';
    const mist=['fog','cloud','rain','snow','thunder'].includes(document.body.dataset.weather||'');
    return {light:night?'#d7d5a855':'#fff4d180',mist:night?'#90aaa5':'#e1e8df',opacity:mist?.14:.055};
  };
  function update(){
    if(!instance)return;
    const colors=palette();
    instance.update('window-light',{colorA:colors.light,colorB:'#ffffff00',center,radius:.7});
    instance.update('window-air',{colorA:`${colors.mist}00`,colorB:colors.mist,opacity:colors.opacity,speed:.1});
  }
  function reconcile(){
    if(disposed)return;
    if(reduced.matches)canvas!.dataset.ready='false';
    if(instance){
      const run=allowed();
      if(run!==painting){painting=run;run?instance.resume():instance.pause();}
      if(!run&&driftFrame!==undefined){cancelAnimationFrame(driftFrame);driftFrame=undefined;}
      if(run){update();canvas!.dataset.ready='true';}
    }else if(allowed()&&!starting)void start();
  }
  function drift(){
    driftFrame=undefined;
    if(!allowed()||!instance)return;
    center={x:center.x+(target.x-center.x)*.07,y:center.y+(target.y-center.y)*.07};
    instance.update('window-light',{center});
    if(Math.abs(target.x-center.x)+Math.abs(target.y-center.y)>.001)driftFrame=requestAnimationFrame(drift);
  }
  function move(event:PointerEvent){
    if(event.pointerType==='touch'||!allowed()||!instance||!scene)return;
    const rect=scene.getBoundingClientRect();
    target={x:Math.max(.08,Math.min(.92,(event.clientX-rect.left)/rect.width)),y:Math.max(.08,Math.min(.85,(event.clientY-rect.top)/(rect.height*.9)))};
    if(driftFrame===undefined)driftFrame=requestAnimationFrame(drift);
  }
  function leave(){target={...anchor};if(allowed()&&instance&&driftFrame===undefined)driftFrame=requestAnimationFrame(drift);}
  function idle(){return new Promise<void>(resolve=>{
    const finish=()=>{cancelIdle=undefined;resolve();};
    if('requestIdleCallback' in window){const id=window.requestIdleCallback(finish,{timeout:1500});cancelIdle=()=>{window.cancelIdleCallback(id);finish();};}
    else{const id=setTimeout(finish,350);cancelIdle=()=>{clearTimeout(id);finish();};}
  });}
  async function start(){
    starting=true;
    try{
      // Skip the large GPU module entirely on unsupported, hidden or motion-reduced pages.
      if(!('gpu' in navigator)){failed=true;return;}
      await idle();
      if(!allowed())return;
      const {createShader,getWebGPUSupport}=await import('shaders/js');
      if(!allowed())return;
      if(!(await getWebGPUSupport()).supported){failed=true;return;}
      if(!allowed())return;
      const colors=palette();
      const next=await createShader(canvas!,{components:[
        {type:'RadialGradient',id:'window-light',props:{colorA:colors.light,colorB:'#ffffff00',center,radius:.7}},
        {type:'SimplexNoise',id:'window-air',props:{colorA:`${colors.mist}00`,colorB:colors.mist,opacity:colors.opacity,scale:1.2,speed:.1,seed:12}},
      ]},{disableTelemetry:true,observeElement:true,onReady:()=>{
        // Also runs after device recovery: reapply the host's pause state to that new renderer.
        painting=true;queueMicrotask(reconcile);
      },onError:()=>queueMicrotask(()=>{
        if(disposed)return;
        if(instance?.getFailureReason()){failed=true;canvas!.dataset.ready='false';}
        painting=true;reconcile();
      })});
      if(disposed){next.destroy();return;}
      instance=next;
      if(instance.getFailureReason()){failed=true;canvas!.dataset.ready='false';}
      painting=true;reconcile();
    }catch{failed=true;canvas!.dataset.ready='false';}
    finally{starting=false;}
  }
  const attributes=new MutationObserver(reconcile);
  attributes.observe(document.body,{attributes:true,attributeFilter:['data-day','data-weather','data-season','data-motion']});
  const intersection=new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting||false;reconcile();});
  intersection.observe(canvas);
  document.addEventListener('visibilitychange',reconcile);
  reduced.addEventListener('change',reconcile);
  scene?.addEventListener('pointermove',move);
  scene?.addEventListener('pointerleave',leave);
  return ()=>{
    disposed=true;intersection.disconnect();attributes.disconnect();
    cancelIdle?.();
    if(driftFrame!==undefined)cancelAnimationFrame(driftFrame);
    document.removeEventListener('visibilitychange',reconcile);reduced.removeEventListener('change',reconcile);
    scene?.removeEventListener('pointermove',move);scene?.removeEventListener('pointerleave',leave);
    instance?.destroy();canvas.dataset.ready='false';
  };
}
let dispose=mountAtmosphere();
window.addEventListener('pagehide',()=>dispose());
window.addEventListener('pageshow',event=>{if(event.persisted){dispose();dispose=mountAtmosphere();}});

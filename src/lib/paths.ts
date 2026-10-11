/** Internal links follow Astro's deployment base; external URLs and anchors stay intact. */
export function withBase(path:string) {
  if(/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(path))return path;
  const base=`${import.meta.env.BASE_URL.replace(/\/$/,'')}/`;
  if(base!=='/'&&(path===base.slice(0,-1)||path.startsWith(base)))return path;
  return base+path.replace(/^\//,'');
}

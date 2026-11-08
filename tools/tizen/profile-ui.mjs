// Start `node tools/tizen/cli.ts tv --debug --no-build`, then pass its local
// inspector port. The viewer must put focus on a row with at least two cards.
// No account data, artwork URLs, or title names are printed.
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Usage: node tools/tizen/profile-ui.mjs <inspector-port>');
const [target] = await (await fetch(`http://localhost:${port}/json`)).json();
if (!target?.webSocketDebuggerUrl) throw new Error('No inspectable app found');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
const pending = new Map();
let id = 0;
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(message.error) : request.resolve(message.result);
};
ws.onclose = () => { for (const request of pending.values()) request.reject(new Error('Inspector disconnected')); pending.clear(); };
const send = (method, params) => new Promise((resolve, reject) => {
  const key = ++id;
  pending.set(key, { resolve, reject });
  ws.send(JSON.stringify({ id: key, method, params }));
});
const timeout = setTimeout(() => ws.close(), 45_000);
try {
  if (process.argv[3] === 'home') {
    const response = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const start=performance.now();
      while(document.querySelector('.home__loading')&&performance.now()-start<18000)await new Promise(r=>setTimeout(r,50));
      const cards=[...document.querySelectorAll('.home .card img')].filter(img=>{const r=img.getBoundingClientRect();return r.left<1824&&r.right>96;});
      return {ready:!document.querySelector('.home__loading'),rows:document.querySelectorAll('.home .row').length,
        hero:!!document.querySelector('.home .hero'),backdrops:document.querySelectorAll('[data-testid="backdrop"]').length,
        visiblePosters:cards.length,loadedPosters:cards.filter(img=>img.complete&&img.naturalWidth>0).length,
        decodedMiB:cards.reduce((sum,img)=>sum+img.naturalWidth*img.naturalHeight*4,0)/1048576};
    })()` });
    if(response.exceptionDetails)throw new Error('Home readiness probe failed');
    console.log(JSON.stringify(response.result.value,null,2));
  } else
  if (process.argv[3] === 'artwork') {
    const response = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const key = async (direction, delay = 350) => {
        const code = {up:38,down:40}[direction];
        const event = new KeyboardEvent('keydown', {key: direction === 'up' ? 'ArrowUp' : 'ArrowDown', bubbles:true});
        Object.defineProperty(event, 'keyCode', {value:code}); window.dispatchEvent(event); await wait(delay);
      };
      if (!document.querySelector('.home')) throw new Error('Open Home before profiling');
      for (let i=0;i<8;i++) await key('up',150);
      for (let i=0;i<3 && !document.querySelector('.card[data-focused="true"]');i++) await key('down');
      await wait(3000);
      const originals = new Map([...document.querySelectorAll('.card img[src]')].map(img => [img, img.getAttribute('src')]));
      const samples = [], reads = [], writes = [], fetches = [], movements = [], recordSizes = [], policies = {}, freshness = [];
      const fs = globalThis.tizen?.filesystem;
      const originalOpen = fs?.openFile, originalFetch = window.fetch;
      if (fs) fs.openFile = function(...args) {
        const handle = originalOpen.apply(this,args);
        for (const [method, timings] of [['readBlobNonBlocking', reads],['writeBlobNonBlocking',writes]]) {
          const original = handle[method];
          handle[method] = function(...args) {
            const start = performance.now(), ok=args[method === 'writeBlobNonBlocking' ? 1 : 0];
            args[method === 'writeBlobNonBlocking' ? 1 : 0] = (...values) => {
              timings.push(performance.now()-start);
              if(method==='readBlobNonBlocking' && values[0] instanceof Blob) {
                const blob=values[0];
                void blob.slice(0,4).arrayBuffer().then(buffer=>new DataView(buffer).getUint32(0)).then(length=>length<65536?blob.slice(4,4+length).text():null).then(text=>{
                  if(!text)return;try{const metadata=JSON.parse(text);if(Number.isFinite(metadata.size))recordSizes.push(metadata.size);if(Number.isFinite(metadata.freshUntil))freshness.push(metadata.freshUntil-Date.now());const policy=metadata.cacheControl||'default';policies[policy]=(policies[policy]||0)+1;}catch{}
                }).catch(()=>{});
              }
              ok(...values);
            };
            return original.apply(this,args);
          };
        }
        return handle;
      };
      window.fetch = async function(...args) {const start=performance.now(); const response=await originalFetch.apply(this,args);fetches.push(performance.now()-start);return response;};
      const visibleImages = () => {
        const root = document.querySelector('.home__rows').getBoundingClientRect();
        return [...document.querySelectorAll('.home .card img')].filter(img=>{const r=img.getBoundingClientRect();return r.right>root.left && r.left<root.right && r.bottom>root.top && r.top<Math.min(root.bottom,innerHeight);});
      };
      const sample = stage => {
        const images = visibleImages();
        samples.push({stage,visible:images.length,blank:images.filter(img=>!img.getAttribute('src')||!img.complete||!img.naturalWidth).length,
          originalLoaded:[...originals].filter(([img,url])=>img.isConnected&&img.getAttribute('src')===url&&img.naturalWidth).length});
      };
      const move = async (direction, stage) => {
        const start = performance.now(); let maximumBlank = 0, lastBlank = 0;
        await key(direction,50);sample(stage+'@50');
        // Continue sampling through the transform, not just at its endpoints.
        while(performance.now()-start<700) {
          const blank=visibleImages().filter(img=>!img.getAttribute('src')||!img.complete||!img.naturalWidth).length;
          maximumBlank=Math.max(maximumBlank,blank);if(blank)lastBlank=performance.now()-start;
          await wait(25);
        }
        sample(stage+'@700');movements.push({stage,maximumBlank,lastBlankMs:Math.round(lastBlank)});
      };
      try {
        sample('start');
        for(let i=0;i<3;i++)await move('down','down'+i);
        await wait(3000);sample('bottom');
        for(let i=0;i<3;i++)await move('up','up'+i);
        await wait(2000);sample('returned');
        const stats = values => ({count:values.length,totalMs:Math.round(values.reduce((a,b)=>a+b,0)),maxMs:Math.round(Math.max(0,...values))});
        return {samples,movements,reads:stats(reads),writes:stats(writes),fetches:stats(fetches),recordBytes:{count:recordSizes.length,total:recordSizes.reduce((a,b)=>a+b,0),max:Math.max(0,...recordSizes)},expired:freshness.filter(ms=>ms<=0).length,policies};
      } finally {if(fs)fs.openFile=originalOpen;window.fetch=originalFetch;}
    })()` });
    if (response.exceptionDetails) throw new Error('Home artwork probe failed: ' + response.exceptionDetails.text);
    console.log(JSON.stringify(response.result.value, null, 2));
  } else {
  const response = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    if (!document.querySelector('.card[data-focused="true"]')) throw new Error('Focus a card row before profiling');
    const gaps = [], longTasks = [], focused = new Set();
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
    observer.observe({entryTypes: ['longtask']});
    let last = performance.now(), done = false;
    const frame = now => { gaps.push(now - last); last = now; if (!done) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    try {
      for (let i = 0; i < 20; i++) {
        const event = new KeyboardEvent('keydown', { key: i % 2 ? 'ArrowLeft' : 'ArrowRight', bubbles: true });
        Object.defineProperty(event, 'keyCode', { value: i % 2 ? 37 : 39 });
        window.dispatchEvent(event);
        await new Promise(resolve => setTimeout(resolve, 700));
        focused.add(document.querySelector('.card[data-focused="true"]'));
      }
    } finally { done = true; observer.disconnect(); }
    gaps.sort((a, b) => a - b);
    if (focused.size < 2) throw new Error('Navigation did not move between cards');
    return { frames: gaps.length, p50Ms: gaps[Math.floor(gaps.length * .5)], p95Ms: gaps[Math.floor(gaps.length * .95)],
      maxMs: Math.max(...gaps), gapsOver50Ms: gaps.filter(gap => gap > 50).length,
      longTasks: longTasks.length, maxLongTaskMs: Math.max(0, ...longTasks) };
  })()` });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? 'TV benchmark failed');
  console.log(JSON.stringify(response.result.value, null, 2));
  }
} finally { clearTimeout(timeout); ws.close(); }

// Convert generated desk PNGs to the site's WebP previews with installed
// Chrome. No Python/Pillow or npm package is required.
const {spawn}=require('child_process');
const fs=require('fs');
const os=require('os');
const path=require('path');
const root=path.join(__dirname,'..');
const source=path.join(root,'dist/desk-shots');
const output=path.join(root,'frontend/assets/img');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const port=9452,profile=fs.mkdtempSync(path.join(os.tmpdir(),'tj-webp-'));
  const chrome=spawn(process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','about:blank'],{stdio:'ignore'});
  try{
    let target;
    for(let i=0;i<60&&!target;i++){await sleep(150);try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x=>x.type==='page')}catch{}}
    if(!target)throw Error('Chrome did not start');
    const ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r=>ws.addEventListener('open',r));
    let id=0;const pending=new Map();
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}))});
    await send('Page.enable');
    const frameId=(await send('Page.getFrameTree')).frameTree.frame.id;
    for(const file of fs.readdirSync(source).filter(n=>/^desk-.*\.png$/.test(n)).sort()){
      const png=fs.readFileSync(path.join(source,file));
      const prefix=file.startsWith('desk-hero-')?'app-home-mobile-':file.startsWith('desk-desktop-')?'app-home-desktop-':'desk-';
      const name=file.replace(/^desk-hero-/,'app-home-mobile-').replace(/^desk-desktop-/,'app-home-desktop-').replace(/\.png$/,'.webp');
      const width=prefix==='app-home-mobile-'?600:prefix==='app-home-desktop-'?1600:560;
      const html=`<img id="shot" src="data:image/png;base64,${png.toString('base64')}">`;
      await send('Page.setDocumentContent',{frameId,html});
      const r=await send('Runtime.evaluate',{expression:`new Promise((resolve,reject)=>{const img=document.getElementById('shot');const make=()=>{const c=document.createElement('canvas');c.width=${width};c.height=Math.round(img.naturalHeight*${width}/img.naturalWidth);const x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/webp',.74))};if(img.complete)make();else{img.onload=make;img.onerror=()=>reject(Error('bad image'))}})`,awaitPromise:true,returnByValue:true});
      if(r.exceptionDetails)throw Error(r.exceptionDetails.text);
      const data=r.result.value;
      if(!data.startsWith('data:image/webp;base64,'))throw Error('WebP encoder unavailable');
      const bytes=Buffer.from(data.split(',')[1],'base64');
      fs.writeFileSync(path.join(output,name),bytes);
      console.log(name,Math.round(bytes.length/1024)+'KB');
    }
    ws.close();
  }finally{chrome.kill();try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}}
}
main().catch(e=>{console.error(e);process.exitCode=1});

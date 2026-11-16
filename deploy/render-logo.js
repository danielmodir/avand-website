// Render the SVG logo family to PNG and ICO with installed Chrome (no packages).
// Run after node deploy/make-logo.js.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ICONS = path.join(ROOT, 'frontend/assets/icons');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const {mark} = require('./make-logo.js');
// The foreground artwork uses the same drawing, scaled inside the Android
// adaptive icon safe zone; its background comes from Android resources.
const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 432"><svg x="65" y="65" width="302" height="302" viewBox="270 270 710 690">${mark('#EB7D00','#2E2910')}</svg></svg>`;

async function main() {
  const port = 9444, profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-logo-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', 'about:blank'], { stdio:'ignore' });
  try {
    let target;
    for (let i=0; i<60 && !target; i++) {
      await sleep(200);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    }
    if (!target) throw new Error('Chrome did not start');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => ws.addEventListener('open', resolve));
    let seq=0; const pending=new Map();
    ws.addEventListener('message', e => { const m=JSON.parse(e.data); if(m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); } });
    const send = (method, params={}) => new Promise((resolve,reject) => {
      const id=++seq; pending.set(id,m=>m.error?reject(new Error(m.error.message)):resolve(m.result));
      ws.send(JSON.stringify({id,method,params}));
    });
    const frameId = (await send('Page.getFrameTree')).frameTree.frame.id;
    async function render(svg,width,height) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
      const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`;
      await send('Page.setDocumentContent',{frameId,html});
      await sleep(140);
      return Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true})).data,'base64');
    }
    const outputs = [
      ['favicon.svg','favicon-48.png',48,48],
      ['favicon.svg','apple-touch-icon.png',180,180],
      ['favicon.svg','icon-192.png',192,192],
      ['favicon.svg','icon-512.png',512,512],
      ['logo-mark.svg','logo-mark.png',512,512],
      ['og-image.svg','og-image.png',1200,630],
    ];
    for (const [source,name,w,h] of outputs) {
      fs.writeFileSync(path.join(ICONS,name),await render(fs.readFileSync(path.join(ICONS,source),'utf8'),w,h));
      console.log(name);
    }
    const icoSizes=[16,32,48,64], icoImages=[];
    for(const size of icoSizes) icoImages.push(await render(fs.readFileSync(path.join(ICONS,'favicon.svg'),'utf8'),size,size));
    const directory=Buffer.alloc(6+16*icoImages.length);
    directory.writeUInt16LE(0,0);directory.writeUInt16LE(1,2);directory.writeUInt16LE(icoImages.length,4);
    let offset=directory.length;
    icoImages.forEach((png,i)=>{
      const n=6+i*16;directory[n]=icoSizes[i];directory[n+1]=icoSizes[i];
      directory.writeUInt16LE(1,n+4);directory.writeUInt16LE(32,n+6);
      directory.writeUInt32LE(png.length,n+8);directory.writeUInt32LE(offset,n+12);offset+=png.length;
    });
    fs.writeFileSync(path.join(ROOT,'frontend/favicon.ico'),Buffer.concat([directory,...icoImages]));
    const androidRes=path.join(ROOT,'android/app/src/main/res/mipmap-xxxhdpi');
    fs.writeFileSync(path.join(androidRes,'ic_launcher.png'),fs.readFileSync(path.join(ICONS,'icon-192.png')));
    fs.writeFileSync(path.join(androidRes,'ic_launcher_foreground.png'),await render(foregroundSvg,432,432));
    ws.close();
    console.log('favicon.ico and Android launcher PNGs');
  } finally {
    chrome.kill();
    try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}); } catch {}
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

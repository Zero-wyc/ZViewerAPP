// Read-only local MKV samples through the official isolated v4.2.1 package.
// This checks HTTP transport; it cannot establish iPhone VLC decode/playback.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.IOS_TEST_SERVER || 'http://127.0.0.1:7343';
const media = process.env.IOS_TEST_MEDIA || path.resolve(__dirname, '../../../TEST视频');
const output = path.resolve(__dirname, '../../../local-ios-validation/ios-150-b13/range-421.json');
(async () => {
  const login = await (await fetch(base + '/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:'root',password:'root'})})).json();
  const headers = {Authorization:`Bearer ${login.accessToken}`, 'Content-Type':'application/json'};
  let key; const samples = []; const cap = 8 * 1024 * 1024;
  try {
    const dto = await (await fetch(base + '/api/server-files/roots', {method:'POST',headers,body:JSON.stringify({name:'Isolated iOS range samples',absPath:media,readonly:true})})).json();
    assert(dto.success); key = dto.root.key;
    for (const file of fs.readdirSync(media).filter(name=>name.endsWith('.mkv'))) {
      const total = fs.statSync(path.join(media,file)).size; const checks = [];
      const resolved = await (await fetch(base + '/api/server-files/resolve?' + new URLSearchParams({path:`${key}:/${file}`}), {headers})).json(); assert(resolved.success);
      const url = new URL(resolved.videoUrl,base);
      for (const [name,start,end,cancel] of [['start',0,255],['middle',Math.floor(total/2),Math.floor(total/2)+255],['tail',total-256,total-1],['open',0,null,true],['large',0,cap+1024],['next capped boundary',cap,cap+255]]) {
        const response = await fetch(url,{headers:{...headers,Range:`bytes=${start}-${end ?? ''}`}}); assert.equal(response.status,206,name);
        const match = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/); assert(match,name); assert.equal(Number(match[1]),start); assert.equal(Number(match[3]),total);
        const length=Number(match[2])-start+1; assert.equal(length,Math.min(cap,(end ?? total-1)-start+1)); assert.equal(Number(response.headers.get('content-length')),length);
        if (cancel) { const reader=response.body.getReader(); const chunk=await reader.read(); assert(chunk.value.length>0 && chunk.value.length<length); await reader.cancel(); }
        else { const body=new Uint8Array(await response.arrayBuffer()); assert.equal(body.length,length); if(start===0) assert.deepEqual([...body.slice(0,4)],[0x1a,0x45,0xdf,0xa3]); }
        checks.push({name,status:response.status,start,end:Number(match[2]),bytes:length,cancelled:!!cancel});
      }
      const invalid=await fetch(url,{headers:{...headers,Range:`bytes=${total}-`}}); assert.equal(invalid.status,416); await invalid.body?.cancel(); checks.push({name:'unsatisfiable',status:416});
      const unauthorized=await fetch(url,{method:'HEAD'}); assert.equal(unauthorized.status,401); checks.push({name:'unauthenticated HEAD',status:401});
      samples.push({container:'MKV',bytes:total,checks});
    }
    assert(samples.length>0);
    fs.writeFileSync(output,JSON.stringify({scope:'official v4.2.1 HTTP transport only; local MKV files; no device decoding claim',capBytes:cap,samples},null,2));
    console.log(JSON.stringify({samples:samples.length,checks:samples.reduce((n,s)=>n+s.checks.length,0)}));
  } finally { if(key) await fetch(base + '/api/server-files/roots/' + key.split(':')[1],{method:'DELETE',headers}); }
})().catch(error=>{console.error(error.message);process.exitCode=1});

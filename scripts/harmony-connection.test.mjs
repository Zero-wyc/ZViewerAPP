import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTs} from './test-ts-module.mjs'

for(const secure of [true,false]) test(`ArkTS ${secure?'TLS':'HTTP'} forwards login and drains a response when close precedes its final message`,async()=>{
 const servers=[],remotes=[]
 class Local {
  events={};sent=[];closed=false
  on(name,fn){this.events[name]=fn}
  async send({data}){this.sent.push(typeof data==='string'?data:new TextDecoder().decode(data))}
  async close(){this.closed=true}
 }
 const socket={Protocol:{TLSv12:12,TLSv13:13},constructTCPSocketServerInstance(){
  const server={events:{},closed:false,async listen(){},async close(){this.closed=true},async getLocalAddress(){return {port:3333}},on(name,fn){this.events[name]=fn}}
  servers.push(server);return server
 },constructTLSSocketInstance(){assert.equal(secure,true);return makeRemote()},constructTCPSocketInstance(){assert.equal(secure,false);return makeRemote()}}
 function makeRemote(){
  const remote={bound:false,events:{},async bind(){this.bound=true},on(name,fn){assert.equal(this.bound,true,'listeners registered before bind');this.events[name]=fn},async connect(options){assert.equal(options.address.port,secure?443:80);assert.equal(options.skipRemoteValidation,secure?true:undefined)},async close(){},async send(input){
   const forwarded=new TextDecoder().decode(secure?input:input.data)
   assert.ok(forwarded.startsWith('POST /base/api/auth/guest HTTP/1.1\r\n'))
   assert.ok(forwarded.endsWith('\r\n\r\n{}'))
   assert.ok(forwarded.includes(`Origin: ${secure?'https':'http'}://selected.test\r\n`))
   const header='HTTP/1.1 200 OK\r\nContent-Length: 9\r\nConnection: keep-alive\r\n\r\n1234'
   this.events.message({message:new TextEncoder().encode(header).buffer})
   // Models the emulator's callback ordering, which previously truncated APIs.
   this.events.close();setTimeout(()=>this.events.message({message:new TextEncoder().encode('56789').buffer}),20)
  }};remotes.push(remote);return remote
 }
 const {ServerConnection}=loadTs('ZV-HarmonyOS/entry/src/main/ets/services/ServerConnection.ets',{
  '@kit.NetworkKit':{socket,http:{}},'@kit.ArkTS':{url:{URL},util:{TextEncoder,TextDecoder:class {decodeWithStream(data){return new TextDecoder().decode(data)}}}},
  '@kit.CryptoArchitectureKit':{cryptoFramework:{createRandom:()=>({generateRandomSync:()=>({data:new Uint8Array(24).fill(1)})})}},
  '@kit.BasicServicesKit':{},
 },{setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer},TextDecoder,URL})
 const connection=new ServerConnection(),channel=await connection.configure({url:`${secure?'https':'http'}://selected.test/base`,allowUntrustedCertificate:secure}),u=new URL(channel.url)
 const client=new Local();servers[0].events.connect(client)
 client.events.message({message:new TextEncoder().encode(`POST ${u.pathname}/api/auth/guest HTTP/1.1\r\nHost: ${u.host}\r\nOrigin: https://zviewer.local\r\nContent-Length: 2\r\n\r\n{}`).buffer})
 await new Promise(r=>setTimeout(r,130))
 const response=client.sent.join('');assert.ok(response.endsWith('123456789'));assert.ok(response.includes('Access-Control-Allow-Origin: https://zviewer.local'));assert.equal(client.closed,true)
 await connection.configure({url:'',allowUntrustedCertificate:false})
 assert.equal(servers[0].closed,true)
})

test('ArkTS ambiguous TLS close requires valid HTTP evidence; certificate and response errors stay HTTPS',async()=>{
 for(const failure of [{code:2300052,message:'Empty reply from server'},{code:2300060,message:'certificate rejected'},'invalid-json','null-json']){
  for(const validHTTP of [true,false]){
   const requests=[]
   const {ServerConnection}=loadTs('ZV-HarmonyOS/entry/src/main/ets/services/ServerConnection.ets',{
    '@kit.NetworkKit':{socket:{},http:{RequestMethod:{GET:'GET'},createHttp:()=>({destroy(){},async request(raw){
     requests.push(raw)
     if(raw.startsWith('https:')){
      if(failure==='invalid-json')return {responseCode:502,result:'bad gateway'}
      if(failure==='null-json')return {responseCode:200,result:'null'}
      throw failure
     }
     return {responseCode:200,result:JSON.stringify({success:validHTTP,settings:{registrationMode:'open'}})}
    }})}},'@kit.ArkTS':{url:{URL},util:{}},'@kit.CryptoArchitectureKit':{},'@kit.BasicServicesKit':{},
   })
   const result=await new ServerConnection().probe('https://selected.test/base')
   const canVerify=typeof failure==='object'&&failure.code===2300052
   assert.equal(result.code,canVerify?(validHTTP?'tls_unavailable':'network'):typeof failure==='string'?'response':'certificate_untrusted')
   assert.equal(requests.length,canVerify?2:1)
   if(canVerify)assert.equal(requests[1],'http://selected.test/base/api/auth/public-settings')
  }
 }
})

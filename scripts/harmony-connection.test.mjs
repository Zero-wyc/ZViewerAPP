import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTs} from './test-ts-module.mjs'

test('ArkTS TLS binds before listeners and drains a response when close precedes its final message',async()=>{
 const servers=[],remotes=[]
 class Local {
  events={};sent=[];closed=false
  on(name,fn){this.events[name]=fn}
  async send({data}){this.sent.push(typeof data==='string'?data:new TextDecoder().decode(data))}
  async close(){this.closed=true}
 }
 const socket={Protocol:{TLSv12:12,TLSv13:13},constructTCPSocketServerInstance(){
  const server={events:{},async listen(){},async close(){},async getLocalAddress(){return {port:3333}},on(name,fn){this.events[name]=fn}}
  servers.push(server);return server
 },constructTLSSocketInstance(){
  const remote={bound:false,events:{},async bind(){this.bound=true},on(name,fn){assert.equal(this.bound,true,'listeners registered before TLS bind');this.events[name]=fn},async connect(){},async close(){},async send(){
   const header='HTTP/1.1 200 OK\r\nContent-Length: 9\r\nConnection: keep-alive\r\n\r\n1234'
   this.events.message({message:new TextEncoder().encode(header).buffer})
   // Models the emulator's callback ordering, which previously truncated APIs.
   this.events.close();setTimeout(()=>this.events.message({message:new TextEncoder().encode('56789').buffer}),20)
  }};remotes.push(remote);return remote
 }}
 const {ServerConnection}=loadTs('ZV-HarmonyOS/entry/src/main/ets/services/ServerConnection.ets',{
  '@kit.NetworkKit':{socket,http:{}},'@kit.ArkTS':{url:{URL},util:{TextEncoder,TextDecoder:class {decodeWithStream(data){return new TextDecoder().decode(data)}}}},
  '@kit.CryptoArchitectureKit':{cryptoFramework:{createRandom:()=>({generateRandomSync:()=>({data:new Uint8Array(24).fill(1)})})}},
  '@kit.BasicServicesKit':{},
 },{setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer},TextDecoder,URL})
 const connection=new ServerConnection(),channel=await connection.configure({url:'https://selected.test/base',allowUntrustedCertificate:true}),u=new URL(channel.url)
 const client=new Local();servers[0].events.connect(client)
 client.events.message({message:new TextEncoder().encode(`GET ${u.pathname}/api/auth/public-settings HTTP/1.1\r\nHost: ${u.host}\r\nOrigin: https://zviewer.local\r\n\r\n`).buffer})
 await new Promise(r=>setTimeout(r,130))
 const response=client.sent.join('');assert.ok(response.endsWith('123456789'));assert.ok(response.includes('Access-Control-Allow-Origin: https://zviewer.local'));assert.equal(client.closed,true)
 await connection.configure({url:'https://selected.test/base',allowUntrustedCertificate:false})
})

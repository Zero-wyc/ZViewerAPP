import { defineConfig } from 'vite'
import base from '../../vite.config.ts'

const isolate={name:'feedback-isolated-data',enforce:'pre' as const,load(id:string){
  const path=id.replaceAll('\\','/').split('?')[0]
  if(path.endsWith('/mobile/useMobileRoom.ts'))return `import{useState}from'react';export function useMobileRoom(){const[isHost,set]=useState(true);window.__feedbackRole=set;return{isHost,phase:'ready',join(){}}}`
  if(path.endsWith('/hooks/useSocket.ts'))return `export const useSocket=()=>({connected:true,socket:null});export function resetSocket(){}`
  if(path.endsWith('/watch-together/WatchTogetherPanel.tsx'))return `export const WatchTogetherPanel=()=>null`
}}
export default defineConfig({...base,plugins:[isolate,...base.plugins],server:{host:'127.0.0.1',port:4191,strictPort:true}})

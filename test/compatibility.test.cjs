const {test}=require('node:test');
const assert=require('node:assert/strict');
const current=require('../legacy-tools.cjs'), original=require('./reference/legacy-tools.cjs');
function fixture(options={}) {
 const trace=[], states=new Map(), listeners=new Map();
 const bridge={SYSTEM_PRINCIPAL:{kind:'system',id:'logos'},createRuntimeContext:()=>({sessionId:'s'}),currentAuthority:()=>({principal:{kind:'system',id:'tester'}}),resolveConditions:async()=>options.allowed!==false,resolveMiddlewares:async()=>['middleware'],runMiddlewares:async(m,c,next)=>{trace.push(['middleware']);return next()},runAsPackage:async(a,p,next)=>{trace.push(['package',p]);return next()},runAsSystem:async(a,next)=>next(),getIsolatedRunner:()=>options.isolated,registerTools:async()=>{if(options.scanError)throw Error('scan failed');return options.tools||[]},getErrors:()=>[],generateManifest:p=>({package:p}),requestReboot:async()=>({allowed:true,impact:{critical:[],liveSessions:[]}})};
 const container={workspace:'/workspace',authority:{enforce:x=>{trace.push(['authority',x]);if(options.deny===x.operation)throw Error('denied')}},registry:{discover:()=>[{folder:'pkg',dir:'/workspace/pkg'},{folder:'nested',dir:'/workspace/pkg/nested'}],getPackage:p=>({dir:'/workspace/'+p}),snapshot:()=>['active']},state:n=>{if(!states.has(n))states.set(n,new Map());return states.get(n)},bus:{veto:async(e,p)=>{trace.push([e,p]);return options.gate||{allowed:true}},emit:async(e,p)=>trace.push([e,p]),pipeline:async(e,p)=>({e,p}),on:(e,fn)=>listeners.set(e,fn)}};
 return {bridge,container,trace,listeners};
}
async function outcome(runtime,options={}) {
 const f=fixture(options);const api=runtime.createRuntime(f.bridge);
 const tool={name:'echo',parameters:{type:'object',properties:{}},call:async(args)=>{f.trace.push(['handler',args]);if(options.handlerError)throw Error('handler failed');return args.value}};
 const wrapped=api.toolToMcp(f.container,tool,'pkg');
 let result,error;
 try{result=await wrapped.handler({value:7},{sessionId:'session'})}catch(e){error={message:e.message,code:e.code,blockedBy:e.blockedBy,details:e.details}}
 return {result,error,trace:f.trace,shape:Object.fromEntries(Object.entries(wrapped).filter(([k])=>k!=='handler'))};
}
for(const [name,options] of Object.entries({success:{},condition:{allowed:false},veto:{gate:{allowed:false,reason:'stop',code:'POLICY',by:'guard',details:{x:1}}},defaultVeto:{gate:{allowed:false}},handlerError:{handlerError:true},authority:{deny:'invoke'}})) {
 test('original parity: '+name,async()=>assert.deepEqual(await outcome(current,options),await outcome(original,options)));
}
test('kernel tool schemas, descriptions and results preserve the original',async()=>{
 const a=fixture(),b=fixture();
 const aa=current.createRuntime(a.bridge).kernelTools(a.container),bb=original.createRuntime(b.bridge).kernelTools(b.container);
 for(let i=0;i<aa.length;i++){
  const {handler:ha,...ma}=aa[i],{handler:hb,...mb}=bb[i];assert.deepEqual(ma,mb);assert.deepEqual(await ha({package:'pkg'}),await hb({package:'pkg'}));
 }
});
for(const scenario of ['missing','notFound','scanError','success','isolated'])test('tool:call parity: '+scenario,async()=>{
 async function run(runtime){const options={tools:[{name:'echo',call:async x=>x}]};if(scenario==='scanError')options.scanError=true;if(scenario==='isolated')options.isolated={surfaces:{tools:[{name:'echo',id:'id'}]},invoke:async(id,args)=>({id,args})};const f=fixture(options);runtime.createRuntime(f.bridge).toolsModule.install(f.container);const payload=scenario==='missing'?{}:{package:'pkg',tool:scenario==='notFound'?'no':'echo',args:{v:1}};return f.listeners.get('tool:call')(payload,{})}
 assert.deepEqual(await run(current),await run(original));
});
test('loadMcpTools picks the deepest package owner and enforces expose',async()=>{
 async function run(runtime){const f=fixture({tools:[{name:'x',_file:'/workspace/pkg/nested/x.js',call:async()=>5}]});const tools=await runtime.createRuntime(f.bridge).loadMcpTools(f.container,'/workspace/pkg');return {trace:f.trace,names:tools.map(t=>t.qualifiedName)}}
 assert.deepEqual(await run(current),await run(original));
});
test('provider validates schemas and vital tools',async()=>{
 const listeners=new Map(),state=new Map();let tools=[{name:'ok',parameters:{type:'object',properties:{}}}];const host={workspace:()=>'/workspace',registry:{},state:()=>state,on:(e,f)=>listeners.set(e,f),tools:{authority:()=>({enforce:()=>{}}),isolatedRunner:()=>null,scan:async()=>tools}};
 const mod=require('..').provideTools(host);mod.install();const result={};await listeners.get('logos:package:validating')({pkg:{folder:'pkg'},result});assert.equal(result.tools,1);
 tools=[{name:'bad',parameters:{type:'string'}}];await assert.rejects(listeners.get('logos:package:validating')({pkg:{folder:'pkg'},result}),/object JSON schema/);
 const checks=[];await assert.rejects(listeners.get('logos:package:staging')({pkg:{folder:'pkg',runtime:{stability:{tools:['missing']}}},checks}),/vital tools missing/);assert.equal(checks[0].ok,false);
});

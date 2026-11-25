const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'module-install-'));
try {
const artifact=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',tmp],{cwd:root,encoding:'utf8'}))[0];
fs.writeFileSync(path.join(tmp,'package.json'),'{}');
execFileSync('npm',['install','--omit=dev','--ignore-scripts','--no-audit','--no-fund',path.join(tmp,artifact.filename)],{cwd:tmp,stdio:'pipe',timeout:120000});
execFileSync(process.execPath,['-e',"const a=require('@thinkiac/module-tools');if(typeof a.createHost!=='function'||typeof a.createRuntimeModule!=='function')throw Error('API missing');console.log('isolated artifact OK')"],{cwd:tmp,stdio:'inherit',env:{...process.env,NODE_PATH:''}});
} finally {fs.rmSync(tmp,{recursive:true,force:true})}

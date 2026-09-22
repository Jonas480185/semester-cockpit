import "./local-only";
/** Offline integration regression: real Supabase SSR/Auth SDK, route handlers and PostgreSQL.
 * Run: node --experimental-test-module-mocks --import tsx tests/oauth-session-security.ts
 * No production credentials, users, connections or records are used.
 */
import assert from "node:assert/strict";
import { mock } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

type Cookie = {name:string; value:string};
const stores = new AsyncLocalStorage<Map<string,string>>();
mock.module("next/headers", {namedExports: {cookies: async () => ({
  getAll: () => [...stores.getStore()!].map(([name,value])=>({name,value})),
  set: (name:string,value:string) => stores.getStore()!.set(name,value),
})}});
const owner = "11111111-1111-4111-8111-111111111111";
const email = "owner@example.test";
const user = {id:owner,email,email_confirmed_at:new Date().toISOString(),aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const secret = randomBytes(32);
const issued = new Map<string,typeof user>();
const refreshTokens = new Map<string,string>();
let callbackToken = "";
const authCalls:string[] = [];
function token(claims:Record<string,unknown> = {}, identity = user) {
  const body = [Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),Buffer.from(JSON.stringify({jti:crypto.randomUUID(),sub:owner,email,role:"authenticated",aud:"authenticated",exp:Math.floor(Date.now()/1000)+3600,...claims})).toString("base64url")].join(".");
  const value = body+"."+createHmac("sha256",secret).update(body).digest("base64url");
  issued.set(value,identity); return value;
}
function session(access_token:string, refresh_token="disposable-refresh-token") {
  return {access_token,refresh_token,expires_in:3600,expires_at:JSON.parse(Buffer.from(access_token.split(".")[1],"base64url").toString()).exp,token_type:"bearer",user};
}
const authServer = createServer(async (req,res)=>{
  authCalls.push(`${req.method} ${req.url}`);
  res.setHeader("Content-Type","application/json");
  const credential = req.headers.authorization?.replace(/^Bearer /,"") || "";
  if(req.url === "/auth/v1/user") {
    const identity = issued.get(credential);
    if(identity) {res.end(JSON.stringify(identity)); return;}
  }
  if(req.url?.startsWith("/auth/v1/token?")) {
    let input=""; for await(const chunk of req) input+=chunk;
    const body=JSON.parse(input);
    const next=req.url.includes("grant_type=pkce") ? callbackToken : refreshTokens.get(body.refresh_token);
    if(next) {res.end(JSON.stringify(session(next,body.refresh_token)));return;}
  }
  if(req.url?.startsWith("/auth/v1/logout")) {res.statusCode=204;res.end();return;}
  if(req.url?.includes("jwks")) {res.end(JSON.stringify({keys:[]}));return;}
  res.statusCode=401;res.end(JSON.stringify({code:"bad_jwt",message:"Invalid fixture token"}));
});
await new Promise<void>(resolve=>authServer.listen(0,"127.0.0.1",resolve));
const address=authServer.address(); assert.ok(address && typeof address!=="string");
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${address.port}`;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="offline-public-fixture-key";
process.env.COCKPIT_OWNER_EMAIL=email;
process.env.APP_URL="http://cockpit.test";
const engine=await PGlite.create();
await engine.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
const migrations=new URL("../supabase/migrations/",import.meta.url);
for(const file of (await readdir(migrations)).filter(f=>f.endsWith(".sql")).sort()) await engine.exec(await readFile(new URL(file,migrations),"utf8"));
const pgServer=new PGLiteSocketServer({db:engine,host:"127.0.0.1",port:54328,maxConnections:8});
await pgServer.start();
process.env.DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54328/postgres";
const api=await import("../app/api/v1/[[...path]]/route");
const auth=await import("../lib/auth");
const backend=await import("../lib/server");
const {databasePool}=await import("../lib/postgres");
const login=await import("../app/auth/session/route");
const callback=await import("../app/auth/callback/route");
const signOut=await import("../app/auth/sign-out/route");
const setup=await import("../app/api/setup/route");
const decision=await import("../app/api/oauth/decision/route");
const revoke=await import("../app/api/oauth/revoke/route");
const mcp=await import("../app/api/mcp/route");
const materials=await import("../app/api/materials/[[...path]]/route");
const loginPage=await import("../app/login/page");
const consentPage=await import("../app/oauth/consent/page");
const cookieName="sb-127-auth-token";
function cookies(access:string,format="base64",refresh?:string):Cookie[] {
  const raw=JSON.stringify(session(access,refresh));
  const value=format==="raw" ? raw : "base64-"+Buffer.from(raw).toString("base64url");
  return format==="chunked" ? [{name:cookieName+".0",value:value.slice(0,300)},{name:cookieName+".1",value:value.slice(300)}] : [{name:cookieName,value}];
}
async function withCookies<T>(values:Cookie[],run:()=>Promise<T>) {
  const store=new Map(values.map(c=>[c.name,c.value]));
  const result=await stores.run(store,run); return {result,store};
}
function request(path:string,body?:unknown,bearer?:string) {
  return new Request(process.env.APP_URL+path,{method:body===undefined?"GET":"POST",headers:{origin:process.env.APP_URL!,...(body===undefined?{}:{"content-type":"application/json","idempotency-key":crypto.randomUUID()}),...(bearer?{authorization:"Bearer "+bearer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function keys(req:Request) {return api.POST(req,{params:Promise.resolve({path:["keys"]})});}
const ownerToken=token(), read=token({client_id:"reader"}), writer=token({client_id:"writer"}), revoked=token({client_id:"revoked"});
let count=0;
function check(value:unknown,label:string) {assert.ok(value,label);count++;console.log("PASS",label);}
async function rejected(run:()=>Promise<unknown>,status:number) {await assert.rejects(run,(e:{status:number})=>e.status===status);count++;}
try {
  await backend.initialize(owner);
  for(const [id,scope,disabled] of [["reader","read",0],["writer","read-write",0],["revoked","read-write",1]]) await backend.db().batch([backend.db().prepare("INSERT INTO oauth_grants (ownerId,client_id,scope,revoked,updatedAt) VALUES (?,?,?,?,?)").bind(owner,id,scope,disabled,new Date().toISOString())]);
  const first=await withCookies(cookies(ownerToken),()=>keys(request("/api/v1/keys",{name:"Fixture",scope:"read-write"})));
  check(first.result.status===201,"First-party owner can create an API key");
  const key=await first.result.json();
  const imported=await withCookies([],()=>login.POST(request("/auth/session",{access_token:ownerToken,refresh_token:"disposable-refresh-token"})));
  check(imported.result.status===200 && !!imported.store.get(cookieName),"First-party session import sets a cookie");
  {
    for(const delegated of [read,writer,revoked,token({client_id:null}),token({client_id:""}),token({client_id:42})]) {
      for(const format of ["base64","raw","chunked"]) {
        const denied=await withCookies(cookies(delegated,format),()=>keys(request("/api/v1/keys",{name:"Escalation attempt",scope:"read-write"})));
        check(denied.result.status===401,`${format} delegated cookie cannot create a key (${count})`);
      }
      const deniedImport=await withCookies([],()=>login.POST(request("/auth/session",{access_token:delegated,refresh_token:"disposable-refresh-token"})));
      check(deniedImport.result.status===401 && !deniedImport.store.get(cookieName),"Delegated session import rejected before cookie storage");
    }
    await withCookies(cookies(writer),async()=>{
      for(const method of ["GET","DELETE"]) {
        const r=new Request(process.env.APP_URL+"/api/v1/keys/fixture",{method,headers:{origin:process.env.APP_URL!}});
        check((await api.GET(r,{params:Promise.resolve({path:["keys","fixture"]})})).status===401,"Delegated cookie cannot list or revoke keys");
      }
      check((await setup.POST(request("/api/setup",{}))).status===401,"Delegated cookie cannot initialize a workspace");
      check((await mcp.POST(request("/api/mcp",{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"semester_write_batch",arguments:{}}}))).status===401,"Delegated cookie cannot reach MCP writes");
      check((await api.POST(request("/api/v1/batch",{}),{params:Promise.resolve({path:["batch"]})})).status===401,"Delegated cookie cannot reach REST writes");
      check(!!await loginPage.default({searchParams:Promise.resolve({next:"/"})}),"Delegated cookie renders login without a redirect loop");
      await assert.rejects(()=>consentPage.default({searchParams:Promise.resolve({authorization_id:"fixture"})}),/NEXT_REDIRECT/);count++;
      await assert.rejects(()=>auth.requireUser(),/NEXT_REDIRECT/);count++;
      const callsBefore=authCalls.length;
      for(const handler of [decision.POST,revoke.POST]) {
        const form=new URLSearchParams({authorization_id:"fixture",scope:"read-write",decision:"approve",client_id:"writer"});
        const r=new Request(process.env.APP_URL+"/api/oauth/decision",{method:"POST",headers:{origin:process.env.APP_URL!},body:form});
        check((await handler(r)).status===401,"Delegated cookie cannot manage OAuth grants");
      }
      check((await signOut.POST(request("/auth/sign-out",{}))).status===401,"Delegated cookie cannot globally sign out the owner");
      check(!authCalls.slice(callsBefore).some(x=>/oauth|logout/.test(x)),"No delegated upstream grant or global logout side effects");
    });
    const wrong=token({}, {...user,id:"22222222-2222-4222-8222-222222222222",email:"other@example.test"});
    const mismatch=token({sub:"22222222-2222-4222-8222-222222222222"});
    const forged=ownerToken.slice(0,-3)+"bad";
    for(const bad of [wrong,mismatch,forged,token({sub:null}),token({}, {...user,email_confirmed_at:""})]) {
      check((await withCookies(cookies(bad),()=>keys(request("/api/v1/keys",{name:"Bad",scope:"read-write"})))).result.status===401,"Unverified owner, invalid subject or forged token denied");
    }
    const expired=token({exp:Math.floor(Date.now()/1000)-60});
    refreshTokens.set("first-party-refresh",ownerToken);
    refreshTokens.set("delegated-refresh",writer);
    check((await withCookies(cookies(expired,"base64","first-party-refresh"),()=>keys(request("/api/v1/keys",{name:"Refreshed owner",scope:"read-write"})))).result.status===201,"First-party cookie refresh retains legitimate access");
    check((await withCookies(cookies(expired,"base64","delegated-refresh"),()=>keys(request("/api/v1/keys",{name:"Refreshed delegate",scope:"read-write"})))).result.status===401,"Refresh to a delegated token cannot obtain browser authority");
    for(const value of [writer,ownerToken]) {
      callbackToken=value;
      const result=await withCookies([{name:cookieName+"-code-verifier",value:JSON.stringify("fixture-verifier")}],()=>callback.GET(request("/auth/callback?code=fixture&next=/connections")));
      check(result.result.headers.get("location")===process.env.APP_URL+(value===writer?"/login?error=expired":"/connections"),"PKCE callback classifies the exchanged token");
    }
    const malformed=await withCookies([{name:cookieName,value:"base64-not-a-session"}],()=>keys(request("/api/v1/keys",{name:"Malformed",scope:"read-write"})));
    check(malformed.result.status===401,"Malformed session storage fails closed");
    const invalidRefresh=await withCookies(cookies(expired),()=>keys(request("/api/v1/keys",{name:"Expired",scope:"read-write"})));
    check(invalidRefresh.result.status===401,"Expired session with invalid refresh token fails closed");
    await withCookies(cookies(ownerToken),async()=>{
      check((await auth.requireUser()).id===owner,"Verified owner can load protected pages");
      await assert.rejects(()=>loginPage.default({searchParams:Promise.resolve({next:"/connections"})}),/NEXT_REDIRECT/);count++;
      await rejected(()=>backend.authorize(request("/api/v1/batch",{},read),true),403);
    });
    const noOrigin=new Request(process.env.APP_URL+"/api/v1/keys",{method:"POST",body:JSON.stringify({name:"No CSRF",scope:"read-write"})});
    check((await withCookies(cookies(ownerToken),()=>keys(noOrigin))).result.status===403,"Owner mutations retain same-origin protection");
    for(const [credential,scope] of [[read,"read"],[writer,"read-write"],[key.token,"read-write"]]) {
      const resolved=await backend.authorize(request("/api/v1/snapshot",undefined,credential));
      check(!resolved.browser && resolved.scope===scope && resolved.actor.startsWith("Agent: "),"Bearer retains agent identity and grant scope");
      check((await keys(request("/api/v1/keys",{name:"Not owner",scope:"read-write"},credential))).status===403,"Bearer cannot manage owner credentials");
      if(scope==="read-write") {
        const snap=await backend.snapshot(owner);
        const reply=await mcp.POST(request("/api/mcp",{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"semester_write_batch",arguments:{revision:snap.revision,idempotencyKey:crypto.randomUUID(),operations:[{entity:"modules",action:"create",data:{id:crypto.randomUUID(),title:"Agent fixture",code:"QA",color:"#6655cc",credits:5,target:60}}]}}},credential));
        check(reply.status===200 && (await reply.json()).result.isError===false && (await backend.snapshot(owner)).revision===snap.revision+1,"Read-write agent persists learning data through MCP");
      }
    }
    const snap=await backend.snapshot(owner);
    const restWrite=await api.POST(request("/api/v1/batch",{revision:snap.revision,operations:[{entity:"modules",action:"create",data:{id:"rest-agent-fixture",title:"REST fixture",code:"QA",color:"#6655cc",credits:5,target:60}}]},writer),{params:Promise.resolve({path:["batch"]})});
    check(restWrite.status===200 && (await backend.snapshot(owner)).revision===snap.revision+1,"OAuth read-write agent persists learning data through REST");
    for(const credential of [read,revoked]) check((await mcp.POST(request("/api/mcp",{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"semester_write_batch",arguments:{}}},credential))).status===403,"Read-only or revoked grant cannot write through MCP");
    await rejected(()=>backend.authorize(request("/api/v1/batch",{},read),true),403);
    await rejected(()=>backend.authorize(request("/api/v1/snapshot",undefined,revoked)),403);
    for (const credential of [read, writer]) {
      const listing = await mcp.POST(request("/api/mcp", {jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"semester_material_list",arguments:{}}}, credential));
      check(listing.status === 200 && !(await listing.json()).result.isError, "OAuth reader and writer can list scoped material metadata");
    }
    for (const credential of [read, revoked]) for (const name of ["semester_material_prepare_upload", "semester_material_complete_upload", "semester_material_update", "semester_material_delete"]) {
      check((await mcp.POST(request("/api/mcp", {jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:{}}}, credential))).status === 403, "OAuth read-only or revoked grant cannot mutate materials");
    }
    check((await withCookies(cookies(writer), () => materials.GET(request("/api/materials/fixture/download"), {params:Promise.resolve({path:["fixture","download"]})}))).result.status === 401, "Delegated cookie cannot obtain a file capability as the owner");
    check((await withCookies(cookies(ownerToken), () => materials.POST(new Request(process.env.APP_URL+"/api/materials", {method:"POST",body:"{}"}), {params:Promise.resolve({})}))).result.status === 403, "Material browser writes retain CSRF protection");
    const audit=await backend.db().prepare("SELECT actor FROM audit WHERE entity='modules'").all();
    check(audit.results.length===3 && audit.results.every(r=>String(r.actor).startsWith("Agent: ")),"Agent learning writes retain correct audit attribution");
    check((await withCookies(cookies(ownerToken),()=>signOut.POST(request("/auth/sign-out",{})))).result.status===303,"First-party owner can still sign out");
  }
  console.log(`\n${count} OAuth session security checks passed.`);
} finally {
  await databasePool().end();await pgServer.stop();await engine.close();
  await new Promise<void>((resolve,reject)=>authServer.close(error=>error?reject(error):resolve()));
  mock.restoreAll();
}

import "./local-only";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { initialize, snapshot, mutate, analysis, db, hash, authorize } from "../lib/server";
import { databasePool } from "../lib/postgres";
import { allowedUser, safeReturnTo } from "../lib/auth";
import { monday, offsetDate, today } from "../lib/model";
import { proposeWeek } from "../lib/planner";
import { entitySchemas } from "../lib/openapi";

const engine=await PGlite.create();
await engine.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
const migrations = new URL("../supabase/migrations/", import.meta.url);
for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) {
  await engine.exec(await readFile(new URL(file, migrations), "utf8"));
}
const server=new PGLiteSocketServer({db:engine,host:"127.0.0.1",port:54329,maxConnections:8});
await server.start();
process.env.DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54329/postgres";
// PGlite supports one backend session; serialize the transport, not the application requests.
databasePool().options.max = 1;
process.env.COCKPIT_OWNER_EMAIL="owner@example.test";
const a={owner:"11111111-1111-4111-8111-111111111111",actor:"Nutzer",scope:"read-write",browser:true};
const b={...a,owner:"22222222-2222-4222-8222-222222222222"};
let count=0;
function check(value:unknown,message:string) {assert.ok(value,message);count++;console.log("PASS",message);}
async function change(operations:unknown[],revision?:number,key=crypto.randomUUID()) {return mutate(a,{revision:revision??(await snapshot(a.owner)).revision,operations},key);}
async function fails(fn:()=>Promise<unknown>,status:number) {await assert.rejects(fn,(error:unknown)=>!!error && typeof error === "object" && "status" in error && error.status===status);count++;}
try {
  await initialize(a.owner); await initialize(b.owner); await initialize(a.owner);
  check(Object.values((await snapshot(a.owner)).data).every(rows=>rows.length===0),"Empty start and repeated initialization");
  await change([{entity:"modules",action:"create",data:{id:"m",title:"Data",code:"DB",color:"#6655cc",credits:5,examDate:"2026-12-01",target:60}}]);
  check(analysis((await snapshot(a.owner)).data).modules[0].behind===false,"Empty module is not falsely behind");
  await change([{entity:"topics",action:"create",data:{id:"t",moduleId:"m",title:"Transactions",status:"unsicher",priority:3,relevance:3,lastPracticed:null}}]);
  const task={id:"task",topicId:"t",title:"Practice",date:"2026-09-21",time:"10:00",minutes:30,status:"offen",kind:"Lernen",priority:2};
  const start=await snapshot(a.owner), key=crypto.randomUUID(), operations=[{entity:"tasks",action:"create",data:task}];
  await change(operations,start.revision,key);
  check((await change(operations,start.revision,key)).replayed,"Idempotent replay");
  await fails(()=>change([{...operations[0],data:{...task,title:"Changed"}}],start.revision,key),409);
  await fails(()=>change([{entity:"tasks",action:"update",id:"task",data:{status:"erledigt"}}],start.revision),409);
  let current=await snapshot(a.owner);
  await fails(()=>change([{entity:"tasks",action:"update",id:"task",data:{title:"SHOULD NOT SAVE"}},{entity:"tasks",action:"create",data:{...task,id:"bad",topicId:"missing"}}]),400);
  check((await snapshot(a.owner)).revision===current.revision,"Invalid batch rolls back without revision change");
  check((await snapshot(a.owner)).data.tasks[0].title==="Practice","No partial writes");
  check((await snapshot(b.owner)).data.modules.length===0,"Other owner cannot see records");
  const races=await Promise.allSettled([change([{entity:"tasks",action:"update",id:"task",data:{title:"A"}}],current.revision),change([{entity:"tasks",action:"update",id:"task",data:{title:"B"}}],current.revision)]);
  check(races.filter(x=>x.status==="fulfilled").length===1,"Concurrent writers produce one committed revision");
  await change([{entity:"tasks",action:"update",id:"task",data:{status:"erledigt"}}]);
  check(analysis((await snapshot(a.owner)).data).masteredTopics.length===0,"Completion does not prove mastery");
  await change([{entity:"topics",action:"update",id:"t",data:{status:"sicher"}}]);
  check(analysis((await snapshot(a.owner)).data).masteredTopics.length===0,"Self-assessment alone does not prove mastery");
  await change([{entity:"tests",action:"create",data:{id:"test",topicId:"t",date:new Date().toISOString(),score:88,independent:true,notes:"Solved without help"}}]);
  current=await snapshot(a.owner);
  check(current.data.tests[0].independent===true && analysis(current.data).masteredTopics.length===1,"Independent test is persisted and proves mastery");
  check(current.data.topics[0].lastPracticed!==null && current.data.history.length===2,"Practice date and knowledge history update automatically");
  check(current.data.deadlines[0].id==="exam-m","Canonical exam deadline preserved");
  const secret="sem_"+crypto.randomUUID(), tokenId=crypto.randomUUID();
  await db().batch([db().prepare("INSERT INTO tokens (id,ownerId,name,hash,scope,createdAt,expiresAt,revoked) VALUES (?,?,?,?,?,?,?,0)").bind(tokenId,a.owner,"Test reader",await hash(secret),"read",new Date().toISOString(),"2099-01-01T00:00:00.000Z")]);
  const agentRequest=new Request("http://localhost/api/v1/snapshot",{headers:{authorization:"Bearer "+secret}});
  check((await authorize(agentRequest)).owner===a.owner,"Agent key resolves the correct owner");
  await fails(()=>authorize(agentRequest,true),403);
  await db().batch([db().prepare("UPDATE tokens SET revoked=1 WHERE id=?").bind(tokenId)]);
  await fails(()=>authorize(agentRequest),401);
  check(!allowedUser({email:"owner@example.test"}),"Unconfirmed email cannot access cockpit");
  check(!allowedUser({email:"attacker@example.test",email_confirmed_at:new Date().toISOString()}),"Other verified user cannot access cockpit");
  check(safeReturnTo("//evil.test")==="/" && safeReturnTo("/\\evil.test")==="/","Login redirect cannot leave the website");
  const audit=await db().prepare("SELECT * FROM audit WHERE ownerId=?").bind(a.owner).all();
  check(audit.results.some(x=>x.entity==="tests" && x.actor==="Nutzer"),"Database audit includes actor and test changes");
  const tableSecurity=await engine.query<{relrowsecurity:boolean}>("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='semester' AND c.relkind='r'");
  check(tableSecurity.rows.length===16 && tableSecurity.rows.every(x=>x.relrowsecurity),"All 16 tables have RLS enabled");
  const permissions=await engine.query<{allowed:boolean}>("SELECT has_schema_privilege('anon','semester','USAGE') OR has_schema_privilege('authenticated','semester','USAGE') AS allowed");
  check(!permissions.rows[0].allowed,"Private schema is not accessible through the public Data API");
  await change([{entity:"modules",action:"create",data:{id:"undated",title:"Ohne Termin",code:"OT",color:"#6655cc",credits:5,target:60}}]);
  current=await snapshot(a.owner);
  check(current.data.modules.find(m=>m.id==="undated")?.examDate===null && !current.data.deadlines.some(d=>d.id==="exam-undated"),"Module without exam date persists without an invented deadline");
  check(!entitySchemas.modules.required.includes("examDate") && entitySchemas.modules.properties.examDate.nullable===true,"Agent schema allows omitted and null exam dates");
  await change([{entity:"modules",action:"update",id:"undated",data:{examDate:"2026-12-10"}}]);
  await change([{entity:"modules",action:"update",id:"undated",data:{title:"Später ergänzter Termin"}}]);
  current=await snapshot(a.owner);
  check(current.data.modules.find(m=>m.id==="undated")?.examDate==="2026-12-10" && current.data.deadlines.some(d=>d.id==="exam-undated" && d.date==="2026-12-10"),"Adding a date later creates the exam deadline; unrelated edits preserve it");
  await change([{entity:"deadlines",action:"update",id:"exam-undated",data:{date:"2026-12-12"}}]);
  check((await snapshot(a.owner)).data.modules.find(m=>m.id==="undated")?.examDate==="2026-12-12","Editing the exam deadline still updates the module date");
  await change([{entity:"deadlines",action:"create",data:{id:"manual-deadline",moduleId:"undated",title:"Hausarbeit",date:"2026-11-20",kind:"Abgabe"}},{entity:"modules",action:"update",id:"undated",data:{examDate:null}}]);
  current=await snapshot(a.owner);
  check(current.data.modules.find(m=>m.id==="undated")?.examDate===null && !current.data.deadlines.some(d=>d.id==="exam-undated") && current.data.deadlines.some(d=>d.id==="manual-deadline"),"Clearing an exam date removes only its automatic deadline");
  await change([{entity:"topics",action:"create",data:{id:"undated-topic",moduleId:"undated",title:"Offenes Thema",status:"unsicher",priority:3,relevance:3,lastPracticed:null}}]);
  const nextWeek = monday(offsetDate(today(), 7));
  await change([null, "undated"].map(moduleId=>({entity:"plans",action:"create",data:{id:moduleId || "global-week",moduleId,title:"Allocated budget",startDate:nextWeek,endDate:offsetDate(nextWeek,6),targetMinutes:90,notes:""}})));
  check(proposeWeek((await snapshot(a.owner)).data).tasks[0]?.topicId==="undated-topic","Undated modules remain eligible for priority-based study planning");
  await assert.rejects(()=>change([{entity:"modules",action:"update",id:"undated",data:{examDate:"2026-02-30"}}]),(error:unknown)=>error instanceof Error && error.name==="ZodError"); count++;
  console.log(`\n${count} migration checks passed.`);
} finally {
  await databasePool().end(); await server.stop(); await engine.close();
}

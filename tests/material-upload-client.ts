import "./local-only";
import assert from "node:assert/strict";
import { materialPdf } from "./fixtures/material-pdf";
import { MaterialRequestError, materialRequest, runMaterialUpload, validatePdf } from "../lib/material-upload-client";
import type { Material } from "../lib/material-model";

const file = new File([new Uint8Array(materialPdf())], "original.pdf", {type:"application/pdf"});
const pending = {id:"one-upload",fileName:file.name,size:file.size,state:"pending"} as Material;
const ready = {...pending,state:"ready"} as Material;
let checks = 0;
const check = (value: unknown, label: string) => {assert.ok(value,label); checks++; console.log("PASS", label);};
check(await validatePdf(file) === null,"Original PDF is accepted");
check(!!await validatePdf(new File(["%PDF-valid"],"wrong.txt")),"Wrong extension is rejected before preparing metadata");
check(!!await validatePdf(new File(["fake content"],"fake.pdf")),"Fake PDF is rejected before preparing metadata");
check(!!await validatePdf(new File([new Uint8Array(20*1024*1024+1)],"large.pdf")),"Oversize PDF is rejected before upload");

let materialId: string | undefined, transferred = false, prepares = 0, resumes = 0, completions = 0;
const mockRequest: typeof materialRequest = async <T>(path: string) => {
  if(path === "") {prepares++; return {material:pending,upload:{url:"https://storage.test/upload",headers:{}}} as T;}
  if(path.endsWith("/upload")) {resumes++; return {material:pending,upload:{url:"https://storage.test/resume",headers:{}}} as T;}
  if(path.endsWith("/complete")) {completions++; if(!transferred) throw new MaterialRequestError("Not uploaded",409); return {material:ready} as T;}
  throw new Error("Unexpected request");
};
const options = {file,input:{},onPrepared:(m:Material)=>{materialId=m.id;},onProgress:()=>{}};
await assert.rejects(runMaterialUpload(options,mockRequest,async()=>{throw new Error("Offline");}),/Offline/);
check(materialId===pending.id && prepares===1,"Failed transfer preserves the prepared material ID");
const result=await runMaterialUpload({...options,materialId},mockRequest,async()=>{transferred=true;});
check(result.state==="ready" && prepares===1 && resumes===1,"Retry reuses one entry and a fresh upload URL");
let duplicateTransfers=0;
await runMaterialUpload({...options,materialId},mockRequest,async()=>{duplicateTransfers++;});
check(duplicateTransfers===0 && prepares===1,"Lost completion response does not upload a second copy");
transferred=false;
await runMaterialUpload({...options,materialId},mockRequest,async()=>{transferred=true;throw new Error("Response lost");});
check(transferred && completions>1,"Successful transfer with lost response is recovered by completion");
let deniedTransfers=0;
const denied: typeof materialRequest = async()=>{throw new MaterialRequestError("Forbidden",403);};
await assert.rejects(runMaterialUpload({...options,materialId},denied,async()=>{deniedTransfers++;}),/Forbidden/);
check(deniedTransfers===0,"Authorization failure stops retries before transferring bytes");
const mismatch: typeof materialRequest = async <T>(path:string)=>{
  if(path.endsWith("/complete"))throw new MaterialRequestError("Missing",409);
  return {material:{...pending,size:1},upload:{url:"https://storage.test/upload",headers:{}}} as T;
};
await assert.rejects(runMaterialUpload({...options,materialId},mismatch,async()=>{deniedTransfers++;}),/ursprüngliche PDF/);
check(deniedTransfers===0,"Resuming with another file size cannot send the wrong original");
const spacedFile = new File([new Uint8Array(materialPdf())], " original.pdf", {type:"application/pdf"});
const normalized = await runMaterialUpload({...options,file:spacedFile},mockRequest,async()=>{transferred=true;});
check(normalized.state === "ready","Server filename normalization does not block files with leading spaces");
const originalFetch=globalThis.fetch;
try {
  globalThis.fetch=async()=>new Response("<html>Gateway error</html>",{status:502});
  await assert.rejects(materialRequest(""),/nicht erreichbar/);
  check(true,"HTML server errors produce readable messages instead of JSON parse errors");
  globalThis.fetch=async()=>new Response('{}',{status:401});
  await assert.rejects(materialRequest(""),/Anmeldung ist abgelaufen/);
  check(true,"Expired login gets an actionable message");
} finally {globalThis.fetch=originalFetch;}
console.log(`${checks} upload client regression checks passed.`);

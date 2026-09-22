import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import { authorize, ApiError, readBody, json, failure } from "@/lib/server";
import { listMaterials, getMaterial, prepareUpload, resumeUpload, completeUpload, updateMaterial, deleteMaterial, materialDownload } from "@/lib/materials";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handler(request:Request,{params}:{params:Promise<{path?:string[]}>}) {
  if (isDemoDeployment()) return demoBackendResponse();
  try {
    const auth=await authorize(request,request.method!=="GET");
    const path=(await params).path || [], [id,action]=path;
    if(path.length>2)throw new ApiError(404,"Unbekannter Datei-Endpunkt.");
    const url=new URL(request.url);
    if(request.method==="GET") {
      if(!id)return json(await listMaterials(auth,{...(url.searchParams.has("moduleId")?{moduleId:url.searchParams.get("moduleId")} : {}),...(url.searchParams.has("documentType")?{documentType:url.searchParams.get("documentType")} : {}),includePending:url.searchParams.get("includePending")==="true"}));
      if(action==="download") {
        const result=await materialDownload(auth,id,url.searchParams.get("download")==="1");
        if(url.searchParams.get("redirect")==="1")return new Response(null,{status:303,headers:{Location:result.url + (/^[1-9][0-9]{0,5}$/.test(url.searchParams.get("page") || "") ? `#page=${url.searchParams.get("page")}` : ""),"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
        return json(result);
      }
      if(!action)return json({material:await getMaterial(auth,id)});
    }
    if(request.method==="POST" && !id)return json(await prepareUpload(auth,await readBody(request)),201);
    if(request.method==="POST" && action==="upload")return json(await resumeUpload(auth,id));
    if(request.method==="POST" && action==="complete")return json(await completeUpload(auth,id));
    if(request.method==="PATCH" && id && !action)return json(await updateMaterial(auth,id,await readBody(request)));
    if(request.method==="DELETE" && id && !action)return json(await deleteMaterial(auth,{...await readBody(request),id}));
    throw new ApiError(405,"Diese Datei-Operation wird nicht unterstützt.");
  } catch(error) {return failure(error);}
}
export {handler as GET,handler as POST,handler as PATCH,handler as DELETE};

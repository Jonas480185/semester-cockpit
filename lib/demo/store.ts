import { entities, type Snapshot, type Entity } from '../model';
import { batchSchema, schemas } from '../validation';
import { planningWarnings } from '../study-planning';
import { createDemoSnapshot, createDemoMaterials } from './fixtures';

type Row = Snapshot[Entity][number];
export type DemoAudit = {id:string;date:string;actor:string;entity:string;entityId:string;action:string;before:string|null;after:string|null;revision:number;reason:string};
/** Small, intentionally non-persistent UI simulator. This module has no network or server imports. */
export function createDemoStore() {
  let data = createDemoSnapshot(), revision = 1;
  const materials = createDemoMaterials();
  const audit: DemoAudit[] = [];
  const replays = new Map<string,{body:string;response:unknown}>();
  const reply = (value:unknown,status=200) => Response.json(value,{status});
  return async function request(input:string, init:RequestInit = {}):Promise<Response> {
    const url = new URL(input,'https://demo.invalid');
    const path = url.pathname;
    const method = init.method || 'GET';
    if (path === '/api/setup' && method === 'POST') return reply({demo:true});
    if (path === '/api/v1/snapshot' && method === 'GET') return reply({data,revision});
    if (path === '/api/v1/audit' && method === 'GET') return reply({data:audit});
    if (path === '/api/v1/keys' && method === 'GET') return reply({data:[]});
    if (path === '/api/materials' && method === 'GET') return reply({data:materials.filter(m=>!url.searchParams.get('moduleId') || m.moduleId===url.searchParams.get('moduleId'))});
    if (path !== '/api/v1/batch' || method !== 'POST') return reply({error:'Diese Funktion benötigt eine eigene private Instanz. In der Demo ist kein Backend verbunden.'},403);
    try {
      const body = String(init.body || '{}');
      const parsed = batchSchema.parse(JSON.parse(body));
      const key = new Headers(init.headers).get('Idempotency-Key');
      if (!key) return reply({error:'Idempotenzschlüssel fehlt.'},422);
      const prior = replays.get(key);
      if (prior) return prior.body === body ? reply({...prior.response as object,replayed:true}) : reply({error:'Schlüssel wurde bereits für eine andere Änderung verwendet.'},409);
      if (parsed.revision !== revision) return reply({error:'Der Demostand hat sich geändert. Bitte aktualisieren.'},409);
      const draft = structuredClone(data);
      const changes:DemoAudit[] = [];
      for (const op of parsed.operations) {
        const list:Row[] = draft[op.entity];
        const id = op.id || String(op.data?.id || crypto.randomUUID());
        const index = list.findIndex(row=>row.id===id);
        if (op.action==='create' && index>=0) return reply({error:'Diese ID existiert bereits.'},409);
        if (op.action!=='create' && index<0) return reply({error:'Eintrag nicht gefunden.'},404);
        const before = list[index];
        const after = op.action === 'delete' ? undefined : schemas[op.entity].parse({...before,...op.data,id});
        if (op.action === 'delete') list.splice(index,1);
        else if (index<0) list.push(after!);
        else list[index]=after!;
        changes.push({id:crypto.randomUUID(),date:new Date().toISOString(),actor:'Demo · lokal',entity:op.entity,entityId:id,action:op.action,before:before?JSON.stringify(before):null,after:after?JSON.stringify(after):null,revision:revision+1,reason:parsed.reason || 'Lokale Demoänderung'});
        if (op.entity==='topics' && after && 'status' in after && (!before || !('status' in before) || before.status!==after.status)) {
          draft.history.push({id:crypto.randomUUID(),topicId:id,date:new Date().toISOString(),status:schemas.topics.parse(after).status,source:'Demo · lokale Änderung'});
        }
      }
      // Reject broken references instead of silently cascading or losing source links.
      for (const topic of draft.topics) if (!draft.modules.some(m=>m.id===topic.moduleId)) throw new Error('Das Modul wird noch von Themen verwendet.');
      for (const entity of ['tasks','tests','sessions','gaps','reviews'] as const) for (const row of draft[entity]) if (!draft.topics.some(t=>t.id===row.topicId)) throw new Error('Das Thema wird noch verwendet.');
      for (const task of draft.tasks) if (task.sourceMaterialId && !materials.some(m=>m.id===task.sourceMaterialId && m.moduleId===draft.topics.find(t=>t.id===task.topicId)?.moduleId)) throw new Error('Quelle muss zum gleichen Modul gehören.');
      for (const session of draft.sessions) if (session.taskId && !draft.tasks.some(t=>t.id===session.taskId && t.topicId===session.topicId)) throw new Error('Rückmeldung und Block müssen zum gleichen Thema gehören.');
      if (draft.plans.some(p=>p.moduleId && !draft.modules.some(m=>m.id===p.moduleId)) || draft.deadlines.some(d=>!draft.modules.some(m=>m.id===d.moduleId)) || materials.some(m=>!draft.modules.some(mod=>mod.id===m.moduleId))) throw new Error('Das Modul enthält noch Pläne, Termine oder Materialien.');
      // Match the same schemas, while leaving mastery entirely to existing explicit test evidence.
      for (const entity of entities) for (const row of draft[entity]) schemas[entity].parse(row);
      data = draft; revision++;
      audit.unshift(...changes);
      const response={revision,applied:changes.length,planningWarnings:planningWarnings(data),demo:true};
      replays.set(key,{body,response});
      return reply(response);
    } catch (error) {
      return reply({error:error instanceof Error?error.message:'Demoänderung nicht möglich.'},422);
    }
  };
}

import { createDemoStore } from './demo/store';

export const isDemoBrowser = () => typeof window !== 'undefined' && /^\/demo\/?$/.test(window.location.pathname);
let demoRequest: ReturnType<typeof createDemoStore> | undefined;
/** No demo request ever falls through to fetch, even for unknown endpoints. */
export function clientRequest(path:string, init?:RequestInit) {
  if (isDemoBrowser()) return (demoRequest ??= createDemoStore())(path,init);
  return fetch(path,init);
}
const sampleDocuments:Record<string,string> = {'demo-material-math':'/demo/beispiel-math.pdf','demo-material-db':'/demo/beispiel-db.pdf'};
export function materialHref(id:string,page?:number|null,download=false) {
  if (isDemoBrowser()) return (sampleDocuments[id] || '#') + (page ? '#page='+page : '');
  return `/api/materials/${encodeURIComponent(id)}/download?redirect=1${page?'&page='+page:''}${download?'&download=1':''}`;
}

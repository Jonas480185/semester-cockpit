import { type Snapshot, type Topic, type Task, today, monday, offsetDate } from '../model';
import type { Material } from '../material-model';

/** Entirely fictional. Dates move with the visit; no imports from a database or exported semester. */
export function createDemoSnapshot(date = today()): Snapshot {
  const week = monday(date);
  const modules = [
    { id:'demo-math', title:'Mathematik', code:'MAT', color:'#7661d4', credits:6, examDate:offsetDate(date,55), target:75, learningNotes:'Jeden Rechenschritt begründen. Erst selbst versuchen, dann einen Hinweis nutzen. Fiktive Lernregel.' },
    { id:'demo-db', title:'Datenbanken', code:'DB', color:'#4b91a8', credits:5, examDate:offsetDate(date,61), target:80, learningNotes:'SQL-Abfragen zuerst selbst formulieren und anschließend mit kleinen Beispieldaten prüfen.' },
    { id:'demo-se', title:'Software Engineering', code:'SE', color:'#ce995b', credits:5, examDate:offsetDate(date,68), target:75, learningNotes:'Begriffe immer an einem kleinen Softwareprojekt erklären. Weitere Inhalte folgen im Semester.' },
    { id:'demo-accounting', title:'Rechnungswesen', code:'RW', color:'#559786', credits:5, examDate:offsetDate(date,72), target:70, learningNotes:'Buchungssätze mit Begründung von Soll und Haben notieren.' },
  ];
  const catalogue: Array<[string,string,string,Topic['status'],number]> = [
    ['math-basics','demo-math','Funktionen & Gleichungen','sicher',1],
    ['math-linear','demo-math','Lineare Gleichungssysteme','in Arbeit',2],
    ['math-derivatives','demo-math','Differentialrechnung','nicht begonnen',3],
    ['math-integrals','demo-math','Integralrechnung','nicht begonnen',4],
    ['db-model','demo-db','Relationales Datenmodell','sicher',1],
    ['db-sql','demo-db','SQL: Abfragen & Joins','in Arbeit',2],
    ['db-normal','demo-db','Normalisierung','nicht begonnen',3],
    ['db-transactions','demo-db','Transaktionen','nicht begonnen',4],
    ['se-requirements','demo-se','Anforderungen beschreiben','sicher',1],
    ['se-uml','demo-se','UML & Modellierung','unsicher',2],
    ['se-testing','demo-se','Softwaretests','nicht begonnen',3],
    ['rw-basics','demo-accounting','Bilanz & Erfolgsrechnung','sicher',1],
    ['rw-entries','demo-accounting','Buchungssätze','in Arbeit',2],
    ['rw-cost','demo-accounting','Kostenrechnung','nicht begonnen',3],
  ];
  const topics: Topic[] = catalogue.map(([key,moduleId,title,status,position])=>({id:'demo-'+key,moduleId,title,status,position,priority:2,relevance:3,lastPracticed:status==='nicht begonnen'?null:offsetDate(date,-2),plannedStart:position<=2?offsetDate(date,-7):position===3?offsetDate(date,14):null,plannedEnd:position<=2?offsetDate(date,7):position===3?offsetDate(date,27):null}));
  const block = (id:string,topic:string,title:string,goal:string,day:string,time:string,minutes:number,source?:string):Task=>({id:'demo-'+id,topicId:'demo-'+topic,title,goal,date:day,time,minutes,status:'offen',kind:'Lernen',priority:2,sourceMaterialId:source?'demo-material-'+source:null,sourcePageStart:source?1:null,sourcePageEnd:null,sourceExercise:'',instructions:''});
  const tasks:Task[] = [
    block('today-math','math-linear','Gauß-Verfahren anwenden','Ein lineares Gleichungssystem ohne Musterlösung lösen.',date,'09:00',45,'math'),
    block('today-db','db-sql','Joins sicher unterscheiden','INNER JOIN und LEFT JOIN an einem eigenen Beispiel erklären.',date,'14:00',50,'db'),
    block('next-se','se-uml','Ein kleines Modell entwerfen','Ein Klassendiagramm aus einer kurzen Anforderung ableiten.',offsetDate(date,1),'10:00',45),
    block('next-rw','rw-entries','Buchungssätze begründen','Drei Geschäftsvorfälle mit Soll und Haben nachvollziehbar buchen.',offsetDate(date,2),'11:00',40),
    block('next-math','math-linear','Ohne Hinweise rechnen','Das Gauß-Verfahren auf eine neue Aufgabe übertragen.',offsetDate(date,3),'09:00',45,'math'),
    {...block('past-db','db-model','Relationen und Schlüssel','Primär- und Fremdschlüssel unterscheiden.',offsetDate(date,-2),'14:00',40,'db'),status:'erledigt'},
    {...block('past-math','math-basics','Funktionen wiederholen','Nullstellen und Schnittpunkte bestimmen.',offsetDate(date,-1),'09:00',35,'math'),status:'erledigt'},
  ];
  const confirmed = topics.filter(t=>t.status==='sicher');
  return {
    modules,topics,tasks,
    tests:confirmed.map((t,i)=>({id:'demo-proof-'+i,topicId:t.id,date:offsetDate(date,-3)+'T09:00:00.000Z',score:[90,85,88,82][i],independent:true,notes:'Fiktiver Selbsttest ohne Hilfe. Kein echter Leistungsnachweis.'})),
    sessions:[
      {id:'demo-feedback-db',topicId:'demo-db-model',taskId:'demo-past-db',date:offsetDate(date,-2),minutes:40,assistance:'selbstständig',difficulty:'Keine offene Schwierigkeit im Beispiel.',nextStep:'SQL-Abfragen mit zwei verknüpften Tabellen üben.',notes:'Fiktive Fachchat-Rückmeldung.',recordedAt:offsetDate(date,-2)+'T14:45:00.000Z'},
      {id:'demo-feedback-math',topicId:'demo-math-linear',taskId:null,date:offsetDate(date,-1),minutes:35,assistance:'mit Hilfe',difficulty:'Vorzeichen bei der Zeilenumformung.',nextStep:'Jede Zeilenumformung kurz begründen und anschließend selbst prüfen.',notes:'Fiktive Fachchat-Rückmeldung.',recordedAt:offsetDate(date,-1)+'T10:00:00.000Z'},
      {id:'demo-feedback-basics',topicId:'demo-math-basics',taskId:'demo-past-math',date:offsetDate(date,-1),minutes:30,assistance:'selbstständig',difficulty:'',nextStep:'Die Grundlagen bei Gleichungssystemen anwenden.',notes:'Fiktives Wiederholen.',recordedAt:offsetDate(date,-1)+'T09:35:00.000Z'},
    ],
    gaps:[{id:'demo-gap-math',topicId:'demo-math-linear',description:'Vorzeichen beim Addieren von Gleichungen noch unsicher.',status:'offen',date:offsetDate(date,-1)},{id:'demo-gap-se',topicId:'demo-se-uml',description:'Aggregation und Komposition an einem Beispiel unterscheiden.',status:'offen',date:offsetDate(date,-2)}],
    reviews:[{id:'demo-review-db',topicId:'demo-db-model',date:offsetDate(date,1),status:'offen',interval:7},{id:'demo-review-math',topicId:'demo-math-basics',date:offsetDate(date,2),status:'offen',interval:7}],
    deadlines:[...modules.map(m=>({id:'demo-exam-'+m.id,moduleId:m.id,title:'Fiktive Klausur · '+m.title,date:m.examDate,kind:'Klausur' as const})),{id:'demo-submission',moduleId:'demo-se',title:'Fiktive Projektabgabe',date:offsetDate(date,21),kind:'Abgabe'}],
    plans:[week,offsetDate(week,7)].flatMap((start,index)=>[null,...modules.map(m=>m.id)].map((moduleId,i)=>({id:'demo-budget-'+index+'-'+i,moduleId,title:moduleId?'Fachbudget':'Wochenbudget',startDate:start,endDate:offsetDate(start,6),targetMinutes:moduleId?[180,150,150,120][i-1]:600,notes:'Fiktives Wochenbudget. Verschieben erhöht es nicht.'}))),
    history:topics.filter(t=>t.status!=='nicht begonnen').flatMap((t,i)=>[{id:'demo-history-before-'+i,topicId:t.id,date:offsetDate(date,-14)+'T12:00:00.000Z',status:'nicht begonnen' as const,source:'Fiktiver Semesterstart'},{id:'demo-history-after-'+i,topicId:t.id,date:offsetDate(date,-3)+'T12:00:00.000Z',status:t.status,source:'Fiktive Lerneinheit'}]),
  };
}
export function createDemoMaterials(date=today()):Material[] {
  return ['math','db'].map((key,i)=>({id:'demo-material-'+key,moduleId:'demo-'+key,title:i?'SQL · Kleine Beispieldatenbank':'Gleichungssysteme · Beispielblatt',documentType:'Übung',semester:'Fiktives Demosemester',description:'Selbst erstellte Beispielunterlage. Keine echten Hochschulunterlagen.',relatedMaterialId:null,fileName:'beispiel-'+key+'.pdf',size:i?1676:1561,mimeType:'application/pdf',sha256:null,state:'ready',version:1,createdAt:date+'T08:00:00.000Z',updatedAt:date+'T08:00:00.000Z'}));
}

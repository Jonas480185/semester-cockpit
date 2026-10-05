export type TimetableException = {
  originalDate: string;
  date: string;
  time: string;
  minutes: number;
  location: string;
  cancelled: boolean;
};
export type TimetableEvent = {
  id: string;
  moduleId: string;
  kind: "Vorlesung" | "Übung";
  date: string;
  time: string;
  minutes: number;
  location: string;
  intervalWeeks: 0 | 1 | 2;
  until: string | null;
  exceptions: TimetableException[];
};
export type TimetableBlock = {
  id: string;
  sourceId: string;
  originalDate: string;
  moduleId: string;
  title: string;
  kind: "Vorlesung" | "Übung" | "Lernzeit";
  start: string;
  end: string;
  location: string;
  done: boolean;
};

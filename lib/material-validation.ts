import { z } from "zod";
import { materialTypes, MAX_PDF_BYTES } from "./material-model";
export const materialId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const id = materialId;
const metadata = z.object({
  title: z.string().trim().min(1).max(300),
  documentType: z.enum(materialTypes),
  semester: z.string().trim().max(80).default(""),
  description: z.string().trim().max(1000).default(""),
  relatedMaterialId: id.nullable().default(null),
}).strict();
export const materialUploadInput = metadata.extend({moduleId:id, fileName:z.string().trim().min(1).max(240).regex(/\.pdf$/i).refine(s=>!/[\x00-\x1f\x7f/\\]/.test(s),"Ungültiger Dateiname"),size:z.number().int().min(5).max(MAX_PDF_BYTES)}).strict();
export const materialUpdateInput = metadata.partial().extend({version:z.number().int().positive()}).strict();
export const materialListInput = z.object({moduleId:id.optional(),documentType:z.enum(materialTypes).optional(),includePending:z.boolean().default(false)}).strict();
export const materialIdInput = z.object({id}).strict();
export const materialDeleteInput = z.object({id,version:z.number().int().positive(),confirm:z.literal(true)}).strict();

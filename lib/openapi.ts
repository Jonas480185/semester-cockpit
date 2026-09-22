import type { ZodTypeAny } from "zod";
import { materialUploadInput, materialUpdateInput, materialDeleteInput } from "./material-validation";
import { schemas } from "./validation";
export type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; [key: string]: unknown };
export function convert(z: ZodTypeAny): JsonSchema {
  const d = z._def;
  switch (d.typeName) {
    case "ZodEffects":
      return convert(d.schema);
    case "ZodNullable":
      return { ...convert(d.innerType), nullable: true };
    case "ZodOptional":
    case "ZodDefault":
      return convert(d.innerType);
    case "ZodArray":
      return { type: "array", items: convert(d.type), ...(d.minLength ? { minItems: d.minLength.value } : {}), ...(d.maxLength ? { maxItems: d.maxLength.value } : {}) };
    case "ZodUnion":
      return { anyOf: d.options.map(convert) };
    case "ZodLiteral":
      return { type: typeof d.value, enum: [d.value] };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodString": {
      const a: JsonSchema = { type: "string" };
      for (const c of d.checks || []) {
        if (c.kind === "min") a.minLength = c.value;
        if (c.kind === "max") a.maxLength = c.value;
        if (c.kind === "regex") a.pattern = c.regex.source;
        if (c.kind === "datetime") a.format = "date-time";
      }
      return a;
    }
    case "ZodNumber": {
      const a: JsonSchema = { type: "number" };
      for (const c of d.checks || []) {
        if (c.kind === "int") a.type = "integer";
        if (c.kind === "min") a.minimum = c.value;
        if (c.kind === "max") a.maximum = c.value;
      }
      return a;
    }
    case "ZodEnum":
      return { type: "string", enum: d.values };
    case "ZodObject": {
      const s = d.shape();
      return {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(s).map(([k, v]) => [k, convert(v as ZodTypeAny)]),
        ),
        required: Object.keys(s).filter((k) => !s[k].isOptional()),
        additionalProperties: false,
      };
    }
    default:
      return {};
  }
}
export const entitySchemas = Object.fromEntries(
  Object.entries(schemas).map(([k, v]) => [k, convert(v)]),
) as Record<string, JsonSchema & { properties: Record<string, JsonSchema>; required: string[] }>;
export const batchInput = {
  type: "object",
  properties: {
    revision: { type: "integer", minimum: 0 },
    reason: { type: "string", minLength: 1, maxLength: 300 },
    moduleScope: { type: "string", description: "Fachchat: auf diese Modul-ID begrenzen; Budgets sind zentral zu ändern." },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 80,
      items: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            enum: Object.keys(schemas).filter((k) => k !== "history"),
          },
          action: { type: "string", enum: ["create", "update", "delete"] },
          id: { type: "string" },
          data: { type: "object" },
        },
        required: ["entity", "action"],
        additionalProperties: false,
      },
    },
  },
  required: ["revision", "operations"],
  additionalProperties: false,
};
export function openapi(origin: string) {
  const paths: Record<string, unknown> = {};
  const responses = {
    "200": { description: "Ergebnis mit Snapshot-Revision" },
    "400": { description: "Ungültige Referenz oder Anfrage" },
    "401": { description: "Authentifizierung erforderlich" },
    "403": { description: "Keine Schreibberechtigung" },
    "409": {
      description: "Revisions- oder Idempotenzkonflikt; Daten neu lesen",
    },
    "422": { description: "Validierungsfehler" },
    "503": { description: "Datenbank nicht verfügbar" },
  };
  const auth = [{ agentKey: [] }];
  const idem = {
    name: "Idempotency-Key",
    in: "header",
    required: true,
    schema: { type: "string", minLength: 8, maxLength: 100 },
  };
  const revision = {
    name: "If-Match",
    in: "header",
    required: true,
    schema: { type: "string" },
    description: "Aktuelle ganzzahlige Snapshot-Revision",
  };
  const request = (schema: JsonSchema) => ({
    required: true,
    content: { "application/json": { schema } },
  });
  for (const [name, schema] of Object.entries(entitySchemas)) {
    const create = structuredClone(schema);
    create.required = (create.required || []).filter((k: string) => k !== "id");
    const patch = structuredClone(schema);
    patch.required = [];
    if (patch.properties) delete patch.properties.id;
    paths["/api/v1/" + name] = {
      get: {
        operationId: "list_" + name,
        summary: "Datensätze lesen",
        security: auth,
        parameters: ["moduleId", "topicId", "status", "date"].map((f) => ({
          name: f,
          in: "query",
          schema: { type: "string" },
        })),
        responses,
      },
      ...(name === "history"
        ? {}
        : {
            post: {
              operationId: "create_" + name,
              security: auth,
              parameters: [idem, revision],
              requestBody: request(create),
              responses,
            },
          }),
    };
    paths["/api/v1/" + name + "/{id}"] = {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      get: { operationId: "get_" + name, security: auth, responses },
      ...(name === "history"
        ? {}
        : {
            patch: {
              operationId: "update_" + name,
              security: auth,
              parameters: [idem, revision],
              requestBody: request(patch),
              responses,
            },
            delete: {
              operationId: "delete_" + name,
              security: auth,
              parameters: [idem, revision],
              responses,
            },
          }),
    };
  }
  for (const name of ["snapshot", "analysis", "audit"])
    paths["/api/v1/" + name] = {
      get: { operationId: "get_" + name, security: auth, responses },
    };
  paths["/api/v1/batch"] = {
    post: {
      operationId: "mutate_semester_batch",
      security: auth,
      parameters: [idem],
      requestBody: request(batchInput),
      responses,
    },
  };
  const materialId = { name: "id", in: "path", required: true, schema: { type: "string" } };
  paths["/api/materials"] = {
    get: { operationId: "list_materials", summary: "Private PDF-Metadaten gezielt lesen", security: auth, parameters: [
      { name: "moduleId", in: "query", schema: { type: "string" } },
      { name: "documentType", in: "query", schema: { type: "string", enum: ["Vorlesung/Skript", "Übung", "Lösung", "Altklausur", "Sonstiges"] } },
      { name: "includePending", in: "query", schema: { type: "boolean", default: false } },
    ], responses },
    post: { operationId: "prepare_material_upload", summary: "PDF vorbereiten; Antwort enthält signierte PUT-URL (2 Stunden). Danach complete aufrufen.", security: auth, requestBody: request(convert(materialUploadInput)), responses: { ...responses, "201": { description: "Metadaten und private Upload-URL" } } },
  };
  paths["/api/materials/{id}"] = {
    parameters: [materialId],
    get: { operationId: "get_material", security: auth, responses },
    patch: { operationId: "update_material", security: auth, requestBody: request(convert(materialUpdateInput)), responses },
    delete: { operationId: "delete_material", security: auth, requestBody: request(convert(materialDeleteInput.omit({ id: true }))), responses },
  };
  paths["/api/materials/{id}/complete"] = { parameters: [materialId], post: { operationId: "complete_material_upload", security: auth, responses } };
  paths["/api/materials/{id}/upload"] = { parameters: [materialId], post: { operationId: "resume_material_upload", summary: "Upload für denselben unvollständigen Eintrag fortsetzen; fertige Originale werden nicht überschrieben", security: auth, responses } };
  paths["/api/materials/{id}/download"] = {
    parameters: [materialId], get: { operationId: "download_material", summary: "Berechtigung prüfen und privaten Original-PDF-Link für 300 Sekunden ausstellen", security: auth, parameters: [
      { name: "redirect", in: "query", schema: { type: "string", enum: ["1"] }, description: "Optional: direkt zur Datei weiterleiten" },
      { name: "download", in: "query", schema: { type: "string", enum: ["1"] }, description: "Optional: Content-Disposition attachment" },
      { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "Optionale PDF-Seite beim Weiterleiten" },
    ], responses: { ...responses, "303": { description: "Weiterleitung zur privaten Originaldatei" }, "404": { description: "Material oder Originaldatei fehlt" } } },
  };
  return {
    openapi: "3.0.3",
    info: {
      title: "Semester Cockpit API",
      version: "1.1.0",
      description:
        "Nutzerbezogene Daten. Status und Testergebnisse sind getrennt. history ist automatisch und unveränderlich. Schreiben erfordert aktuelle Revision und Idempotency-Key. Authentifizierung über Supabase OAuth oder einen widerrufbaren Agent-Schlüssel.",
    },
    servers: [{ url: origin }],
    security: auth,
    components: {
      securitySchemes: { agentKey: { type: "http", scheme: "bearer" } },
      schemas: entitySchemas,
    },
    paths,
  };
}

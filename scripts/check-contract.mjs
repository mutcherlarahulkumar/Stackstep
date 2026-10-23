#!/usr/bin/env node
// Fails when an enum in api/openapi.yaml drifts from the Go, TypeScript or Dart sources.
// Usage: node scripts/check-contract.mjs <bundled-openapi.json>
import fs from "node:fs";

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const enums = (name) => spec.components.schemas[name].enum;
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const go = {
  Role: read("backend/internal/domain/domain.go"),
  TaskType: read("backend/internal/domain/task.go"),
  TaskStatus: read("backend/internal/domain/task.go"),
  EnrollmentStatus: read("backend/internal/domain/domain.go"),
  ErrorCode: read("backend/internal/apperr/apperr.go"),
  ReviewMode: read("backend/internal/domain/task.go"),
  PersonaColor: read("backend/internal/domain/catalog.go"),
  FlowVersionStatus: read("backend/internal/domain/catalog.go"),
  Author: read("backend/internal/domain/chat.go"),
  CreditReason: read("backend/internal/domain/wallet.go"),
  CertificateStatus: read("backend/internal/domain/certificate.go"),
  CohortKind: read("backend/internal/domain/people.go"),
};
const goType = {
  Role: "Role",
  TaskType: "TaskType",
  TaskStatus: "TaskStatus",
  EnrollmentStatus: "EnrollmentStatus",
  ErrorCode: "Code",
  ReviewMode: "ReviewMode",
  PersonaColor: "PersonaColor",
  FlowVersionStatus: "FlowVersionStatus",
  Author: "Author",
  CreditReason: "CreditReason",
  CertificateStatus: "CertificateStatus",
  CohortKind: "CohortKind",
};
const ts = read("web/src/lib/api/schemas.ts");
const tsConst = {
  Role: "ROLES",
  TaskType: "TASK_TYPES",
  TaskStatus: "TASK_STATUSES",
  EnrollmentStatus: "ENROLLMENT_STATUSES",
  ErrorCode: "ERROR_CODES",
  ReviewMode: "REVIEW_MODES",
  PersonaColor: "PERSONA_COLORS",
  FlowVersionStatus: "FLOW_VERSION_STATUSES",
  Author: "AUTHORS",
  CreditReason: "CREDIT_REASONS",
  CertificateStatus: "CERTIFICATE_STATUSES",
  CohortKind: "COHORT_KINDS",
};
const dart = read("mobile/lib/api/models.dart");
const dartEnum = { ...goType, ErrorCode: "ErrorCode" };

const sorted = (a) => [...a].sort().join(",");
let failed = false;
const check = (label, expected, actual) => {
  if (sorted(expected) !== sorted(actual)) {
    failed = true;
    console.error(`✗ ${label}\n    openapi: ${sorted(expected)}\n    source:  ${sorted(actual)}`);
  } else console.log(`✓ ${label}`);
};

for (const name of Object.keys(goType)) {
  const expected = enums(name);
  // Go declares values as typed constants, or as one `All… = []Type{...}` slice.
  const consts = [...go[name].matchAll(new RegExp(`\\s\\w+\\s+${goType[name]} = "([a-z_]+)"`, "g"))].map((m) => m[1]);
  const slice = new RegExp(`= \\[\\]${goType[name]}\\{([^}]*)\\}`).exec(go[name])?.[1] ?? "";
  const goVals = [...consts, ...[...slice.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])];
  check(`Go ${goType[name]}`, expected, goVals);

  const tsBlock = new RegExp(`export const ${tsConst[name]} = \\[([\\s\\S]*?)\\] as const`).exec(ts)?.[1] ?? "";
  check(`TypeScript ${tsConst[name]}`, expected, [...tsBlock.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));

  const dartBlock = new RegExp(`enum ${dartEnum[name]} \\{([\\s\\S]*?);`).exec(dart)?.[1] ?? "";
  check(`Dart ${dartEnum[name]}`, expected, [...dartBlock.matchAll(/\w+\('([a-z_]+)'/g)].map((m) => m[1]));
}
process.exit(failed ? 1 : 0);

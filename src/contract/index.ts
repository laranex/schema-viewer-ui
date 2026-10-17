export * from './types';
export { jsonSchema, SCHEMA_ID, VERSION_PATTERN } from './document';
export { assertDocument, InvalidDocumentError, UnsupportedDocumentError, validateDocument, type ValidationOptions, type ValidationResult } from './validate';
export { canonicalJson, documentRevision } from './serialize';
export { buildGraph, linkId, derivedLinkId, type GraphResult } from './graph';
export { comparisonId, diagnosticId, differenceId, inferredAssociationId, migrationTrackId } from './ids';
// Shared producer algorithms with conformance cases, like buildGraph. Viewers display the stored results and never
// call these to compute what they show.
export { compareScopes, COMPARISON_FEATURES, defaultSeverity, inScope, normalizeSql, normalizeType, type CompareOptions, type SeverityOverride } from './comparison';
export { migrationHistory, migrationState, type MigrationState } from './migration';
export { candidateKeys, inferAssociations } from './inference';
export { GATE_FORMAT, GATE_VERSION, gateReportJsonSchema, qualifies, validateGateReport, type GateError, type GateFinding, type GateReport, type GateValidationResult } from './gate';
export type { ViewerConfig, ViewerChange, ViewerDownload } from './viewer-config';

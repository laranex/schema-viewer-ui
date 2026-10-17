export * from './types';
export { jsonSchema, SCHEMA_ID, VERSION_PATTERN } from './document';
export { assertDocument, InvalidDocumentError, UnsupportedDocumentError, validateDocument, type ValidationOptions, type ValidationResult } from './validate';
export { canonicalJson, documentRevision } from './serialize';
export { buildGraph, linkId, derivedLinkId, type GraphResult } from './graph';
export { comparisonId, diagnosticId, differenceId, inferredAssociationId, migrationTrackId } from './ids';
// Shared producer algorithms with conformance cases, like buildGraph. Viewers display the stored results and never
// call these to compute what they show.
export {
    compareScopes,
    comparisonDiagnostics,
    COMPARISON_FEATURES,
    coverageGaps,
    coverageGapText,
    defaultSeverity,
    DIFFERENCE_FIELDS,
    expandComparisonRequests,
    inScope,
    normalizeSql,
    normalizeType,
    REQUEST_ERROR_KINDS,
    scopeCovered,
    storeComparisons,
    validateSeverityOverrides,
    WILDCARD,
    type CompareOptions,
    type CoverageGap,
    type ExpandedComparison,
    type RequestedComparison,
    type RequestError,
    type SeverityOverride,
} from './comparison';
export { migrationHistory, migrationState, type MigrationState } from './migration';
export { candidateKeys, inferAssociations } from './inference';
export { DEFAULT_THRESHOLDS, GATE_ERROR_KINDS, GATE_FORMAT, GATE_VERSION, gateDocument, gateReportJsonSchema, qualifies, validateGateReport, type GateError, type GateErrorKind, type GateFinding, type GateOptions, type GateReport, type GateThresholds, type GateValidationResult } from './gate';
export type { ViewerConfig, ViewerChange, ViewerDownload } from './viewer-config';

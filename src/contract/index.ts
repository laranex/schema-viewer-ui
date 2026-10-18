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
    spellScope,
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
// Snapshot scanning (contract/scan.mjs is its command line). Viewers never call it.
export {
    ALLOWLIST_FORMAT,
    ALLOWLIST_VERSION,
    allowlistDigest,
    allowlistJsonSchema,
    isScanCandidate,
    resolveAllowlist,
    SCAN_ERROR_KINDS,
    SCAN_FORMAT,
    SCAN_KINDS,
    SCAN_REASONS,
    SCAN_SCOPES,
    SCAN_SIZE_LIMIT,
    SCAN_STATUSES,
    SCAN_VERSION,
    scanContent,
    scanExitCode,
    scanFiles,
    scanMode,
    scanReportJsonSchema,
    validateAllowlist,
    validateScanReport,
    type Allowlist,
    type AllowlistEntry,
    type AllowlistInclude,
    type ResolvedAllowlist,
    type ScanContentOptions,
    type ScanError,
    type ScanErrorKind,
    type ScanFile,
    type ScanFinding,
    type ScanInput,
    type ScanKind,
    type ScanMatch,
    type ScanMode,
    type ScanReason,
    type ScanReport,
    type ScanScope,
    type ScanStatus,
} from './scan';

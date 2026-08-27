export type FrameworkReadinessStatus = "covered" | "partial" | "missing";

export type FrameworkReadinessScope = {
  businessId: string;
  period?: string;
  siteId?: string | null;
};

export type FrameworkReadinessRequirement = {
  id: string;
  requirementType: "metric" | "narrative" | "policy" | "target" | "risk" | "evidence";
};

export type FrameworkReadinessMapping = {
  frameworkRequirementId: string;
  metricDefinitionId: string;
  mappingStrength: "direct" | "partial" | "supporting";
};

export type FrameworkReadinessMetricDefinition = {
  id: string;
  evidenceRequired?: boolean | null;
};

export type FrameworkMetricFact = {
  businessId: string;
  valueId: string;
  metricDefinitionId: string;
  siteId: string | null;
  period: string | null;
  valueNumeric?: string | number | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
  approvalStatus?: string | null;
  periodCoverage?: "full" | "subperiod";
  evidenceCount?: number;
  approvedEvidenceCount?: number;
};

export type FrameworkRequirementEvidenceFact = {
  businessId: string;
  requirementId: string;
  siteId: string | null;
  period: string | null;
  evidenceStatus?: string | null;
};

export type FrameworkRequirementResponseFact = {
  businessId: string;
  requirementId: string;
  siteId: string | null;
  period: string | null;
  responseText?: string | null;
  linkedEntityType?: "policy" | "target" | "risk" | null;
  linkedEntityId?: string | null;
  responseStatus?: string | null;
  sourceIsEligible?: boolean;
};

export type FrameworkRequirementFactSummary = {
  mappedDefinitions: number;
  enteredValues: number;
  usableValues: number;
  approvedValues: number;
  subperiodValues: number;
  rejectedValues: number;
  evidencedValues: number;
  evidenceFiles: number;
  approvedEvidenceFiles: number;
  evidenceRequired: boolean;
  requirementLinkedEvidence: number;
  approvedRequirementLinkedEvidence: number;
  requirementResponses: number;
  validRequirementResponses: number;
  approvedRequirementResponses: number;
  submittedRequirementResponses: number;
  draftRequirementResponses: number;
  rejectedRequirementResponses: number;
  invalidRequirementResponses: number;
};

export type EvaluatedFrameworkRequirement = {
  status: FrameworkReadinessStatus;
  mappedMetricIds: string[];
  mappedMetricCount: number;
  factSummary: FrameworkRequirementFactSummary;
  additionalNeeded: string[];
};

const APPROVED_EVIDENCE_STATUSES = new Set(["approved", "reviewed"]);
const UNUSABLE_EVIDENCE_STATUSES = new Set(["deleted", "expired", "quarantined", "rejected"]);
const PARTIAL_RESPONSE_STATUSES = new Set(["draft", "submitted"]);

export function normalizeFrameworkMetricName(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    "natural gas consumption": "gas / fuel consumption",
  };
  return aliases[normalized] ?? normalized;
}

export function metricFactHasValue(fact: FrameworkMetricFact): boolean {
  if (fact.valueBoolean !== null && fact.valueBoolean !== undefined) return true;
  if (fact.valueNumeric !== null && fact.valueNumeric !== undefined && String(fact.valueNumeric).trim() !== "") return true;
  if (fact.valueText !== null && fact.valueText !== undefined && fact.valueText.trim() !== "") return true;
  return fact.valueJson !== null && fact.valueJson !== undefined;
}

export function isUsableEvidenceStatus(status: string | null | undefined): boolean {
  return !UNUSABLE_EVIDENCE_STATUSES.has((status ?? "pending").toLowerCase());
}

export function frameworkRequirementResponseIsValid(
  requirementType: FrameworkReadinessRequirement["requirementType"],
  response: FrameworkRequirementResponseFact,
): boolean {
  if (requirementType === "narrative") {
    return Boolean(response.responseText?.trim());
  }
  if (requirementType === "policy" || requirementType === "target" || requirementType === "risk") {
    return response.linkedEntityType === requirementType && Boolean(response.linkedEntityId) && response.sourceIsEligible === true;
  }
  return false;
}

export function frameworkResponseSourceIsEligible(input: {
  linkedEntityType: "policy" | "target" | "risk";
  status?: string | null;
  targetValue?: string | number | null;
  targetYear?: number | null;
  riskScore?: number | null;
}): boolean {
  if (input.linkedEntityType === "policy") {
    return input.status === "active";
  }
  if (input.linkedEntityType === "target") {
    return input.status !== "cancelled" && input.targetValue !== null && input.targetValue !== undefined && input.targetYear !== null && input.targetYear !== undefined;
  }
  return input.riskScore !== null && input.riskScore !== undefined;
}

function factMatchesScope(
  fact: { businessId: string; period: string | null; siteId: string | null },
  scope: FrameworkReadinessScope,
): boolean {
  if (fact.businessId !== scope.businessId) return false;
  if (scope.siteId !== undefined && fact.siteId !== scope.siteId) return false;
  if (scope.period !== undefined && fact.period !== scope.period) return false;
  return true;
}

function nonMetricRequirementPrompt(requirementType: FrameworkReadinessRequirement["requirementType"]): string {
  if (requirementType === "narrative") return "Add a requirement-linked narrative statement";
  if (requirementType === "policy") return "Link an approved policy record to this requirement";
  if (requirementType === "target") return "Link a quantified target to this requirement";
  if (requirementType === "risk") return "Link a completed risk assessment to this requirement";
  return "Upload evidence linked directly to this requirement";
}

export function evaluateFrameworkRequirement(input: {
  requirement: FrameworkReadinessRequirement;
  mappings: FrameworkReadinessMapping[];
  metricDefinitions: FrameworkReadinessMetricDefinition[];
  metricFacts: FrameworkMetricFact[];
  requirementEvidenceFacts?: FrameworkRequirementEvidenceFact[];
  requirementResponseFacts?: FrameworkRequirementResponseFact[];
  scope: FrameworkReadinessScope;
}): EvaluatedFrameworkRequirement {
  const definitionById = new Map(input.metricDefinitions.map((definition) => [definition.id, definition]));
  const mappings = input.mappings.filter((mapping) =>
    mapping.frameworkRequirementId === input.requirement.id && definitionById.has(mapping.metricDefinitionId),
  );
  const mappedMetricIds = Array.from(new Set(mappings.map((mapping) => mapping.metricDefinitionId)));
  const mappingStrengthByDefinition = new Map(
    mappings.map((mapping) => [mapping.metricDefinitionId, mapping.mappingStrength]),
  );

  const scopedMetricFacts = input.metricFacts.filter((fact) =>
    mappedMetricIds.includes(fact.metricDefinitionId) && factMatchesScope(fact, input.scope),
  );
  const enteredFacts = scopedMetricFacts.filter(metricFactHasValue);
  const rejectedFacts = enteredFacts.filter((fact) => fact.approvalStatus === "rejected");
  const usableFacts = enteredFacts.filter((fact) => fact.approvalStatus !== "rejected");
  const approvedFacts = usableFacts.filter((fact) => fact.approvalStatus === "approved");
  const subperiodFacts = usableFacts.filter((fact) => fact.periodCoverage === "subperiod");
  const evidencedFacts = usableFacts.filter((fact) => (fact.evidenceCount ?? 0) > 0);

  const requirementEvidence = (input.requirementEvidenceFacts ?? []).filter((fact) =>
    fact.requirementId === input.requirement.id &&
    factMatchesScope(fact, input.scope) &&
    isUsableEvidenceStatus(fact.evidenceStatus),
  );
  const approvedRequirementEvidence = requirementEvidence.filter((fact) =>
    APPROVED_EVIDENCE_STATUSES.has((fact.evidenceStatus ?? "").toLowerCase()),
  );

  const requirementResponses = (input.requirementResponseFacts ?? []).filter((fact) =>
    fact.requirementId === input.requirement.id && factMatchesScope(fact, input.scope),
  );
  const validRequirementResponses = requirementResponses.filter((fact) =>
    frameworkRequirementResponseIsValid(input.requirement.requirementType, fact),
  );
  const approvedRequirementResponses = validRequirementResponses.filter((fact) =>
    (fact.responseStatus ?? "").toLowerCase() === "approved",
  );
  const submittedRequirementResponses = validRequirementResponses.filter((fact) =>
    (fact.responseStatus ?? "").toLowerCase() === "submitted",
  );
  const draftRequirementResponses = validRequirementResponses.filter((fact) =>
    (fact.responseStatus ?? "draft").toLowerCase() === "draft",
  );
  const rejectedRequirementResponses = requirementResponses.filter((fact) =>
    (fact.responseStatus ?? "").toLowerCase() === "rejected",
  );
  const invalidRequirementResponses = requirementResponses.filter((fact) =>
    !frameworkRequirementResponseIsValid(input.requirement.requirementType, fact),
  );

  const evidenceRequired = mappedMetricIds.some((id) => Boolean(definitionById.get(id)?.evidenceRequired));
  const factSummary: FrameworkRequirementFactSummary = {
    mappedDefinitions: mappedMetricIds.length,
    enteredValues: enteredFacts.length,
    usableValues: usableFacts.length,
    approvedValues: approvedFacts.length,
    subperiodValues: subperiodFacts.length,
    rejectedValues: rejectedFacts.length,
    evidencedValues: evidencedFacts.length,
    evidenceFiles: usableFacts.reduce((total, fact) => total + (fact.evidenceCount ?? 0), 0),
    approvedEvidenceFiles: usableFacts.reduce((total, fact) => total + (fact.approvedEvidenceCount ?? 0), 0),
    evidenceRequired,
    requirementLinkedEvidence: requirementEvidence.length,
    approvedRequirementLinkedEvidence: approvedRequirementEvidence.length,
    requirementResponses: requirementResponses.length,
    validRequirementResponses: validRequirementResponses.length,
    approvedRequirementResponses: approvedRequirementResponses.length,
    submittedRequirementResponses: submittedRequirementResponses.length,
    draftRequirementResponses: draftRequirementResponses.length,
    rejectedRequirementResponses: rejectedRequirementResponses.length,
    invalidRequirementResponses: invalidRequirementResponses.length,
  };

  if (input.requirement.requirementType !== "metric") {
    let status: FrameworkReadinessStatus = "missing";
    if (input.requirement.requirementType === "evidence") {
      status = approvedRequirementEvidence.length > 0
        ? "covered"
        : requirementEvidence.length > 0
          ? "partial"
          : "missing";
    } else if (approvedRequirementResponses.length > 0) {
      status = "covered";
    } else if (
      validRequirementResponses.some((fact) => PARTIAL_RESPONSE_STATUSES.has((fact.responseStatus ?? "draft").toLowerCase())) ||
      invalidRequirementResponses.length > 0
    ) {
      status = "partial";
    }

    const additionalNeeded: string[] = [];
    if (status !== "covered") additionalNeeded.push(nonMetricRequirementPrompt(input.requirement.requirementType));
    if (input.requirement.requirementType === "evidence" && requirementEvidence.length > 0 && approvedRequirementEvidence.length === 0) {
      additionalNeeded.push("Review or approve the linked evidence");
    }
    if (input.requirement.requirementType !== "evidence") {
      if (invalidRequirementResponses.length > 0) {
        additionalNeeded.push("Replace or complete the linked source, then resubmit the response");
      } else if (submittedRequirementResponses.length > 0) {
        additionalNeeded.push("Approve the submitted requirement response");
      } else if (draftRequirementResponses.length > 0) {
        additionalNeeded.push("Submit and approve the requirement response");
      } else if (rejectedRequirementResponses.length > 0) {
        additionalNeeded.push("Revise and resubmit the rejected requirement response");
      }
    }

    return {
      status,
      mappedMetricIds,
      mappedMetricCount: mappedMetricIds.length,
      factSummary,
      additionalNeeded,
    };
  }

  const directApprovedFacts = approvedFacts.filter((fact) => {
    if (fact.periodCoverage === "subperiod") return false;
    if (mappingStrengthByDefinition.get(fact.metricDefinitionId) !== "direct") return false;
    const definition = definitionById.get(fact.metricDefinitionId);
    return !definition?.evidenceRequired || (fact.evidenceCount ?? 0) > 0;
  });

  const status: FrameworkReadinessStatus = directApprovedFacts.length > 0
    ? "covered"
    : usableFacts.length > 0
      ? "partial"
      : "missing";

  const additionalNeeded: string[] = [];
  if (mappedMetricIds.length === 0) {
    additionalNeeded.push("Map an active metric definition to this requirement");
  } else if (usableFacts.length === 0) {
    additionalNeeded.push("Enter a company value for a mapped metric in this scope and period");
  } else if (approvedFacts.length === 0) {
    additionalNeeded.push("Submit and approve the entered metric value");
  } else {
    const hasOnlySubperiodApprovedFacts = approvedFacts.some((fact) => fact.periodCoverage === "subperiod")
      && !approvedFacts.some((fact) => fact.periodCoverage !== "subperiod");
    const directApprovedWithoutRequiredEvidence = approvedFacts.some((fact) =>
      fact.periodCoverage !== "subperiod" &&
      mappingStrengthByDefinition.get(fact.metricDefinitionId) === "direct" &&
      Boolean(definitionById.get(fact.metricDefinitionId)?.evidenceRequired) &&
      (fact.evidenceCount ?? 0) === 0,
    );
    if (hasOnlySubperiodApprovedFacts) {
      additionalNeeded.push("Enter or approve a value covering the full reporting period; sub-period facts remain in progress");
    } else if (directApprovedWithoutRequiredEvidence) {
      additionalNeeded.push("Attach evidence to the approved metric value");
    } else if (!approvedFacts.some((fact) => mappingStrengthByDefinition.get(fact.metricDefinitionId) === "direct")) {
      additionalNeeded.push("Add a direct mapping or a requirement-specific disclosure");
    }
  }

  return {
    status,
    mappedMetricIds,
    mappedMetricCount: mappedMetricIds.length,
    factSummary,
    additionalNeeded,
  };
}

export function parseFrameworkReadinessPeriod(period: string): { start: Date; end: Date } | null {
  const annual = /^(\d{4})$/.exec(period);
  if (annual) {
    const year = Number(annual[1]);
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    };
  }

  const quarterly = /^(\d{4})-Q([1-4])$/i.exec(period);
  if (quarterly) {
    const year = Number(quarterly[1]);
    const startMonth = (Number(quarterly[2]) - 1) * 3;
    return {
      start: new Date(Date.UTC(year, startMonth, 1)),
      end: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999)),
    };
  }

  const monthly = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (monthly) {
    const year = Number(monthly[1]);
    const month = Number(monthly[2]) - 1;
    return {
      start: new Date(Date.UTC(year, month, 1)),
      end: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
    };
  }

  return null;
}

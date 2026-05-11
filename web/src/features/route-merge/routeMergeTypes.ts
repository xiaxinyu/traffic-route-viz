export type RouteMergeLevel = "safe" | "review" | "blocked";

export type RouteMergeKind = "Ingress" | "VirtualService";

export type RouteMergeRecommendation = {
  id: string;
  kind: RouteMergeKind;
  level: RouteMergeLevel;
  /** ns/name identifiers involved */
  resourceRefs: string[];
  rationale: string;
  estimatedLineDelta: number;
  warnings: string[];
  /** Only when level === safe */
  candidateYaml?: string;
  /** Impact summary for FR-2.9 */
  impact?: {
    keptResources: string[];
    mergedIntoName?: string;
    riskLabel: string;
  };
};

export type RouteMergeAnalysis = {
  recommendations: RouteMergeRecommendation[];
  v1RulesReminder: string;
};

export type RouteMergeAiSuggestion = {
  title: string;
  detail: string;
  risk?: string;
};

/** Parsed JSON from LLM (best-effort). */
export type RouteMergeAiPayload = {
  summary: string;
  ingressDomainNotes: string[];
  virtualServiceDomainNotes: string[];
  destinationRuleDomainNotes: string[];
  suggestions: RouteMergeAiSuggestion[];
  /** May be empty if model declines or only gives advice */
  optimizedYaml: string;
  disclaimer: string;
};

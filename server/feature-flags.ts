export const featureFlags = {
  portfolioEnabled: process.env.FEATURE_PORTFOLIO_ENABLED !== "false",
  estimationEnabled: process.env.FEATURE_ESTIMATION_ENABLED !== "false",
  reportGenerationEnabled: process.env.FEATURE_REPORT_GENERATION_ENABLED !== "false",
};

export type FeatureFlagName = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  return featureFlags[flag];
}

export function featureDisabledResponse(featureName: string): { status: number; body: object } {
  return {
    status: 503,
    body: {
      error: "Feature temporarily unavailable",
      code: "FEATURE_DISABLED",
      feature: featureName,
      message: `The '${featureName}' feature is currently disabled. Please contact your administrator or try again later.`,
    },
  };
}

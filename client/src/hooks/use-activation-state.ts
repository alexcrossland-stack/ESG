import { useQuery } from "@tanstack/react-query";

export type ActivationState = {
  hasCompletedOnboarding: boolean;
  hasAddedData: boolean;
  hasUploadedEvidence: boolean;
  hasGeneratedReport: boolean;
  activationComplete: boolean;
  overallPercent: number;
  completedCount: number;
  totalSteps: number;
  steps: Array<{
    key: string;
    label: string;
    complete: boolean;
    actionUrl: string;
    description: string;
  }>;
  nextStep: { key: string; label: string; actionUrl: string; description: string } | null;
  dismissedAt: string | null;
};

const EMPTY_STATE: ActivationState = {
  hasCompletedOnboarding: false,
  hasAddedData: false,
  hasUploadedEvidence: false,
  hasGeneratedReport: false,
  activationComplete: false,
  overallPercent: 0,
  completedCount: 0,
  totalSteps: 6,
  steps: [],
  nextStep: null,
  dismissedAt: null,
};

export function useActivationState() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/onboarding/status"],
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  if (!data || isLoading) return { ...EMPTY_STATE, isLoading };

  const state: ActivationState = {
    hasCompletedOnboarding: !!data.onboardingComplete,
    hasAddedData: !!data.hasAddedData,
    hasUploadedEvidence: !!data.hasUploadedEvidence,
    hasGeneratedReport: !!data.hasGeneratedReport,
    activationComplete: !!data.activationComplete,
    overallPercent: data.overallPercent ?? 0,
    completedCount: data.completedCount ?? 0,
    totalSteps: data.totalSteps ?? 6,
    steps: data.steps ?? [],
    nextStep: data.nextStep ?? null,
    dismissedAt: data.dismissedAt ?? null,
  };

  return { ...state, isLoading, refetch };
}

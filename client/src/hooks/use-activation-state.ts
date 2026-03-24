import { useQuery } from "@tanstack/react-query";

export type ActivationStep = {
  key: string;
  label: string;
  complete: boolean;
  actionUrl: string;
  description: string;
  why?: string;
};

export type ActivationState = {
  hasCompletedOnboarding: boolean;
  hasAddedData: boolean;
  hasUploadedEvidence: boolean;
  hasGeneratedReport: boolean;
  activationComplete: boolean;
  overallPercent: number;
  completedCount: number;
  totalSteps: number;
  steps: ActivationStep[];
  nextStep: ActivationStep | null;
  dismissedAt: string | null;
  activationSteps: ActivationStep[];
  activationPercent: number;
  activationCompletedCount: number;
  activationNextStep: ActivationStep | null;
  isLoading: boolean;
  isError: boolean;
};

const EMPTY_STATE: Omit<ActivationState, "isLoading" | "isError"> = {
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
  activationSteps: [],
  activationPercent: 0,
  activationCompletedCount: 0,
  activationNextStep: null,
};

export function useActivationState() {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/onboarding/status"],
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return { ...EMPTY_STATE, isLoading: isLoading || !data, isError };
  }

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
    activationSteps: data.activationSteps ?? [],
    activationPercent: data.activationPercent ?? 0,
    activationCompletedCount: data.activationCompletedCount ?? 0,
    activationNextStep: data.activationNextStep ?? null,
    isLoading: false,
    isError: false,
  };

  return { ...state, refetch };
}

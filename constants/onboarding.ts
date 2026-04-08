export const ONBOARDING_STATUS_KEY = '@garage_connect_onboarding_v1';

export type OnboardingStatus = {
  completed: boolean;
  skipped: boolean;
  completedAt: string;
};


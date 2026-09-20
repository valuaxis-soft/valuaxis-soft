export type EffectiveFeature = {
  key: string;
  included: boolean;
  unlimited: boolean;
  limit: bigint | null;
  period: string | null;
};

export type AuthorizationContext = {
  userId: number;
  organizationId: number;
  role: string;
  permissions: Set<string>;
  subscription: {
    status: string | null;
    plan: string | null;
  };
  features: Map<string, EffectiveFeature>;
};

export function needsOnboarding(user) {
  return ['not_started', 'in_progress'].includes(user?.onboarding?.status);
}

export function getPostAuthDestination(user, explicitDestination) {
  if (explicitDestination) return explicitDestination;
  return needsOnboarding(user) ? '/onboarding' : '/pulse';
}

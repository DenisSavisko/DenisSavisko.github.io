export const SUPPORT_EMAIL = 'support@mymaingoals.app';

export function generalSupportMailto(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('MyMainGoals support')}`;
}

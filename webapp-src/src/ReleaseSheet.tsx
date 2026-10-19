import { Button, Sheet } from 'konsta/react';
import { formatStakeCents, type Goal } from './useGoals';
import { stakeSupportMailto } from './support';

/// For a missed goal whose hold is still held. There's no self-serve release: this explains
/// that and hands off to support with the stake's details filled in. Kept as an obvious
/// button so someone who missed the "goal missed" email writes to us instead of their bank.
export function ReleaseSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const amount = goal?.stakeAmountCents != null ? formatStakeCents(goal.stakeAmountCents) : '';
  const supportHref =
    goal?.stakeAmountCents != null && goal.stripePaymentIntentId
      ? stakeSupportMailto({ goalTitle: goal.title, amountCents: goal.stakeAmountCents, paymentIntentId: goal.stripePaymentIntentId })
      : null;
  return (
    <Sheet opened={goal != null} onBackdropClick={onClose} className="mx-auto max-w-(--k-app-max-w)">
      <div className="px-6 pb-10 pt-10 text-center">
        <h2 className="text-lg font-semibold">{amount} will be charged</h2>
        <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">
          "{goal?.title}" wasn't marked done by its deadline. Forgetting to mark it done counts as missing it.
        </p>
        <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">
          Something went wrong? Contact support. Keep in mind that after 3 releases on request, you can't stake anymore.
        </p>
        {supportHref && (
          <Button large rounded className="mt-6" component="a" href={supportHref}>
            Contact Support
          </Button>
        )}
        <Button large rounded clear className="mt-2" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

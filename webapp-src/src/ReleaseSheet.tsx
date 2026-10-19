import { useEffect, useState } from 'react';
import { Button, Preloader, Sheet } from 'konsta/react';
import { ensureSignedIn } from './supabase';
import { freeRelease, getFreeReleaseInfo, type FreeReleaseInfo } from './staking';
import { formatDeadline, formatStakeCents } from './useGoals';
import { stakeSupportMailto } from './support';

type Phase = 'loading' | 'ready' | 'releasing' | 'released' | 'error';

/// The free release for a missed goal: from the Release button on a failed goal, or the
/// "goal missed" email's link (#release/<paymentIntentId>), which works signed out, since
/// whoever has the email's link is the payer.
export function ReleaseSheet({
  paymentIntentId,
  onClose,
  onReleased,
}: {
  paymentIntentId: string | null;
  onClose: () => void;
  onReleased?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<FreeReleaseInfo | null>(null);

  async function load(id: string, isCancelled: () => boolean = () => false) {
    try {
      await ensureSignedIn();
      const result = await getFreeReleaseInfo(id);
      if (isCancelled()) return;
      setInfo(result);
      setPhase('ready');
    } catch {
      if (!isCancelled()) setPhase('error');
    }
  }

  useEffect(() => {
    if (!paymentIntentId) return;
    setPhase('loading');
    setInfo(null);
    let cancelled = false;
    load(paymentIntentId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [paymentIntentId]);

  async function release() {
    if (!paymentIntentId) return;
    setPhase('releasing');
    try {
      const result = await freeRelease(paymentIntentId);
      if (result.status === 'released') {
        setPhase('released');
        onReleased?.();
        return;
      }
    } catch {
      // Most likely the free release was used up meanwhile: reloading shows the real state.
    }
    await load(paymentIntentId);
  }

  const amount = info ? formatStakeCents(info.amountCents) : '';
  const supportHref =
    info && paymentIntentId
      ? stakeSupportMailto({ goalTitle: info.goalTitle, amountCents: info.amountCents, paymentIntentId })
      : null;

  /// For when the free release can't help: none left, or already charged.
  function contactSupport() {
    if (!supportHref) return null;
    return (
      <>
        <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">
          Something went wrong on our side? Let us know.
        </p>
        <Button large rounded tonal className="mt-6" component="a" href={supportHref}>
          Contact Support
        </Button>
      </>
    );
  }
  const goal = info?.goalTitle ? `"${info.goalTitle}"` : 'This goal';

  function body() {
    if (phase === 'loading' || phase === 'releasing') {
      return (
        <div className="flex justify-center py-6">
          <Preloader />
        </div>
      );
    }
    if (phase === 'error' || !info) {
      return <p className="text-sm text-ios-secondary dark:text-ios-secondary-dark">Couldn't load this stake. Try again later.</p>;
    }
    if (phase === 'released') {
      return (
        <>
          <h2 className="text-lg font-semibold">{amount} released</h2>
          <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">
            You won't be charged. Your bank may take a few days to clear the pending charge.
          </p>
        </>
      );
    }
    if (info.status === 'captured') {
      return (
        <>
          <h2 className="text-lg font-semibold">{amount} was charged</h2>
          {contactSupport()}
        </>
      );
    }
    if (info.status !== 'held') {
      return <h2 className="text-lg font-semibold">This stake is already settled</h2>;
    }
    if (new Date(info.deadline) > new Date()) {
      return <h2 className="text-lg font-semibold">This goal isn't missed yet</h2>;
    }
    const chargeLine = `${goal} was missed, so ${amount} will be charged after ${formatDeadline(new Date(info.chargeAt))}.`;
    if (!info.freeReleaseAvailable) {
      return (
        <>
          <h2 className="text-lg font-semibold">No free release left</h2>
          <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">
            {chargeLine}{' '}
            {info.nextFreeReleaseAt
              ? `Your next free release is available ${formatDeadline(new Date(info.nextFreeReleaseAt))}.`
              : ''}
          </p>
          {contactSupport()}
        </>
      );
    }
    return (
      <>
        <h2 className="text-lg font-semibold">Release {amount}?</h2>
        <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">{chargeLine}</p>
        <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">
          This uses your free release. You get one every 30 days.
        </p>
        <Button large rounded className="mt-6" onClick={release}>
          Release {amount}
        </Button>
      </>
    );
  }

  return (
    <Sheet opened={paymentIntentId != null} onBackdropClick={onClose} className="mx-auto max-w-(--k-app-max-w)">
      <div className="px-6 pb-10 pt-10 text-center">
        {body()}
        <Button large rounded clear className="mt-2" onClick={onClose}>
          {phase === 'ready' && info?.status === 'held' && info.freeReleaseAvailable ? 'Cancel' : 'Done'}
        </Button>
      </div>
    </Sheet>
  );
}

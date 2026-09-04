import { Button, Sheet } from 'konsta/react';
import { formatStakeCents } from './useGoals';

export interface ShareVerificationTarget {
  title: string;
  deadline: Date;
  stakeAmountCents: number | null;
  token: string;
}

/// Mirrors VerificationShareMessage.text on iOS — same wording, same explicit "https://"
/// (NSDataDetector/link-preview reasoning there applies just as much to any other messaging
/// app a link gets pasted into), and the same real Universal Link path (not the /webapp hash
/// route — this is the canonical link meant for sharing).
function shareMessage(target: ShareVerificationTarget): string {
  const url = `https://mymaingoals.app/verify/${target.token}`;
  const deadlineText = target.deadline.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const title = target.title.trim();
  if (target.stakeAmountCents != null) {
    const amount = formatStakeCents(target.stakeAmountCents);
    return `I will do '${title}' by ${deadlineText}, or lose ${amount}. You're the judge — confirm here once you've seen it done: ${url}`;
  }
  return `I will do '${title}' by ${deadlineText}. You're the judge — confirm here once you've seen it done: ${url}`;
}

/// Mirrors ShareVerificationPrompt on iOS — shown both right after creating a
/// verification-gated goal, and when tapping done on one that's still unverified.
export function ShareVerificationSheet({
  target,
  headline,
  message,
  onClose,
}: {
  target: ShareVerificationTarget | null;
  headline: string;
  message: string;
  onClose: () => void;
}) {
  const canShare = typeof navigator.share === 'function';

  async function share() {
    if (!target) return;
    const text = shareMessage(target);
    if (canShare) {
      try {
        await navigator.share({ text });
      } catch {
        // User cancelled the share sheet — not an error.
      }
    } else {
      await navigator.clipboard.writeText(text);
    }
  }

  return (
    <Sheet opened={target != null} onBackdropClick={onClose} className="mx-auto max-w-(--k-app-max-w)">
      <div className="px-6 pb-10 pt-10 text-center">
        <h2 className="text-lg font-semibold">{headline}</h2>
        <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">{message}</p>
        <Button large rounded className="mt-6" onClick={share}>
          {canShare ? 'Share Task' : 'Copy Link'}
        </Button>
        <Button large rounded clear className="mt-2" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

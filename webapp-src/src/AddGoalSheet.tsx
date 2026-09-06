import { useEffect, useMemo, useState } from 'react';
import { Navbar, Preloader, Segmented, SegmentedButton, Sheet, Toggle } from 'konsta/react';
import { createGoal, getCloudKitContainer } from './cloudkit';
import { createVerification } from './verification';
import { ensureSignedIn } from './supabase';
import { createHold, StakingError } from './staking';
import { createLinkCardSession, formatCard, getLinkedCard, type LinkedCard } from './paymentMethods';
import { formatDeadline, formatStakeCents, mapRecord, type Goal } from './useGoals';
import { STAKE_OPTIONS, type StakeOptionId } from './stripeConfig';

/// Mirrors AddTaskSheet's DeadlineOption exactly: a small set of relative offsets, not a
/// precise date/time picker — goals are a rough estimate, not a reminder (see that enum's own
/// comment). Skips the debug-only "1 minute" option: there's no debug-vs-release build
/// concept for a deployed website, and this is otherwise the production option set.
const DEADLINE_OPTIONS = [
  { id: '1h', label: '1h', ms: 60 * 60 * 1000 },
  { id: '1d', label: '1d', ms: 24 * 60 * 60 * 1000 },
  { id: '3d', label: '3d', ms: 3 * 24 * 60 * 60 * 1000 },
  { id: '5d', label: '5d', ms: 5 * 24 * 60 * 60 * 1000 },
] as const;
type DeadlineOptionId = (typeof DEADLINE_OPTIONS)[number]['id'];

/// Mirrors AddTaskSheet on iOS (PAYMENTS_PLAN.md v2). No Stripe Elements, no payment sheet,
/// no card entry: a card is linked once at #link-card, and creating a staked goal is a plain
/// call to create-hold that charges nothing at the time.
export function AddGoalSheet({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (goal: Goal) => void;
}) {
  const [title, setTitle] = useState('');
  const [deadlineOptionId, setDeadlineOptionId] = useState<DeadlineOptionId>('1d'); // matches selectedDeadlineOption's default of .oneDay
  const [stakeOptionId, setStakeOptionId] = useState<StakeOptionId>('none');
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mirrors AddTaskSheet's linkedCard/hasCheckedForLinkedCard pair — null covers both "no
  // card" and "haven't looked yet", so the second flag is what tells the gate apart from the
  // loading state.
  const [linkedCard, setLinkedCard] = useState<LinkedCard | null>(null);
  const [hasCheckedForLinkedCard, setHasCheckedForLinkedCard] = useState(false);
  const [isLinkingCard, setIsLinkingCard] = useState(false);

  const stakeOption = STAKE_OPTIONS.find((o) => o.id === stakeOptionId)!;
  const isStaked = stakeOption.cents > 0;

  // Recomputed on every render rather than fixed at selection time — same effect as iOS's
  // `deadline = Date().addingTimeInterval(newValue.interval)` firing fresh each time the
  // option changes, since the sheet's open duration is short enough that "now" barely drifts.
  const deadline = useMemo(() => {
    const option = DEADLINE_OPTIONS.find((o) => o.id === deadlineOptionId)!;
    return new Date(Date.now() + option.ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineOptionId]);

  const isValid = title.trim() !== '';
  const isBusy = isSaving || isLinkingCard;

  // Checked every time the sheet opens rather than once on mount: the user may have linked a
  // card since (the #link-card route takes over the whole page and comes back here), and
  // create-hold rejects a stake with no card on file.
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    setHasCheckedForLinkedCard(false);
    ensureSignedIn()
      .then(() => getLinkedCard())
      .then((card) => {
        if (cancelled) return;
        if (!card) clearStakeSelection();
        setLinkedCard(card);
        setHasCheckedForLinkedCard(true);
      })
      .catch(() => {
        // A lookup that failed (offline, transient) isn't proof there's no card, but on a
        // first open there's nothing else to show — "Enable Stakes" re-checks anyway.
        if (cancelled) return;
        setHasCheckedForLinkedCard(true);
      });
    return () => {
      cancelled = true;
    };
  }, [opened]);

  /// The stake picker is hidden whenever no card is on file, so a selection left behind from
  /// before would be stuck — unchangeable and still submitted on Add.
  function clearStakeSelection() {
    setStakeOptionId('none');
    setRequiresVerification(false);
  }

  function reset() {
    setTitle('');
    setDeadlineOptionId('1d');
    setStakeOptionId('none');
    setRequiresVerification(false);
    setErrorMessage(null);
    setIsSaving(false);
  }

  function close() {
    reset();
    onClose();
  }

  /// Mirrors AddTaskSheet.handleAddTapped's verification step — create_verification always
  /// runs first (if requested), before the hold, so the token exists to attach to the staked
  /// goal's record no matter how goal creation completes.
  async function obtainVerificationToken(): Promise<string | null> {
    if (!requiresVerification) return null;
    await ensureSignedIn();
    return createVerification(title.trim(), stakeOption.cents || null, deadline);
  }

  /// Mirrors GoalTask never being inserted locally until the backend hold is confirmed
  /// (TaskStore.addStakedTask's own comment) — this only ever runs after create-hold has
  /// already succeeded.
  async function finishCreatingGoal(verificationToken: string | null, stake: { amountCents: number; paymentIntentId: string } | null) {
    const container = getCloudKitContainer();
    const record = await createGoal(container, {
      title: title.trim(),
      deadline,
      verificationCode: verificationToken,
      stake,
    });
    onCreated(mapRecord(record));
    close();
  }

  /// Mirrors AddTaskSheet.handleEnableStakesTapped. Navigates to the #link-card route rather
  /// than opening a new tab — it's the same static page, and coming back is a hash change.
  async function handleEnableStakes() {
    setIsLinkingCard(true);
    setErrorMessage(null);
    try {
      await ensureSignedIn();
      const session = await createLinkCardSession();
      window.location.hash = `#link-card/${session.token}`;
    } catch (error) {
      setErrorMessage((error as Error).message || "Couldn't start payment setup. Please try again.");
    } finally {
      setIsLinkingCard(false);
    }
  }

  /// Mirrors AddTaskSheet.handleAddTapped: unstaked goals are a straight CloudKit write;
  /// staked ones place the hold first and only write the record if it succeeds. Nothing here
  /// shows payment UI — that all happened once, earlier, at #link-card.
  function handleAddTapped() {
    if (!isValid) return;
    setIsSaving(true);
    setErrorMessage(null);
    obtainVerificationToken()
      .then(async (verificationToken) => {
        if (!isStaked) return finishCreatingGoal(verificationToken, null);
        const hold = await createHold(stakeOption.cents, deadline);
        return finishCreatingGoal(verificationToken, { amountCents: stakeOption.cents, paymentIntentId: hold.paymentIntentId });
      })
      .catch((error) => {
        if (error instanceof StakingError) {
          // All three codes mean the saved card can't back this stake — dropping linkedCard
          // swaps the picker back for the "Enable Stakes" button, which is the route out.
          setLinkedCard(null);
          clearStakeSelection();
          setErrorMessage(
            error.code === 'card_declined'
              ? 'Your card was declined. Add a different one to keep staking.'
              : error.code === 'card_authentication_required'
                ? 'Your bank needs to confirm this card again. Add it once more to keep staking.'
                : "Your payment method isn't set up yet. Tap Enable Stakes to add one."
          );
        } else {
          setErrorMessage((error as Error).message || "Couldn't create this goal. Please try again.");
        }
        setIsSaving(false);
      });
  }

  if (!opened) return null;

  return (
    <Sheet opened={opened} onBackdropClick={close} className="mx-auto max-w-(--k-app-max-w)">
      {/* Mirrors AddTaskSheet's toolbar exactly: Cancel top-left (.cancellationAction), "New
          Goal" centered title, Add top-right (.confirmationAction) swapped for a spinner
          while busy — not stacked full-width buttons at the bottom. */}
      <Navbar
        title="New Goal"
        left={
          <button onClick={close} className="px-2 text-primary">
            Cancel
          </button>
        }
        right={
          isBusy ? (
            <div className="flex items-center justify-center px-2">
              <Preloader />
            </div>
          ) : (
            <button onClick={handleAddTapped} disabled={!isValid} className={`px-2 font-semibold ${isValid ? 'text-primary' : 'text-black/30 dark:text-white/30'}`}>
              Add
            </button>
          )
        }
      />

      <div className="px-4 pb-10 pt-4">
        {/* Plain input styled to match Stake/Deadline's label+control pattern below, rather
            than Konsta's ListInput/List card styling (its own label position/inset margin
            didn't line up with everything else on this sheet). */}
        <p className="mb-2 px-4 text-xs font-medium uppercase text-ios-secondary dark:text-ios-secondary-dark">Title</p>
        <input
          type="text"
          placeholder="What do you want to do?"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          className="w-full rounded-2xl border border-black/10 bg-transparent px-4 py-3 text-base text-black outline-none dark:border-white/15 dark:text-white"
        />

        {/* Mirrors AddTaskSheet's Section("Stake") — gated on a card being on file, since a
            stake with nothing to collect against isn't a commitment. */}
        <p className="mb-2 mt-6 px-4 text-xs font-medium uppercase text-ios-secondary dark:text-ios-secondary-dark">Stake</p>
        {linkedCard ? (
          <>
            <Segmented strong>
              {STAKE_OPTIONS.map((option) => (
                <SegmentedButton
                  key={option.id}
                  active={stakeOptionId === option.id}
                  onClick={() => {
                    setStakeOptionId(option.id);
                    if (option.id === 'none') setRequiresVerification(false);
                  }}
                >
                  {option.label}
                </SegmentedButton>
              ))}
            </Segmented>
            {isStaked && (
              <p className="mt-2 px-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">
                If you miss the deadline, {formatStakeCents(stakeOption.cents)} is charged to {formatCard(linkedCard)}.
                Completing in time refunds it in full.
              </p>
            )}
          </>
        ) : hasCheckedForLinkedCard ? (
          <>
            <button
              onClick={handleEnableStakes}
              disabled={isBusy}
              className="w-full rounded-2xl border border-black/10 px-4 py-3 text-base font-semibold text-primary dark:border-white/15"
            >
              Enable Stakes
            </button>
            <p className="mt-2 px-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">
              Staking needs a payment method. Nothing is charged when you add one — a stake is only collected if you miss
              your own deadline.
            </p>
          </>
        ) : (
          <p className="px-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">Checking for a payment method…</p>
        )}

        {/* Mirrors AddTaskSheet's Section("Deadline") — a segmented control of relative
            offsets, not a date/time picker. */}
        <p className="mb-2 mt-6 px-4 text-xs font-medium uppercase text-ios-secondary dark:text-ios-secondary-dark">Deadline</p>
        <Segmented strong>
          {DEADLINE_OPTIONS.map((option) => (
            <SegmentedButton key={option.id} active={deadlineOptionId === option.id} onClick={() => setDeadlineOptionId(option.id)}>
              {option.label}
            </SegmentedButton>
          ))}
        </Segmented>
        <p className="mt-2 px-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">Due around {formatDeadline(deadline)}</p>

        {/* Mirrors AddTaskSheet's Section("Verification") — only ever shown once staked,
            same as iOS's `if isStaked { Toggle(...) }`. Plain row, not Konsta's List/ListItem
            — same reasoning as Title above: List's own insetIos margin plus ListItem's own
            internal padding double up to a ~32px left inset, out of step with every other
            field's flat px-4. */}
        {isStaked && (
          <>
            <p className="mb-2 mt-6 px-4 text-xs font-medium uppercase text-ios-secondary dark:text-ios-secondary-dark">Verification</p>
            <div className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
              <span className="text-base text-black dark:text-white">Require confirmation from someone else</span>
              <Toggle checked={requiresVerification} onChange={() => setRequiresVerification((v) => !v)} />
            </div>
            {requiresVerification && (
              <p className="mt-2 px-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">
                Anyone with the link can see this goal's title and stake, and can confirm it for you. Only share it with someone
                you trust.
              </p>
            )}
          </>
        )}

        {errorMessage && <p className="mt-4 px-2 text-center text-sm text-red-500">{errorMessage}</p>}
      </div>
    </Sheet>
  );
}

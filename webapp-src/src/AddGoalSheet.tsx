import { useEffect, useMemo, useRef, useState } from 'react';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import { List, ListItem, Navbar, Preloader, Segmented, SegmentedButton, Sheet, Toggle } from 'konsta/react';
import { createGoal, getCloudKitContainer } from './cloudkit';
import { createVerification } from './verification';
import { ensureSignedIn } from './supabase';
import { createHold } from './staking';
import { formatDeadline, formatStakeCents, mapRecord, type Goal } from './useGoals';
import { STAKE_OPTIONS, stripePromise, type StakeOptionId } from './stripeConfig';
import type { ShareVerificationTarget } from './ShareVerificationSheet';

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

/// Mirrors AddTaskSheet on iOS. Wraps the form in <Elements> unconditionally (harmless when
/// unstaked — useStripe()/useElements() are just unused then) so the same component can use
/// Stripe's hooks without a conditional-provider/ref-lifting dance.
export function AddGoalSheet({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (goal: Goal) => void;
}) {
  return (
    <Elements stripe={stripePromise}>
      <AddGoalForm opened={opened} onClose={onClose} onCreated={onCreated} />
    </Elements>
  );
}

function AddGoalForm({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (goal: Goal) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [step, setStep] = useState<'form' | 'card'>('form');
  const [title, setTitle] = useState('');
  const [deadlineOptionId, setDeadlineOptionId] = useState<DeadlineOptionId>('1d'); // matches selectedDeadlineOption's default of .oneDay
  const [stakeOptionId, setStakeOptionId] = useState<StakeOptionId>('none');
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [canUseApplePay, setCanUseApplePay] = useState(false);

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

  // The paymentmethod/cancel handlers below are registered once (see the PaymentRequest
  // effect, which only depends on `stripe`) so they'd otherwise close over stale
  // title/deadline/requiresVerification/stakeOption from whenever the component last
  // rendered when the effect ran — this ref sidesteps that without recreating the
  // PaymentRequest (and re-running canMakePayment(), the exact delay being fixed below) every
  // time any of those change.
  const latest = useRef({ title, deadline, requiresVerification, stakeOption });
  latest.current = { title, deadline, requiresVerification, stakeOption };

  function reset() {
    setStep('form');
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
  /// runs first (if requested), before any payment, so the token exists to attach to the
  /// staked goal's record no matter which payment path completes it.
  async function obtainVerificationToken(): Promise<string | null> {
    if (!latest.current.requiresVerification) return null;
    await ensureSignedIn();
    return createVerification(latest.current.title.trim(), latest.current.stakeOption.cents || null, latest.current.deadline);
  }

  /// Mirrors GoalTask never being inserted locally until the backend hold is confirmed
  /// (TaskStore.addStakedTask's own comment) — this only ever runs after create-hold (and any
  /// required 3D Secure confirmation) has already succeeded.
  async function finishCreatingGoal(verificationToken: string | null, stake: { amountCents: number; paymentIntentId: string } | null) {
    const container = getCloudKitContainer();
    const record = await createGoal(container, {
      title: latest.current.title.trim(),
      deadline: latest.current.deadline,
      verificationCode: verificationToken,
      stake,
    });
    onCreated(mapRecord(record));
    close();
  }

  /// Shared by both payment paths (typed card, Apple Pay) — create-hold confirms the
  /// PaymentIntent server-side but a card can still come back requires_action (3D Secure),
  /// which only the client can resolve (mirrors ApplePayContext using the same clientSecret
  /// internally on iOS).
  async function chargeAndFinish(paymentMethodId: string, verificationToken: string | null) {
    const { stakeOption: currentStake, deadline: currentDeadline } = latest.current;
    const hold = await createHold(paymentMethodId, currentStake.cents, currentDeadline);
    if (hold.status === 'requires_action') {
      if (!stripe) throw new Error('Payment could not be confirmed.');
      const { error, paymentIntent } = await stripe.confirmCardPayment(hold.clientSecret);
      if (error) throw new Error(error.message ?? 'Payment could not be confirmed.');
      if (paymentIntent?.status !== 'succeeded' && paymentIntent?.status !== 'requires_capture') {
        throw new Error('Payment could not be confirmed.');
      }
    }
    await finishCreatingGoal(verificationToken, { amountCents: currentStake.cents, paymentIntentId: hold.paymentIntentId });
  }

  // Set up once `stripe` is ready — not gated on isStaked — so canMakePayment()'s round trip
  // (a real async browser call) is already resolved by the time a stake is picked, instead of
  // the Apple Pay button popping in a moment after switching away from "None". The total
  // starts at a placeholder and gets kept in sync by the effect below; canMakePayment() only
  // checks wallet availability, not the exact amount, so this doesn't affect that check.
  useEffect(() => {
    if (!stripe) {
      setPaymentRequest(null);
      setCanUseApplePay(false);
      return;
    }
    const pr = stripe.paymentRequest({
      country: 'US',
      currency: 'usd',
      total: { label: 'Goal Stake (refundable)', amount: STAKE_OPTIONS[1].cents },
    });
    let cancelled = false;
    pr.canMakePayment().then((result) => {
      if (!cancelled) setCanUseApplePay(!!result);
    });
    pr.on('paymentmethod', async (ev) => {
      try {
        const verificationToken = await obtainVerificationToken();
        await chargeAndFinish(ev.paymentMethod.id, verificationToken);
        ev.complete('success');
      } catch (error) {
        ev.complete('fail');
        setIsSaving(false);
        setErrorMessage((error as Error).message || "Couldn't process payment. Please try again.");
      }
    });
    pr.on('cancel', () => {
      setIsSaving(false);
    });
    setPaymentRequest(pr);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

  // Keeps the Apple Pay sheet's displayed total accurate as the stake selection changes,
  // without recreating the PaymentRequest (which would re-trigger canMakePayment() and risk
  // the same pop-in this is meant to avoid).
  useEffect(() => {
    paymentRequest?.update({ total: { label: 'Goal Stake (refundable)', amount: stakeOption.cents || STAKE_OPTIONS[1].cents } });
  }, [paymentRequest, stakeOption.cents]);

  /// Mirrors AddTaskSheet.handleAddTapped: unstaked submits directly; staked hands off to
  /// whichever payment path is available — Apple Pay's native sheet if it can, a card-entry
  /// step (this app's closest equivalent, there's no browser-native card popup) if not —
  /// rather than showing payment fields inline while the rest of the form is still being
  /// filled in.
  function handleAddTapped() {
    if (!isValid) return;
    if (!isStaked) {
      setIsSaving(true);
      setErrorMessage(null);
      obtainVerificationToken()
        .then((token) => finishCreatingGoal(token, null))
        .catch((error) => {
          setErrorMessage((error as Error).message || "Couldn't create this goal. Please try again.");
          setIsSaving(false);
        });
      return;
    }
    if (canUseApplePay && paymentRequest) {
      // Must be called synchronously from this click handler, with no `await` before it —
      // browsers only allow PaymentRequest.show() as a direct result of a user gesture.
      // Everything after payment (verification token, create-hold, the CloudKit write) runs
      // in the paymentmethod handler registered above instead, which has no such restriction.
      setIsSaving(true);
      setErrorMessage(null);
      paymentRequest.show();
      return;
    }
    setStep('card');
  }

  async function handlePayWithCard() {
    if (!stripe || !elements) {
      setErrorMessage('Payment is still loading — try again in a moment.');
      return;
    }
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const { paymentMethod, error } = await stripe.createPaymentMethod({ type: 'card', card: cardElement });
      if (error || !paymentMethod) throw new Error(error?.message ?? 'Card could not be processed.');
      const verificationToken = await obtainVerificationToken();
      await chargeAndFinish(paymentMethod.id, verificationToken);
    } catch (error) {
      setErrorMessage((error as Error).message || "Couldn't create this goal. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!opened) return null;

  if (step === 'card') {
    return (
      <Sheet opened={opened} onBackdropClick={close} className="mx-auto max-w-(--k-app-max-w)">
        <Navbar
          title="Card Details"
          left={
            <button onClick={() => setStep('form')} disabled={isSaving} className="px-2 text-primary">
              Back
            </button>
          }
          right={
            isSaving ? (
              <div className="flex items-center justify-center px-2">
              <Preloader />
            </div>
            ) : (
              <button onClick={handlePayWithCard} className="px-2 font-semibold text-primary">
                Pay {formatStakeCents(stakeOption.cents)}
              </button>
            )
          }
        />
        <div className="px-4 pb-10 pt-6">
          <p className="mb-4 px-2 text-center text-sm text-ios-secondary dark:text-ios-secondary-dark">
            Charged only if you miss the deadline — completing "{title.trim()}" in time refunds it in full.
          </p>
          <div className="rounded-2xl border border-black/10 px-3 py-3 dark:border-white/15">
            <CardElement options={{ style: { base: { fontSize: '16px' } } }} />
          </div>
          {errorMessage && <p className="mt-4 px-2 text-center text-sm text-red-500">{errorMessage}</p>}
        </div>
      </Sheet>
    );
  }

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
          isSaving ? (
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

        {/* Mirrors AddTaskSheet's Section("Stake (Apple Pay)") */}
        <p className="mb-2 mt-6 px-4 text-xs font-medium uppercase text-ios-secondary dark:text-ios-secondary-dark">Stake</p>
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
            If you miss the deadline, {formatStakeCents(stakeOption.cents)} is charged. Completing in time refunds it in full.
            {canUseApplePay ? ' Tap Add to pay with Apple Pay.' : ' Tap Add to enter a card.'}
          </p>
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
            same as iOS's `if isStaked { Toggle(...) }`. */}
        {isStaked && (
          <>
            <p className="mb-2 mt-6 px-4 text-xs font-medium uppercase text-ios-secondary dark:text-ios-secondary-dark">Verification</p>
            <List strongIos insetIos>
              <ListItem
                label
                title="Require confirmation from someone else"
                after={<Toggle checked={requiresVerification} onChange={() => setRequiresVerification((v) => !v)} />}
              />
            </List>
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

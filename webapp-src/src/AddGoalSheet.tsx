import { useEffect, useMemo, useRef, useState } from 'react';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import { Navbar, Preloader, Segmented, SegmentedButton, Sheet, Toggle } from 'konsta/react';
import { createGoal, getCloudKitContainer } from './cloudkit';
import { createVerification } from './verification';
import { ensureSignedIn } from './supabase';
import { createHold, releaseHold, StakingError } from './staking';
import { createStakedGoal } from './stakedGoal';
import { formatDeadline, formatStakeCents, mapRecord, type Goal } from './useGoals';
import { STAKE_OPTIONS, stripePromise, TERMS_URL, TERMS_VERSION, type StakeOptionId } from './stripeConfig';

const APPLE_PAY_LABEL = 'Goal Stake (charged if missed)';

// The card form's email, remembered on this browser only as a convenience. Apple Pay hands
// over the payer's email itself.
const EMAIL_STORAGE_KEY = 'stakeEmail';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rememberedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberEmail(email: string) {
  try {
    localStorage.setItem(EMAIL_STORAGE_KEY, email);
  } catch {
    // Private mode or blocked storage: the field just starts empty next time.
  }
}

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

type AddGoalSheetProps = {
  opened: boolean;
  onClose: () => void;
  onCreated: (goal: Goal) => void;
};

/// Each staked goal places its own hold with a card approved just for it: Apple Pay's sheet
/// where the browser supports it, otherwise a card form step. Nothing is saved.
export function AddGoalSheet(props: AddGoalSheetProps) {
  return (
    <Elements stripe={stripePromise}>
      <AddGoalSheetContent {...props} />
    </Elements>
  );
}

function AddGoalSheetContent({ opened, onClose, onCreated }: AddGoalSheetProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [step, setStep] = useState<'form' | 'card'>('form');
  const [title, setTitle] = useState('');
  const [deadlineOptionId, setDeadlineOptionId] = useState<DeadlineOptionId>('1d'); // matches selectedDeadlineOption's default of .oneDay
  const [stakeOptionId, setStakeOptionId] = useState<StakeOptionId>('none');
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [email, setEmail] = useState(rememberedEmail);
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

  // A stake also needs the Terms checkbox, ticked fresh for each one.
  const isValid = title.trim() !== '' && (!isStaked || agreedToTerms);

  // The Apple Pay handlers are registered once (the PaymentRequest effect only depends on
  // `stripe`), so they'd otherwise see the form as it was back then. Reading through this
  // ref gives them the current values without recreating the PaymentRequest, which would
  // re-run canMakePayment() and make the Apple Pay path pop in late.
  const latest = useRef({ title, deadline, requiresVerification, stakeOption });
  latest.current = { title, deadline, requiresVerification, stakeOption };

  function reset() {
    setStep('form');
    setTitle('');
    setDeadlineOptionId('1d');
    setStakeOptionId('none');
    setRequiresVerification(false);
    setAgreedToTerms(false);
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
    const current = latest.current;
    if (!current.requiresVerification) return null;
    await ensureSignedIn();
    return createVerification(current.title.trim(), current.stakeOption.cents || null, current.deadline);
  }

  async function createGoalRecord(verificationToken: string | null, stake: { amountCents: number; paymentIntentId: string } | null): Promise<Goal> {
    const current = latest.current;
    const record = await createGoal(getCloudKitContainer(), {
      title: current.title.trim(),
      deadline: current.deadline,
      verificationCode: verificationToken,
      stake,
    });
    return mapRecord(record);
  }

  function finish(goal: Goal) {
    onCreated(goal);
    close();
  }

  /// Shared by both payment paths. See createStakedGoal for the guarantees: the goal exists
  /// only once its hold is in place, and a failure after that cancels the hold.
  async function stakeAndCreate(paymentMethodId: string, payerEmail: string): Promise<Goal> {
    const current = latest.current;
    const verificationToken = await obtainVerificationToken();
    return createStakedGoal(
      {
        createHold: async (pm, cents, due) => {
          await ensureSignedIn();
          return createHold(pm, cents, due, {
            email: payerEmail,
            goalTitle: current.title.trim(),
            termsVersion: TERMS_VERSION,
          });
        },
        confirmCardPayment: async (clientSecret) => {
          if (!stripe) return { status: null, errorMessage: 'Payment could not be confirmed.' };
          const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret);
          return {
            status: paymentIntent?.status ?? null,
            errorMessage: error ? (error.message ?? 'Payment could not be confirmed.') : null,
          };
        },
        releaseHold,
        createGoal: (stake) => createGoalRecord(verificationToken, stake),
      },
      paymentMethodId,
      current.stakeOption.cents,
      current.deadline
    );
  }

  function messageFor(error: unknown): string {
    if (error instanceof StakingError) {
      switch (error.code) {
        case 'card_declined':
          return 'Your card was declined. Try a different one.';
        case 'too_many_holds':
          return "You've added a lot of staked goals today. Try again tomorrow.";
        case 'too_many_attempts':
          return 'Too many declined cards today. Try again tomorrow.';
        case 'stakes_blocked':
          return "Stakes aren't available for this card or email. Contact support@mymaingoals.app.";
        case 'invalid_email':
          return 'Enter a valid email address.';
      }
    }
    return (error as Error).message || "Couldn't create this goal. Please try again.";
  }

  // Set up once `stripe` is ready, not only once a stake is picked, so canMakePayment()'s
  // round trip has already resolved by then. The total starts at a placeholder and the
  // effect below keeps it in sync; canMakePayment() only checks wallet availability.
  useEffect(() => {
    if (!stripe) {
      setPaymentRequest(null);
      setCanUseApplePay(false);
      return;
    }
    const pr = stripe.paymentRequest({
      country: 'US',
      currency: 'usd',
      total: { label: APPLE_PAY_LABEL, amount: STAKE_OPTIONS[1].cents },
      // Where the stake's notices go (hold placed, goal missed, charged).
      requestPayerEmail: true,
    });
    let cancelled = false;
    pr.canMakePayment().then((result) => {
      if (!cancelled) setCanUseApplePay(!!result);
    });
    pr.on('paymentmethod', async (ev) => {
      try {
        if (!ev.payerEmail) throw new StakingError('invalid_email');
        const goal = await stakeAndCreate(ev.paymentMethod.id, ev.payerEmail);
        ev.complete('success');
        finish(goal);
      } catch (error) {
        ev.complete('fail');
        setIsSaving(false);
        setErrorMessage(messageFor(error));
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

  // Keeps the Apple Pay sheet's total in step with the picked stake without recreating the
  // PaymentRequest.
  useEffect(() => {
    paymentRequest?.update({ total: { label: APPLE_PAY_LABEL, amount: stakeOption.cents || STAKE_OPTIONS[1].cents } });
  }, [paymentRequest, stakeOption.cents]);

  /// Unstaked goals are a straight CloudKit write. Staked ones go to Apple Pay's sheet if the
  /// browser has it, otherwise to the card step.
  function handleAddTapped() {
    if (!isValid) return;
    setErrorMessage(null);
    if (!isStaked) {
      setIsSaving(true);
      obtainVerificationToken()
        .then((token) => createGoalRecord(token, null))
        .then(finish)
        .catch((error) => {
          setErrorMessage(messageFor(error));
          setIsSaving(false);
        });
      return;
    }
    if (canUseApplePay && paymentRequest) {
      // Must run synchronously in this click handler, with no `await` before it: browsers
      // only allow PaymentRequest.show() as a direct result of a user gesture. Everything
      // after the user approves runs in the 'paymentmethod' handler above.
      setIsSaving(true);
      paymentRequest.show();
      return;
    }
    setStep('card');
  }

  async function handlePayWithCard() {
    if (!stripe || !elements) {
      setErrorMessage('Payment is still loading. Try again in a moment.');
      return;
    }
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;
    const payerEmail = email.trim();
    if (!EMAIL_PATTERN.test(payerEmail)) {
      setErrorMessage('Enter a valid email address.');
      return;
    }
    rememberEmail(payerEmail);

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const { paymentMethod, error } = await stripe.createPaymentMethod({ type: 'card', card: cardElement });
      if (error || !paymentMethod) throw new Error(error?.message ?? 'Card could not be processed.');
      finish(await stakeAndCreate(paymentMethod.id, payerEmail));
    } catch (error) {
      setErrorMessage(messageFor(error));
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
                Hold {formatStakeCents(stakeOption.cents)}
              </button>
            )
          }
        />
        <div className="px-4 pb-10 pt-6">
          <p className="mb-4 px-2 text-center text-sm text-ios-secondary dark:text-ios-secondary-dark">
            Miss the deadline and {formatStakeCents(stakeOption.cents)} is charged. Mark "{title.trim()}" done in time and the
            hold is released.
          </p>
          <input
            type="email"
            autoComplete="email"
            placeholder="Email for stake notices"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className="mb-3 w-full rounded-2xl border border-black/10 bg-transparent px-4 py-3 text-base text-black outline-none dark:border-white/15 dark:text-white"
          />
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

        {/* Mirrors AddTaskSheet's Section("Stake"). */}
        <p className="mb-2 mt-6 px-4 text-xs font-medium uppercase text-ios-secondary dark:text-ios-secondary-dark">Stake</p>
        <Segmented strong>
          {STAKE_OPTIONS.map((option) => (
            <SegmentedButton key={option.id} active={stakeOptionId === option.id} onClick={() => setStakeOptionId(option.id)}>
              {option.label}
            </SegmentedButton>
          ))}
        </Segmented>
        {isStaked && (
          <>
            <p className="mt-2 px-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">
              {formatStakeCents(stakeOption.cents)} is held on your card when you add this goal. Miss the deadline and it's
              charged. Mark it done in time and the hold is released.
            </p>
            <label className="mt-3 flex items-start gap-3 px-4 text-sm text-black dark:text-white">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
              />
              <span>
                I'm 18 or older and agree to the{' '}
                <a href={TERMS_URL} target="_blank" rel="noopener" className="text-primary underline">
                  Stake Terms
                </a>
                .
              </span>
            </label>
          </>
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
        {/* Not gated on staking, mirroring AddTaskSheet: a friend confirming you did the
            thing stands on its own, and createVerification's stake argument is already
            nullable. */}
        <p className="mb-2 mt-6 px-4 text-xs font-medium uppercase text-ios-secondary dark:text-ios-secondary-dark">Verification</p>
        <div className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
          <span className="text-base text-black dark:text-white">Require confirmation from someone else</span>
          <Toggle checked={requiresVerification} onChange={() => setRequiresVerification((v) => !v)} />
        </div>
        {requiresVerification && (
          <p className="mt-2 px-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">
            Anyone with the link can see this goal's title{isStaked ? ' and stake' : ''}, and can confirm it for you. Only share
            it with someone you trust.
          </p>
        )}

        {errorMessage && <p className="mt-4 px-2 text-center text-sm text-red-500">{errorMessage}</p>}
      </div>
    </Sheet>
  );
}

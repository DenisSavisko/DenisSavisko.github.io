import { useEffect, useMemo, useRef, useState } from 'react';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import {
  Block,
  BlockFooter,
  BlockTitle,
  Button,
  Checkbox,
  Link,
  List,
  ListInput,
  ListItem,
  Navbar,
  Preloader,
  Segmented,
  SegmentedButton,
  Sheet,
  Toggle,
} from 'konsta/react';
import { createGoal, getCloudKitContainer } from './cloudkit';
import { createVerification } from './verification';
import { ensureSignedIn } from './supabase';
import { createHold, releaseHold, StakingError } from './staking';
import { createStakedGoal } from './stakedGoal';
import { formatDeadline, formatStakeCents, mapRecord, type Goal } from './useGoals';
import { consentRecord, stakeSummary } from './stakeConsent';
import { PRIVACY_URL, STAKE_OPTIONS, stripePromise, TERMS_URL, TERMS_VERSION, type StakeOptionId } from './stripeConfig';

// Apple Pay shows the total as "Pay <label>", and Apple's guidelines want the business name
// there; what the amount is for goes on its own line above it.
const APPLE_PAY_TOTAL_LABEL = 'MyMainGoals';
const APPLE_PAY_ITEM_LABEL = 'Goal hold, charged only if deadline missed';

function applePayAmounts(cents: number) {
  return {
    total: { label: APPLE_PAY_TOTAL_LABEL, amount: cents },
    displayItems: [{ label: APPLE_PAY_ITEM_LABEL, amount: cents }],
  };
}

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

// Padding shared by every step's content, below its top bar.
const STEP_BODY = 'pb-10';

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
  // A staked goal goes form → confirm (what the stake means, the Terms checkbox, then Apple
  // Pay) → card (only when there's no Apple Pay). Unstaked goals never leave the form.
  const [step, setStep] = useState<'form' | 'confirm' | 'card'>('form');
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
  const isValid = title.trim() !== '';
  const summary = stakeSummary(stakeOption.cents, deadline, requiresVerification);

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
            consentText: consentRecord(stakeSummary(cents, due, current.requiresVerification)),
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
        case 'non_us_card':
          return 'Stakes can only be placed with a US-issued card.';
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
      ...applePayAmounts(STAKE_OPTIONS[1].cents),
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
    paymentRequest?.update(applePayAmounts(stakeOption.cents || STAKE_OPTIONS[1].cents));
  }, [paymentRequest, stakeOption.cents]);

  /// Unstaked goals are a straight CloudKit write. Staked ones go to the confirm step first.
  function handleAddTapped() {
    if (!isValid) return;
    setErrorMessage(null);
    if (isStaked) {
      setStep('confirm');
      return;
    }
    setIsSaving(true);
    obtainVerificationToken()
      .then((token) => createGoalRecord(token, null))
      .then(finish)
      .catch((error) => {
        setErrorMessage(messageFor(error));
        setIsSaving(false);
      });
  }

  /// The confirm step's button: Apple Pay's sheet if the browser has it, otherwise the card step.
  function handleConfirmTapped() {
    if (!agreedToTerms) return;
    setErrorMessage(null);
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
          left={<NavLink onClick={() => setStep('confirm')} disabled={isSaving}>Back</NavLink>}
          right={
            isSaving ? (
              <Preloader />
            ) : (
              <NavLink onClick={handlePayWithCard} bold>
                Hold {formatStakeCents(stakeOption.cents)}
              </NavLink>
            )
          }
        />
        <div className={STEP_BODY}>
          <List strongIos insetIos>
            <ListInput
              type="email"
              autoComplete="email"
              placeholder="Email for stake notices"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            />
            {/* Stripe's own card field, in a row of the same list. */}
            <li className="px-4 py-3">
              <CardElement options={{ style: { base: { fontSize: '16px' } } }} />
            </li>
          </List>
          <ErrorMessage message={errorMessage} />
        </div>
      </Sheet>
    );
  }

  if (step === 'confirm') {
    return (
      <Sheet opened={opened} onBackdropClick={close} className="mx-auto max-w-(--k-app-max-w)">
        <Navbar title="Confirm Stake" left={<NavLink onClick={() => setStep('form')} disabled={isSaving}>Back</NavLink>} />
        <div className={STEP_BODY}>
          {/* Exactly this text, checkbox included, is sent with the hold as the consent
              record (stakeConsent.ts). Full-size text, as the legal review asked. */}
          <Block className="text-center text-lg font-semibold text-black [overflow-wrap:anywhere] dark:text-white">
            "{title.trim()}"
          </Block>
          <StakeConsent summary={summary} agreed={agreedToTerms} onChange={setAgreedToTerms} />
          <Block>
            {isSaving ? (
              <div className="flex justify-center">
                <Preloader />
              </div>
            ) : (
              <Button large rounded disabled={!agreedToTerms} onClick={handleConfirmTapped}>
                {canUseApplePay ? `Hold ${summary.amount}` : 'Continue'}
              </Button>
            )}
          </Block>
          <ErrorMessage message={errorMessage} />
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
        left={<NavLink onClick={close}>Cancel</NavLink>}
        right={
          isSaving ? (
            <Preloader />
          ) : (
            <NavLink onClick={handleAddTapped} disabled={!isValid} bold>
              {isStaked ? 'Next' : 'Add'}
            </NavLink>
          )
        }
      />

      {/* Mirrors AddTaskSheet's Form: one titled section per field, in Konsta's inset-grouped
          List/Block, the same way iOS's Form lays out Sections. */}
      <div className={STEP_BODY}>
        <BlockTitle>Goal</BlockTitle>
        <List strongIos insetIos>
          <ListInput
            type="text"
            placeholder="What do you want to do?"
            // Same cap as the iPhone app and the backend (friend links reject longer).
            maxLength={200}
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            clearButton={title !== ''}
            onClear={() => setTitle('')}
          />
        </List>

        <BlockTitle>Stake</BlockTitle>
        <Block>
          <Segmented strong>
            {STAKE_OPTIONS.map((option) => (
              <SegmentedButton key={option.id} active={stakeOptionId === option.id} onClick={() => setStakeOptionId(option.id)}>
                {option.label}
              </SegmentedButton>
            ))}
          </Segmented>
        </Block>

        {/* A segmented control of relative offsets, not a date/time picker, like iOS. */}
        <BlockTitle>Deadline</BlockTitle>
        <Block>
          <Segmented strong>
            {DEADLINE_OPTIONS.map((option) => (
              <SegmentedButton key={option.id} active={deadlineOptionId === option.id} onClick={() => setDeadlineOptionId(option.id)}>
                {option.label}
              </SegmentedButton>
            ))}
          </Segmented>
        </Block>
        <BlockFooter>Due around {formatDeadline(deadline)}</BlockFooter>

        {/* Not gated on staking, mirroring AddTaskSheet: a friend confirming you did the
            thing stands on its own, and createVerification's stake argument is already
            nullable. */}
        <BlockTitle>Verification</BlockTitle>
        <List strongIos insetIos>
          <ListItem
            title="Require confirmation from someone else"
            after={<Toggle checked={requiresVerification} onChange={() => setRequiresVerification((v) => !v)} />}
          />
        </List>
        {requiresVerification && (
          <BlockFooter>
            Anyone with the link can see this goal's title{isStaked ? ' and stake' : ''}, and can confirm it for you. Only share
            it with someone you trust.
          </BlockFooter>
        )}

        <ErrorMessage message={errorMessage} />
      </div>
    </Sheet>
  );
}

/// A Navbar text button (Konsta's Link), dimmed and inert while disabled, which Link itself
/// has no prop for.
function NavLink({
  onClick,
  disabled = false,
  bold = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  bold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      onClick={disabled ? undefined : onClick}
      className={`${bold ? 'font-semibold' : ''} ${disabled ? 'pointer-events-none opacity-30' : ''}`}
    >
      {children}
    </Link>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <Block className="text-center text-red-500">{message}</Block>;
}

function StakeConsent({
  summary,
  agreed,
  onChange,
}: {
  summary: ReturnType<typeof stakeSummary>;
  agreed: boolean;
  onChange: (agreed: boolean) => void;
}) {
  const link = 'text-primary underline';
  return (
    <>
      <Block strong inset className="!text-base text-black dark:text-white">
        <p>
          <strong>{summary.amount} hold on your card now.</strong> {summary.terms} {summary.refunds}
        </p>
        {summary.debitNote && <p className="mt-2">{summary.debitNote}</p>}
      </Block>
      <List strongIos insetIos>
        <ListItem
          label
          media={<Checkbox component="div" checked={agreed} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)} />}
          title={
            <span className="whitespace-normal">
              I'm 18+, in the US, and agree to the{' '}
              <a href={TERMS_URL} target="_blank" rel="noopener" className={link}>
                Stake Terms
              </a>{' '}
              (including this charge). I've read the{' '}
              <a href={PRIVACY_URL} target="_blank" rel="noopener" className={link}>
                Privacy Policy
              </a>
              .
            </span>
          }
        />
      </List>
    </>
  );
}

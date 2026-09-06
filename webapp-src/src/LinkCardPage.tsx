import { useEffect, useRef, useState } from 'react';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import { Block, Button, Navbar, Page, Preloader } from 'konsta/react';
import { confirmCardLink, createSetupIntent, formatCard, type LinkedCard } from './paymentMethods';
import { stripePromise } from './stripeConfig';

/// The web half of the v2 payments flow (PAYMENTS_PLAN.md). Reached at
/// `#link-card/<token>` — the iOS app opens it in Safari, and the web app links to it from
/// its own stake gating. Saves a reusable payment method against a **zero-charge**
/// SetupIntent; nothing is billed here, and nothing is billed when a staked goal is created
/// either. This page existing at all is the compliance fix: it's the only place Apple Pay
/// ever runs, so the iOS app contains no payment UI.
export function LinkCardPage({ token }: { token: string }) {
  return (
    <Elements stripe={stripePromise}>
      <LinkCardContent token={token} />
    </Elements>
  );
}

/// The iOS app appends `?src=ios` when it opens this page (see create-link-card-session), so
/// a user who arrived from the app gets sent back to it rather than into the web client.
/// Read once at module scope: the query string can't change while the page is mounted.
const CAME_FROM_IOS_APP = new URLSearchParams(window.location.search).get('src') === 'ios';

/// Custom scheme, not the app's existing mymaingoals.app Universal Link — Safari ignores a
/// universal link that points at the domain it's already showing, which is precisely this
/// case. Nothing needs to handle it app-side beyond being launched: AddTaskSheet re-checks
/// for a linked card on foreground, so simply coming back to the foreground unlocks staking.
const RETURN_TO_APP_URL = 'mymaingoals://link-card-done';

function LinkCardContent({ token }: { token: string }) {
  const stripe = useStripe();
  const elements = useElements();

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [currentCard, setCurrentCard] = useState<LinkedCard | null>(null);
  const [savedCard, setSavedCard] = useState<LinkedCard | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [canUseApplePay, setCanUseApplePay] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The token is single-use, so a page reload after a successful link would fail with
  // invalid_token — but by then `savedCard` is set and the success state is what shows,
  // never this fetch's error.
  useEffect(() => {
    let cancelled = false;
    createSetupIntent(token)
      .then((result) => {
        if (cancelled) return;
        setClientSecret(result.clientSecret);
        setCurrentCard(result.currentCard);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('This link has expired. Open the app and tap Enable Stakes again to get a fresh one.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Keeps the paymentmethod handler below off the stale-closure problem AddGoalSheet works
  // around with the same trick — the handler is registered once, but needs whatever
  // clientSecret is current.
  const latest = useRef({ clientSecret });
  latest.current = { clientSecret };

  /// Shared by both paths (Apple Pay, typed card): confirm the SetupIntent client-side, then
  /// have the server verify it with Stripe before it saves anything.
  async function finishLink(setupIntentId: string) {
    const card = await confirmCardLink(token, setupIntentId);
    setSavedCard(card);
  }

  useEffect(() => {
    if (!stripe || !clientSecret) return;
    const pr = stripe.paymentRequest({
      country: 'US',
      currency: 'usd',
      // Apple Pay won't show a $0 total unless it's marked pending — which is exactly what
      // this is: a card being saved for a charge that may never happen. The label is the
      // only place we get to explain the "Amount Pending" Apple then renders next to it,
      // so it says *why* there's no number rather than naming the action again.
      total: { label: 'Charged only if you miss a deadline', amount: 0, pending: true },
    });
    let cancelled = false;
    pr.canMakePayment().then((result) => {
      if (!cancelled) setCanUseApplePay(!!result);
    });
    pr.on('paymentmethod', async (ev) => {
      const secret = latest.current.clientSecret;
      if (!secret) {
        ev.complete('fail');
        return;
      }
      try {
        // handleActions: false so the Apple Pay sheet can be dismissed before any 3D Secure
        // step runs — Stripe's documented order for this API; running it the other way round
        // leaves the sheet spinning behind the challenge.
        const { error, setupIntent } = await stripe.confirmCardSetup(secret, { payment_method: ev.paymentMethod.id }, { handleActions: false });
        if (error) throw new Error(error.message ?? 'Card could not be saved.');
        ev.complete('success');
        if (setupIntent?.status === 'requires_action') {
          const followUp = await stripe.confirmCardSetup(secret);
          if (followUp.error) throw new Error(followUp.error.message ?? 'Card could not be saved.');
        }
        setIsSaving(true);
        await finishLink(setupIntent!.id);
      } catch (err) {
        ev.complete('fail');
        setErrorMessage((err as Error).message || "Couldn't save your card. Please try again.");
      } finally {
        setIsSaving(false);
      }
    });
    setPaymentRequest(pr);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, clientSecret]);

  /// Fallback for browsers with no Apple Pay (desktop, Android) — the same CardElement
  /// path AddGoalSheet already falls back to. iOS Safari, which is where the app's own
  /// link-out lands, always gets the Apple Pay button above instead.
  async function handleSaveTypedCard() {
    if (!stripe || !elements || !clientSecret) return;
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (error || !setupIntent) throw new Error(error?.message ?? 'Card could not be saved.');
      await finishLink(setupIntent.id);
    } catch (err) {
      setErrorMessage((err as Error).message || "Couldn't save your card. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Page>
      <Navbar title="Payment Method" />
      <Block className="space-y-4">
        {savedCard ? (
          <>
            <p className="text-center text-lg font-semibold text-black dark:text-white">Card linked ✓</p>
            <p className="text-center text-sm text-ios-secondary dark:text-ios-secondary-dark">
              {formatCard(savedCard)} is saved — staking is unlocked now.
            </p>
            {CAME_FROM_IOS_APP ? (
              <>
                <Button onClick={() => { window.location.href = RETURN_TO_APP_URL; }}>Back to MyMainGoals</Button>
                {/* The scheme silently does nothing if the app isn't installed (or if the
                    user declines Safari's "Open in…" prompt), so say what to do instead
                    rather than leaving them on a button that looks broken. */}
                <p className="text-center text-xs text-ios-secondary dark:text-ios-secondary-dark">
                  Or just switch back to the app — it picks this up on its own.
                </p>
              </>
            ) : (
              /* Came from the web app: clearing the hash is all it takes to drop back into
                 the goals list. */
              <Button onClick={() => { window.location.hash = ''; }}>Continue to the web app</Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-ios-secondary dark:text-ios-secondary-dark">
              Saving a card is what lets you stake money on a goal. <strong>Nothing is charged now</strong>, and nothing is
              charged when you create a goal — a stake is only collected if you miss your own deadline.
            </p>
            {currentCard && (
              <p className="text-sm text-ios-secondary dark:text-ios-secondary-dark">
                You currently have {formatCard(currentCard)} saved. Linking again replaces it.
              </p>
            )}
            {!clientSecret && !errorMessage && (
              <div className="flex justify-center py-6">
                <Preloader />
              </div>
            )}
            {clientSecret && isSaving && (
              <div className="flex justify-center py-6">
                <Preloader />
              </div>
            )}
            {clientSecret && !isSaving && canUseApplePay && paymentRequest && (
              <Button onClick={() => paymentRequest.show()}>Set up with Apple Pay</Button>
            )}
            {clientSecret && !isSaving && !canUseApplePay && (
              <>
                <div className="rounded-2xl border border-black/10 px-3 py-3 dark:border-white/15">
                  <CardElement options={{ style: { base: { fontSize: '16px' } } }} />
                </div>
                <Button onClick={handleSaveTypedCard}>Save card</Button>
              </>
            )}
          </>
        )}
        {errorMessage && <p className="text-center text-sm text-red-500">{errorMessage}</p>}
      </Block>
    </Page>
  );
}

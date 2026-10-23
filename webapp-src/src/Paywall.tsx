// The web's hard paywall: the same plans and words as the iPhone app's (PaywallView.swift),
// plus the stakes line only the web can say. RevenueCat's own checkout takes the payment.
import { useEffect, useState } from 'react';
import { Block, Button, Preloader } from 'konsta/react';
import { PackageType, PeriodUnit, type Package, type Period } from '@revenuecat/purchases-js';
import type { Subscription } from './useSubscription';
import { CheckCircleIcon } from './icons';
import { clearGiftCodeFromURL, giftCodeFromURL } from './giftCode';

const FEATURES = [
  'Three goals with real deadlines',
  "A friend confirms when you're done",
  'Stake money for extra motivation',
];

export function Paywall({ subscription }: { subscription: Subscription }) {
  const { packages, loadError, purchase } = subscription;
  // A gift link skips the choice: it's always the lifetime plan, at $0.
  const [giftCode] = useState(giftCodeFromURL);
  const lifetime = packages.find((p) => p.packageType === PackageType.Lifetime) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!packages.some((p) => p.identifier === selectedId)) setSelectedId(packages[0]?.identifier ?? null);
  }, [packages, selectedId]);

  const selected = giftCode ? lifetime : (packages.find((p) => p.identifier === selectedId) ?? null);

  async function handlePurchase() {
    if (!selected) return;
    setIsPurchasing(true);
    setError(null);
    try {
      if ((await purchase(selected, giftCode ?? undefined)) && giftCode) clearGiftCodeFromURL();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsPurchasing(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-2 pb-10">
      <h2 className="px-2 text-center text-3xl font-bold">
        {giftCode ? "You've got a gift." : 'Commit to what matters.'}
      </h2>
      {giftCode && (
        <p className="-mt-3 text-center text-black/55 dark:text-white/55">Lifetime access, free.</p>
      )}

      <ul className="flex flex-col gap-3 px-2">
        {FEATURES.map((feature) => (
          <li key={feature} className="flex items-center gap-3">
            <CheckCircleIcon className="h-6 w-6 shrink-0 text-primary" aria-hidden />
            {feature}
          </li>
        ))}
      </ul>

      {giftCode ? null : packages.length === 0 ? (
        loadError ? (
          <Block className="text-center text-black/55 dark:text-white/55">{loadError}</Block>
        ) : (
          <div className="flex justify-center py-10">
            <Preloader />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3" role="radiogroup">
          {packages.map((pkg) => {
            const isSelected = pkg.identifier === selectedId;
            return (
              <button
                key={pkg.identifier}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedId(pkg.identifier)}
                className={`flex items-center gap-3 rounded-2xl border-2 bg-black/5 px-4 py-3 text-left dark:bg-white/10 ${
                  isSelected ? 'border-primary' : 'border-transparent'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    isSelected ? 'border-primary bg-primary' : 'border-black/25 dark:border-white/30'
                  }`}
                >
                  {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{title(pkg)}</span>
                  <span className="block text-sm text-black/55 dark:text-white/55">{detail(pkg)}</span>
                </span>
                {pkg.packageType === PackageType.Annual && perMonth(pkg) && (
                  <span className="text-sm text-black/55 dark:text-white/55">{perMonth(pkg)}/mo</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button large rounded disabled={!selected || isPurchasing} onClick={handlePurchase}>
          {isPurchasing ? (
            <Preloader className="h-5 w-5" />
          ) : giftCode ? (
            'Get Your Gift'
          ) : selected && trial(selected) ? (
            'Start Free Trial'
          ) : (
            'Continue'
          )}
        </Button>
        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        {selected && !giftCode && <p className="text-center text-xs text-black/55 dark:text-white/55">{terms(selected)}</p>}
        <p className="text-center text-xs text-black/55 dark:text-white/55">
          Subscribed on iPhone? It unlocks here with the same Apple Account.{' '}
          <a href="https://mymaingoals.app/web-privacy-policy.html" className="text-primary">
            Privacy
          </a>
        </p>
      </div>
    </div>
  );
}

function title(pkg: Package): string {
  switch (pkg.packageType) {
    case PackageType.Annual:
      return 'Yearly';
    case PackageType.Monthly:
      return 'Monthly';
    case PackageType.Lifetime:
      return 'Lifetime';
    default:
      return pkg.product.title;
  }
}

function trial(pkg: Package): Period | null {
  return pkg.product.freeTrialPhase?.period ?? null;
}

function perMonth(pkg: Package): string | null {
  return pkg.product.defaultSubscriptionOption?.base.pricePerMonth?.formattedPrice ?? null;
}

function length({ number, unit }: Period): string {
  const names: Record<PeriodUnit, string> = {
    [PeriodUnit.Day]: 'day',
    [PeriodUnit.Week]: 'week',
    [PeriodUnit.Month]: 'month',
    [PeriodUnit.Year]: 'year',
  };
  return `${number} ${names[unit]}${number === 1 ? '' : 's'}`;
}

function detail(pkg: Package): string {
  const price = pkg.product.price.formattedPrice;
  const freeFor = trial(pkg);
  switch (pkg.packageType) {
    case PackageType.Annual:
      return freeFor ? `${length(freeFor)} free, then ${price} a year` : `${price} a year`;
    case PackageType.Monthly:
      return `${price} a month`;
    case PackageType.Lifetime:
      return `${price}, paid once`;
    default:
      return price;
  }
}

function terms(pkg: Package): string {
  const price = pkg.product.price.formattedPrice;
  if (pkg.packageType === PackageType.Lifetime) return 'One-time purchase. No subscription.';
  const period = pkg.packageType === PackageType.Annual ? 'year' : 'month';
  const freeFor = trial(pkg);
  const start = freeFor ? `Free for ${length(freeFor)}, then ${price} a ${period}.` : `${price} a ${period}.`;
  return `${start} Renews automatically until cancelled. Cancel anytime from the link in your receipt email.`;
}

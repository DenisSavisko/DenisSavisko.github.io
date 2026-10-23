// Paid access through RevenueCat Web Billing. The RevenueCat customer is the CloudKit user
// record name, which the iPhone app uses too for the same Apple ID, so a subscription bought
// on either side unlocks both.
import { useCallback, useEffect, useState } from 'react';
import { ErrorCode, PackageType, Purchases, PurchasesError, type Package } from '@revenuecat/purchases-js';

const API_KEY = 'rcb_jIovbRpAeiYzPZgKdOWqptRJtzDT';
export const ENTITLEMENT_ID = 'mymaingoals_pro';

export type Access = 'unknown' | 'granted' | 'denied';

const PACKAGE_ORDER: string[] = [PackageType.Annual, PackageType.Monthly, PackageType.Lifetime];

export interface Subscription {
  access: Access;
  packages: Package[];
  loadError: string | null;
  /// Where a subscriber cancels or updates their card: RevenueCat's portal for a web
  /// subscription (Apple's subscriptions page for an iPhone one). Null with nothing to manage.
  managementURL: string | null;
  /// Resolves true once paid, false if the person closed the checkout. discountCode: a gift
  /// link's code (see giftCode.ts), which RevenueCat applies at checkout.
  purchase: (pkg: Package, discountCode?: string) => Promise<boolean>;
}

export function useSubscription(userRecordName: string | null): Subscription {
  const [access, setAccess] = useState<Access>('unknown');
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [managementURL, setManagementURL] = useState<string | null>(null);

  useEffect(() => {
    if (!userRecordName) return;
    let cancelled = false;
    const purchases = Purchases.isConfigured()
      ? Purchases.getSharedInstance()
      : Purchases.configure({ apiKey: API_KEY, appUserId: userRecordName });

    Promise.all([purchases.getCustomerInfo(), purchases.getOfferings()])
      .then(([customerInfo, offerings]) => {
        if (cancelled) return;
        setAccess(ENTITLEMENT_ID in customerInfo.entitlements.active ? 'granted' : 'denied');
        setManagementURL(customerInfo.managementURL);
        const available = [...(offerings.current?.availablePackages ?? [])].sort(
          (a, b) => order(a) - order(b)
        );
        setPackages(available);
        setLoadError(available.length ? null : "Plans aren't available right now. Please try again later.");
      })
      .catch((error: Error) => {
        if (cancelled) return;
        // Can't tell either way: keep the paywall up, with a way to retry by reloading.
        setAccess('denied');
        setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [userRecordName]);

  const purchase = useCallback(async (pkg: Package, discountCode?: string) => {
    try {
      const { customerInfo } = await Purchases.getSharedInstance().purchase({ rcPackage: pkg, discountCode });
      const entitled = ENTITLEMENT_ID in customerInfo.entitlements.active;
      setAccess(entitled ? 'granted' : 'denied');
      setManagementURL(customerInfo.managementURL);
      return entitled;
    } catch (error) {
      if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) return false;
      throw error;
    }
  }, []);

  return { access, packages, loadError, managementURL, purchase };
}

function order(pkg: Package): number {
  const index = PACKAGE_ORDER.indexOf(pkg.packageType);
  return index === -1 ? PACKAGE_ORDER.length : index;
}

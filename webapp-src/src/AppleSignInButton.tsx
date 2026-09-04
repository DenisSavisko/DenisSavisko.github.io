/// CloudKit JS finds this by its fixed id and injects a sign-in/sign-out button into it as a
/// side effect of setUpAuth() (called once, in useCloudKitAuth). Rendered exactly once, at the
/// app's top level (App.tsx) — never duplicated per-tab or per-modal, since CloudKit JS only
/// supports one such element on the page.
export function AppleSignInButton() {
  return <div id="apple-sign-in-button" className="flex justify-center py-2" />;
}

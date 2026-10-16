/// CloudKit JS finds this by its fixed id and injects a sign-in button into it as a side
/// effect of setUpAuth() (called once, in useCloudKitAuth). Rendered exactly once, at the
/// app's top level (App.tsx), and kept mounted the whole time: CloudKit can re-show the button
/// at any point (a session ending mid-visit), and it only does that if the element is already
/// on the page. So signing in hides it rather than removing it.
///
/// While signed out it's the only thing to do, so it sits at the bottom, within thumb reach,
/// like a native app's welcome screen.
export function AppleSignInButton({ visible }: { visible: boolean }) {
  return (
    <div
      id="apple-sign-in-button"
      className={
        visible
          ? 'fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-(--k-app-max-w) justify-center pb-[calc(env(safe-area-inset-bottom)+2rem)]'
          : 'hidden'
      }
    />
  );
}

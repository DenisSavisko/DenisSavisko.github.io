import { ensureSignedIn } from './supabase';
import { confirmVerification, getVerification, type VerificationInfo } from './verification';
import { initGoalsView } from './goals';
import { getCloudKitContainer, isCloudKitConfigured, ownsGoalWithVerificationCode } from './cloudkit';

const app = document.querySelector<HTMLDivElement>('#app')!;

function parseToken(): string | null {
  // Matches #verify/<token> — a hash fragment never reaches the server, so this page can
  // live at a fixed, static path (/webapp/) with no server-side routing at all.
  const match = /^#verify\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

function formatStake(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderNotFound() {
  app.innerHTML = `
    <h1>Link Not Found</h1>
    <p class="muted">This link may have expired or is no longer valid.</p>
  `;
}

function renderConfirmed(info: VerificationInfo) {
  app.innerHTML = `
    <h1>Confirmed!</h1>
    <p class="muted">${escapeHtml(info.task_title)}</p>
  `;
}

/// Only ever called from an explicit button tap, never automatically — see
/// VerificationClient.confirm's comment on iOS for why (chat apps auto-fetch links to build
/// previews, and confirming on a friend's behalf before they've seen the screen would be bad).
function renderConfirmStep(status: HTMLDivElement, token: string, info: VerificationInfo) {
  status.innerHTML = `
    <p class="error" id="error" hidden></p>
    <button id="confirm">Confirm</button>
  `;
  const button = status.querySelector<HTMLButtonElement>('#confirm')!;
  const errorEl = status.querySelector<HTMLParagraphElement>('#error')!;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Confirming…';
    errorEl.hidden = true;
    try {
      const result = await confirmVerification(token);
      if (result === 'confirmed' || result === 'already_confirmed') {
        renderConfirmed(info);
      } else {
        errorEl.textContent = 'This link may have expired or is no longer valid.';
        errorEl.hidden = false;
        button.disabled = false;
        button.textContent = 'Confirm';
      }
    } catch {
      errorEl.textContent = "Couldn't confirm right now. Please try again.";
      errorEl.hidden = false;
      button.disabled = false;
      button.textContent = 'Confirm';
    }
  });
}

/// Gates confirming behind an actual signed-in identity (CloudKit JS / Apple ID), then mirrors
/// VerifyGoalView.matchingLocalTask on iOS: if the signed-in person's own synced goals include
/// this token, they're the goal's owner, not a confirming friend, so no Confirm button at all.
/// iOS does this silently via the local SwiftData store; web has no such store, so it needs a
/// real sign-in to ask CloudKit instead — the sign-in prompt itself is the necessary extra step
/// (clicking the shared link alone never confirms anything either way).
function renderConfirmable(token: string, info: VerificationInfo) {
  app.innerHTML = `
    <h1>${escapeHtml(info.task_title)}</h1>
    ${info.stake_amount_cents != null ? `<p class="stake">${formatStake(info.stake_amount_cents)} is on the line</p>` : ''}
    ${info.deadline != null ? `<p class="deadline">Due ${formatDeadline(info.deadline)}</p>` : ''}
    <p class="muted">Is it done?</p>
    <div id="apple-sign-in-button"></div>
    <div id="verify-status"><p class="muted">Sign in with your Apple ID to confirm.</p></div>
  `;
  const status = app.querySelector<HTMLDivElement>('#verify-status')!;

  if (!isCloudKitConfigured()) {
    status.innerHTML = '<p class="error">Sign-in isn\'t configured yet — see webapp-src/README.md.</p>';
    return;
  }

  const container = getCloudKitContainer();

  async function afterSignIn() {
    status.innerHTML = '<p class="muted">Checking…</p>';
    try {
      const isOwnGoal = await ownsGoalWithVerificationCode(container, token);
      if (isOwnGoal) {
        status.innerHTML = '<p class="muted">This is your own goal — a friend needs to confirm it.</p>';
        return;
      }
    } catch {
      // Fail open to the Confirm button rather than blocking a real friend just because the
      // self-check couldn't run — same effective outcome as iOS's matchingLocalTask finding
      // nothing.
    }
    renderConfirmStep(status, token, info);
  }

  container.whenUserSignsIn().then(afterSignIn);
  container.setUpAuth().then((userIdentity) => {
    if (userIdentity) afterSignIn();
  });
}

async function main() {
  const token = parseToken();
  if (!token) {
    await initGoalsView();
    return;
  }

  try {
    await ensureSignedIn();
    const info = await getVerification(token);
    if (info.is_verified) {
      renderConfirmed(info);
    } else {
      renderConfirmable(token, info);
    }
  } catch {
    renderNotFound();
  }
}

main();

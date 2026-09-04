import { ensureSignedIn } from './supabase';
import { confirmVerification, getVerification, type VerificationInfo } from './verification';
import {
  ensureCloudKitAuth,
  getCloudKitContainer,
  isCloudKitConfigured,
  ownsGoalWithVerificationCode,
  relocateSignInButton,
} from './cloudkit';

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

/// Only ever called from an explicit button tap, never automatically — see
/// VerificationClient.confirm's comment on iOS for why (chat apps auto-fetch links to build
/// previews, and confirming on a friend's behalf before they've seen the screen would be bad).
function renderConfirmStep(status: HTMLDivElement, token: string, info: VerificationInfo, onConfirmed: () => void) {
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
        onConfirmed();
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

/// Opens the verify flow as a closable modal over the Goals tab (mirrors VerifyGoalView being
/// presented as a sheet over the app's main task list on iOS) — never a dead-end page of its
/// own. Closing it (✕, backdrop click, or the 1.5s auto-close right after confirming) always
/// leaves the Goals tab underneath exactly as it was.
export function showVerifyModal(token: string) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" aria-label="Close">✕</button>
      <div id="verify-modal-content"><p class="muted">Loading…</p></div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const card = backdrop.querySelector<HTMLDivElement>('.modal-card')!;
  const content = backdrop.querySelector<HTMLDivElement>('#verify-modal-content')!;

  let restoreSignInButton: (() => void) | null = null;
  const close = () => {
    restoreSignInButton?.();
    backdrop.remove();
    if (window.location.hash.startsWith('#verify/')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };
  backdrop.querySelector('.modal-close')!.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  function renderConfirmable(info: VerificationInfo) {
    content.innerHTML = `
      <h1>${escapeHtml(info.task_title)}</h1>
      ${info.stake_amount_cents != null ? `<p class="stake">${formatStake(info.stake_amount_cents)} is on the line</p>` : ''}
      ${info.deadline != null ? `<p class="deadline">Due ${formatDeadline(info.deadline)}</p>` : ''}
      <p class="muted">Is it done?</p>
      <div id="verify-status"><p class="muted">Sign in with your Apple ID to confirm.</p></div>
    `;
    const status = content.querySelector<HTMLDivElement>('#verify-status')!;

    if (!isCloudKitConfigured()) {
      status.innerHTML = '<p class="error">Sign-in isn\'t configured yet — see webapp-src/README.md.</p>';
      return;
    }

    restoreSignInButton = relocateSignInButton(card);
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
      renderConfirmStep(status, token, info, () => {
        content.innerHTML = `<h1>Confirmed!</h1><p class="muted">${escapeHtml(info.task_title)}</p>`;
        // Only auto-closes right after the person's own tap confirms it — matches
        // VerifyGoalView's onChange(of: didConfirm), which doesn't auto-dismiss when the
        // screen loads already-verified from a past visit.
        setTimeout(close, 1500);
      });
    }

    container.whenUserSignsIn().then(afterSignIn);
    ensureCloudKitAuth().then((userIdentity) => {
      if (userIdentity) afterSignIn();
    });
  }

  (async () => {
    try {
      await ensureSignedIn();
      const info = await getVerification(token);
      if (info.is_verified) {
        content.innerHTML = `<h1>Confirmed!</h1><p class="muted">${escapeHtml(info.task_title)}</p>`;
      } else {
        renderConfirmable(info);
      }
    } catch {
      content.innerHTML = `
        <h1>Link Not Found</h1>
        <p class="muted">This link may have expired or is no longer valid.</p>
      `;
    }
  })();
}

import { ensureSignedIn } from './supabase';
import { confirmVerification, getVerification, type VerificationInfo } from './verification';

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

function renderMissingToken() {
  app.innerHTML = `
    <h1>MyMainGoals</h1>
    <p class="muted">Open this page from a MyMainGoals verification link.</p>
  `;
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

function renderConfirmable(token: string, info: VerificationInfo) {
  app.innerHTML = `
    <h1>${escapeHtml(info.task_title)}</h1>
    ${info.stake_amount_cents != null ? `<p class="stake">${formatStake(info.stake_amount_cents)} is on the line</p>` : ''}
    ${info.deadline != null ? `<p class="deadline">Due ${formatDeadline(info.deadline)}</p>` : ''}
    <p class="muted">Is it done?</p>
    <p class="error" id="error" hidden></p>
    <button id="confirm">Confirm</button>
  `;
  const button = app.querySelector<HTMLButtonElement>('#confirm')!;
  const errorEl = app.querySelector<HTMLParagraphElement>('#error')!;
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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function main() {
  const token = parseToken();
  if (!token) {
    renderMissingToken();
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

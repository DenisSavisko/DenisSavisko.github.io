import { initGoalsView } from './goals';
import { showVerifyModal } from './verifyModal';

function parseToken(): string | null {
  // Matches #verify/<token> — a hash fragment never reaches the server, so this page can
  // live at a fixed, static path (/webapp/) with no server-side routing at all.
  const match = /^#verify\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

async function main() {
  // Goals is the permanent base view, same as opening the app to its main task list — a
  // verify link never replaces it, it opens as a modal on top (see verifyModal.ts).
  await initGoalsView();

  const token = parseToken();
  if (token) {
    showVerifyModal(token);
  }
}

main();

import { GOAL_FIELDS, GOAL_RECORD_TYPE } from './cloudkitConfig';
import { ensureCloudKitAuth, getCloudKitContainer, isCloudKitConfigured } from './cloudkit';

const app = document.querySelector<HTMLDivElement>('#app')!;

type Status = 'active' | 'done' | 'failed';

interface Goal {
  title: string;
  deadline: Date;
  isDone: boolean;
}

/// Mirrors GoalTask.status(asOf:) in MyMainGoals/GoalTask.swift.
function statusOf(goal: Goal, referenceDate: Date): Status {
  if (goal.isDone) return 'done';
  if (goal.deadline < referenceDate) return 'failed';
  return 'active';
}

function formatDeadline(date: Date): string {
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderList(content: HTMLDivElement, goals: Goal[]) {
  const now = new Date();
  const rows = goals
    .slice()
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
    .map((goal) => {
      const status = statusOf(goal, now);
      return `
        <li class="goal-row">
          <span class="status-badge status-${status}">${status}</span>
          <span class="title">${escapeHtml(goal.title)}</span>
          <span class="deadline">${formatDeadline(goal.deadline)}</span>
        </li>
      `;
    })
    .join('');
  content.innerHTML = goals.length
    ? `<ul class="goal-list">${rows}</ul>`
    : '<p class="muted">No goals yet.</p>';
}

async function loadGoals(content: HTMLDivElement, container: CKContainer) {
  content.innerHTML = '<p class="muted">Loading goals…</p>';
  try {
    const response = await container.privateCloudDatabase.performQuery({ recordType: GOAL_RECORD_TYPE });
    if (response.hasErrors) {
      throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
    }
    const goals: Goal[] = response.records.map((record) => ({
      title: String(record.fields[GOAL_FIELDS.title]?.value ?? ''),
      deadline: new Date(record.fields[GOAL_FIELDS.deadline]?.value as string | number),
      isDone: Boolean(record.fields[GOAL_FIELDS.isDone]?.value),
    }));
    renderList(content, goals);
  } catch (error) {
    content.innerHTML = `<p class="error">${escapeHtml(
      `Couldn't load goals: ${(error as Error).message}. This proof of concept depends on ` +
        "the CloudKit record/field names and a queryable index matching what's actually in " +
        'the CloudKit Dashboard schema — see webapp-src/README.md.'
    )}</p>`;
  }
}

export async function initGoalsView() {
  // The permanent base view — a verify link opens as a modal on top of this (see
  // verifyModal.ts), it never replaces it. The sign-in/out button is a live DOM node CloudKit
  // JS injects into and manages itself; created once here, it may later be borrowed by the
  // verify modal (relocateSignInButton) but always ends up back in this same spot.
  app.innerHTML = `
    <h1>Goals</h1>
    <div id="apple-sign-in-button"></div>
    <div id="goals-content"><p class="muted">Loading…</p></div>
  `;
  const content = document.querySelector<HTMLDivElement>('#goals-content')!;

  if (!isCloudKitConfigured()) {
    content.innerHTML = '<p class="error">CloudKit API token not configured yet — see webapp-src/README.md.</p>';
    return;
  }

  const container = getCloudKitContainer();

  container.whenUserSignsIn().then(() => loadGoals(content, container));
  container.whenUserSignsOut().then(() => {
    content.innerHTML = '<p class="muted">Sign in to see your goals.</p>';
  });

  const userIdentity = await ensureCloudKitAuth();
  if (userIdentity) {
    await loadGoals(content, container);
  } else {
    content.innerHTML = '<p class="muted">Sign in to see your goals.</p>';
  }
}

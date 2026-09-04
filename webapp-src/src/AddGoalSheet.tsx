import { useMemo, useState } from 'react';
import { List, ListInput, ListItem, Navbar, Preloader, Segmented, SegmentedButton, Sheet, Toggle } from 'konsta/react';
import { createGoal, getCloudKitContainer } from './cloudkit';
import { createVerification } from './verification';
import { ensureSignedIn } from './supabase';
import { formatDeadline } from './useGoals';
import type { ShareVerificationTarget } from './ShareVerificationSheet';

/// Mirrors AddTaskSheet's DeadlineOption exactly: a small set of relative offsets, not a
/// precise date/time picker — goals are a rough estimate, not a reminder (see that enum's own
/// comment). Skips the debug-only "1 minute" option: there's no debug-vs-release build
/// concept for a deployed website, and this is otherwise the production option set.
const DEADLINE_OPTIONS = [
  { id: '1h', label: '1h', ms: 60 * 60 * 1000 },
  { id: '1d', label: '1d', ms: 24 * 60 * 60 * 1000 },
  { id: '3d', label: '3d', ms: 3 * 24 * 60 * 60 * 1000 },
  { id: '5d', label: '5d', ms: 5 * 24 * 60 * 60 * 1000 },
] as const;
type DeadlineOptionId = (typeof DEADLINE_OPTIONS)[number]['id'];

/// Mirrors AddTaskSheet on iOS, minus staking — creating a *staked* goal means collecting a
/// real payment method and calling create-hold (Stripe), a materially bigger, separate
/// integration (Apple Pay JS / Stripe Elements) not built here. Unstaked goal creation is a
/// plain CloudKit write, safe to do the same way iOS does it.
///
/// The 3-active-goals cap is enforced by disabling the Fab itself (App.tsx), same as
/// ContentView's `.disabled(!store.canAddTask)` — this sheet doesn't need its own check,
/// since it can't open in that state to begin with.
export function AddGoalSheet({
  opened,
  onClose,
  onCreated,
  onNeedsShare,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
  onNeedsShare: (target: ShareVerificationTarget) => void;
}) {
  const [title, setTitle] = useState('');
  const [deadlineOptionId, setDeadlineOptionId] = useState<DeadlineOptionId>('1d'); // matches selectedDeadlineOption's default of .oneDay
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Recomputed on every render rather than fixed at selection time — same effect as iOS's
  // `deadline = Date().addingTimeInterval(newValue.interval)` firing fresh each time the
  // option changes, since the sheet's open duration is short enough that "now" barely drifts.
  const deadline = useMemo(() => {
    const option = DEADLINE_OPTIONS.find((o) => o.id === deadlineOptionId)!;
    return new Date(Date.now() + option.ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineOptionId]);

  const isValid = title.trim() !== '';

  function reset() {
    setTitle('');
    setDeadlineOptionId('1d');
    setRequiresVerification(false);
    setErrorMessage(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await ensureSignedIn();
      const token = requiresVerification ? await createVerification(trimmedTitle, null, deadline) : null;
      const container = getCloudKitContainer();
      await createGoal(container, { title: trimmedTitle, deadline, verificationCode: token });
      onCreated();
      if (token) {
        onNeedsShare({ title: trimmedTitle, deadline, stakeAmountCents: null, token });
      }
      close();
    } catch (error) {
      setErrorMessage((error as Error).message || "Couldn't create this goal. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet opened={opened} onBackdropClick={close} className="mx-auto max-w-(--k-app-max-w)">
      {/* Mirrors AddTaskSheet's toolbar exactly: Cancel top-left (.cancellationAction), "New
          Goal" centered title, Add top-right (.confirmationAction) swapped for a spinner
          while busy — not stacked full-width buttons at the bottom. */}
      <Navbar
        title="New Goal"
        left={
          <button onClick={close} className="px-2 text-primary">
            Cancel
          </button>
        }
        right={
          isSaving ? (
            <Preloader className="mr-2" />
          ) : (
            <button onClick={handleCreate} disabled={!isValid} className={`px-2 font-semibold ${isValid ? 'text-primary' : 'text-black/30 dark:text-white/30'}`}>
              Add
            </button>
          )
        }
      />

      <div className="px-4 pb-10 pt-4">
        <List strongIos insetIos>
          <ListInput
            label="Title"
            type="text"
            placeholder="What do you want to do?"
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          />
          <ListItem
            label
            title="Require confirmation from someone else"
            after={<Toggle checked={requiresVerification} onChange={() => setRequiresVerification((v) => !v)} />}
          />
        </List>

        {/* Mirrors AddTaskSheet's Section("Deadline") — a segmented control of relative
            offsets, not a date/time picker. */}
        <p className="mb-2 mt-6 px-4 text-xs font-medium uppercase text-ios-secondary dark:text-ios-secondary-dark">Deadline</p>
        <Segmented strong>
          {DEADLINE_OPTIONS.map((option) => (
            <SegmentedButton key={option.id} active={deadlineOptionId === option.id} onClick={() => setDeadlineOptionId(option.id)}>
              {option.label}
            </SegmentedButton>
          ))}
        </Segmented>
        <p className="mt-2 px-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">Due around {formatDeadline(deadline)}</p>

        {errorMessage && <p className="mt-4 px-2 text-center text-sm text-red-500">{errorMessage}</p>}
      </div>
    </Sheet>
  );
}

import { useState } from 'react';
import { Button, List, ListInput, ListItem, Sheet, Toggle } from 'konsta/react';
import { createGoal, getCloudKitContainer } from './cloudkit';
import { createVerification } from './verification';
import { ensureSignedIn } from './supabase';
import type { ShareVerificationTarget } from './ShareVerificationSheet';

const MAX_ACTIVE_TASKS = 3; // mirrors TaskStore.maxActiveTasks

/// Mirrors AddTaskSheet on iOS, minus staking — creating a *staked* goal means collecting a
/// real payment method and calling create-hold (Stripe), a materially bigger, separate
/// integration (Apple Pay JS / Stripe Elements) not built here. Unstaked goal creation is a
/// plain CloudKit write, safe to do the same way iOS does it.
export function AddGoalSheet({
  opened,
  activeCount,
  onClose,
  onCreated,
  onNeedsShare,
}: {
  opened: boolean;
  activeCount: number;
  onClose: () => void;
  onCreated: () => void;
  onNeedsShare: (target: ShareVerificationTarget) => void;
}) {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canAddTask = activeCount < MAX_ACTIVE_TASKS;

  function reset() {
    setTitle('');
    setDeadline('');
    setRequiresVerification(false);
    setErrorMessage(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !deadline) return;
    const deadlineDate = new Date(deadline);
    if (Number.isNaN(deadlineDate.getTime())) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await ensureSignedIn();
      const token = requiresVerification ? await createVerification(trimmedTitle, null, deadlineDate) : null;
      const container = getCloudKitContainer();
      await createGoal(container, { title: trimmedTitle, deadline: deadlineDate, verificationCode: token });
      onCreated();
      if (token) {
        onNeedsShare({ title: trimmedTitle, deadline: deadlineDate, stakeAmountCents: null, token });
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
      <div className="px-4 pb-10 pt-6">
        <h2 className="text-center text-lg font-semibold">New Goal</h2>

        {!canAddTask ? (
          <p className="mt-4 px-2 text-center text-sm text-ios-secondary dark:text-ios-secondary-dark">
            You already have {MAX_ACTIVE_TASKS} active goals — finish or fail one before adding another.
          </p>
        ) : (
          <>
            <List strongIos insetIos className="mt-4">
              <ListInput
                label="Title"
                type="text"
                placeholder="What do you want to do?"
                value={title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              />
              <ListInput
                label="Deadline"
                type="datetime-local"
                value={deadline}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeadline(e.target.value)}
              />
              <ListItem
                label
                title="Require confirmation from someone else"
                after={<Toggle checked={requiresVerification} onChange={() => setRequiresVerification((v) => !v)} />}
              />
            </List>

            {errorMessage && <p className="mt-2 px-2 text-center text-sm text-red-500">{errorMessage}</p>}

            <Button
              large
              rounded
              className="mx-2 mt-4"
              disabled={isSaving || !title.trim() || !deadline}
              onClick={handleCreate}
            >
              {isSaving ? 'Creating…' : 'Create Goal'}
            </Button>
          </>
        )}

        <Button large rounded clear className="mx-2 mt-2" onClick={close}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}

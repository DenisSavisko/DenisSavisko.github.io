import { useState } from 'react';
import { List, ListInput, ListItem, Navbar, Preloader, Sheet, Toggle } from 'konsta/react';
import { createGoal, getCloudKitContainer } from './cloudkit';
import { createVerification } from './verification';
import { ensureSignedIn } from './supabase';
import type { ShareVerificationTarget } from './ShareVerificationSheet';

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
  const [deadline, setDeadline] = useState('');
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isValid = title.trim() !== '' && deadline !== '';

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
      </div>
    </Sheet>
  );
}

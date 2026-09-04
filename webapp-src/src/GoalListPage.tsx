import { Fragment, type ReactNode } from 'react';
import { Block, List, ListItem, Preloader } from 'konsta/react';
import type { Goal } from './useGoals';
import { groupByMonth } from './useGoals';

export function GoalListPage({
  status,
  errorMessage,
  goals,
  emptyIcon,
  emptyTitle,
  emptyText,
  groupDateOf,
  renderRow,
}: {
  status: 'unconfigured' | 'idle' | 'loading' | 'error' | 'loaded';
  errorMessage?: string;
  /// Already filtered + sorted for this specific tab (see sortedByTab) — only meaningful once
  /// status is 'loaded'.
  goals: Goal[];
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyText: string;
  /// When set, rows are grouped into month sections (Done/Failed) — omitted for a flat list
  /// (Active), matching ActiveListView vs DoneListView/FailedListView on iOS.
  groupDateOf?: (goal: Goal) => Date;
  renderRow: (goal: Goal) => ReactNode;
}) {
  if (status === 'unconfigured') {
    return (
      <Block strong inset className="text-center text-red-600 dark:text-red-400">
        CloudKit isn't configured yet — see webapp-src/README.md.
      </Block>
    );
  }

  if (status === 'idle' || status === 'loading') {
    return (
      <Block strong inset className="flex flex-col items-center gap-3 py-10 text-center">
        {status === 'loading' && <Preloader />}
        <p className="text-ios-secondary dark:text-ios-secondary-dark">
          {status === 'loading' ? 'Loading your goals…' : 'Sign in with your Apple ID (above) to see your goals.'}
        </p>
      </Block>
    );
  }

  if (status === 'error') {
    return (
      <Block strong inset className="text-center text-red-600 dark:text-red-400">
        Couldn't load goals: {errorMessage}
      </Block>
    );
  }

  if (goals.length === 0) {
    return (
      <Block strong inset className="flex flex-col items-center gap-2 py-10 text-center text-ios-secondary dark:text-ios-secondary-dark">
        <span className="[&>svg]:h-10 [&>svg]:w-10">{emptyIcon}</span>
        <p className="font-semibold text-black dark:text-white">{emptyTitle}</p>
        <p className="text-sm">{emptyText}</p>
      </Block>
    );
  }

  if (!groupDateOf) {
    return (
      <List strongIos outlineIos insetIos>
        {goals.map((goal) => renderRow(goal))}
      </List>
    );
  }

  const sections = groupByMonth(goals, groupDateOf);
  return (
    <List strongIos outlineIos insetIos>
      {sections.map((section) => (
        <Fragment key={section.title}>
          <ListItem groupTitle title={section.title} />
          {section.goals.map((goal) => renderRow(goal))}
        </Fragment>
      ))}
    </List>
  );
}

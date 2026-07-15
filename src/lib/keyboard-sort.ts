export type KeyboardSortKey = 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';
export type KeyboardSortBehaviorKey = KeyboardSortKey | 'Escape';

export const KEYBOARD_SORT_KEY_SHORTCUTS = 'Enter Space ArrowUp ArrowDown Home End Escape';

export type KeyboardSortState<T> = {
  items: T[];
  active: boolean;
  focusIndex: number;
  announcement: string;
};

export function moveByKeyboard<T>(items: T[], index: number, key: KeyboardSortKey) {
  if (items.length === 0 || index < 0 || index >= items.length) return { items: [...items], nextIndex: index };
  const nextIndex = key === 'Home'
    ? 0
    : key === 'End'
      ? items.length - 1
      : key === 'ArrowUp'
        ? Math.max(0, index - 1)
        : Math.min(items.length - 1, index + 1);
  if (nextIndex === index) return { items: [...items], nextIndex };
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(nextIndex, 0, moved);
  return { items: next, nextIndex };
}

export function beginKeyboardSort<T>(items: T[], focusIndex: number): KeyboardSortState<T> {
  return { items: [...items], active: true, focusIndex, announcement: '已进入排序模式' };
}

export function transitionKeyboardSort<T>(
  state: KeyboardSortState<T>,
  key: KeyboardSortBehaviorKey,
): KeyboardSortState<T> {
  if (key === 'Escape') {
    return { ...state, active: false, announcement: '已退出排序模式' };
  }
  if (!state.active) return state;
  const result = moveByKeyboard(state.items, state.focusIndex, key);
  return {
    items: result.items,
    active: true,
    focusIndex: result.nextIndex,
    announcement: `已移动到第 ${result.nextIndex + 1} 项`,
  };
}

export function keyboardSortAria<T>(state: KeyboardSortState<T>) {
  return {
    grabbed: state.active,
    focusIndex: state.focusIndex,
    keyShortcuts: KEYBOARD_SORT_KEY_SHORTCUTS,
  };
}

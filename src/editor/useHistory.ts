import { useCallback, useRef, useState } from "react";

const LIMIT = 100;

/**
 * Undo/redo for a controlled value. `commit` records the current value before passing
 * the next one to `onChange`.
 */
export function useHistory<T>(value: T, onChange: (next: T) => void) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, bump] = useState(0);
  const latest = useRef(value);
  latest.current = value;
  const lastMergeKey = useRef<string | undefined>(undefined);

  /**
   * Records a change. Consecutive changes with the same `mergeKey` (typing in one field)
   * become one undo step.
   */
  const commit = useCallback(
    (next: T, mergeKey?: string) => {
      if (next === latest.current) {
        return;
      }
      const merge = mergeKey !== undefined && mergeKey === lastMergeKey.current && past.current.length > 0;
      if (!merge) {
        past.current = [...past.current.slice(-(LIMIT - 1)), latest.current];
      }
      lastMergeKey.current = mergeKey;
      future.current = [];
      bump((n) => n + 1);
      onChange(next);
    },
    [onChange],
  );

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    if (previous === undefined) {
      return;
    }
    past.current = past.current.slice(0, -1);
    future.current = [latest.current, ...future.current];
    lastMergeKey.current = undefined;
    bump((n) => n + 1);
    onChange(previous);
  }, [onChange]);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (next === undefined) {
      return;
    }
    future.current = future.current.slice(1);
    past.current = [...past.current, latest.current];
    lastMergeKey.current = undefined;
    bump((n) => n + 1);
    onChange(next);
  }, [onChange]);

  return { commit, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

"use client";

import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

export function useLiveQuery<T>(query: () => Promise<T>, initialValue: T, deps: readonly unknown[] = []) {
  const [value, setValue] = useState<T>(initialValue);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: (nextValue) => {
        setValue(nextValue);
        setError(null);
      },
      error: (nextError) => {
        setError(nextError instanceof Error ? nextError : new Error("Live query failed"));
      }
    });

    return () => subscription.unsubscribe();
  }, deps);

  return { value, error };
}

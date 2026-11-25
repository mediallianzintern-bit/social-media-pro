// Whether Pro is part-way through switching to another client (Studio Phase
// 5). The switcher sets it; the shell fades the page while it is set, so the
// old client's figures stay readable but plainly on their way out, and the
// new client's name and figures arrive together.
import { useSyncExternalStore } from "react";

let switching = false;
const listeners = new Set<() => void>();

export function setClientSwitching(value: boolean) {
  if (switching === value) return;
  switching = value;
  for (const listener of listeners) listener();
}

export function useClientSwitching(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => switching,
    () => false,
  );
}

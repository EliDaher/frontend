export function createActionGuard() {
  let busy = false;

  return {
    get busy() {
      return busy;
    },
    async run(action: () => Promise<void>) {
      if (busy) return false;
      busy = true;
      try {
        await action();
        return true;
      } finally {
        busy = false;
      }
    }
  };
}

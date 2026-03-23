import { runCleanup } from "./index";

let intervalId: ReturnType<typeof setInterval> | null = null;

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const VACUUM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
let lastVacuum = Date.now();

export function startCleanupScheduler() {
  if (intervalId) return;

  // Run once after a 30s delay to let server fully start
  setTimeout(() => {
    try {
      const result = runCleanup({ vacuum: false });
      console.log("[cleanup] Initial cleanup:", result);
    } catch (err) {
      console.error("[cleanup] Initial cleanup failed:", err);
    }
  }, 30_000);

  intervalId = setInterval(() => {
    const shouldVacuum = Date.now() - lastVacuum > VACUUM_INTERVAL_MS;
    try {
      const result = runCleanup({ vacuum: shouldVacuum });
      if (shouldVacuum) lastVacuum = Date.now();
      console.log("[cleanup] Scheduled cleanup:", result);
    } catch (err) {
      console.error("[cleanup] Scheduled cleanup failed:", err);
    }
  }, CLEANUP_INTERVAL_MS);
}

export function stopCleanupScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

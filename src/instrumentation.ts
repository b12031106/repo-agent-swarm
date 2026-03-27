export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // PM2 cluster mode 下只讓 instance 0 跑排程，避免重複執行
    const instanceId = process.env.NODE_APP_INSTANCE;
    if (!instanceId || instanceId === "0") {
      const { startCleanupScheduler } = await import("@/lib/cleanup/scheduler");
      startCleanupScheduler();
    }
  }
}

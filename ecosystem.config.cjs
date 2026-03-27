/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: "app",
      script: ".next/standalone/server.js",
      instances: 2,
      exec_mode: "cluster",
      env: {
        PORT: 3000,
        NODE_ENV: "production",
      },
      // Graceful shutdown: 等待進行中的 SSE stream 完成
      kill_timeout: 10000,
      // 防止 crash loop
      max_restarts: 10,
      min_uptime: 5000,
      // Logs
      merge_logs: true,
      out_file: "./data/logs/app-out.log",
      error_file: "./data/logs/app-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "updater",
      script: "./scripts/auto-updater.mjs",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        UPDATE_CHECK_INTERVAL_MS: "300000", // 5 分鐘
        UPDATE_BRANCH: "main",
      },
      out_file: "./data/logs/updater-out.log",
      error_file: "./data/logs/updater-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};

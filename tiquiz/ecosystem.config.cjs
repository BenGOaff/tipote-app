// PM2 configuration for Tiquiz
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: "tiquiz",
      script: ".next/standalone/server.js",
      cwd: "/home/user/tiquiz", // Adjust to your deployment path
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        HOSTNAME: "127.0.0.1",
      },
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/home/user/logs/tiquiz-error.log",
      out_file: "/home/user/logs/tiquiz-out.log",
      merge_logs: true,
    },
  ],
};

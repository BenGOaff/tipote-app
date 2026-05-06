// pm2 process file for Tipote in production.
//
// next.config.ts sets `output: "standalone"`. With that, Next emits a
// self-contained server at .next/standalone/server.js — but unlike
// `next start`, that server does NOT auto-load .env.local at runtime.
// We pass them explicitly via Node's --env-file flag (Node ≥ 20.6).
//
// Start with:  pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: "tipote-prod",
      cwd: "/home/tipote/tipote-app",
      script: ".next/standalone/server.js",
      interpreter: "node",
      node_args: [
        "--env-file=/home/tipote/tipote-app/.env.local",
        "--env-file=/home/tipote/tipote-app/.env",
      ],
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      kill_timeout: 10000,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};

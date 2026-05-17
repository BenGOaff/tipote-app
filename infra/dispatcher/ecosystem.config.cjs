// PM2 process definition for the custom-domains dispatcher.
//
// Usage on the VPS:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//
// The three CADDY_ASK_SECRET vars MUST match the values set in each
// app's env (and in /etc/caddy/caddy.env for DISPATCHER_ASK_SECRET).
// Reading from process.env keeps the secrets out of git — feed them
// via /etc/default/dispatcher.env or `pm2 set` before starting.

module.exports = {
  apps: [
    {
      name: "domain-dispatcher",
      script: "./server.mjs",
      cwd: __dirname,
      // Single instance is plenty — pure I/O, lookups are cached.
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      // Cap memory so a leak can't OOM the VPS.
      max_memory_restart: "150M",
      env: {
        NODE_ENV: "production",
        DISPATCHER_PORT: "4000",
        TIPOTE_PORT: "3000",
        TIQUIZ_PORT: "3001",
        // The next three are deliberately NOT set here. They come
        // from the shell env or /etc/default/dispatcher.env loaded
        // via `pm2 start --update-env` after sourcing.
        // TIPOTE_CADDY_ASK_SECRET
        // TIQUIZ_CADDY_ASK_SECRET
        // DISPATCHER_ASK_SECRET
      },
    },
  ],
};

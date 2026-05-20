// PM2 ecosystem config for KuratorKas (sandbox local dev)
// Run: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'kuratorkas',
      script: 'npx',
      // Local dev without D1 binding (graceful degradation in src/index.tsx).
      // To enable D1 locally, see README → Local D1 setup.
      // --d1 DB=kuratorkas binds the D1 database to env.DB (local SQLite mirror)
      args: 'wrangler pages dev dist --d1 DB=kuratorkas --kv KV --ip 0.0.0.0 --port 3000',
      env: { NODE_ENV: 'development', PORT: 3000 },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}

import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { createDatabasePool, initializeDatabase } from "./server/database.js";
import { createWorldApiMiddleware } from "./server/worldApi.js";
import { createBrainGateway } from "./server/brainGateway.js";
import { ExperimentManager } from "./server/experimentManager.js";
import { createExperimentApi } from "./server/experimentApi.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pool = createDatabasePool(env.DATABASE_URL);
  const attachApi = async (server: Pick<ViteDevServer, "middlewares">) => {
    if (pool) await initializeDatabase(pool).catch((cause) => console.warn("PostgreSQL is unavailable; browser storage remains active.", cause));
    server.middlewares.use(createBrainGateway({ serviceUrl: env.BRAIN_SERVICE_URL, token: env.FREEWILL_BRAIN_TOKEN }));
    const experimentManager = new ExperimentManager(pool, { brainServiceUrl: env.BRAIN_SERVICE_URL, brainToken: env.FREEWILL_BRAIN_TOKEN });
    // A Vite dev server may run beside Docker against the same database. It
    // must not declare the production runner interrupted when HMR restarts.
    if (env.FREEWILL_DEV_RECOVER_INTERRUPTED === "true") await experimentManager.recoverInterrupted();
    server.middlewares.use(createExperimentApi(experimentManager));
    server.middlewares.use(createWorldApiMiddleware({
      pool,
      databaseDashboardUrl: env.DATABASE_DASHBOARD_URL,
    }));
  };

  return {
    plugins: [
      react(),
      {
        name: "freewill-server-api",
        configureServer: attachApi,
        configurePreviewServer: attachApi,
      },
    ],
    publicDir: "public",
    server: {
      host: "127.0.0.1",
      port: 5173,
    },
  };
});

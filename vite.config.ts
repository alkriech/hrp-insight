import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.sites/hosting.json";
import localConfig from "./wrangler.local.json";
import { sites } from "./build/sites-vite-plugin";

const HRP_INSIGHT_PLACEHOLDER_DATABASE_ID =
  localConfig.d1_databases[0].database_id;

const { d1, r2 } = hostingConfig;

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  compatibility_date: localConfig.compatibility_date,
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "hrp-insight-d1",
          database_id: HRP_INSIGHT_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "hrp-insight-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import packageJson from "./package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get git information for build versioning
const getGitInfo = () => {
  try {
    const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    const commitDate = execSync("git log -1 --format=%cI").toString().trim();
    const isDirty = execSync("git status --porcelain").toString().trim() !== "";

    return {
      hash: commitHash,
      branch: branch,
      date: commitDate,
      dirty: isDirty
    };
  } catch (e) {
    console.warn("Git info not available:", e.message);
    return {
      hash: "unknown",
      branch: "unknown",
      date: new Date().toISOString(),
      dirty: false
    };
  }
};

// Generate build number based on package version, environment, and git info
const generateBuildNumber = (mode) => {
  // Use getGitHash() so Docker builds that pass VITE_GIT_COMMIT_HASH as a
  // build-arg get the correct hash. getGitInfo().hash runs git directly and
  // always returns "unknown" inside a Docker context with no .git directory.
  const hash = getGitHash();
  const gitInfo = getGitInfo();
  const version = packageJson.version || "0.0.0";
  const env = mode === "production" ? "prod" : "dev";
  const dirtyFlag = gitInfo.dirty ? "-dirty" : "";

  // Format: v1.0.0-dev-abc1234[-dirty]
  return `v${version}-${env}-${hash}${dirtyFlag}`;
};

// Get git commit hash. Checks VITE_GIT_COMMIT_HASH env var first so Docker
// builds can inject the hash via --build-arg without needing .git in the context.
const getGitHash = () => {
  if (process.env.VITE_GIT_COMMIT_HASH && process.env.VITE_GIT_COMMIT_HASH !== 'unknown') {
    return process.env.VITE_GIT_COMMIT_HASH;
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch (e) {
    return "unknown";
  }
};

// Custom plugin to serve marketing website at root
const marketingWebsitePlugin = () => {
  return {
    name: 'marketing-website',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Serve marketing website for specific paths
        const marketingPaths = ['/', '/features.html', '/pricing.html', '/demo.html', '/self-assessment.html'];
        const websiteDir = path.resolve(__dirname, '../website');

        if (marketingPaths.includes(req.url) || req.url.startsWith('/images/') || req.url.startsWith('/css/') || req.url.startsWith('/js/')) {
          // Strip query string from URL (e.g., ?v=2)
          const urlWithoutQuery = req.url.split('?')[0];
          const filePath = urlWithoutQuery === '/' ? '/index.html' : urlWithoutQuery;
          const fullPath = path.join(websiteDir, filePath);

          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            const ext = path.extname(fullPath);
            const contentTypes = {
              '.html': 'text/html',
              '.css': 'text/css',
              '.js': 'application/javascript',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.svg': 'image/svg+xml',
              '.webp': 'image/webp',
            };

            res.setHeader('Content-Type', contentTypes[ext] || 'text/plain');
            res.end(fs.readFileSync(fullPath));
            return;
          }
        }

        next();
      });
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from root directory (parent of frontend/)
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');

  // Fix for Windows Git Bash path expansion issue:
  // If VITE_API_URL doesn't start with http/https or /, it may have been corrupted
  // by Git Bash path expansion (e.g., "/api" -> "C:/Program Files/Git/api")
  // Valid values: "/api" (relative), "http://..." or "https://..." (absolute)
  if (env.VITE_API_URL && !env.VITE_API_URL.startsWith('http') && !env.VITE_API_URL.startsWith('/')) {
    console.warn(`[vite.config.js] Invalid VITE_API_URL detected: "${env.VITE_API_URL}"`);

    // In production, this should never happen - fail loudly
    if (mode === 'production') {
      throw new Error(
        `Invalid VITE_API_URL in production: "${env.VITE_API_URL}". ` +
        `Must start with http://, https://, or / (relative)`
      );
    }

    // In development, use sensible fallback
    const fallback = 'http://localhost:4000/api';
    console.warn(`[vite.config.js] Using development fallback: ${fallback}`);
    env.VITE_API_URL = fallback;
  }

  return {
  plugins: [react(), marketingWebsitePlugin()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    watch: {
      usePolling: true,
    },
    // Middleware to serve marketing website at root
    middlewareMode: false,
    fs: {
      allow: ['..'],
    },
    // Proxy API requests to backend in development
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "build",
    sourcemap: mode !== 'production',
    chunkSizeWarningLimit: 1000,
    ...(mode === 'production' && {
      minify: 'terser',
      terserOptions: { compress: { drop_console: true, drop_debugger: true } },
    }),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      exclude: [
        'src/test/**',
        'src/**/*.test.{js,jsx,ts,tsx}',
        'src/**/__tests__/**',
        'build/**',
      ],
    },
  },
  define: {
    global: "globalThis",
    "import.meta.env.VITE_GIT_COMMIT_HASH": JSON.stringify(getGitHash()),
    "import.meta.env.VITE_BUILD_NUMBER": JSON.stringify(generateBuildNumber(mode)),
    "import.meta.env.VITE_BUILD_INFO": JSON.stringify(getGitInfo()),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
    // Expose VITE_ prefixed env vars from root .env
    "import.meta.env.VITE_API_URL": JSON.stringify(env.VITE_API_URL),
    "import.meta.env.VITE_RECAPTCHA_SITE_KEY": JSON.stringify(env.VITE_RECAPTCHA_SITE_KEY),
    "import.meta.env.VITE_BASE_DOMAIN": JSON.stringify(env.VITE_BASE_DOMAIN || 'br360.example.com'),
  },
  };
});

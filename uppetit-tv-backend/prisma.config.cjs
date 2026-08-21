// prisma.config.cjs — CommonJS config for Prisma CLI (Postgres)
// Use defineConfig from prisma/config; dotenv loads .env for local development
const { defineConfig } = require('prisma/config');
require('dotenv').config();

// Prefer explicit process.env read to avoid env helper resolution edge-cases in some CLI flows
const dbUrl = process.env.DATABASE_URL || undefined;
if (!dbUrl) {
  // Helpful debug message when CLI can't find the URL
  // Note: Prisma CLI may still show its own error if undefined
  console.error('prisma.config.cjs ⚠️ DATABASE_URL is not set in environment');
}

module.exports = defineConfig({
  datasources: {
    db: {
      provider: 'postgresql',
      url: dbUrl,
    },
  },
  generators: {
    client: {
      provider: 'prisma-client-js',
    },
  },
});

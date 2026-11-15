// Vercel serverless adapter — exposes the same Express app as a
// Vercel Function. No secrets, no database: verification is stateless.
const { default: app } = await import("../src/server.mjs");

export default app;

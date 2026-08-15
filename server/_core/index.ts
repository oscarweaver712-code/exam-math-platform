import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { getDb } from "../db";
import { variantGenerationSchedules } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { createPublishedMonthlyVariant, monthKeyFrom } from "../variantService";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/scheduled/monthly-oge-variant", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req as never);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [schedule] = await db.select().from(variantGenerationSchedules).where(eq(variantGenerationSchedules.scheduleCronTaskUid, user.taskUid)).limit(1);
      if (!schedule || !schedule.isActive) return res.json({ ok: true, skipped: "orphan-or-paused" });
      const monthKey = monthKeyFrom();
      const result = await createPublishedMonthlyVariant(db, schedule.examTrackId, monthKey);
      await db.update(variantGenerationSchedules).set({ lastGeneratedMonthKey: monthKey, lastGeneratedAt: Date.now(), lastError: null, updatedAt: Date.now() }).where(eq(variantGenerationSchedules.id, schedule.id));
      res.json({ ok: true, monthKey, ...result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error), timestamp: Date.now() });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

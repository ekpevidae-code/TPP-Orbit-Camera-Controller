import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import { createClient } from "redis";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { PrismaClient } from "@prisma/client";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port");
  }

  const clientOrigin = required("CLIENT_ORIGIN");
  const prisma = new PrismaClient();
  const publisher = createClient({ url: required("REDIS_URL") });
  const subscriber = publisher.duplicate();

  publisher.on("error", error => console.error("Redis publisher:", error));
  subscriber.on("error", error => console.error("Redis subscriber:", error));

  try {
    await Promise.all([prisma.$connect(), publisher.connect(), subscriber.connect()]);
    await prisma.$queryRaw`SELECT 1`;
    await publisher.ping();
  } catch (error) {
    await Promise.allSettled([prisma.$disconnect(), publisher.quit(), subscriber.quit()]);
    throw error;
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({
    origin: clientOrigin.split(",").map(value => value.trim()),
    credentials: true,
    methods: ["GET", "POST", "PATCH"]
  }));
  app.use(express.json({ limit: "32kb" }));

  app.get("/health/live", (_request, response) => {
    response.status(200).json({ status: "alive" });
  });

  app.get("/health/ready", async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await publisher.ping();
      response.status(200).json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "not_ready" });
    }
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: clientOrigin.split(",").map(value => value.trim()), credentials: true },
    transports: ["websocket"],
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000
  });
  io.adapter(createAdapter(publisher, subscriber));

  httpServer.listen(port, "0.0.0.0", () => {
    console.info(`Velocity Run backend listening on :${port}`);
  });

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.info(`Shutting down after ${signal}`);
    const forceExit = setTimeout(() => process.exit(1), 15_000);
    forceExit.unref();
    io.close(async () => {
      await Promise.allSettled([
        prisma.$disconnect(),
        publisher.quit(),
        subscriber.quit()
      ]);
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

main().catch(error => {
  console.error("Backend startup failed:", error);
  process.exitCode = 1;
});

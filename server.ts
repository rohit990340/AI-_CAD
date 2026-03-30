import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  app.use(express.json());

  // Simple in-memory state for rooms
  const rooms: Record<string, any[]> = {};

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
      
      // Send current room state to the new user
      if (rooms[roomId]) {
        socket.emit("room-state", rooms[roomId]);
      } else {
        rooms[roomId] = [];
      }
    });

    socket.on("update-objects", ({ roomId, objects }) => {
      rooms[roomId] = objects;
      socket.to(roomId).emit("objects-updated", objects);
    });

    socket.on("update-annotations", ({ roomId, annotations }) => {
      socket.to(roomId).emit("annotations-updated", annotations);
    });

    socket.on("move-cursor", ({ roomId, x, y, name }) => {
      socket.to(roomId).emit("cursor-moved", { id: socket.id, x, y, name });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      io.emit("user-left", socket.id);
    });
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "CAD Processing Engine Online" });
  });

  // Mock CAD Processing Endpoint
  app.post("/api/process-cad", (req, res) => {
    const { geometryData } = req.body;
    console.log("Processing geometry:", geometryData);
    // In a real scenario, this might call a WASM-based OpenCascade or similar
    // For now, we simulate processing and return analysis
    res.json({
      success: true,
      analysis: {
        volume: Math.random() * 100,
        surfaceArea: Math.random() * 200,
        materialEfficiency: 0.85 + Math.random() * 0.1,
        structuralIntegrity: "High",
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

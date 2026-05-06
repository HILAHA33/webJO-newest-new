import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/terminal" });

  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.post("/api/sync", (req, res) => {
    try {
      const { projectId, files } = req.body;
      if (!projectId || !files) return res.status(400).json({ error: "Missing projectId or files" });
      
      const projectDir = path.join(process.cwd(), ".projects", projectId);
      import("fs").then(fs => {
        fs.mkdirSync(projectDir, { recursive: true });
        for (const [filePath, fileData] of Object.entries(files) as any) {
          const fullPath = path.join(projectDir, filePath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, fileData.content);
        }
        res.json({ success: true, dir: projectDir });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/exec", (req, res) => {
    try {
      const { projectId, command } = req.body;
      if (!projectId || !command) return res.status(400).json({ error: "Missing projectId or command" });
      
      const cwd = path.join(process.cwd(), ".projects", projectId);
      import("child_process").then(({ exec }) => {
        exec(command, { cwd }, (error, stdout, stderr) => {
          res.json({ error: error?.message, stdout, stderr });
        });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Terminal WebSocket logic
  wss.on("connection", (ws, req) => {
    console.log("Terminal connection established", req.url);
    
    let cwd = process.cwd();
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const projectId = url.searchParams.get("projectId");
    if (projectId) {
      cwd = path.join(process.cwd(), ".projects", projectId);
      import("fs").then(fs => fs.mkdirSync(cwd, { recursive: true }));
    }

    // Spawn a pseudo-terminal using python3's pty module
    // This provides a real PTY so bash behaves normally (handles \r text alignment natively, bash prompt works, etc.)
    let terminal: any;
    try {
      terminal = spawn("python3", ["-c", "import pty; import sys; pty.spawn(['/bin/bash', '--noprofile', '--norc'])"], {
        env: { 
          ...process.env, 
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          PS1: "PS \\w> ",
          LANG: "en_US.UTF-8",
          PATH: process.env.PATH
        },
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      terminal = spawn("/bin/sh", [], {
        env: { ...process.env, TERM: "xterm-256color", PS1: "# " },
        cwd,
      });
    }

    // Windows PowerShell-style Welcome message since the user requested "looks like the windows 11 powershell"
    const banner = [
      "Windows PowerShell",
      "Copyright (C) Microsoft Corporation. All rights reserved.",
      "",
      "Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows",
      "",
      ""
    ].join("\r\n");
    ws.send(banner);


    let outputBuffer: Buffer[] = [];
    let flushTimeout: NodeJS.Timeout | null = null;

    const flush = () => {
      if (outputBuffer.length > 0) {
        const combined = Buffer.concat(outputBuffer);
        if (ws.readyState === ws.OPEN) {
          ws.send(combined);
        }
        outputBuffer = [];
      }
      flushTimeout = null;
    };

    const handleData = (data: Buffer) => {
      outputBuffer.push(data);
      if (!flushTimeout) {
        // High-frequency updates are batched every 10ms
        flushTimeout = setTimeout(flush, 10);
      }
      // If buffer gets too big (e.g. 32KB), flush immediately
      const totalLength = outputBuffer.reduce((acc, b) => acc + b.length, 0);
      if (totalLength > 32768) {
        if (flushTimeout) clearTimeout(flushTimeout);
        flush();
      }
    };

    terminal.stdout.on("data", handleData);
    terminal.stderr.on("data", handleData);

    ws.on("message", (message) => {
      terminal.stdin.write(message);
    });

    terminal.on("close", () => {
      ws.close();
    });

    ws.on("close", () => {
      terminal.kill();
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import Groq from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import fs from "fs";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { createServer } from "http";

const JWT_SECRET = process.env.JWT_SECRET || "caravana-rosa-secret-2026";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "kadjo5-davjar-Borkyd";

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);

  app.use(express.json());
  const PORT = 3000;

  const WHITELIST = [7909565335];

  const db = new Database("history.db");
  db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER,
    role TEXT,
    content TEXT, 
    is_transaction_end INTEGER DEFAULT 0, 
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    alias TEXT
  );
  CREATE TABLE IF NOT EXISTS audios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_file_id TEXT UNIQUE,
    audio_data BLOB NOT NULL,
    mime_type TEXT DEFAULT 'audio/ogg'
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    status INTEGER NOT NULL,
    audio_id INTEGER,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(audio_id) REFERENCES audios(id)
  );
`);

  const saveMessage = (
    chatId: number,
    role: "user" | "assistant",
    content: Anthropic.MessageParam['content'],
    isTransactionEnd: boolean = false
  ) => {
    db.prepare(
      "INSERT INTO messages (chat_id, role, content, is_transaction_end) VALUES (?, ?, ?, ?)"
    ).run(chatId, role, JSON.stringify(content), isTransactionEnd ? 1 : 0);
  };

  const getHistory = (chatId: number): Anthropic.MessageParam[] => {
    const rows = db.prepare(
      "SELECT role, content, is_transaction_end FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 30"
    ).all(chatId) as { role: "user" | "assistant"; content: string; is_transaction_end: number }[];

    const history: Anthropic.MessageParam[] = [];

    const endIdx = rows.findIndex(r => r.is_transaction_end === 1);
    const rowsToUse = endIdx !== -1 ? rows.slice(0, endIdx + 1) : rows;

    for (const row of rowsToUse.reverse()) {
      let content = JSON.parse(row.content);

      const last = history[history.length - 1];
      if (last && last.role === row.role) {
        if (typeof last.content === "string" && typeof content === "string") {
          last.content = last.content + "\n" + content;
        } else {
          const lastBlocks = Array.isArray(last.content) ? last.content : [{ type: "text", text: last.content }];
          const curBlocks = Array.isArray(content) ? content : [{ type: "text", text: content }];
          last.content = [...lastBlocks, ...curBlocks] as any;
        }
        continue;
      }

      history.push({ role: row.role, content });
      if (row.is_transaction_end === 1) {
      }
    }
    while (history.length > 0 && history[0].role !== "user") {
      const removed = history.shift();
      if (removed && Array.isArray(removed.content)) {
        const hasToolUse = (removed.content as any[]).some((b: any) => b.type === 'tool_use');
        if (hasToolUse && history.length > 0 && (history[0] as any).role === 'user' && Array.isArray(history[0].content)) {
          const onlyToolResults = (history[0].content as any[]).every((b: any) => b.type === 'tool_result');
          if (onlyToolResults) {
            history.shift();
          }
        }
      }
    }

    console.log(`[History] Retornando ${history.length} mensajes para el chat ${chatId}`);
    return history;
  };

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });
  const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620";

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn("TELEGRAM_BOT_TOKEN is missing.");
  } else {
    const bot = new Telegraf(botToken);

    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (userId && WHITELIST.includes(userId)) {
        return next();
      }
      console.log(`Intento de acceso denegado para el ID: ${userId}`);
      await ctx.reply(`⛔ Acceso denegado.\n\nTu ID de usuario es: ${userId}`);
    });

    const tools: Anthropic.Tool[] = [
      {
        name: "registrar_transaccion",
        description: "Registra una transacción.",
        input_schema: {
          type: "object",
          properties: {
            customer_id: { type: "integer", description: "ID numérico del cliente" },
            amount: { type: "number", description: "Monto del pedido" },
            timestamp: { type: "integer", description: "Timestamp unix" },
            description: { type: "string", description: "Descripción del pedido" },
            audio_id: { type: "integer", description: "ID del audio" },
            status: { type: "integer", description: "0 = fiado, 1 = pagado al instante, 2 = abono, 3 = anticipo" },
          },
          required: ["customer_id", "amount", "timestamp", "description", "status"],
        },
      },
      {
        name: "registrar_cliente",
        description: "Crea un nuevo cliente. Requiere nombre o alias.",
        input_schema: {
          type: "object",
          properties: {
            nombre: { type: "string", description: "Nombre oficial" },
            alias: { type: "array", items: { type: "string" }, description: "Apodos" },
          },
        },
      },
      {
        name: "buscar_cliente",
        description: "Busca clientes por nombre o alias.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre o apodo" },
          },
          required: ["query"],
        },
      },
    ];

    const handleToolCall = async (chatId: number, name: string, args: any) => {
      try {
        if (name === "registrar_transaccion") {
          const status = args.status;
          const customer_id = args.customer_id;
          const amount = args.amount;
          const timestamp = args.timestamp;
          const description = args.description;
          const audio_id = args.audio_id; //nullable

          db.prepare("INSERT INTO transactions (customer_id, amount, timestamp, description, audio_id, status) VALUES (?, ?, ?, ?, ?, ?)")
            .run(customer_id, amount, timestamp, description, audio_id, status);
          io.emit("transaction_updated");
          return `✅ Transacción registrada para el cliente bajo la ID ${args.customer_id}.`;
        }

        if (name === "registrar_cliente") {
          const aliasStr = args.alias ? JSON.stringify(args.alias) : "[]";
          const info = db.prepare("INSERT INTO customers (nombre, alias) VALUES (?, ?)")
            .run(args.nombre || null, aliasStr);
          return `✅ Cliente registrado. ID: ${info.lastInsertRowid}.`;
        }

        if (name === "buscar_cliente") {
          const query = args.query.toLowerCase();
          const allCustomers = db.prepare("SELECT * FROM customers").all() as any[];
          const matches = allCustomers.filter(c => {
            const n = c.nombre?.toLowerCase().includes(query);
            const a = JSON.parse(c.alias || "[]").some((alias: string) => alias.toLowerCase().includes(query));
            return n || a;
          });

          if (matches.length === 0) return `No encuentro a nadie bajo '${args.query}'`;
          return "Clientes encontrados:\n" + matches.map(c => `${c.id}. ${c.nombre || "Sin nombre"} (${JSON.parse(c.alias || "[]").join(", ")})`).join("\n");
        }
      } catch (err: any) {
        return `Error ejecutando herramienta: ${err.message}`;
      }
      return "Error: Herramienta no encontrada.";
    };

    const processWithLLM = async (chatId: number, userText: string, audioId?: number) => {
      console.log(`\n[${new Date().toLocaleTimeString()}] 📥 ENTRADA: "${userText}"`);

      const historyForTurn = getHistory(chatId);
      saveMessage(chatId, "user", userText);

      let currentMessages = [...historyForTurn, { role: "user" as const, content: userText }];
      const nowUnix = Math.floor(Date.now() / 1000);

      const systemPrompt = fs.readFileSync("SYSTEM_PROMPT.txt", "utf-8").replace("%timestamp%", nowUnix.toString()).replace("%audioId%", audioId ? `Audio ID: ${audioId}` : "Sin audio");

      try {
        console.log(`[LLM Request] Enviando ${currentMessages.length} mensajes. System length: ${systemPrompt.length}`);
        let msg = await anthropic.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: currentMessages,
          tools,
        });

        let hasCompletedTransaction = false;

        while (msg.stop_reason === "tool_use") {
          saveMessage(chatId, "assistant", msg.content);
          currentMessages.push({ role: "assistant", content: msg.content as any });

          const toolBlocks = msg.content.filter(b => b.type === "tool_use") as Anthropic.ToolUseBlock[];
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of toolBlocks) {
            console.log(`      👉 Herramienta: ${block.name}`);
            const result = await handleToolCall(chatId, block.name, block.input);

            if (block.name === "registrar_transaccion" && !result.includes("Error")) {
              hasCompletedTransaction = true;
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }

          saveMessage(chatId, "user", toolResults);
          currentMessages.push({ role: "user", content: toolResults });

          msg = await anthropic.messages.create({
            model: ANTHROPIC_MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages: currentMessages,
            tools,
          });
          console.log(`[LLM Loop] Turno procesado. Siguiente stop_reason: ${msg.stop_reason}`);
        }

        const finalResponse = msg.content
          .filter(b => b.type === "text")
          .map(b => (b as any).text)
          .join(" ").trim() || "Operación realizada.";

        saveMessage(chatId, "assistant", msg.content, hasCompletedTransaction);
        console.log(`   📤 RESPUESTA: "${finalResponse}"\n`);
        return finalResponse;

      } catch (error: any) {
        console.error("LLM Error:", error.message);
        return "Lo siento, tuve un error técnico procesando eso.";
      }
    };

    bot.on(message("text"), async (ctx) => {
      const reply = await processWithLLM(ctx.chat.id, ctx.message.text);
      ctx.reply(reply);
    });

    bot.on(message("voice"), async (ctx) => {
      try {
        const fileId = ctx.message.voice.file_id;
        const link = await ctx.telegram.getFileLink(fileId);

        const response = await axios({
          method: "GET",
          url: link.href,
          responseType: "arraybuffer"
        });
        const audioBuffer = Buffer.from(response.data);

        const insertAudio = db.prepare(`
      INSERT OR IGNORE INTO audios (telegram_file_id, audio_data, mime_type) 
      VALUES (?, ?, ?)
    `).run(fileId, audioBuffer, ctx.message.voice.mime_type || 'audio/ogg');

        let audioId: number;
        if (insertAudio.changes > 0) {
          audioId = insertAudio.lastInsertRowid as number;
        } else {
          const existing = db.prepare("SELECT id FROM audios WHERE telegram_file_id = ?").get(fileId) as any;
          audioId = existing.id;
        }

        const tempFile = `temp_${fileId}.ogg`;
        fs.writeFileSync(tempFile, audioBuffer);

        const trans = await groq.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: "whisper-large-v3-turbo",
        });
        fs.unlinkSync(tempFile);

        if (trans.text) {
          ctx.reply(`🎤: "${trans.text}"`);
          const reply = await processWithLLM(ctx.chat.id, trans.text, audioId);
          ctx.reply(reply);
        }
      } catch (err) {
        console.error(err);
        ctx.reply("Error procesando audio.");
      }
    });

    bot.launch();
  }

  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token });
    } else {
      res.status(401).json({ error: "Credenciales incorrectas" });
    }
  });

  app.get("/api/health", authMiddleware, (req, res) => {
    res.json({ status: "ok", botStarted: !!botToken });
  });

  app.get("/api/transactions", authMiddleware, (req, res) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayUnix = Math.floor(startOfToday.getTime() / 1000);

    const rows = db.prepare(`
      SELECT p.*, c.nombre, c.alias
      FROM transactions p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.timestamp >= ? 
      ORDER BY p.id DESC
    `).all(startOfTodayUnix) as any[];

    const formattedRows = rows.map(row => {
      const name = row.nombre?.trim();
      let aliases: string[] = [];
      try {
        aliases = JSON.parse(row.alias || "[]");
      } catch (e) {
        aliases = [];
      }
      const aliasStr = aliases.join(", ");
      let customerLabel = "";
      if (name && aliasStr) {
        customerLabel = `${name} (${aliasStr})`;
      } else if (name) {
        customerLabel = name;
      } else if (aliasStr) {
        customerLabel = aliasStr;
      } else {
        customerLabel = `Desconocido (ID: ${row.customer_id})`;
      }
      return {
        id: row.id,
        chat_id: row.chat_id,
        customer_id: row.customer_id,
        amount: row.amount,
        timestamp: row.timestamp,
        customer: customerLabel,
        status: row.status,
        description: row.description
      };
    });

    res.json(formattedRows);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
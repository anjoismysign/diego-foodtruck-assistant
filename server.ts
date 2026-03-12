import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import Groq from "groq-sdk";
import OpenAI from "openai";
import axios from "axios";
import fs from "fs";
import { promisify } from "util";
import { pipeline } from "stream";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";

const streamPipeline = promisify(pipeline);

// ─── Auth config ────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "caravana-rosa-secret-2026";
const ADMIN_USER = "admin";
const ADMIN_PASS = "kadjo5-davjar-Borkyd";
// ────────────────────────────────────────────────────────────────────────────

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
  app.use(express.json());
  const PORT = 3000;

  const WHITELIST = [7909565335];

  const db = new Database("history.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS mensajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      role TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      customer TEXT NOT NULL,
      amount REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0
    );
  `);

  const saveMessage = (chatId: number, role: string, content: string) => {
    db.prepare("INSERT INTO mensajes (chat_id, role, content) VALUES (?, ?, ?)").run(chatId, role, content);
  };

  const getHistory = (chatId: number) => {
    const rows = db.prepare("SELECT role, content FROM mensajes WHERE chat_id = ? ORDER BY timestamp DESC LIMIT 10").all(chatId) as { role: string; content: string }[];
    return rows.reverse();
  };

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const openAi = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });

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
      await ctx.reply(
        `⛔ Acceso denegado.\n\nTu ID de usuario es: ${userId}\nPor favor, contacta al administrador para ser agregado como operador.`
      );
    });

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "registrar_pedido",
          description: "Registra un pedido de un cliente. TODOS los parámetros son obligatorios. Si el operador no menciona alguno, debes pedírselo antes de llamar esta función.",
          parameters: {
            type: "object",
            properties: {
              customer: { type: "string", description: "Nombre del cliente" },
              amount: { type: "number", description: "Monto del pedido en colones" },
              timestamp: { type: "integer", description: "Timestamp unix del momento del pedido" },
              paid: { type: "boolean", description: "true si el cliente pagó de inmediato, false si es fiado" },
            },
            required: ["customer", "amount", "timestamp", "paid"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "obtener_reporte",
          description: "Muestra el resumen de pedidos de las últimas 24 horas: total vendido, total cobrado en caja y cuentas pendientes.",
          parameters: {
            type: "object",
            properties: {
              customer: { type: "string", description: "Opcional: filtrar por nombre de cliente" },
            },
          },
        },
      },
    ];

    const handleToolCall = async (chatId: number, toolCall: any) => {
      if (!toolCall.function) return "Error: Tool call is not a function.";
      const { name, arguments: argsString } = toolCall.function;
      const args = JSON.parse(argsString);

      if (name === "registrar_pedido") {
        db.prepare(
          "INSERT INTO pedidos (chat_id, customer, amount, timestamp, paid) VALUES (?, ?, ?, ?, ?)"
        ).run(chatId, args.customer, args.amount, args.timestamp, args.paid ? 1 : 0);
        return args.paid
          ? `✅ Pedido registrado: ${args.customer} pagó ₡${args.amount.toLocaleString()} al contado.`
          : `📌 Pedido fiado: ${args.customer} debe ₡${args.amount.toLocaleString()}.`;
      }

      if (name === "obtener_reporte") {
        const last24h = Math.floor(Date.now() / 1000) - 86400;
        let query = "SELECT * FROM pedidos WHERE chat_id = ? AND timestamp > ?";
        const params: any[] = [chatId, last24h];
        if (args.customer) {
          query += " AND LOWER(customer) = LOWER(?)";
          params.push(args.customer);
        }
        const pedidos = db.prepare(query).all(...params) as any[];
        const totalVentas = pedidos.reduce((sum: number, p: any) => sum + p.amount, 0);
        const totalCobrado = pedidos.filter((p: any) => p.paid).reduce((sum: number, p: any) => sum + p.amount, 0);
        const totalPendiente = pedidos.filter((p: any) => !p.paid).reduce((sum: number, p: any) => sum + p.amount, 0);
        const pendientesPorCliente = pedidos
          .filter((p: any) => !p.paid)
          .reduce((acc: Record<string, number>, p: any) => {
            acc[p.customer] = (acc[p.customer] || 0) + p.amount;
            return acc;
          }, {});
        const desglose = Object.entries(pendientesPorCliente)
          .map(([name, amount]) => `- ${name}: ₡${(amount as number).toLocaleString()}`)
          .join("\n");
        return `📊 Reporte últimas 24h:
Total vendido: ₡${totalVentas.toLocaleString()}
En caja (contado): ₡${totalCobrado.toLocaleString()}
Pendiente por cobrar: ₡${totalPendiente.toLocaleString()}

${desglose ? `Cuentas pendientes:\n${desglose}` : "Sin cuentas pendientes."}`;
      }

      return "Herramienta no reconocida.";
    };

    const processWithLLM = async (chatId: number, userText: string) => {
      saveMessage(chatId, "user", userText);
      const history = getHistory(chatId);
      const nowUnix = Math.floor(Date.now() / 1000);
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `Eres Diego, el asistente de un Food Truck en Costa Rica.
Tu trabajo es registrar pedidos y dar reportes.
No uses markdown en tus respuestas.
El timestamp unix actual es: ${nowUnix}

⚠️ REGLA CRÍTICA: La función registrar_pedido requiere TODOS los parámetros: customer, amount, timestamp y paid.
- Si el operador NO menciona el nombre del cliente → pregúntalo antes de llamar la función.
- Si el operador NO menciona el monto → pregúntalo antes de llamar la función.
- Si el operador NO dice si pagó o es fiado → pregúntalo antes de llamar la función.
- Para el timestamp, usa el timestamp unix actual si no se especifica.

Responde de forma muy breve y directa.`,
        },
        ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      ];

      try {
        let response = await openAi.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o",
          messages,
          tools,
        });
        let assistantMessage = response.choices[0].message;
        if (assistantMessage.tool_calls) {
          const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...messages, assistantMessage];
          for (const toolCall of assistantMessage.tool_calls) {
            const result = await handleToolCall(chatId, toolCall);
            toolMessages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
          }
          const secondResponse = await openAi.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: toolMessages,
          });
          assistantMessage = secondResponse.choices[0].message;
        }
        saveMessage(chatId, "assistant", assistantMessage.content);
        return assistantMessage.content;
      } catch (error) {
        console.error("LLM Error:", error);
        return "Error al procesar. Intenta de nuevo.";
      }
    };

    bot.start((ctx) => ctx.reply("¡Asistente de Food Truck listo! Puedo anotar pedidos (contado/fiado) y darte reportes."));
    bot.on(message("text"), async (ctx) => {
      const reply = await processWithLLM(ctx.chat.id, ctx.message.text);
      ctx.reply(reply);
    });
    bot.on(message("voice"), async (ctx) => {
      try {
        const fileId = ctx.message.voice.file_id;
        const link = await ctx.telegram.getFileLink(fileId);
        const response = await axios({ method: "GET", url: link.href, responseType: "stream" });
        const tempFile = `temp_${fileId}.ogg`;
        await streamPipeline(response.data, fs.createWriteStream(tempFile));
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: "whisper-large-v3-turbo",
        });
        fs.unlinkSync(tempFile);
        const text = transcription.text;
        ctx.reply(`🎤: "${text}"`);
        const reply = await processWithLLM(ctx.chat.id, text);
        ctx.reply(reply);
      } catch (error) {
        console.error("Transcription Error:", error);
        ctx.reply("No pude entender el audio.");
      }
    });

    bot.launch()
      .then(() => {
        console.log("✅ Telegram Bot started successfully");
      })
      .catch((err) => {
        console.error("❌ Telegram Bot failed to start:");
        console.error(err.message);
        console.log("The Dashboard is still running. Check your IPv6/DNS settings.");
      });
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  }

  // ─── Auth endpoint (público) ─────────────────────────────────────────────
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token });
    } else {
      res.status(401).json({ error: "Credenciales incorrectas" });
    }
  });

  // ─── API protegida ────────────────────────────────────────────────────────
  app.get("/api/health", authMiddleware, (req, res) => {
    res.json({ status: "ok", botStarted: !!botToken });
  });

  app.get("/api/pedidos", authMiddleware, (req, res) => {
    const last24h = Math.floor(Date.now() / 1000) - 86400;
    const rows = db.prepare("SELECT * FROM pedidos WHERE timestamp > ? ORDER BY id DESC").all(last24h);
    res.json(rows);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

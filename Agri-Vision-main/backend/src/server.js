import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDb, hasDatabase } from "./db.js";
import { authRequired, createToken } from "./auth.js";
import { createJsonChatCompletion, createTextResponse } from "./openai.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const defaultAllowedOrigins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://localhost:8081,http://127.0.0.1:8080,http://127.0.0.1:8081";
const allowedOrigins = `${process.env.FRONTEND_URL || ""},${defaultAllowedOrigins}`
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isDevMode = process.env.DEV_MODE === "true";
const demoUser = {
  _id: "dev-user",
  name: "Demo Farmer",
  email: "demo@agrivision.local",
  createdAt: new Date().toISOString(),
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: false,
  }),
);
app.use(express.json({ limit: "10mb" }));

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function logAiRequest(entry) {
  if (!hasDatabase()) {
    return;
  }

  const db = await getDb();
  await db.collection("ai_requests").insertOne({
    ...entry,
    createdAt: new Date(),
  });
}

app.get("/api/health", async (_req, res) => {
  if (!hasDatabase()) {
    return res.json({ ok: true, mode: isDevMode ? "dev" : "no-db" });
  }

  const db = await getDb();
  await db.command({ ping: 1 });
  res.json({ ok: true, mode: "db" });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = normalizeEmail(email);

    if (!hasDatabase() && isDevMode) {
      const devUser = {
        ...demoUser,
        name: String(name).trim(),
        email: normalizedEmail,
      };
      const token = createToken(devUser);
      return res.status(201).json({ token, user: sanitizeUser(devUser) });
    }

    const db = await getDb();
    const users = db.collection("users");

    const existingUser = await users.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date(),
    };

    const result = await users.insertOne(user);
    const createdUser = { ...user, _id: result.insertedId };
    const token = createToken(createdUser);

    return res.status(201).json({
      token,
      user: sanitizeUser(createdUser),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Signup failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (!hasDatabase() && isDevMode) {
      const devUser = {
        ...demoUser,
        email: String(email).trim().toLowerCase(),
      };
      const token = createToken(devUser);
      return res.json({ token, user: sanitizeUser(devUser) });
    }

    const db = await getDb();
    const user = await db.collection("users").findOne({ email: normalizeEmail(email) });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const matches = await bcrypt.compare(String(password), user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = createToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Login failed" });
  }
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    if (!hasDatabase() && isDevMode) {
      const devUser = {
        ...demoUser,
        _id: req.auth.sub || demoUser._id,
        name: req.auth.name || demoUser.name,
        email: req.auth.email || demoUser.email,
      };
      return res.json({ user: sanitizeUser(devUser) });
    }

    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.auth.sub) });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load user" });
  }
});

app.post("/api/agri-chat", authRequired, async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const sanitizedMessages = messages
      .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.trim())
      .slice(-12);

    if (sanitizedMessages.length === 0) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const model = process.env.OPENAI_AGRI_CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const instructions = `You are AgriVision AI, a practical agricultural assistant for farmers.

Your job is to answer questions about crops, soil health, irrigation, fertilizer usage, pests, diseases, seasonal planning, and basic farm management.

Rules:
- Give practical, farmer-friendly advice in simple language.
- Prefer step-by-step answers when helpful.
- Mention uncertainty when location, crop variety, weather, or soil conditions matter.
- Do not invent local regulations, pesticide labels, or guaranteed yield outcomes.
- For dangerous, high-risk, or regulated advice, recommend consulting a local agriculture officer, agronomist, or approved product label.
- Keep answers concise but useful.
- If the question is not agriculture-related, still respond helpfully.`;

    const result = await createTextResponse({
      model,
      instructions,
      input: sanitizedMessages.map((message) => ({
        role: message.role,
        content: [
          {
            type: message.role === "assistant" ? "output_text" : "input_text",
            text: message.content,
          },
        ],
      })),
    });

    await logAiRequest({
      type: "agri-chat",
      userId: req.auth.sub,
      request: sanitizedMessages,
      responseId: result.id,
      model: result.model,
      response: result.text,
    });

    return res.json({ answer: result.text, model: result.model, responseId: result.id });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Chat failed" });
  }
});

app.post("/api/crop-advisory", authRequired, async (req, res) => {
  try {
    const { phValue, moisture, nitrogen, phosphate, weather, soilType, location, landType, month, feedback } = req.body ?? {};
    const model = process.env.OPENAI_CROP_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const systemPrompt = `You are an expert agricultural AI advisor. Based on farmer soil and field data, provide detailed crop recommendations.

Return valid JSON only with this exact structure:
{
  "soilHealth": {
    "ph": { "value": 0, "status": "Good|Warning|Critical", "description": "text" },
    "moisture": { "value": 0, "status": "Good|Warning|Critical", "description": "text" },
    "temperature": { "value": 0, "status": "Good|Warning|Critical", "description": "text" },
    "conductivity": { "value": 0, "status": "Good|Warning|Critical", "description": "text" }
  },
  "crops": [
    {
      "name": "crop name",
      "suitability": 0,
      "bestSoils": "comma separated soil types",
      "npk": "N: 0 | P: 0 | K: 0 kg/ha",
      "irrigation": "method",
      "phRange": "range",
      "tempRange": "range"
    }
  ],
  "nutrients": {
    "nitrogen": 0,
    "phosphorus": 0,
    "potassium": 0,
    "organicCarbon": 0,
    "zinc": 0,
    "iron": 0
  }
}`;

    const userPrompt = `Farmer field data:
- pH Value: ${phValue || "Not provided"}
- Moisture: ${moisture || "Not provided"}%
- Nitrogen: ${nitrogen || "Not provided"} kg/ha
- Phosphate: ${phosphate || "Not provided"} kg/ha
- Weather: ${weather || "Not provided"}
- Soil Type: ${soilType || "Not provided"}
- Location: ${location || "Not provided"}
- Land Type: ${landType || "Not provided"}
- Month: ${month || "Not provided"}
- Additional Notes: ${feedback || "None"}`;

    const result = await createJsonChatCompletion({
      model,
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    await logAiRequest({
      type: "crop-advisory",
      userId: req.auth.sub,
      request: req.body,
      responseId: result.id,
      model: result.model,
      response: result.json,
    });

    return res.json(result.json);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Crop advisory failed" });
  }
});

app.post("/api/disease-detect", authRequired, async (req, res) => {
  try {
    const { imageBase64 } = req.body ?? {};
    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const model = process.env.OPENAI_DISEASE_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
    const systemPrompt = `You are an expert agricultural plant pathologist AI. Analyze the crop image and return valid JSON only with this structure:
{
  "detected": true,
  "diseaseName": "string",
  "confidence": 85,
  "severity": "mild|moderate|severe",
  "affectedPart": "leaf|stem|fruit|root|flower|whole plant",
  "description": "string",
  "symptoms": ["symptom1", "symptom2"],
  "treatments": [
    {
      "type": "chemical|organic|cultural|biological",
      "name": "string",
      "description": "string",
      "effectiveness": "high|medium|low"
    }
  ],
  "preventionTips": ["tip1", "tip2"],
  "additionalInfo": {
    "spreadRisk": "high|medium|low",
    "commonIn": ["crop1", "crop2"],
    "bestSeason": "string",
    "estimatedYieldLoss": "string"
  }
}

If the image is not a crop or plant, set detected to false and explain that in description.`;

    const result = await createTextResponse({
      model,
      instructions: systemPrompt,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Analyze this crop or plant image and provide disease diagnosis and treatment." },
            { type: "input_image", image_url: imageBase64 },
          ],
        },
      ],
    });

    const parsed = JSON.parse(result.text);

    await logAiRequest({
      type: "disease-detect",
      userId: req.auth.sub,
      request: { hasImage: true },
      responseId: result.id,
      model: result.model,
      response: parsed,
    });

    return res.json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Disease detection failed" });
  }
});

app.listen(PORT, () => {
  const mode = hasDatabase() ? "MongoDB" : isDevMode ? "DEV_MODE (no MongoDB)" : "no database";
  console.log(`AgriVision backend running on http://localhost:${PORT} using ${mode}`);
});

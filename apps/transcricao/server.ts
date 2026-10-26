import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import multer from "multer";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// CORS configuration: Allow Clínica Exemplo frontend on Vercel, localhost, and custom domains
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "";
const customOrigins = allowedOriginsEnv
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. curl, uptime monitors, health checks)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, "");

    // 1. Localhost and development IPs
    const isLocalhost =
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin) ||
      /^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);

    // 2. All Vercel deployments (*.vercel.app, preview branches, and production)
    const isVercel =
      /^https:\/\/([a-zA-Z0-9_-]+\.)*vercel\.app$/.test(normalizedOrigin);

    // 3. Google Cloud Run and preview environments (*.run.app)
    const isCloudRunOrPreview =
      /^https:\/\/([a-zA-Z0-9_-]+\.)*run\.app$/.test(normalizedOrigin) ||
      normalizedOrigin.includes("google.com") ||
      (process.env.APP_URL && normalizedOrigin === process.env.APP_URL.replace(/\/$/, ""));

    // 4. Custom frontend URLs explicitly passed in FRONTEND_URL or ALLOWED_ORIGINS
    const isCustomAllowed = customOrigins.some((allowed) => {
      if (allowed === "*") return true;
      return normalizedOrigin === allowed || normalizedOrigin.endsWith(allowed);
    });

    if (isLocalhost || isVercel || isCloudRunOrPreview || isCustomAllowed) {
      return callback(null, true);
    }

    console.warn(`[CORS] Origem não autorizada bloqueada: ${origin}`);
    return callback(new Error(`Bloqueado pela política CORS: ${origin}`), false);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Increase JSON / urlencoded limits for general metadata
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Configure Multer storage to stream binary audio directly to disk
// Eliminates Base64 33% memory bloat and allows large consultation audios (30-60+ min, 100MB+)
const uploadDir = path.join(os.tmpdir(), "clinicos-audio-uploads");
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {
    console.warn("Aviso ao criar diretório de uploads:", e);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeExt = path.extname(file.originalname) || ".audio";
    cb(null, `consulta-${uniqueSuffix}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150 MB binary limit for long medical consultations
  },
});

// Initialize Gemini Client lazily or gracefully
function getGeminiClient() {
  const rawKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, "");
  if (!apiKey) {
    throw new Error("Chave GEMINI_API_KEY não configurada no servidor.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "clinicos-transcricao",
      },
    },
  });
}

// Health check endpoints for Render, Railway, and uptime monitors
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "clinicos-clinical-backend-webservice",
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "clinicos-clinical-backend-webservice",
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

// Main endpoint: Process Audio with Specialized Clinic Agent via multipart/form-data
app.post("/api/process-audio", upload.single("audio"), async (req, res) => {
  // Extend timeouts to 15 minutes (900s) for long consultations of 30-60 minutes
  req.setTimeout(900000);
  res.setTimeout(900000);

  let tempFilePath: string | null = null;
  let geminiUploadedFile: any = null;

  try {
    let agentConfig: any = {};
    if (req.body.agentConfig) {
      try {
        agentConfig =
          typeof req.body.agentConfig === "string"
            ? JSON.parse(req.body.agentConfig)
            : req.body.agentConfig;
      } catch (e) {
        console.warn("Não foi possível fazer parse do agentConfig JSON:", e);
      }
    }

    let detectedMimeType = req.file?.mimetype || req.body?.mimeType || "audio/webm";
    if (detectedMimeType === "application/octet-stream" && req.file?.originalname) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext === ".mp3") detectedMimeType = "audio/mp3";
      else if (ext === ".wav") detectedMimeType = "audio/wav";
      else if (ext === ".m4a") detectedMimeType = "audio/mp4";
      else if (ext === ".ogg") detectedMimeType = "audio/ogg";
      else if (ext === ".webm") detectedMimeType = "audio/webm";
    }

    const ai = getGeminiClient();

    // Default agent settings if not provided
    const clinicName = agentConfig?.clinicName || "Clínica Exemplo";
    const speciality = agentConfig?.speciality || "Dermatologia & Medicina Estética";
    const summaryFormat = agentConfig?.summaryFormat || "Anamnesis";
    const customInstructions = agentConfig?.customInstructions || "";
    const language = agentConfig?.language || "Português (Brasil)";

    // Construct specialized clinical system prompt
    const systemInstruction = `Você é um Assistente e Agente de IA Especializado em Saúde para a clínica "${clinicName}", atuando no ramo de "${speciality}".
Sua tarefa é ouvir o áudio gravado durante a consulta ou recado médico e realizar duas ações essenciais:
1. Fazer a transcrição contínua e fiel do áudio em ${language}.
2. Gerar uma Anamnese Direta estruturada profissional com Queixa Principal (QP), História da Doença Atual (HDA), Exame Físico/Tricológico, Hipótese Diagnóstica e Conduta Médica.

Regras do Agente Clínico Especializado:
- Mantenha linguagem médica formal, clara e focada no contexto de ${speciality}.
- Não invente diagnósticos não mencionados no áudio.
- Destaque queixas principais, sintomas do paciente, histórico relatado, exame físico (se citado), conduta médica e rotina home care.
- Respeite todas as diretrizes adicionais fornecidas pelo profissional: ${customInstructions}
- O retorno DEVE ser obrigatoriamente um objeto JSON estrito com os campos definidos.`;

    const promptText = `Por favor, transcreva o áudio em anexo com alta precisão e gere a Anamnese Direta clínica correspondente.`;

    let audioPart: any = null;

    if (req.file) {
      tempFilePath = req.file.path;
      console.log(
        `Processando áudio binário multipart: ${req.file.originalname} (${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`
      );

      // Stream binary file directly to Gemini Files API (handles files up to 2GB)
      try {
        const fileUploadResponse = await ai.files.upload({
          file: tempFilePath,
          config: {
            mimeType: detectedMimeType,
            displayName: req.file.originalname || "consulta_clinica",
          },
        });
        geminiUploadedFile = fileUploadResponse;
        audioPart = {
          fileData: {
            fileUri: fileUploadResponse.uri,
            mimeType: fileUploadResponse.mimeType || detectedMimeType,
          },
        };
      } catch (uploadErr) {
        console.warn("Upload direto para Gemini Files API falhou, tentando fallback por buffer:", uploadErr);
        const fileBuffer = fs.readFileSync(tempFilePath);
        audioPart = {
          inlineData: {
            mimeType: detectedMimeType,
            data: fileBuffer.toString("base64"),
          },
        };
      }
    } else if (req.body?.audioBase64) {
      // Backward compatibility fallback for legacy requests
      audioPart = {
        inlineData: {
          mimeType: detectedMimeType,
          data: req.body.audioBase64,
        },
      };
    } else {
      return res.status(400).json({
        error: "Nenhum arquivo de áudio recebido via multipart/form-data.",
      });
    }

    const textPart = {
      text: promptText,
    };

    // Modelo original estável
    const candidateModels = [
      "gemini-3.6-flash",
      "gemini-flash-latest",
    ];

    let responseText = "";
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: [audioPart, textPart] },
          config: {
            systemInstruction,
            temperature: 0.2, // Low temperature for high factual precision
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transcription: {
                  type: Type.STRING,
                  description: "Transcrição textual completa e fiel do áudio.",
                },
                summary: {
                  type: Type.OBJECT,
                  description: "Anamnese Direta clínica estruturada.",
                  properties: {
                    subjective: {
                      type: Type.STRING,
                      description: "Queixa Principal (QP), motivo da consulta e Histórico da Doença Atual (HDA) relatados pelo paciente.",
                    },
                    objective: {
                      type: Type.STRING,
                      description: "Exame Físico, avaliação dermatológica, capilar ou tricológica do paciente e achados clínicos.",
                    },
                    assessment: {
                      type: Type.STRING,
                      description: "Avaliação médica, hipótese diagnóstica, raciocínio clínico e síntese do caso.",
                    },
                    plan: {
                      type: Type.STRING,
                      description: "Conduta clínica, procedimentos prescritos, medicamentos indicados e orientações de rotina home care.",
                    },
                  },
                  required: ["subjective", "objective", "assessment", "plan"],
                },
                keySymptoms: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Lista de principais sintomas ou queixas identificadas.",
                },
                patientActionItems: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Ações imediatas que o paciente deve realizar (ex: tomar remédio X às 8h, fazer exame Y).",
                },
                followUpRecommendation: {
                  type: Type.STRING,
                  description: "Recomendação de retorno ou consulta de acompanhamento.",
                },
                clinicalCategory: {
                  type: Type.STRING,
                  description: "Categoria da consulta (ex: Anamnese Inicial, Retorno, Urgência, Procedimento).",
                },
                confidenceScore: {
                  type: Type.NUMBER,
                  description: "Nota de 0 a 100 indicando a clareza do áudio e precisão da transcrição.",
                },
              },
              required: [
                "transcription",
                "summary",
                "keySymptoms",
                "patientActionItems",
                "followUpRecommendation",
                "clinicalCategory",
                "confidenceScore",
              ],
            },
          },
        });

        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        console.warn(`Tentativa server com modelo ${modelName} falhou:`, errMsg);
        if (
          errMsg.includes("503") ||
          errMsg.includes("high demand") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("429")
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        throw err;
      }
    }

    if (!responseText && lastError) {
      throw lastError;
    }

    const parsedData = JSON.parse(responseText);

    return res.json({
      success: true,
      data: parsedData,
      meta: {
        processedAt: new Date().toISOString(),
        speciality,
        clinicName,
        formatUsed: summaryFormat,
      },
    });
  } catch (error: any) {
    console.error("Erro no processamento de áudio:", error);
    let errorMessage = error?.message || "Falha interna no processamento do áudio.";
    try {
      if (typeof errorMessage === "string" && errorMessage.trim().startsWith("{")) {
        const parsed = JSON.parse(errorMessage);
        if (parsed?.error?.message) {
          errorMessage = parsed.error.message;
        }
      }
    } catch {}

    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  } finally {
    // Clean up local temp file to avoid disk growth
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.warn("Aviso ao limpar arquivo temporário local:", cleanupErr);
      }
    }
    // Clean up temporary Gemini uploaded file from Gemini storage
    if (geminiUploadedFile?.name) {
      try {
        const ai = getGeminiClient();
        await ai.files.delete({ name: geminiUploadedFile.name });
      } catch (cleanupGeminiErr) {
        // Silent cleanup
      }
    }
  }
});

// Endpoint to simulate audio test using text if user doesn't have mic available right now
app.post("/api/process-text-simulation", async (req, res) => {
  try {
    const { audioScriptText, agentConfig } = req.body;

    if (!audioScriptText) {
      return res.status(400).json({ error: "Texto do áudio simulado é obrigatório." });
    }

    const ai = getGeminiClient();

    const clinicName = agentConfig?.clinicName || "Clínica Médica";
    const speciality = agentConfig?.speciality || "Clínica Geral";
    const summaryFormat = agentConfig?.summaryFormat || "SOAP";
    const customInstructions = agentConfig?.customInstructions || "";

    const systemInstruction = `Você é um Agente de IA Especializado em Saúde para a clínica "${clinicName}", especialidade "${speciality}".
Você recebeu o texto ditado em áudio por um médico/paciente em uma consulta fictícia/simulada.
Gere um resumo no formato "${summaryFormat}".
Diretrizes do profissional: ${customInstructions}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Processe o seguinte relato de consulta ditado em áudio: "${audioScriptText}"`,
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: { type: Type.STRING },
            summary: {
              type: Type.OBJECT,
              properties: {
                subjective: { type: Type.STRING },
                objective: { type: Type.STRING },
                assessment: { type: Type.STRING },
                plan: { type: Type.STRING },
              },
              required: ["subjective", "objective", "assessment", "plan"],
            },
            keySymptoms: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            patientActionItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            followUpRecommendation: { type: Type.STRING },
            clinicalCategory: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER },
          },
          required: [
            "transcription",
            "summary",
            "keySymptoms",
            "patientActionItems",
            "followUpRecommendation",
            "clinicalCategory",
            "confidenceScore",
          ],
        },
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    return res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Erro na simulação:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(indexPath);
      });
    } else {
      app.get("/", (_req, res) => {
        res.status(200).json({
          status: "ok",
          service: "clinicos-clinical-backend-webservice",
          message: "API Clínica Exemplo ativa. Utilize GET /health ou POST /api/process-audio.",
        });
      });
    }
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
  });
  server.setTimeout(900000); // 15 minutes timeout for long medical consultations (30-60 min audios)
}

startServer();

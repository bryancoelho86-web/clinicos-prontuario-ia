import { GoogleGenAI, Type } from "@google/genai";
import { AgentConfig, ClinicalResultData } from "../types";

export async function processAudioWithGemini(
  audioBase64: string,
  mimeType: string,
  agentConfig?: AgentConfig,
  customApiKey?: string
): Promise<ClinicalResultData> {
  let storedKey = '';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      storedKey = window.localStorage.getItem('clinicos_gemini_api_key') || '';
    }
  } catch (e) {
    // Ignore localStorage access errors
  }

  const rawKey = customApiKey || 
    agentConfig?.apiKey ||
    storedKey ||
    (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) || 
    (typeof process !== "undefined" && process.env?.VITE_GEMINI_API_KEY) || 
    ((import.meta as any).env && (import.meta as any).env.VITE_GEMINI_API_KEY);

  const apiKey = (rawKey || '').trim().replace(/^["']|["']$/g, '');

  if (!apiKey) {
    throw new Error(
      "A variável GEMINI_API_KEY não foi encontrada na Vercel. Certifique-se de configurar a variável GEMINI_API_KEY na Vercel e fazer o Redeploy."
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "clinicos-transcricao",
      },
    },
  });

  const clinicName = agentConfig?.clinicName || "Clínica Exemplo";
  const speciality = agentConfig?.speciality || "Dermatologia & Medicina Estética";
  const summaryFormat = agentConfig?.summaryFormat || "Anamnesis";
  const customInstructions = agentConfig?.customInstructions || "";
  const language = agentConfig?.language || "Português (Brasil)";

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

  const audioPart = {
    inlineData: {
      mimeType: mimeType || "audio/webm",
      data: audioBase64,
    },
  };

  const textPart = {
    text: promptText,
  };

  // Modelo original de alta estabilidade
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
          temperature: 0.2,
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
      console.warn(`Tentativa client-side com modelo ${modelName} falhou:`, errMsg);
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
    const errorMsg = lastError?.message || String(lastError);
    if (errorMsg.includes("503") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE")) {
      throw new Error(
        "Os servidores do Google Gemini estão com alta demanda temporária. Por favor, aguarde alguns segundos e tente novamente."
      );
    }
    throw lastError;
  }

  return JSON.parse(responseText || "{}") as ClinicalResultData;
}

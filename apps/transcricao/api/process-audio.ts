import type { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const rawKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
    const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Chave GEMINI_API_KEY não encontrada nas variáveis de ambiente da Vercel. Certifique-se de configurar a variável GEMINI_API_KEY na Vercel e fazer o Redeploy.',
      });
    }

    let parsedBody = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {}
    }
    const { audioBase64, mimeType, agentConfig } = parsedBody || {};

    if (!audioBase64) {
      return res.status(400).json({ success: false, error: 'O áudio em Base64 é obrigatório.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'clinicos-transcricao',
        },
      },
    });

    const clinicName = agentConfig?.clinicName || 'Clínica Exemplo';
    const speciality = agentConfig?.speciality || 'Dermatologia & Medicina Estética';
    const customInstructions = agentConfig?.customInstructions || '';
    const language = agentConfig?.language || 'Português (Brasil)';

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

    const audioPart = {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64,
      },
    };

    const textPart = {
      text: 'Por favor, transcreva o áudio em anexo com alta precisão e gere a Anamnese Direta clínica correspondente.',
    };

    // Modelo original de alta estabilidade
    const candidateModels = [
      'gemini-3.6-flash',
      'gemini-flash-latest',
    ];

    let responseText = '';
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: [audioPart, textPart] },
          config: {
            systemInstruction,
            temperature: 0.2,
            responseMimeType: 'application/json',
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
                  required: ['subjective', 'objective', 'assessment', 'plan'],
                },
                keySymptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
                patientActionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                followUpRecommendation: { type: Type.STRING },
                clinicalCategory: { type: Type.STRING },
                confidenceScore: { type: Type.NUMBER },
              },
              required: [
                'transcription',
                'summary',
                'keySymptoms',
                'patientActionItems',
                'followUpRecommendation',
                'clinicalCategory',
                'confidenceScore',
              ],
            },
          },
        });

        if (response.text) {
          responseText = response.text;
          break; // Success!
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        console.warn(`Tentativa com modelo ${modelName} falhou:`, errMsg);
        // If high demand (503), quota (429), or unavailable, continue to next candidate model
        if (errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE') || errMsg.includes('429')) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        // If not a transient error, break or throw
        throw err;
      }
    }

    if (!responseText && lastError) {
      throw lastError;
    }

    const parsedData = JSON.parse(responseText || '{}');
    return res.status(200).json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error('Erro na Vercel API:', error);
    let userMsg = error.message || 'Falha no processamento do áudio.';
    if (userMsg.includes('503') || userMsg.includes('high demand') || userMsg.includes('UNAVAILABLE')) {
      userMsg = 'Os servidores do Google Gemini estão temporariamente com alta demanda. Por favor, aguarde alguns segundos e clique em "Tentar Novamente".';
    }
    return res.status(500).json({
      success: false,
      error: userMsg,
    });
  }
}

import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Todos os timeouts abaixo somados precisam caber dentro do limite físico
// de wall-clock do Supabase Edge Functions pra background tasks via
// EdgeRuntime.waitUntil: 150s no plano Free (não é extensível por nenhum
// timeout de código — confirmado na documentação do Supabase). Isso limita
// esta função, na prática, a gravações curtas/médias (poucos minutos) — não
// cobre o caso de ~1h de áudio contínuo que a spec original previa. Decisão
// de produto (2026-07-31): aceitável por ora, já que o Dr. vai priorizar
// transcrever fora do app e colar o texto manualmente; suporte a gravações
// longas ficaria pra uma reformulação futura (processar em pedaços/fila),
// fora de escopo por agora.

const CATEGORIAS_VALIDAS = [
  "medicamento", "alergia", "doenca", "hipotese", "queixa", "fator_risco", "recomendacao",
] as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcricao: { type: "string" },
    resumo_clinico: { type: "string" },
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoria: { type: "string", enum: CATEGORIAS_VALIDAS },
          texto: { type: "string" },
        },
        required: ["categoria", "texto"],
      },
    },
  },
  required: ["transcricao", "resumo_clinico", "itens"],
};

const SYSTEM_INSTRUCTION = `Você é um assistente clínico especializado em tricologia (saúde capilar e do couro cabeludo), auxiliando um médico tricologista a documentar consultas.

Você vai receber o áudio de uma Consulta Inicial gravada pelo médico. Sua tarefa:

1. Transcrever o áudio literalmente, na íntegra, em português.
2. Escrever um resumo clínico conciso (2-4 parágrafos) do que foi discutido: queixa principal, histórico relevante, exame físico relatado, hipóteses e conduta.
3. Extrair itens categorizados EXATAMENTE nas categorias abaixo — só inclua um item se ele foi de fato mencionado no áudio, nunca invente ou infira informação que não foi dita:
   - medicamento: qualquer medicamento, suplemento ou tratamento tópico/oral mencionado (uso atual ou prescrito)
   - alergia: alergias mencionadas pelo paciente
   - doenca: doenças/condições de saúde (do próprio paciente ou histórico familiar relevante)
   - hipotese: hipóteses diagnósticas levantadas pelo médico
   - queixa: queixas relatadas pelo paciente
   - fator_risco: fatores de risco identificados (genéticos, hormonais, comportamentais, etc.)
   - recomendacao: recomendações/orientações dadas pelo médico ao paciente

Responda SOMENTE no formato JSON estruturado solicitado. Se o áudio estiver inaudível ou não contiver conteúdo clínico, devolva transcricao vazia, um resumo_clinico explicando isso, e itens como lista vazia — nunca invente conteúdo.`;

interface ResultadoGemini {
  transcricao: string;
  resumo_clinico: string;
  itens: { categoria: string; texto: string }[];
}

interface GeminiFileHandle {
  fileUri: string;
  fileName: string;
}

async function uploadToGeminiFiles(audioBlob: Blob, mimeType: string): Promise<GeminiFileHandle> {
  const numBytes = audioBlob.size;

  const startResp = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(numBytes),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: `gravacao-${Date.now()}` } }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!startResp.ok) {
    throw new Error(`Falha ao iniciar upload no Gemini Files API: ${startResp.status} ${await startResp.text()}`);
  }

  const uploadUrl = startResp.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini Files API não retornou x-goog-upload-url");
  }

  // Timeout maior que o da chamada "start" (JSON pequeno, I/O trivial): esta
  // chamada sobe os bytes de verdade do áudio. Orçamento apertado (ver
  // comentário no topo do arquivo sobre o limite de 150s) — dimensionado
  // pra gravações curtas/médias, não pra ~1h de áudio.
  const finalizeResp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Length": String(numBytes),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: audioBlob,
    signal: AbortSignal.timeout(40000),
  });
  if (!finalizeResp.ok) {
    throw new Error(`Falha ao enviar bytes pro Gemini Files API: ${finalizeResp.status} ${await finalizeResp.text()}`);
  }

  const fileInfo = await finalizeResp.json();
  let fileUri: string = fileInfo.file.uri;
  const fileName: string = fileInfo.file.name;
  let state: string = fileInfo.file.state;

  // 15 tentativas x 2s = 30s de orçamento pro Gemini processar o arquivo
  // antes de ficar ACTIVE. Ver comentário no topo do arquivo: o orçamento
  // total precisa caber em 150s, então este loop não pode ser generoso —
  // suficiente pra gravações curtas/médias, não pra ~1h de áudio.
  for (let attempt = 0; attempt < 15 && state === "PROCESSING"; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const checkResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}`,
      { headers: { "x-goog-api-key": GEMINI_API_KEY }, signal: AbortSignal.timeout(20000) },
    );
    if (!checkResp.ok) {
      throw new Error(`Falha ao checar status do arquivo no Gemini: ${checkResp.status}`);
    }
    const checkInfo = await checkResp.json();
    state = checkInfo.state;
    fileUri = checkInfo.uri;
  }

  if (state !== "ACTIVE") {
    throw new Error(`Arquivo de áudio não ficou pronto no Gemini (estado final: ${state})`);
  }

  return { fileUri, fileName };
}

async function excluirArquivoGemini(fileName: string): Promise<void> {
  // Best-effort: áudio sensível (LGPD) não deve ficar mais tempo que o
  // necessário nos servidores do Gemini. O Gemini já expira arquivos
  // sozinho em 48h, então uma falha aqui não é crítica — só loga e segue,
  // nunca deve virar status='erro' numa gravação que já processou com sucesso.
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}`,
      { method: "DELETE", headers: { "x-goog-api-key": GEMINI_API_KEY }, signal: AbortSignal.timeout(10000) },
    );
    if (!resp.ok) {
      console.error(`Falha ao excluir arquivo ${fileName} do Gemini: ${resp.status} ${await resp.text()}`);
    }
  } catch (err) {
    console.error(`Erro ao excluir arquivo ${fileName} do Gemini:`, err);
  }
}

async function chamarGeminiAnalise(fileUri: string, mimeType: string): Promise<ResultadoGemini> {
  const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-3.6-flash",
      system_instruction: SYSTEM_INSTRUCTION,
      input: [
        { type: "text", text: "Processe o áudio da consulta a seguir conforme as instruções." },
        { type: "audio", mime_type: mimeType, uri: fileUri },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RESPONSE_SCHEMA,
      },
    }),
    // 40s: ver comentário no topo do arquivo sobre o limite de 150s pro
    // pipeline inteiro. Suficiente pra gravações curtas/médias, não pra
    // ~1h de áudio contínuo.
    signal: AbortSignal.timeout(40000),
  });

  if (resp.status === 429) {
    throw new Error("Limite de requisições do Gemini atingido (429) — tente novamente em alguns minutos.");
  }
  if (resp.status === 503) {
    throw new Error("Gemini temporariamente indisponível (503) — tente novamente.");
  }
  if (!resp.ok) {
    throw new Error(`Erro na chamada ao Gemini: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  // A API v1beta/interactions não retorna um campo `output_text` de nível
  // superior. O texto gerado fica dentro de `steps[]`: cada step tem um
  // `type` ("thought" | "model_output" | ...), e o step de tipo
  // "model_output" carrega `content[]`, onde o item de tipo "text" tem o
  // JSON de resposta em `text`. Ex. observado em teste real:
  // { steps: [ { type: "thought", ... }, { type: "model_output",
  //     content: [ { type: "text", text: "{...json...}" } ] } ] }
  const steps: unknown = data.steps;
  let outputText: string | undefined;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (
        step && typeof step === "object" && (step as Record<string, unknown>).type === "model_output" &&
        Array.isArray((step as Record<string, unknown>).content)
      ) {
        const content = (step as Record<string, unknown>).content as unknown[];
        for (const item of content) {
          if (item && typeof item === "object" && (item as Record<string, unknown>).type === "text") {
            const text = (item as Record<string, unknown>).text;
            if (typeof text === "string") {
              outputText = text;
            }
          }
        }
      }
    }
  }
  if (!outputText) {
    // erro_detalhe é gravado no banco e renderizado cru na UI — mantém
    // limitado pra não virar um blob gigante de JSON na tela do médico.
    throw new Error(
      `Gemini não retornou texto de saída em steps[].content[] na resposta: ${JSON.stringify(data).slice(0, 500)}`,
    );
  }

  let parsed: ResultadoGemini;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("Resposta do Gemini não é um JSON válido");
  }

  for (const item of parsed.itens) {
    if (!CATEGORIAS_VALIDAS.includes(item.categoria as typeof CATEGORIAS_VALIDAS[number])) {
      throw new Error(`Categoria inválida retornada pelo Gemini: ${item.categoria}`);
    }
  }

  return parsed;
}

async function processarEmBackground(
  admin: ReturnType<typeof createClient>,
  gravacaoId: string,
  storagePath: string,
) {
  try {
    const { data: fileData, error: downloadError } = await admin.storage
      .from("gravacoes-ia")
      .download(storagePath);
    if (downloadError || !fileData) {
      throw new Error(`Falha ao baixar áudio do storage: ${downloadError?.message}`);
    }

    const mimeType = fileData.type || "audio/webm";
    const { fileUri, fileName } = await uploadToGeminiFiles(fileData, mimeType);

    let resultado: ResultadoGemini;
    try {
      resultado = await chamarGeminiAnalise(fileUri, mimeType);
    } finally {
      // Best-effort, sucesso ou falha da análise — não deixa o áudio sensível
      // parado no Gemini além do necessário (ver excluirArquivoGemini).
      await excluirArquivoGemini(fileName);
    }

    const { error: rpcError } = await admin.rpc("registrar_transcricao_ia", {
      p_gravacao_id: gravacaoId,
      p_transcricao: resultado.transcricao,
      p_resumo_clinico: resultado.resumo_clinico,
      p_itens: resultado.itens,
    });
    if (rpcError) {
      throw new Error(`Falha ao registrar transcrição no banco: ${rpcError.message}`);
    }
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    await admin.from("gravacoes_ia").update({ status: "erro", erro_detalhe: mensagem }).eq("id", gravacaoId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { gravacao_id } = await req.json();
    if (!gravacao_id) {
      return new Response(JSON.stringify({ error: "gravacao_id é obrigatório" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: row, error: statusError } = await admin
      .from("gravacoes_ia")
      .update({ status: "processando", erro_detalhe: null })
      .eq("id", gravacao_id)
      .in("status", ["gravando", "erro"])
      .select("storage_path")
      .single();

    if (statusError || !row) {
      return new Response(
        JSON.stringify({ error: "gravacao_id não encontrado, sem áudio associado, ou já em processamento/concluído" }),
        { status: 409, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
    if (!row.storage_path) {
      await admin.from("gravacoes_ia")
        .update({ status: "erro", erro_detalhe: "Nenhum áudio associado a esta gravação" })
        .eq("id", gravacao_id);
      return new Response(JSON.stringify({ error: "Nenhum áudio associado a esta gravação" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // @ts-ignore -- EdgeRuntime é global no runtime do Supabase, não existe no tipo padrão do Deno
    EdgeRuntime.waitUntil(processarEmBackground(admin, gravacao_id, row.storage_path));

    return new Response(JSON.stringify({ accepted: true }), {
      status: 202,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: mensagem }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

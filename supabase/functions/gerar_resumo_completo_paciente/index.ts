import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Diferente de processar_gravacao_ia (que precisa da Gemini Files API +
// EdgeRuntime.waitUntil por causa do upload/polling de áudio, com um teto
// de 150s de wall-clock no plano Free — ver comentário equivalente naquele
// arquivo), esta função só lê texto que já está no banco (anamnese +
// observações de sessão) e faz uma única chamada de texto ao Gemini
// (generateContent, não v1beta/interactions — não há áudio nem Files API
// envolvidos). Isso cabe folgado dentro do timeout de request síncrono
// padrão do Supabase Edge Functions — não há motivo pra rodar em
// background, então a função só responde depois do pipeline inteiro
// terminar (200 de verdade, não 202 "accepted").

const SYSTEM_INSTRUCTION = `Você é um assistente clínico especializado em tricologia (saúde capilar e do couro cabeludo), auxiliando um médico tricologista a manter o prontuário de um paciente sempre atualizado.

Você vai receber: (1) a anamnese da Consulta Inicial do paciente (se já concluída) e (2) as observações registradas em cada sessão de tratamento já concluída, em ordem cronológica (se houver alguma).

Sua tarefa é escrever um ÚNICO resumo clínico atualizado, curto e objetivo — o médico vai ler isso antes de um atendimento, no lugar de reler cada sessão individualmente. Formato obrigatório, nessa ordem:
1. Um mini-texto corrido de 1-2 frases situando o caso (queixa principal + característica mais marcante do quadro).
2. Em seguida, os pontos relevantes em tópicos curtos, um por linha, cada linha começando com "• " — cubra, só quando houver informação real: comorbidades/contraindicações relevantes, hipótese diagnóstica e conduta inicial, evolução ao longo das sessões (o que mudou/melhorou/piorou), estado clínico mais recente. Achados normais ou negativos (ex: exame físico sem alterações) entram como um tópico breve de uma linha só (ex: "• Exame físico/tricológico: sem alterações relevantes."), nunca como parágrafo.

Seja direto: sem frases de preenchimento, sem repetir informação entre o texto inicial e os tópicos, sem listar cada sessão individualmente (sintetize a evolução — não narre sessão por sessão). Nunca invente informação que não esteja no material fornecido. Escreva em português, tom clínico. Responda SOMENTE com o mini-texto seguido dos tópicos com "•" — sem markdown (sem **negrito**, sem #títulos), sem introdução do tipo "Aqui está o resumo:".`;

interface SessaoConcluida {
  numero_sessao: number;
  data: string;
  observacoes: string | null;
  observacao_final: string | null;
}

function montarPrompt(anamnese: string | null, sessoes: SessaoConcluida[]): string {
  const partes: string[] = [];

  if (anamnese) {
    partes.push(`ANAMNESE (Consulta Inicial):\n${anamnese}`);
  }

  if (sessoes.length > 0) {
    const sessoesTexto = sessoes.map((s) => {
      const dataFmt = new Date(s.data).toLocaleDateString("pt-BR");
      const linhas = [`Sessão ${s.numero_sessao} (${dataFmt}):`];
      if (s.observacoes) linhas.push(`Observações durante o atendimento: ${s.observacoes}`);
      if (s.observacao_final) linhas.push(`Observação final: ${s.observacao_final}`);
      return linhas.join("\n");
    }).join("\n\n");
    partes.push(`SESSÕES DE TRATAMENTO CONCLUÍDAS (ordem cronológica):\n${sessoesTexto}`);
  }

  return partes.join("\n\n---\n\n");
}

async function chamarGeminiResumo(prompt: string): Promise<string> {
  const resp = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      // Chamada de texto simples (sem áudio/Files API) — folga generosa,
      // mas nada perto do teto de 150s que a função de áudio precisa
      // gerenciar (ver comentário no topo do arquivo). 45s em vez de 30s:
      // testado ao vivo, uma chamada com prompt maior (anamnese + sessão)
      // levou ~15s mas outra deu timeout em 30s — variação normal de
      // latência do modelo, folga extra evita falso negativo esporádico.
      signal: AbortSignal.timeout(45000),
    },
  );

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
  // generateContent (diferente de v1beta/interactions, usado em
  // processar_gravacao_ia) devolve o texto direto em
  // candidates[0].content.parts[] — sem precisar procurar em steps[].
  const parts: unknown = data?.candidates?.[0]?.content?.parts;
  let texto = "";
  if (Array.isArray(parts)) {
    texto = parts
      .map((p) =>
        p && typeof p === "object" && typeof (p as Record<string, unknown>).text === "string"
          ? (p as Record<string, unknown>).text as string
          : ""
      )
      .join("")
      .trim();
  }

  if (!texto) {
    // erro é só logado (console.error no catch do handler) — não existe
    // tabela de erro dedicada pra este fluxo (diferente de gravacoes_ia).
    throw new Error(
      `Gemini não retornou texto de saída em candidates[0].content.parts[]: ${JSON.stringify(data).slice(0, 500)}`,
    );
  }

  return texto;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { paciente_id } = await req.json();
    if (!paciente_id) {
      return new Response(JSON.stringify({ error: "paciente_id é obrigatório" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Anamnese: consulta inicial concluída mais recente (normalmente só
    // existe uma por paciente — uq_consulta_inicial_paciente barra mais de
    // uma não-cancelada simultânea — mas pega a mais recente por segurança).
    const { data: consultaRows, error: consultaError } = await admin
      .from("consultas_iniciais")
      .select("anamnese")
      .eq("paciente_id", paciente_id)
      .eq("status", "concluida")
      .order("concluida_em", { ascending: false })
      .limit(1);
    if (consultaError) {
      throw new Error(`Falha ao buscar consulta inicial: ${consultaError.message}`);
    }
    const anamnese: string | null = consultaRows?.[0]?.anamnese ?? null;

    // Sessões concluídas de TODOS os planos de tratamento do paciente
    // (avulso, pacote, homecare etc.) — sem RPC nova, duas consultas
    // simples em vez de embed/filtro aninhado do PostgREST.
    const { data: planos, error: planosError } = await admin
      .from("planos_tratamento")
      .select("id")
      .eq("paciente_id", paciente_id);
    if (planosError) {
      throw new Error(`Falha ao buscar planos de tratamento: ${planosError.message}`);
    }
    const planoIds = (planos ?? []).map((p) => p.id);

    let sessoesConcluidas: SessaoConcluida[] = [];
    if (planoIds.length > 0) {
      const { data: sessoesRows, error: sessoesError } = await admin
        .from("sessoes")
        .select("numero_sessao, data, observacoes, observacao_final")
        .in("plano_tratamento_id", planoIds)
        .eq("status", "concluida")
        .order("data", { ascending: true });
      if (sessoesError) {
        throw new Error(`Falha ao buscar sessões concluídas: ${sessoesError.message}`);
      }
      sessoesConcluidas = sessoesRows ?? [];
    }

    if (!anamnese && sessoesConcluidas.length === 0) {
      // Estado normal e legítimo pra paciente novo (consulta inicial ainda
      // não concluída e nenhuma sessão concluída ainda) — não é erro, não
      // chama o Gemini com contexto vazio. 200 de propósito: quem chama
      // (fire-and-forget do frontend) não deve tratar isso como falha.
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: "Paciente sem consulta inicial concluída e sem sessões concluídas — nada para resumir.",
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const prompt = montarPrompt(anamnese, sessoesConcluidas);
    const resumo = await chamarGeminiResumo(prompt);

    const { data: updated, error: updateError } = await admin
      .from("pacientes")
      .update({ resumo_clinico: resumo, resumo_ia_atualizado_em: new Date().toISOString() })
      .eq("id", paciente_id)
      .select("id")
      .maybeSingle();
    if (updateError) {
      throw new Error(`Falha ao gravar resumo clínico: ${updateError.message}`);
    }
    if (!updated) {
      throw new Error(`paciente ${paciente_id} não encontrado — resumo não foi gravado`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error("gerar_resumo_completo_paciente falhou:", mensagem);
    return new Response(JSON.stringify({ error: mensagem }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

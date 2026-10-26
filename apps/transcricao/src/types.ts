export type SummaryFormat = 'SOAP' | 'Anamnesis' | 'Structured' | 'BulletPoints';

export interface AgentConfig {
  clinicName: string;
  speciality: string;
  summaryFormat: SummaryFormat;
  customInstructions: string;
  language: string;
  doctorName?: string;
  apiKey?: string;
}

export interface SOAPSummary {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface ClinicalResultData {
  transcription: string;
  summary: SOAPSummary;
  keySymptoms: string[];
  patientActionItems: string[];
  followUpRecommendation: string;
  clinicalCategory: string;
  confidenceScore: number;
}

export interface ProcessedConsultation {
  id: string;
  timestamp: string;
  audioDurationSeconds: number;
  fileName?: string;
  result: ClinicalResultData;
  agentConfigUsed: AgentConfig;
  status: 'synced_supabase' | 'local_only' | 'pending';
}

export interface CostEstimate {
  audiosPerWeek: number;
  audiosPerMonth: number;
  averageMinutesPerAudio: number;
  totalMinutesPerMonth: number;
  geminiFlashTokensPerMonth: number;
  geminiEstimatedCostUSD: number;
  geminiEstimatedCostBRL: number;
  supabaseCostUSD: number;
  whisperComparisonUSD: number;
}

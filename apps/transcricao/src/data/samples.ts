import { AgentConfig } from '../types';

export interface AudioSample {
  id: string;
  title: string;
  speciality: string;
  durationText: string;
  durationSeconds: number;
  description: string;
  scriptText: string;
  agentConfig: AgentConfig;
}

export const SAMPLE_CONSULTATIONS: AudioSample[] = [
  {
    id: 'sample-clinicos-estetica',
    title: 'Consulta de Dermatologia & Harmonização Facial',
    speciality: 'Medicina Estética & Longevidade',
    durationText: '2 min 40 s',
    durationSeconds: 160,
    description: 'Paciente buscando planejamento de colágeno, botox preventive e melhora na textura e luminosidade da pele.',
    scriptText: `Paciente Beatriz Vasconcelos, 42 anos, comparece à clínica para avaliação de renovação cutânea e manejo de perda de sustentação facial leve no terço médio. Refere exposição solar moderada sem protetor na juventude e queixa-se de sulco nasogeniano incipiente e rugas dinâmicas na região glabelar e periocular. Ao exame físico dermatológico, pele fotótipo II, normohidratada, com rítides de expressão moderadas na glabela e fronte, e leve reabsorção de gordura malar. Plano de tratamento individualizado proposto: 1) Aplicação de toxina botulínica 50 unidades em terço superior para suavização de linhas; 2) Protocolo de bioestimulador de colágeno (Ácido Poli-L-Láctico) 1 frasco na região malar e contorno mandibular para efeito lifting em 2 sessões; 3) Orientação de rotina home care com Vitamina C 15% pela manhã, Protetor Solar FPS 70 recheado de antioxidantes e Ácido Retinoico 0,025% à noite. Paciente de acordo, primeira sessão de aplicação agendada para sexta-feira.`,
    agentConfig: {
      clinicName: 'Clínica Exemplo',
      speciality: 'Dermatologia & Medicina Estética',
      summaryFormat: 'SOAP',
      customInstructions: 'Organize a conduta de estética, prescrição home care e agendamento de procedimentos com extrema precisão e elegância.',
      language: 'Português (Brasil)',
      doctorName: 'Dr(a). Especialista',
    },
  },
  {
    id: 'sample-geral-1',
    title: 'Consulta de Rotina - Hipertensão e Enxaqueca',
    speciality: 'Clínica Geral',
    durationText: '2 min 30 s',
    durationSeconds: 150,
    description: 'Paciente relata dores de cabeça frequentes na região frontal e tonturas ocasionais pela manhã.',
    scriptText: `Paciente Maria Silva, 48 anos, comparece ao consultório relatando episódios recorrentes de cefaleia pulsátil na região frontal nos últimos 10 dias, associados a tontura leve ao levantar da cama. Nega náuseas ou alterações visuais. Refere pressão arterial medida na farmácia de 140 por 90. No exame físico de hoje, PA de 142 por 88 mmHg, frequência cardíaca de 76 batimentos por minuto, ausculta cardíaca e pulmonar sem alterações. Solicitado eletrocardiograma e exames de sangue incluindo perfil lipídico, glicemia de jejum e função renal. Prescrito ajuste no estilo de vida com redução de sódio e caminhada leve. Prescrito Dipirona 1 grama se dor e agendado retorno em 15 days para reavaliação com resultados dos exames.`,
    agentConfig: {
      clinicName: 'Clínica Bem Estar',
      speciality: 'Clínica Geral',
      summaryFormat: 'SOAP',
      customInstructions: 'Destaque medicamentos prescritos e exames laboratoriais solicitados.',
      language: 'Português (Brasil)',
      doctorName: 'Dr. Roberto Santos',
    },
  },
  {
    id: 'sample-odonto-1',
    title: 'Avaliação Odontológica e Tratamento de Canal',
    speciality: 'Odontologia',
    durationText: '1 min 45 s',
    durationSeconds: 105,
    description: 'Paciente com sensibilidade aguda no dente 36 ao ingerir alimentos frios e quentes.',
    scriptText: `Paciente Lucas Oliveira, 32 anos. Queixa principal: dor intensa e pulsátil no elemento dente 36 ao mastigar e sensibilidade prolongada ao frio e quente há 4 dias. Ao exame clínico e radiográfico periapical, identificada cárie profunda com comprometimento pulpar no dente 36. Ausência de abscesso visível. Indicado tratamento endodôntico (canal) no elemento 36. Realizado selamento provisório e prescrito Amoxicilina 500mg de 8 em 8 horas por 7 dias, juntamente com Ibuprofeno 600mg de 8 em 8 horas se houver dor. Sessão de endodontia agendada para a próxima terça-feira às 14h.`,
    agentConfig: {
      clinicName: 'OdontoSorridente',
      speciality: 'Odontologia / Endodontia',
      summaryFormat: 'SOAP',
      customInstructions: 'Especifique o número dos dentes (elementos dentários) afetados e receitas.',
      language: 'Português (Brasil)',
      doctorName: 'Dra. Camila Lima',
    },
  },
  {
    id: 'sample-psico-1',
    title: 'Anamnese de Acompanhamento Psicológico',
    speciality: 'Psicologia',
    durationText: '3 min 10 s',
    durationSeconds: 190,
    description: 'Sessão com paciente apresentando sintomas de ansiedade generalizada e insônia relacionada ao trabalho.',
    scriptText: `Paciente Juliana Mendes, 35 anos, 4ª sessão. Paciente relata melhora parcial nos episódios de pânico, porém mantém elevado nível de ansiedade antecipatória ligado às metas profissionais no trabalho. Descreve insônia de manutenção, acordando por volta das 3h da manhã com pensamentos acelerados. Aplicada técnica de reestruturação cognitiva e respiração diafragmática durante a sessão. A paciente identificou pensamentos automáticos catastrofistas. Como tarefa de casa, foi proposto a escrita do diário de pensamentos e prática diária de higiene do sono desligando telas 1 hora antes de deitar. Próxima sessão confirmada para semana que vem.`,
    agentConfig: {
      clinicName: 'Espaço Mente e Vida',
      speciality: 'Psicologia / TCC',
      summaryFormat: 'SOAP',
      customInstructions: 'Priorize técnicas aplicadas na sessão e tarefas para casa acordadas com o paciente.',
      language: 'Português (Brasil)',
      doctorName: 'Psi. André Costa',
    },
  },
];

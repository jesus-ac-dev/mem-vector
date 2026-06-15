import { z } from 'zod';

// Onboarding (#40): as 3 respostas da entrevista viram as 3 notas pessoais do
// Kernel. Tudo obrigatório — o objetivo é o Kernel nascer preenchido.
export const OnboardingSchema = z.object({
    sobreMim: z.string().trim().min(1, 'Conta-me algo sobre ti.'),
    prioridades: z.string().trim().min(1, 'Quais são as tuas prioridades?'),
    regras: z.string().trim().min(1, 'Como queres que o agente trabalhe?'),
});

export type RespostasOnboarding = z.infer<typeof OnboardingSchema>;

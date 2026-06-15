'use server';

import { OnboardingSchema } from './onboarding.schema';
import { completarOnboardingCom } from './onboarding.service';
import { createClient } from '@/lib/supabase/server';

// A porta do servidor: valida o que vem do wizard antes de escrever no Kernel.
// Devolve `true` para o wizard distinguir sucesso de falha (runClientAction
// devolve undefined em erro).
export async function completarOnboarding(input: unknown): Promise<boolean> {
    const dados = OnboardingSchema.parse(input);
    const db = await createClient();
    await completarOnboardingCom(db, dados);
    return true;
}

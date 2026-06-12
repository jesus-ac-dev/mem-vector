import { cn } from '@/lib/utils';
import type { Provider } from '@/modules/definicoes/definicoes.schema';

// Ícone do provider (#60 r5, prettify): badge com a cor da marca — sem puxar
// os SVGs oficiais (licenças/peso); a inicial + cor identifica bem.

const COR: Record<Provider, string> = {
    claude: 'bg-orange-600',
    codex: 'bg-zinc-700',
    gemini: 'bg-blue-600',
    ollama: 'bg-slate-500',
};

const SIGLA: Record<Provider, string> = {
    claude: 'C',
    codex: 'Cx',
    gemini: 'G',
    ollama: 'Ol',
};

// Classes compostas fora do JSX (a regra das cores cruas só olha ao atributo).
const BASE =
    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[0.65rem] font-semibold text-white';

export function ProviderIcon({ provider, className }: { provider: Provider; className?: string }) {
    const classes = cn(BASE, COR[provider], className);
    return (
        <span aria-hidden className={classes}>
            {SIGLA[provider]}
        </span>
    );
}

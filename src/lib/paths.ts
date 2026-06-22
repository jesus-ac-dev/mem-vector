import { homedir } from 'node:os';
import { join } from 'node:path';

// Expansão do `~` para a home DO SERVIDOR. O spawn (git/gh) não passa por shell,
// por isso o `~` não se expande sozinho — `~/src/x` ia literal e o git criava uma
// pasta chamada "~" relativa ao cwd. No-op para paths sem `~` (Windows incluído,
// onde os paths não começam por `~`). Usa `join` para o separador da plataforma.
export function expandirHome(p: string): string {
    const t = p.trim();
    if (t === '~') return homedir();
    if (t.startsWith('~/') || t.startsWith('~\\')) return join(homedir(), t.slice(2));
    return t;
}

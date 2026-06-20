import type { NotaKernel } from '../../src/agent/kernel';

// #123 (Ponte G): TEMPLATE do seed pessoal do dono. Copia para
// `kernel-pessoal.ts` (gitignored, nunca replicado) e mete a TUA identidade —
// o `seed:user` carrega o ficheiro local se existir, senão cai neste exemplo.
// O produto (src/) nunca depende disto: o caminho canónico de um user novo é o
// `seed:fresh` → onboarding. Isto é só o atalho de dev do dono (o teste do PC
// novo aplicado ao TEU setup: local-only).
export const KERNEL_PESSOAL: NotaKernel[] = [
    {
        title: 'Sobre mim',
        contentMd:
            '# Sobre mim\n\n' +
            'Quem és, o que fazes, o teu contexto. (Substitui por ti; isto é só um exemplo.) ' +
            'Como queres ser tratado.\n',
    },
    {
        title: 'Prioridades',
        contentMd:
            '# Prioridades\n\n' +
            'O que importa agora — os teus focos do trimestre/projeto.\n',
    },
    {
        title: 'Regras do agente',
        contentMd:
            '# Regras do agente\n\n' +
            '- A língua e o registo que queres.\n' +
            '- Como queres que o agente trabalhe contigo.\n',
    },
];

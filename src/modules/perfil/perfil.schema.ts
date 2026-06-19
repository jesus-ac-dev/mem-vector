import { z } from 'zod';

// #92 perfil/conta. Nome vive em profiles.display_name; email/password são do
// Supabase Auth; avatar vai para o Storage (bucket 'avatars').

export const AtualizarNomeSchema = z.object({
    displayName: z.string().trim().min(1).max(80),
});
export type AtualizarNomeInput = z.infer<typeof AtualizarNomeSchema>;

export const AtualizarEmailSchema = z.object({
    email: z.email(),
});
export type AtualizarEmailInput = z.infer<typeof AtualizarEmailSchema>;

// 8 = piso de UX; 72 = limite do bcrypt que o Supabase usa.
export const AtualizarPasswordSchema = z.object({
    password: z.string().min(8).max(72),
});
export type AtualizarPasswordInput = z.infer<typeof AtualizarPasswordSchema>;

// Avatar: tipos de imagem aceites + teto de tamanho.
const EXT_POR_MIME: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
};
export const TIPOS_AVATAR = Object.keys(EXT_POR_MIME);
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export function validarAvatar(file: { type: string; size: number }): {
    ok: boolean;
    erro?: string;
} {
    if (!EXT_POR_MIME[file.type]) return { ok: false, erro: 'Usa uma imagem PNG, JPG ou WebP.' };
    if (file.size > AVATAR_MAX_BYTES) return { ok: false, erro: 'A imagem tem de ser até 2 MB.' };
    return { ok: true };
}

// Caminho no bucket: {uid}/avatar.<ext>. O primeiro segmento (uid) é o que a
// RLS do Storage usa para garantir que cada um só escreve na sua pasta.
export function caminhoAvatar(uid: string, mime: string): string {
    const ext = EXT_POR_MIME[mime];
    if (!ext) throw new Error(`mime de avatar não suportado: ${mime}`);
    return `${uid}/avatar.${ext}`;
}

export interface PerfilVista {
    displayName: string;
    email: string;
    avatarUrl: string | null;
}

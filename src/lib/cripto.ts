import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Cifra das API keys dos providers (#60): AES-256-GCM at rest, segredo em
// MEMVECTOR_KEYS_SECRET (.env.local). A key NUNCA volta ao browser — o
// cliente só vê "configurada (····sufixo)". Formato: gcm:<iv>:<tag>:<dados>
// (base64); valor sem o prefixo é tratado como plaintext legado (migra ao
// gravar seguinte).

const PREFIXO = 'gcm:';

function chave(segredo = process.env.MEMVECTOR_KEYS_SECRET): Buffer {
    if (!segredo) {
        throw new Error(
            'MEMVECTOR_KEYS_SECRET em falta — define no .env.local (openssl rand -hex 32) para guardar API keys',
        );
    }
    // sha256 normaliza qualquer segredo para os 32 bytes do AES-256.
    return createHash('sha256').update(segredo).digest();
}

export function cifrar(texto: string, segredo?: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', chave(segredo), iv);
    const dados = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIXO}${iv.toString('base64')}:${tag.toString('base64')}:${dados.toString('base64')}`;
}

export function decifrar(cifrado: string, segredo?: string): string {
    if (!cifrado.startsWith(PREFIXO)) return cifrado; // plaintext legado
    const [iv, tag, dados] = cifrado.slice(PREFIXO.length).split(':');
    const decipher = createDecipheriv('aes-256-gcm', chave(segredo), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(dados, 'base64')),
        decipher.final(),
    ]).toString('utf8');
}

/** Os últimos 4 caracteres para a máscara da UI ("····abcd"). */
export function sufixoKey(texto: string): string {
    return texto.slice(-4);
}

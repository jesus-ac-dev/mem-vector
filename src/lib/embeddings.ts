import { pipeline, env } from '@xenova/transformers';

// #123 (Ponte G): o modelo (e5-small, ~191M) é o coração do RAG — não pode
// depender de descarregar da HuggingFace para dentro do node_modules em runtime.
// MEMVECTOR_MODEL_CACHE aponta o cache a um dir ESTÁVEL (vendorável / volume de
// deploy), pré-povoável no build. Sem a env, mantém o default do transformers.js
// (não muda nada para o dev local). É o lado "embutir" da política de host.
if (process.env.MEMVECTOR_MODEL_CACHE) {
    env.cacheDir = process.env.MEMVECTOR_MODEL_CACHE;
}

// Tipo mínimo do extractor (evita lutar com os tipos do transformers.js).
type Extractor = (
    text: string,
    opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>;

export const EMBEDDING_DIMS = 384;
export const EMBEDDING_MODEL = 'multilingual-e5-small';

let extractorPromise: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
    extractorPromise ??= pipeline(
        'feature-extraction',
        'Xenova/multilingual-e5-small',
    ) as unknown as Promise<Extractor>;
    return extractorPromise;
}

async function embed(text: string): Promise<number[]> {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// E5 exige prefixos: 'passage:' no conteúdo indexado, 'query:' na pergunta.
export const embedPassage = (text: string): Promise<number[]> => embed(`passage: ${text}`);
export const embedQuery = (text: string): Promise<number[]> => embed(`query: ${text}`);

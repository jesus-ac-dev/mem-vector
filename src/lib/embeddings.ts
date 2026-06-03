import { pipeline } from '@xenova/transformers';

// Tipo mínimo do extractor (evita lutar com os tipos do transformers.js).
type Extractor = (
    text: string,
    opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>;

export const EMBEDDING_DIMS = 384;

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

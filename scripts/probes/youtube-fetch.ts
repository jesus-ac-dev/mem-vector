// Probe #101: gate de viabilidade — buscarVideo (timedtext Node-nativo) funciona
// num vídeo real? Sem isto, o desenho cai para o fallback (Python/yt-dlp).
import { buscarVideo } from '../../src/modules/youtube/youtube';

const URL = process.argv[2] ?? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

async function main(): Promise<void> {
    const v = await buscarVideo(URL);
    console.log(`título: ${v.title}`);
    console.log(`autor:  ${v.author}`);
    console.log(`chars:  ${v.transcript.length}`);
    console.log('--- início do transcript ---');
    console.log(v.transcript.slice(0, 300));
    const ok = v.transcript.length > 50 && Boolean(v.title) && Boolean(v.author);
    console.log(ok ? '\n✅ VIÁVEL (Node-nativo busca metadados + transcript)' : '\n❌ falhou');
    if (!ok) process.exit(1);
}

main().catch((e: unknown) => {
    console.error('❌', e instanceof Error ? e.message : e);
    process.exit(1);
});

// Degrau 1 — embeddings smoke (mem-vector).
// Prova: o multilingual-e5-small corre no CPU, em PT, e a frase relacionada
// fica mais perto da pergunta (= o RAG vai funcionar). Sem base de dados.
import { pipeline } from '@xenova/transformers';

console.log('A carregar o modelo (1ª vez descarrega ~110MB)...');
const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');

const embed = async (text) => {
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
};
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0); // normalize:true → cosseno = produto interno

// E5 exige prefixos: 'query:' na pergunta, 'passage:' no conteúdo indexado.
const pergunta       = 'query: Quem escreve o conhecimento no produto?';
const relacionada    = 'passage: Neste workspace os agentes são os autores: o humano fala e o agente escreve as tarefas, decisões e notas.';
const naoRelacionada = 'passage: A migração de balcões liga a entidade bancária ao balcão físico e depois ao contacto.';

const q = await embed(pergunta);
const r = await embed(relacionada);
const u = await embed(naoRelacionada);

const simR = cos(q, r);
const simU = cos(q, u);

console.log('\ndimensões:', q.length, '(esperado 384)');
console.log('primeiros 4 valores:', q.slice(0, 4).map((n) => n.toFixed(4)).join(', '));
console.log(`\nsim(pergunta, RELACIONADA)     = ${simR.toFixed(4)}`);
console.log(`sim(pergunta, NÃO-relacionada)  = ${simU.toFixed(4)}`);

if (q.length === 384 && simR > simU) {
  console.log('\n✅ PASS — vetor 384 no CPU, relacionada mais perto. O RAG vai funcionar.');
} else {
  console.log('\n❌ FAIL — dimensão ou ordem das similaridades trocada.');
  process.exitCode = 1;
}

#

```ts
interface InputEmbedding {
  seqLen,  // max length of a sequence.
  repSize, // representation size of embeddings.
}
const input: NamedT<InputEmbedding>;

interface ProjectQK {
  nAttnHeads, // Number of attention heads
  repSize,    // Representation size of input embeddings.
  kqSize,     // Size of the Key/Query Represention
}
const keyProj: NamedT<ProjectQK>;
const queryProj: NamedT<ProjectQK>;

interface ProjectValues {
  nAttnHeads, // Attention heads
  repSize,    // Representation size of input embeddings.
  valueSize,  // Size of the Value Represention, traditionally = kqSize
}
const projectValues: NamedT<ProjectValues>;

interface QueryKeyOnInput {
  nAttnHeads,  // Attention heads
  seqLen,      // Number of attention heads
  kqSize,      // Representation size of input embeddings.
}
const keys: NamedT<QueryKeyOnInput> = tf.mult(
  input.repSize, keyProj.repSize);
const queries: NamedT<QueryKeyOnInput> = tf.mult(
  input.repSize, queryProj.repSize);

interface InputAttention {
  nAttnHeads,    // Attention heads
  seqLenKey,     // Each Key
  seqLenQuery,   // Each Query
}
const attention: NamedT<InputAttention> = tf.mult(
  keys.kqSize, queries.kqSize,
  { renaming: [{rename: keys.seqLen, to:'seqLenKey'},
               {rename: queries.seqLen, to:'seqLenQuery'}],
    external: nAttnHeads,
  });

interface AttentionHeadValues {
  nAttnHeads,    // Attention heads
  seqLen,        // Representation size of input embeddings.
  valueSize,     // Number of attention heads
}
const values: NamedT<AttentionHeadValues> = tf.mult(
  input.repSize, valueProj.repSize);

const attendedValues:
tf.mult(
  values.


interface QueryKeyAttention {
  seqLenKeys,     // Number of attention heads
  seqLenQueries,  // Representation size of input embeddings.
}




function attention(inputEmbedding: tf.Tensor<InputEmbedding>) {



inputEmbedding = new tf.representation({
  seqLen,  // max length of a sequence.
  repSize, // representation size of embeddings.
});



/*



*/
```



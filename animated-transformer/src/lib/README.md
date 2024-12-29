# A TypeScript Named Tensors Library (and Transformer implementation)

Author: https://github.com/iislucas (ldixon@google.com)

An ML library where Tensors are typed, parameterized a set of strings, corresponding to their dimensions. e.g. `x: GTensor<'pos' | 'inputRep'>` says that `x` is a tensor with two dimensions `pos` and `inputRep`. This means that you can write, and get auto-completion, and error checking. For example, `x.dim.pos`, is a Dimension object for the `pos` dimension. Another example, given `y: GTensor<'hiddenRep' | 'inputRep'>`, you can write `z = contract(x, y, ['inputRep'])` (contract is another name for matrix multiplication) and you get auto-completion and error checking when entering the `'inputRep'` string, and you get type inference for `z`, it must be `z: GTensor<'pos' | 'hiddenRep'>` (because `'inputRep'` was contracted away).

ML Library:

- `gtensor/`: the lowest level named tensor library (numpy like, but where the dimensions are named, so you get nice auto-completion and as-you-type error checking).

- `tokens/`: An abstraction of Token embeddings, containing a table from strings to vectors, and supporting going from `string[]` to `GTensor<'pos' | 'inputRep'>`.

- `transformer/`: The implementation of transformers.

- `trainer/`: Code for training; an abstract concept of a model's training state, and a specific implementation for training transformers.

- `seqtasks/`: various sequence to sequence tasks.

Generic tool libraries

- `pretty_json/`: a library for pretty printing JSON in a more compact and customizable way than JSON.stringify.

- `js_tree/`: a library for working with JS objects as if they are trees, e.g. flatten them into lists etc. Used to provide convenient way to work with type-checked objects (they have an TS inferface) that act as the object that holds all the parameter for a model, where you can conviently use the names.

Abstract libraries

- `tubes/`: Inspired by the paper [Why walk when you can take the tube?](http://strictlypositive.org/Holes.pdf), a library for working with JS-object-array tree structures where the state captures being at a particular location in the tree. This is used to provide the slightly fancy JSON pretty printer in `pretty_json`.

- `rxjs/`: Misc useful RXJS helpers.

Older documentation that explains the basic concept can be found in the [TFJS RFC](https://github.com/PAIR-code/tiny-transformers/blob/main/animated-transformer/src/lib/gtensor/20210731-tfjs-named-tensors.md) ([older TFJS version](https://github.com/tensorflow/community/blob/master/rfcs/20210731-tfjs-named-tensors.md)).

TODO: Explore nicer markdown-like editor support...

- https://github.com/facebook/lexical | https://playground.lexical.dev/ | https://lexical.dev/
- https://github.com/KillerCodeMonkey/ngx-quill | https://quilljs.com/

Note: https://webgpu.github.io/webgpu-samples/samples/worker#./worker.ts

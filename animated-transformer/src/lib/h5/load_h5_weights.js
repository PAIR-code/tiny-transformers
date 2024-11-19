const h5wasm = await import("h5wasm/node");
await h5wasm.ready;

let f = new h5wasm.File("/Users/afm/Downloads/tf_model.h5", "r");

console.log(f.keys());
let data = f.get("transformer/tfgp_t2lm_head_model/transformer");
// data.get("ln_f")
// problem here is that i'm not sure how to get the data inside each key.
// maybe it does not recognize the python type? not sure.
// it works :)
// 12 heads + ln_f + wpe and wte?
console.log(data.keys());
console.log(data.get('h_._0/attn/c_attn/weight:0').shape);
console.log(data.get("ln_f/beta:0").metadata);
console.log("wpe");
console.log(data.get("wpe/embeddings:0").shape);
console.log("wte");
console.log(data.get("wte/weight:0").shape);
// mlp inside the head should be two layers and one bias
console.log("mlp inside head")
console.log(data.get("h_._0/mlp/c_fc/weight:0").shape);
console.log(data.get("h_._0/mlp/c_fc/bias:0").shape);
console.log(data.get("h_._0/mlp/c_proj/weight:0").shape);
console.log(data.get("h_._0/mlp/c_proj/bias:0").shape);
f.close();
// console.log(f.file_id);
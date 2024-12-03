// export type TaskConfig = {
//   taskConfig: BasicLmTaskConfig;
// };

// export type CustomDataSet = {
//   descroption: string;
//   examples: Example[];
// };

// export type TestSet = {
//   initialTestSeed: number;
//   // testSet may contain duplicates, depending on generation dynamics.
//   // It is expected they will have distribution according to the generator's
//   // specification.
//   examples: Example[];
// };

// export type TrainBatch = {
//   curBatch: {
//     initialTrainSeed: number;
//     currentBatchNumber: number;
//     currentBatchSeed: number;
//     examples: Example[];
//   };
// };

// export type ModelConfig = {
//   transformerConfig: TransformerConfig;
// };

// export type Checkpoint = {
//   modelConfig: ModelConfig;
//   modelParams: TransformerParams;
// };

// export type OptimiserParams = {};

// export type OptimizerState = {
//   optimizerConfig: TrainStateConfig;
//   optimizerParams?: OptimiserParams;
// };

// export type Metrics = {
//   [metricName: string]: number;
// };

// export type Evaluation = {
//   examples: Example[];
//   curMetrics: Metrics;
// };

// export type EvaluationPoint = {
//   checkpoint?: Checkpoint;
//   eval: Evaluation;
// };

// export type EvaluationGraph = {
//   evalPoints: EvaluationPoint[];
// };

// export type Globals = {
//   taskConfig: BasicLmTaskConfig;
//   testSet: TestSet;
// };

// type Signalify<S extends ValueStruct> = { [Key in keyof S]: WritableSignal<S[Key]> };

// const initialState: Partial<ExampleGlobals> = {
//   toyInput: 'some initial input',
// };

// // export const exampleWorkerOp = {
// //   workerPath: './app.worker',
// //   inputs: ['name'] as const,
// //   outputs: ['t'] as const,
// // } as WorkerOp<'name', 't'>;
// export const exampleWorkerSpec = new CellSpec<ExampleCellInput, ExampleCellOutput>(
//   'an example cell',
//   // 'src/lib/weblab/example.worker.js' as never as URL,
//   () => new Worker(new URL('./example.worker', import.meta.url)),
//   ['toyInput'], // new URL('http://localhost:9876/_karma_webpack_/example.worker'),
//   ['toyOutputStr', 'toyOutputNumber']
// );

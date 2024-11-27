// ============================================================================

// Note: this cannot be done async in a timeout, because if it happens within a
// minimise call of an optimise, the metrics values may have already been
// disposed. Also we can't use Promise.all because that would make this async,
// and tf.minimise requires a sync function.
// export function prepareMetrics<Names extends string>(
//   batchId: number,
//   tfScalarMetrics: { [name in Names]: tf.Scalar }
// ): Metrics<Names> {
//   const nextMetrics = { batchId, values: {} } as Metrics<Names>;
//   // const tfMetrics = Object.entries<tf.Scalar>(tfScalarMetrics);
//   // const metricValues = Promise.all(tfMetrics.map(([metricName, scalar]) => scalar.array()));
//   for (const [metricName, scalar] of Object.entries<tf.Scalar>(tfScalarMetrics)) {
//     nextMetrics.values[metricName as Names] = scalar.arraySync();
//   }
//   return nextMetrics;
// }

// type PromisedMetrics<Name extends string> = {
//   batchId: number;
//   values: { [metricName in Name]: Promise<number> };
// };

// export function makeMetricReporter<Name extends string>(
//   // space: SignalSpace,
//   // metrics: SetableSignal<Metrics<Name>>
// ): {
//   reportMetrics: (batchId: number, tfScalarMetrics: { [names in Name]: tf.Scalar }) => void;
// } {
//   // const promisedMetrics = space.setable({ batchId: -1, values: {} } as PromisedMetrics<Name>);

//   // Notes:
//   // - We keep all tfjs values local, so there is no memory leakage.
//   // - We avoid sync calls that slow down CPU/GPU communication.
//   // - Return a promise once the metric has been reported.
//   function reportMetrics(
//     batchId: number,
//     tfScalarMetrics: { [names in Name]: tf.Scalar }
//   ): Promise<Metrics<Name>> {
//     return new Promise<Metrics<Name>>((resolve, _) => {
//       setTimeout(async () => {
//         const nextMetrics = { batchId, values: {} } as Metrics<Name>;
//         for (const [metricName, scalar] of Object.entries<tf.Scalar>(tfScalarMetrics)) {
//           nextMetrics.values[metricName as Name] = await scalar.array();
//         }
//         // metrics.set(nextMetrics);
//         resolve(nextMetrics);
//       });
//     });
//     // const promised = { batchId, values: {} } as PromisedMetrics<Name>;
//     // for (const [metricName, scalar] of Object.entries<tf.Scalar>(tfScalarMetrics)) {
//     //   promised.values[metricName as Name] = scalar.array();
//     // }
//     // promisedMetrics.set(promised);
//   }

//   // // const lastMetrics = space.writable({ batchId: -1, values: {} } as Metrics<Name>);
//   // space.derived(async () => {
//   //   const promised = promisedMetrics();
//   //   const metric = { batchId: promised.batchId, values: {} } as Metrics<Name>;
//   //   console.log('promised', promised);
//   //   for (const [metricName, promise] of Object.entries<Promise<number>>(promised.values)) {
//   //     metric.values[metricName as Name] = await promise;
//   //   }
//   //   metrics.set(metric);
//   // });

//   return { reportMetrics };
// }

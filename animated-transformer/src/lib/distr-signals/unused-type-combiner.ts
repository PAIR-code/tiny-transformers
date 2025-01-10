// type ConnectStructValue<Key, V1, V2, V3, V4> = Key extends keyof V1
//   ? SignalSender<V1[Key]>
//   : Key extends keyof V2
//     ? StreamSender<V2[Key]>
//     : Key extends keyof V3
//       ? SignalReceiver<V3[Key]>
//       : Key extends keyof V4
//         ? StreamReceiver<V4[Key]>
//         : never;

// type ConnectStruct<V1, V2, V3, V4> = {
//   [Key in keyof V1 | keyof V2 | keyof V3 | keyof V4]: () => ConnectStructValue<Key, V1, V2, V3, V4>;
// };

// type Combine4Struct<V1, V2, V3, V4> = {
//   [Key in keyof V1 | keyof V2 | keyof V3 | keyof V4]: Key extends keyof V1
//     ? V1[Key]
//     : Key extends keyof V2
//       ? V2[Key]
//       : Key extends keyof V3
//         ? V3[Key]
//         : Key extends keyof V4
//           ? V4[Key]
//           : never;
// };

// type test_Combine4Struct = Combine4Struct<{ a: string }, { b: number }, {}, {}>;

// type ChannelStructValue<Key, V1, V2, V3, V4> = Key extends keyof V1
//   ? SignalSendChannel<V1[Key]>
//   : Key extends keyof V2
//     ? StreamSendChannel<V2[Key]>
//     : Key extends keyof V3
//       ? SignalReceiveChannel<V3[Key]>
//       : Key extends keyof V4
//         ? StreamReceiveChannel<V4[Key]>
//         : never;

// type ChannelStruct<V1, V2, V3, V4> = {
//   [Key in keyof V1 | keyof V2 | keyof V3 | keyof V4]: ChannelStructValue<Key, V1, V2, V3, V4>;
// };

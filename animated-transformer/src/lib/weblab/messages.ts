export type FromWorkerMessage =
  | {
      kind: 'requestInput';
      name: string;
    }
  | {
      kind: 'requestInputStream';
      name: string;
    }
  | {
      kind: 'providingOutput';
      name: string;
      outputData: unknown;
    }
  | {
      kind: 'providingOutputStreamEntry';
      name: string;
      outputData: unknown;
    }
  | {
      kind: 'finished';
    };
export type ToWorkerMessage =
  | {
      kind: 'finishRequest';
    }
  | {
      kind: 'providingInput';
      name: string;
      inputData: unknown;
    }
  | {
      kind: 'providingInputStreamEntry';
      name: string;
      inputData: unknown;
    };

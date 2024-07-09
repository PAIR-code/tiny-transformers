import { SignalSpace, ValueSignal } from './signalspace';

describe('signalspace', () => {
  fit('Simple singal compute', () => {
    const s = new SignalSpace();

    const b = new ValueSignal(s, 'b');

    const c = s.makeComputedSignal(() => {
      return b.get() + 'c';
    });

    // Notice: c gets placeds on a single line, top level does not, and nothing
    // silly about wrapping d.
    expect(c.get()).toEqual('bc');
    b.set('a');
    expect(c.get()).toEqual('ac');
  });
});

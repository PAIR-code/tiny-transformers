import { SignalSpace, ValueSignal } from './signalspace';

fdescribe('signalspace', () => {
  it('Simple singal compute', () => {
    const s = new SignalSpace();

    const b = new ValueSignal(s, true);

    const notb = s.makeComputedSignal(() => {
      return !b.get();
    });

    // Notice: c gets placeds on a single line, top level does not, and nothing
    // silly about wrapping d.
    expect(notb.get()).toEqual(false);
    b.set(!b.get());
    expect(notb.get()).toEqual(true);
  });
});

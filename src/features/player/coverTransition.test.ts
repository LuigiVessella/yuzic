import { canStartCoverSlide } from './coverTransition';

describe('canStartCoverSlide', () => {
  it('does not strand the outgoing cover when the queue cannot advance', () => {
    expect(canStartCoverSlide('next', 2, 3, 'off')).toBe(false);
    expect(canStartCoverSlide('previous', 0, 3, 'off')).toBe(false);
  });

  it('allows an intentional queue move, including repeat-all from the end', () => {
    expect(canStartCoverSlide('next', 1, 3, 'off')).toBe(true);
    expect(canStartCoverSlide('previous', 1, 3, 'off')).toBe(true);
    expect(canStartCoverSlide('next', 2, 3, 'all')).toBe(true);
  });
});

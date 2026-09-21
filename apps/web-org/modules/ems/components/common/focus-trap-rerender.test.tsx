import { describe, expect, it } from 'vitest';
import React, { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusTrap } from '@smarteam/ui';

/**
 * A panel whose parent re-renders while someone types, passing a new close handler each time,
 * as the calendar's regularization drawer does.
 */
function Panel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  useFocusTrap(true, ref, onClose);
  return (
    <div ref={ref}>
      <button onClick={onClose} type="button">
        Close
      </button>
      <textarea aria-label="Reason" onChange={(e) => setText(e.target.value)} value={text} />
    </div>
  );
}

function Parent() {
  const [ticks, setTicks] = useState(0);
  return (
    <>
      <button onClick={() => setTicks((n) => n + 1)} type="button">
        Re-render {ticks}
      </button>
      <Panel onClose={() => undefined} />
    </>
  );
}

describe('focus trap', () => {
  it('keeps focus where the person is typing when the page re-renders', async () => {
    render(<Parent />);
    const user = userEvent.setup();
    const reason = screen.getByLabelText('Reason');
    await user.click(reason);
    await user.type(reason, 'forgot');
    // A re-render gives the panel a new close handler; focus must not jump to the Close button.
    screen.getByRole('button', { name: /Re-render/ }).click();
    expect(document.activeElement).toBe(reason);
    await user.type(reason, ' to punch');
    expect(reason).toHaveValue('forgot to punch');
  });
});

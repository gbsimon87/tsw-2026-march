import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VoiceTrackingControl } from './VoiceTrackingControl';

class MockRecognition {
  static instance = null;

  constructor() {
    MockRecognition.instance = this;
    this.start = vi.fn();
    this.abort = vi.fn();
  }

  begin() {
    this.onstart?.();
  }

  finish(transcript) {
    const result = [{ transcript }];
    result.isFinal = true;
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

describe('VoiceTrackingControl', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    window.SpeechRecognition = MockRecognition;
  });

  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.isSecureContext;
  });

  test('runs one command and reports the safely rendered final transcript', async () => {
    const onListeningStart = vi.fn(() => ({ gameId: 'game-1' }));
    const onCommand = vi.fn(async () => ({ ok: true, message: 'Steal recorded.' }));
    render(<VoiceTrackingControl onListeningStart={onListeningStart} onCommand={onCommand} />);

    fireEvent.click(screen.getByRole('button', { name: 'Record voice command' }));
    act(() => MockRecognition.instance.begin());
    expect(screen.getByRole('button', { name: 'Cancel voice command' })).toBeInTheDocument();
    act(() => MockRecognition.instance.finish('<img src=x> home 13 steal'));

    await waitFor(() => expect(screen.getAllByText('Steal recorded.')).toHaveLength(2));
    expect(onCommand).toHaveBeenCalledWith('<img src=x> home 13 steal', { gameId: 'game-1' });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/Heard:/)).toHaveTextContent('<img src=x> home 13 steal');
    expect(screen.getAllByText('Steal recorded.')).toHaveLength(2);
  });

  test('keeps the microphone unavailable when the control is disabled', () => {
    render(<VoiceTrackingControl disabled onCommand={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Record voice command' })).toBeDisabled();
  });

  test('starts once when a court tap requests recognition', async () => {
    const onListeningStart = vi.fn(() => ({ selectedShot: { zoneId: 'PAINT' } }));
    const onStartRequestHandled = vi.fn();
    const { rerender } = render(
      <VoiceTrackingControl
        startRequest={0}
        onStartRequestHandled={onStartRequestHandled}
        onListeningStart={onListeningStart}
      />
    );

    rerender(
      <VoiceTrackingControl
        startRequest={1}
        onStartRequestHandled={onStartRequestHandled}
        onListeningStart={onListeningStart}
      />
    );

    await waitFor(() => expect(MockRecognition.instance.start).toHaveBeenCalledTimes(1));
    expect(onStartRequestHandled).toHaveBeenCalledTimes(1);
    act(() => MockRecognition.instance.begin());
    expect(onListeningStart).toHaveBeenCalledTimes(1);

    rerender(
      <VoiceTrackingControl
        startRequest={1}
        onStartRequestHandled={onStartRequestHandled}
        onListeningStart={onListeningStart}
      />
    );
    expect(MockRecognition.instance.start).toHaveBeenCalledTimes(1);
  });

  test('does not replay a consumed court request after a remount', () => {
    const first = render(<VoiceTrackingControl startRequest={1} onStartRequestHandled={vi.fn()} />);
    expect(MockRecognition.instance.start).toHaveBeenCalledTimes(1);
    first.unmount();

    MockRecognition.instance = null;
    render(<VoiceTrackingControl startRequest={0} onStartRequestHandled={vi.fn()} />);

    expect(MockRecognition.instance).toBeNull();
  });

  test('shows court-tap guidance without an idle microphone button', () => {
    render(<VoiceTrackingControl courtTapOnly />);

    expect(
      screen.getAllByText('Voice tracking is on. Select a court position to start listening.')
        .length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Record voice command' })).not.toBeInTheDocument();
  });

  test('lets a mis-heard command be discarded and re-recorded', async () => {
    const onCommand = vi.fn(async () => ({ ok: true, message: 'Steal recorded.' }));
    render(<VoiceTrackingControl onCommand={onCommand} />);
    const clearButton = () => screen.queryByRole('button', { name: 'Clear voice result' });

    expect(clearButton()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record voice command' }));
    act(() => MockRecognition.instance.begin());
    expect(clearButton()).not.toBeInTheDocument();

    act(() => MockRecognition.instance.finish('home 13 steel'));
    await waitFor(() => expect(clearButton()).toBeInTheDocument());
    expect(screen.getByText(/Heard:/)).toHaveTextContent('home 13 steel');

    fireEvent.click(clearButton());

    expect(screen.queryByText(/Heard:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Steal recorded.')).not.toBeInTheDocument();
    expect(clearButton()).not.toBeInTheDocument();
    expect(
      screen.getAllByText('Tap the court for a shot, or tap the microphone for another stat.')
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Record voice command' }));
    act(() => MockRecognition.instance.begin());
    act(() => MockRecognition.instance.finish('home 13 steal'));

    await waitFor(() => expect(onCommand).toHaveBeenCalledTimes(2));
    expect(onCommand).toHaveBeenLastCalledWith('home 13 steal', null);
    expect(screen.getByText(/Heard:/)).toHaveTextContent('home 13 steal');
  });

  test('offers the correction control after a rejected command', async () => {
    const onCommand = vi.fn(async () => ({ ok: false }));
    render(<VoiceTrackingControl onCommand={onCommand} />);

    fireEvent.click(screen.getByRole('button', { name: 'Record voice command' }));
    act(() => MockRecognition.instance.begin());
    act(() => MockRecognition.instance.finish('home 13 sandwich'));

    await waitFor(() =>
      expect(screen.getAllByText('Command not recognised. No stat was recorded.')).toHaveLength(2)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear voice result' }));

    expect(
      screen.queryByText('Command not recognised. No stat was recorded.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Heard:/)).not.toBeInTheDocument();
    expect(
      screen.getAllByText('Tap the court for a shot, or tap the microphone for another stat.')
    ).toHaveLength(2);
  });

  test('shows a useful fallback in an unsupported browser', () => {
    delete window.SpeechRecognition;
    render(<VoiceTrackingControl />);
    expect(screen.getByText(/does not support voice tracking/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /voice command/i })).not.toBeInTheDocument();
  });
});

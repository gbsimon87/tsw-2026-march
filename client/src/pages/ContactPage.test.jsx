import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ContactPage } from './ContactPage';
import { contactApi } from '../features/contact/contactApi';

vi.mock('../features/contact/contactApi', () => ({
  contactApi: {
    submit: vi.fn(),
  },
}));

describe('ContactPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('submits the contact form and shows the success state', async () => {
    contactApi.submit.mockResolvedValue({ ok: true });

    render(<ContactPage />);

    fireEvent.change(screen.getByPlaceholderText('Jane Smith'), {
      target: { value: 'Jane Smith' },
    });
    fireEvent.change(screen.getByPlaceholderText('jane@club.com'), {
      target: { value: 'jane@club.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Eastside Hoops'), {
      target: { value: 'Eastside Hoops' },
    });

    const [roleSelect, interestSelect] = screen.getAllByRole('combobox');
    fireEvent.change(roleSelect, { target: { value: 'coach' } });
    fireEvent.change(interestSelect, { target: { value: 'league-setup' } });

    fireEvent.change(
      screen.getByPlaceholderText(
        'Games per week, age group, current workflow, specific questions...'
      ),
      { target: { value: 'We run two games per week.' } }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(contactApi.submit).toHaveBeenCalledWith({
        name: 'Jane Smith',
        email: 'jane@club.com',
        role: 'coach',
        clubName: 'Eastside Hoops',
        interest: 'league-setup',
        message: 'We run two games per week.',
      });
    });
    expect(await screen.findByText('Message sent.')).toBeInTheDocument();
    expect(screen.getByText("We'll be in touch at jane@club.com.")).toBeInTheDocument();
  });
});

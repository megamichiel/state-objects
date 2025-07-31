import {render, screen} from '@testing-library/react';
import userEvent from "@testing-library/user-event";
import React from 'react';
import App from '../App';
import '@testing-library/jest-dom'

test('modal can open', async () => {
    render(<App/>);
    const linkElement = screen.getByText(/this is some/i);
    expect(linkElement).toBeInTheDocument();

    const modalButton = screen.getByText(/open modal/i);
    expect(modalButton).toBeInTheDocument();

    userEvent.click(modalButton);

    const header = screen.getByText(/modal header/i);
    expect(header).toBeInTheDocument();
});

import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreateServiceTokenModal from "./create-service-token-modal";
import * as service from "@/features/service-tokens/services/service-token-service";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The user picker is covered by its own query; here it just picks a user.
vi.mock("@/features/service-tokens/components/service-account-select", () => ({
  default: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange("user-1")}>
      pick user
    </button>
  ),
}));

vi.mock("@/features/service-tokens/services/service-token-service", () => ({
  getServiceTokens: vi.fn(),
  revokeServiceToken: vi.fn(),
  createServiceToken: vi.fn(),
}));

const created = {
  id: "token-1",
  name: "TRYlle",
  tokenPrefix: "Zk3f9QaB",
  userId: "user-1",
  userName: "TRYlle",
  userEmail: "trylle@example.com",
  userDisabled: false,
  creatorId: "admin-1",
  status: "active" as const,
  expiresAt: "2027-01-08T10:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-10-10T10:00:00.000Z",
  token: "header.payload.signature-of-the-token",
};

function Harness({ opened = true, onClose = () => {} }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <CreateServiceTokenModal opened={opened} onClose={onClose} />
      </MantineProvider>
    </QueryClientProvider>
  );
}

describe("CreateServiceTokenModal", () => {
  beforeAll(() => {
    window.matchMedia =
      window.matchMedia ||
      ((query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
          onchange: null,
        }) as MediaQueryList);
    (globalThis as any).ResizeObserver =
      (globalThis as any).ResizeObserver ||
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
  });

  beforeEach(() => {
    vi.mocked(service.createServiceToken).mockReset();
    vi.mocked(service.createServiceToken).mockResolvedValue(created);
  });

  it("creates a token with the chosen user and the 90 day default, then shows it once", async () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: "TRYlle" },
    });
    fireEvent.click(screen.getByText("pick user"));
    fireEvent.click(screen.getByText("Create token"));

    await waitFor(() =>
      expect(service.createServiceToken).toHaveBeenCalledWith({
        name: "TRYlle",
        userId: "user-1",
        expiresInDays: 90,
      }),
    );
    const tokenField = (await screen.findByDisplayValue(
      created.token,
    )) as HTMLInputElement;
    expect(tokenField.readOnly).toBe(true);
    expect(
      screen.getByText(/shown only once and cannot be retrieved later/),
    ).toBeTruthy();
  });

  it("does not submit without a name or a user", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByText("Create token"));

    await waitFor(() =>
      expect(screen.getByLabelText(/Name/).getAttribute("aria-invalid")).toBe(
        "true",
      ),
    );
    expect(service.createServiceToken).not.toHaveBeenCalled();
  });

  it("forgets the token when the dialog is closed", async () => {
    const { rerender } = render(<Harness />);
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: "TRYlle" },
    });
    fireEvent.click(screen.getByText("pick user"));
    fireEvent.click(screen.getByText("Create token"));
    await screen.findByDisplayValue(created.token);

    fireEvent.click(screen.getByText("Done"));
    rerender(<Harness opened />);

    await waitFor(() =>
      expect(screen.queryByDisplayValue(created.token)).toBeNull(),
    );
    expect(screen.getByText("Create token")).toBeTruthy();
  });
});

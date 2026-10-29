import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PairingDialog, PairingGate } from "../src/components/PairingDialog";

afterEach(cleanup);

it("lets a visitor skip pairing without submitting a code", () => {
  const onRedeem = vi.fn(async () => {});
  const onSkip = vi.fn();
  render(<PairingGate onRedeem={onRedeem} onSkip={onSkip} />);
  fireEvent.click(screen.getByRole("button", { name: "开始记录" }));
  expect(onSkip).toHaveBeenCalledOnce();
  expect(onRedeem).not.toHaveBeenCalled();
});

it("reveals pairing on demand and rejects incomplete codes locally", async () => {
  const onRedeem = vi.fn(async () => {});
  render(<PairingGate onRedeem={onRedeem} onSkip={vi.fn()} />);
  expect(screen.queryByRole("textbox", { name: "6 位配对码" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "连接已有设备" }));
  const input = screen.getByRole("textbox", { name: "6 位配对码" });
  fireEvent.change(input, { target: { value: "123" } });
  fireEvent.click(screen.getByRole("button", { name: "配对并同步" }));
  expect(onRedeem).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("完整的 6 位");
  expect(input).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(input, { target: { value: "123 456" } });
  await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
  expect(onRedeem).toHaveBeenCalledExactlyOnceWith("123456");
});

it("allows only one redemption while Enter is pressed repeatedly", async () => {
  let finish!: () => void;
  const onRedeem = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<PairingGate initialCode="123456" onRedeem={onRedeem} />);
  const input = screen.getByRole("textbox", { name: "6 位配对码" });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onRedeem).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "连接中…" })).toBeDisabled();
  expect(document.querySelector(".diamond-grid")).not.toBeNull();
  await act(async () => finish());
  expect(document.querySelector(".diamond-grid")).toBeNull();
  expect(screen.getByRole("button", { name: "配对并同步" })).toBeEnabled();
});

it("does not redeem while confirming IME text", () => {
  const onRedeem = vi.fn(async () => {});
  render(<PairingGate initialCode="123456" onRedeem={onRedeem} />);
  const input = screen.getByRole("textbox", { name: "6 位配对码" });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(onRedeem).not.toHaveBeenCalled();
});

it("explains that a web preview without a controller cannot display a code", () => {
  render(<PairingDialog web onClose={vi.fn()} />);
  expect(screen.getByText(/网页暂时不能出示配对码/)).toBeInTheDocument();
  expect(screen.queryByText(/在电脑端打开/)).toBeNull();
});

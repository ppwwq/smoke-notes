import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PairingGate } from "../src/components/PairingDialog";

afterEach(cleanup);

it("lets a visitor skip pairing without submitting a code", () => {
  const onRedeem = vi.fn(async () => {});
  const onSkip = vi.fn();
  render(<PairingGate onRedeem={onRedeem} onSkip={onSkip} />);
  fireEvent.click(
    screen.getByRole("button", { name: "暂时跳过，先在本机使用" }),
  );
  expect(onSkip).toHaveBeenCalledOnce();
  expect(onRedeem).not.toHaveBeenCalled();
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

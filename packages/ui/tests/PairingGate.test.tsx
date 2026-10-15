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
  await act(async () => finish());
});

it("does not redeem while confirming IME text", () => {
  const onRedeem = vi.fn(async () => {});
  render(<PairingGate initialCode="123456" onRedeem={onRedeem} />);
  const input = screen.getByRole("textbox", { name: "6 位配对码" });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(onRedeem).not.toHaveBeenCalled();
});

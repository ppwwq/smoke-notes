import { expect, it } from "vitest";
import { stackedCardCollision } from "../src/components/stacked-card-collision";
type Args = Parameters<typeof stackedCardCollision>[0];
function collision(y: number, pointer = true, x = 400) {
  const rect = (top: number) => ({
    top,
    left: 0,
    bottom: top + 230,
    right: 800,
    width: 800,
    height: 230,
  });
  return stackedCardCollision({
    active: { id: "one" },
    collisionRect: rect(y - 115),
    pointerCoordinates: pointer ? { x, y } : null,
    droppableRects: new Map([
      ["one", rect(0)],
      ["two", rect(120)],
      ["three", rect(240)],
    ]),
    droppableContainers: ["one", "two", "three"].map((id) => ({
      id,
      data: { current: {} },
    })),
  } as Args);
}
it("targets the visible strip of the next overlapped card instead of the original full-card centre", () => {
  expect(collision(132)[0].id).toBe("two");
  expect(collision(252)[0].id).toBe("three");
  expect(collision(110)[0].id).toBe("one");
});
it("retains end insertion targets when auto-scroll moves the cards past the pointer", () => {
  expect(collision(-60)[0].id).toBe("one");
  expect(collision(530)[0].id).toBe("three");
});
it("cancels outside the column and retains centre-based keyboard sorting", () => {
  expect(collision(-20, true, -10)).toEqual([]);
  expect(collision(530, true, 810)).toEqual([]);
  expect(collision(235, false)[0].id).toBe("two");
});

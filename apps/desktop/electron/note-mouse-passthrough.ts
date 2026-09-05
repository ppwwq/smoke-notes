type MouseWindow = {
  isDestroyed(): boolean;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void;
  getContentBounds(): { x: number; y: number };
  webContents: { getZoomFactor(): number };
};
type Handler = (event: { sender: { id: number } }, value?: unknown) => unknown;

export function registerNoteMousePassthrough(
  ipc: { handle(channel: string, handler: Handler): void },
  resolveWindow: (senderId: number) => MouseWindow | null | undefined,
  noteIds: ReadonlyMap<number, string>,
  cursorPosition: () => { x: number; y: number },
) {
  const noteWindow = (senderId: number) => {
    if (!noteIds.has(senderId)) throw new Error("Not a note window");
    const window = resolveWindow(senderId);
    if (!window || window.isDestroyed())
      throw new Error("Note window unavailable");
    return window;
  };
  ipc.handle("note-window:mouse-passthrough", (event, ignore) => {
    const window = noteWindow(event.sender.id);
    if (typeof ignore !== "boolean") throw new Error("Expected boolean");
    if (ignore) window.setIgnoreMouseEvents(true, { forward: true });
    else window.setIgnoreMouseEvents(false);
  });
  ipc.handle("note-window:pointer", (event) => {
    const window = noteWindow(event.sender.id);
    const bounds = window.getContentBounds();
    const point = cursorPosition();
    const zoom = window.webContents.getZoomFactor();
    return { x: (point.x - bounds.x) / zoom, y: (point.y - bounds.y) / zoom };
  });
}

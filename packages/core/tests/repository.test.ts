import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository, SmokeNotesDatabase } from '../src/index';

describe('LocalRepository', () => {
  let database: SmokeNotesDatabase;
  let repository: LocalRepository;
  let sequence = 0;

  beforeEach(() => {
    database = new SmokeNotesDatabase(`smoke-notes-test-${crypto.randomUUID()}`);
    repository = new LocalRepository(database, {
      workspaceId: 'workspace-1',
      deviceId: 'desktop-1',
      now: () => new Date('2026-08-28T12:00:00.000Z'),
      createId: () => `id-${++sequence}`,
    });
  });

  afterEach(async () => {
    await database.delete();
  });

  it('stores a new notebook locally and queues it for sync', async () => {
    const notebook = await repository.createNotebook('工作');

    expect(await repository.listNotebooks()).toEqual([notebook]);
    expect(await repository.listPendingOperations()).toMatchObject([
      {
        entity: 'notebook',
        entityId: notebook.id,
        action: 'upsert',
        baseVersion: 0,
        attempts: 0,
      },
    ]);
  });

  it('updates a todo and keeps the change in the outbox', async () => {
    const todo = await repository.createTodo('交水费');
    const completed = await repository.toggleTodo(todo.id);

    expect(completed.completed).toBe(true);
    expect(completed.version).toBe(2);
    expect(await repository.listTodos()).toMatchObject([{ completed: true }]);
    expect(await repository.listPendingOperations()).toHaveLength(2);
  });

  it('moves a note using only the moved note rank', async () => {
    const notebook = await repository.createNotebook('灵感');
    const first = await repository.createNote(notebook.id, { title: '一', body: '' });
    const second = await repository.createNote(notebook.id, { title: '二', body: '' });
    const third = await repository.createNote(notebook.id, { title: '三', body: '' });

    await repository.moveNote(third.id, first.rank, second.rank);

    expect((await repository.listNotes(notebook.id)).map((note) => note.title)).toEqual([
      '一',
      '三',
      '二',
    ]);
  });

  it('soft deletes immediately and purges records after thirty days', async () => {
    const todo = await repository.createTodo('旧任务');
    await repository.trashTodo(todo.id);

    expect(await repository.listTodos()).toEqual([]);
    expect(await repository.listTrash()).toHaveLength(1);

    await database.todos.update(todo.id, { deletedAt: '2026-07-20T00:00:00.000Z' });
    expect(await repository.purgeExpiredTrash()).toBe(1);
    expect(await database.todos.get(todo.id)).toBeUndefined();
  });

  it('edits and restores records without losing their identity', async () => {
    const notebook = await repository.createNotebook('生活');
    const note = await repository.createNote(notebook.id, { title: '原题', body: '原文' });
    const changed = await repository.updateNote(note.id, { title: '新标题', body: '新正文' });
    await repository.trashNote(note.id);
    const restored = await repository.restore('note', note.id);

    expect(changed).toMatchObject({ id: note.id, title: '新标题', body: '新正文', version: 2 });
    expect(restored.deletedAt).toBeNull();
    expect((await repository.listNotes(notebook.id))[0]).toMatchObject({ id: note.id, title: '新标题' });
  });

  it('renames notebooks and edits todo text', async () => {
    const notebook = await repository.createNotebook('临时');
    const todo = await repository.createTodo('旧文字');

    expect(await repository.renameNotebook(notebook.id, '项目')).toMatchObject({ name: '项目' });
    expect(await repository.updateTodo(todo.id, { text: '新文字' })).toMatchObject({ text: '新文字' });
  });

  it('moves notebooks and todos between their neighbours', async () => {
    const firstBook = await repository.createNotebook('一');
    const secondBook = await repository.createNotebook('二');
    const thirdBook = await repository.createNotebook('三');
    const firstTodo = await repository.createTodo('甲');
    const secondTodo = await repository.createTodo('乙');

    await repository.moveNotebook(thirdBook.id, firstBook.rank, secondBook.rank);
    await repository.moveTodo(secondTodo.id, null, firstTodo.rank);

    expect((await repository.listNotebooks()).map((item) => item.name)).toEqual(['一', '三', '二']);
    expect((await repository.listTodos()).map((item) => item.text)).toEqual(['乙', '甲']);
  });
});

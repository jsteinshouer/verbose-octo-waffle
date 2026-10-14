import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalNotesRepository,
  NOTES_STORAGE_KEY,
  NotesStorageError,
  makeNote,
  normalizeTags,
} from "../src/notes-store.mjs";

class MemoryStorage {
  values = new Map();
  failReads = false;
  failWrites = false;

  getItem(key) {
    if (this.failReads) throw new Error("Read blocked");
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    if (this.failWrites) throw new Error("Write blocked");
    this.values.set(key, value);
  }
}

test("starts with an empty notebook and persists note updates", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalNotesRepository(storage);
  const note = makeNote("Field notes");

  assert.deepEqual(await repository.list(), []);
  await repository.save({ ...note, content: "A first thought." });
  await repository.save({ ...note, content: "A revised thought." });

  const records = await repository.list();
  assert.equal(records.length, 1);
  assert.equal(records[0].content, "A revised thought.");
  assert.equal(storage.values.has(NOTES_STORAGE_KEY), true);
});

test("removes only the selected note", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalNotesRepository(storage);
  const first = makeNote("First");
  const second = makeNote("Second");
  await repository.save(first);
  await repository.save(second);

  await repository.remove(first.id);

  assert.deepEqual((await repository.list()).map((note) => note.id), [second.id]);
});

test("normalizes duplicate tags without changing their first spelling", () => {
  assert.deepEqual(normalizeTags(["  Ideas ", "ideas", "", "Reading"]), ["Ideas", "Reading"]);
});

test("leaves malformed stored data untouched and reports it", async () => {
  const storage = new MemoryStorage();
  storage.values.set(NOTES_STORAGE_KEY, "{not valid JSON");
  const repository = new LocalNotesRepository(storage);

  await assert.rejects(repository.list(), NotesStorageError);
  assert.equal(storage.values.get(NOTES_STORAGE_KEY), "{not valid JSON");
});

test("surfaces read and quota errors rather than pretending a save worked", async () => {
  const readFailure = new MemoryStorage();
  readFailure.failReads = true;
  await assert.rejects(new LocalNotesRepository(readFailure).list(), /blocked access/);

  const writeFailure = new MemoryStorage();
  writeFailure.failWrites = true;
  await assert.rejects(new LocalNotesRepository(writeFailure).save(makeNote()), /couldn't save/);
});

test("rejects malformed records instead of silently dropping them", async () => {
  const storage = new MemoryStorage();
  storage.values.set(NOTES_STORAGE_KEY, JSON.stringify([{ id: "not-a-note" }]));

  await assert.rejects(new LocalNotesRepository(storage).list(), /invalid format/);
});

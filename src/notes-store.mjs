export const NOTES_STORAGE_KEY = "writing-desk-notes-v1";

export class NotesStorageError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "NotesStorageError";
  }
}

export function normalizeTags(value) {
  const seen = new Set();
  return value
    .map((tag) => tag.trim())
    .filter((tag) => {
      const normalized = tag.toLocaleLowerCase();
      if (!tag || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function makeNote(title = "") {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const timestamp = new Date().toISOString();
  return {
    id,
    title,
    content: "",
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function validateNote(note) {
  if (
    !note
    || typeof note !== "object"
    || typeof note.id !== "string"
    || typeof note.title !== "string"
    || typeof note.content !== "string"
    || !Array.isArray(note.tags)
    || !note.tags.every((tag) => typeof tag === "string")
    || typeof note.createdAt !== "string"
    || Number.isNaN(Date.parse(note.createdAt))
    || typeof note.updatedAt !== "string"
    || Number.isNaN(Date.parse(note.updatedAt))
  ) {
    throw new NotesStorageError("A saved note has an invalid format. The stored notes were left untouched.");
  }

  return {
    id: note.id,
    title: note.title,
    content: note.content,
    tags: normalizeTags(note.tags),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export class LocalNotesRepository {
  constructor(storage, key = NOTES_STORAGE_KEY) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new NotesStorageError("Browser storage is unavailable.");
    }
    this.storage = storage;
    this.key = key;
  }

  async list() {
    let serialized;
    try {
      serialized = this.storage.getItem(this.key);
    } catch (error) {
      throw new NotesStorageError("Your browser blocked access to locally stored notes.", { cause: error });
    }

    if (serialized === null) return [];

    let records;
    try {
      records = JSON.parse(serialized);
    } catch (error) {
      throw new NotesStorageError("Saved notes could not be read. They were left untouched.", { cause: error });
    }
    if (!Array.isArray(records)) {
      throw new NotesStorageError("Saved notes have an invalid format. They were left untouched.");
    }

    return records.map(validateNote);
  }

  async save(note) {
    const validated = validateNote(note);
    const records = await this.list();
    const next = records.filter((record) => record.id !== validated.id);
    next.push(validated);
    this.write(next);
    return validated;
  }

  async remove(id) {
    const records = await this.list();
    this.write(records.filter((record) => record.id !== id));
  }

  write(records) {
    try {
      this.storage.setItem(this.key, JSON.stringify(records));
    } catch (error) {
      throw new NotesStorageError("Your browser couldn't save this change. Check available storage and try again.", { cause: error });
    }
  }
}

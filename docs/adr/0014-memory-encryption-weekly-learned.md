# ADR 0014: Memories encrypted at rest, weekly "what I learned"

**Status:** accepted (2026-10-30)

**Decision**

- **Encryption.** `memories.content` uses a `sealedText` column type (`schema.ts`). Values are encrypted with AES-256-GCM (`crypto.ts`, `ENCRYPTION_KEY`) on write and decrypted on read.
  - Services and tools are unchanged, and the database only ever sees ciphertext.
  - Plain values written before this still read, and `scripts/encrypt-memories.ts` (run on every deploy, safe to repeat) re-saves them encrypted.
  - Without `ENCRYPTION_KEY` (local development only), values stay plain.
- **Search.** Memory matching and duplicate checks already happen in application code (`selectMemories`, `similarContent`), so encryption costs no search features. Nothing may filter or sort memories by content in SQL.
- **Weekly summary.** `weekly_learned` is a Sunday-evening review (it doesn't count toward the daily cap). It lists the week's new memories and how answers were rated, and links to Settings → Assistant to correct anything.

**Consequences**

- Rotating `ENCRYPTION_KEY` needs a re-encrypt step; the format is versioned (`v1.`) for that.
- A database dump alone no longer reveals what Jarvis knows about a person.

// Browser storage (localStorage). Data stays on this device/browser.
// To sync across devices, replace these four methods with Firestore calls:
//   users/{uid}/essays/{id}, users/{uid}/vocabulary/{id}, users/{uid}/settings
// and protect them with security rules (request.auth.uid == userId).
const PREFIX = "ielts-coach:";
const mem = {};
export const store = {
  async get(k) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? null : JSON.parse(v); } catch (e) { return mem[k] ?? null; } },
  async set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { mem[k] = v; } },
  async del(k) { try { localStorage.removeItem(PREFIX + k); } catch (e) { delete mem[k]; } },
  async list(prefix) {
    try { return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX + prefix)).map((k) => k.slice(PREFIX.length)); }
    catch (e) { return Object.keys(mem).filter((k) => k.startsWith(prefix)); }
  },
};

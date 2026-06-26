// Returns the current logged-in user (from the session cookie), or null.
import { currentUser } from "./lib/session.js";

export default async function handler(req, res) {
  try {
    const user = await currentUser(req);
    res.status(200).json({ user });
  } catch (e) {
    res.status(200).json({ user: null, error: String(e.message || e) });
  }
}

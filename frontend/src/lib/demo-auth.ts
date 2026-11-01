// Demo-only accounts kept in this browser's localStorage. Not secure.
// Real validation will move to the backend later.
export type DemoUser = { name: string; email: string; password: string };

const USERS_KEY = "blueprint-demo-users";
const SESSION_KEY = "blueprint-demo-session";

const readUsers = (): DemoUser[] => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]");
  } catch {
    return [];
  }
};

export function signUp(name: string, email: string, password: string) {
  const users = readUsers();
  const key = email.trim().toLowerCase();
  if (users.some((u) => u.email === key)) throw new Error("An account with this email already exists");
  const user = { name: name.trim(), email: key, password };
  localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
  localStorage.setItem(SESSION_KEY, key);
  return user;
}

export function signIn(email: string, password: string) {
  const user = readUsers().find((u) => u.email === email.trim().toLowerCase() && u.password === password);
  if (!user) throw new Error("Wrong email or password");
  localStorage.setItem(SESSION_KEY, user.email);
  return user;
}

export function currentUser(): DemoUser | null {
  const email = localStorage.getItem(SESSION_KEY);
  return email ? readUsers().find((u) => u.email === email) ?? null : null;
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

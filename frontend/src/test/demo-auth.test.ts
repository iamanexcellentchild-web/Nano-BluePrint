import { beforeEach, expect, it } from "vitest";
import { currentUser, signIn, signOut, signUp } from "@/lib/demo-auth";
beforeEach(() => localStorage.clear());
it("signs up, rejects wrong password, signs back in", () => {
  signUp("Ada", "A@b.com", "pw");
  expect(currentUser()?.email).toBe("a@b.com");
  signOut();
  expect(currentUser()).toBeNull();
  expect(() => signIn("a@b.com", "nope")).toThrow();
  expect(signIn("a@b.com", "pw").name).toBe("Ada");
});
it("blocks duplicate emails", () => {
  signUp("Ada", "a@b.com", "pw");
  expect(() => signUp("Bo", "A@B.com", "x")).toThrow();
});

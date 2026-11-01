import { describe, expect, it } from "vitest";
import { pascal, slug, snake } from "@/lib/names";

describe("names", () => {
  it("snake-cases spaces, dashes and camelCase", () => {
    expect(snake("Booking Request")).toBe("booking_request");
    expect(snake("order-line")).toBe("order_line");
    expect(snake("clientName")).toBe("client_name");
  });

  it("pascal-cases the same way the backend does", () => {
    expect(pascal("booking_requested")).toBe("BookingRequested");
    expect(pascal("Booking requested")).toBe("BookingRequested");
    expect(pascal("")).toBe("");
  });

  it("makes safe file names", () => {
    expect(slug("My Project!")).toBe("my-project");
    expect(slug("!!!")).toBe("project");
  });
});

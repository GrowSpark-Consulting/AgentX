import { describe, expect, it } from "vitest";
import { CONNECTION_SERVICES, visibleActions } from "./connection-actions";

describe("visibleActions", () => {
  it("gives the owner recheck and disconnect on a working or broken connection", () => {
    expect(visibleActions("active", "owner")).toEqual(["recheck", "disconnect"]);
    expect(visibleActions("failed", "owner")).toEqual(["recheck", "disconnect"]);
    expect(visibleActions("pending", "owner")).toEqual(["recheck", "disconnect"]);
  });

  it("offers no recheck while checks run, and nothing once disconnected", () => {
    expect(visibleActions("validating", "owner")).toEqual(["disconnect"]);
    expect(visibleActions("disconnected", "owner")).toEqual([]);
  });

  it("lets an admin recheck but not disconnect, and staff do neither", () => {
    expect(visibleActions("active", "admin")).toEqual(["recheck"]);
    expect(visibleActions("active", "staff")).toEqual([]);
    expect(visibleActions("failed", "staff")).toEqual([]);
  });
});

describe("CONNECTION_SERVICES", () => {
  it("has no service switched on until the API has the endpoints", () => {
    // POST /api/whatsapp/connections/:id/recheck and /disconnect are not on the API yet. Switching
    // one on here without the endpoint would make the button call a route that answers 404.
    expect(CONNECTION_SERVICES).toEqual({ recheck: null, disconnect: null });
  });
});

import type { ConnectionStatus, Role } from "@pakka/types";
import { describe, expect, it } from "vitest";
import { CONNECTION_SERVICES, visibleActions } from "./connection-actions";

const STATUSES: ConnectionStatus[] = ["pending", "validating", "active", "failed", "disconnected"];
const ROLES: Role[] = ["owner", "admin", "staff"];

describe("visibleActions", () => {
  it("gives the owner recheck and disconnect on a working or broken connection", () => {
    expect(visibleActions("active", "owner", "embedded_signup")).toEqual(["recheck", "disconnect"]);
    expect(visibleActions("failed", "owner", "embedded_signup")).toEqual(["recheck", "disconnect"]);
    expect(visibleActions("pending", "owner", "embedded_signup")).toEqual(["recheck", "disconnect"]);
  });

  it("offers no recheck while checks run, and nothing once disconnected", () => {
    expect(visibleActions("validating", "owner", "embedded_signup")).toEqual(["disconnect"]);
    expect(visibleActions("disconnected", "owner", "embedded_signup")).toEqual([]);
  });

  it("lets an admin recheck but not disconnect, and staff do neither", () => {
    expect(visibleActions("active", "admin", "embedded_signup")).toEqual(["recheck"]);
    expect(visibleActions("active", "staff", "embedded_signup")).toEqual([]);
    expect(visibleActions("failed", "staff", "embedded_signup")).toEqual([]);
  });

  it("treats every client connection method the same", () => {
    for (const status of STATUSES) {
      for (const role of ROLES) {
        const expected = visibleActions(status, role, "embedded_signup");
        expect(visibleActions(status, role, "assisted")).toEqual(expected);
        expect(visibleActions(status, role, "manual_byo")).toEqual(expected);
      }
    }
  });

  it("offers nothing on a Spark Agent number (platform), whoever looks and whatever its status", () => {
    // Our own test or demo number, seeded by script: recheck and disconnect are for the client's own.
    for (const status of STATUSES) {
      for (const role of ROLES) expect(visibleActions(status, role, "platform")).toEqual([]);
    }
  });
});

describe("CONNECTION_SERVICES", () => {
  it("has no service switched on until the API has the endpoints", () => {
    // POST /api/whatsapp/connections/:id/recheck and /disconnect are not on the API yet. Switching
    // one on here without the endpoint would make the button call a route that answers 404.
    expect(CONNECTION_SERVICES).toEqual({ recheck: null, disconnect: null });
  });
});

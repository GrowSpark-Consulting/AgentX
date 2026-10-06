import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  connectionSecretContext,
  CryptoError,
  decryptSecret,
  encryptSecret,
  type ConnectionSecretColumn,
} from "./crypto";

// Tests pass the key explicitly; nothing reads process.env.
const newKey = () => ({ ENCRYPTION_KEY: randomBytes(32).toString("base64") });
const env = newKey();

const SECRET = "EAAB-super-secret-token-123";
const CONTEXT = connectionSecretContext({
  column: "token_enc",
  tenantId: "d0000000-0000-0000-0000-0000000000a1",
  connectionId: "d4000000-0000-0000-0000-0000000000a1",
});

// Runs fn, expects a CryptoError, and returns its message.
function failure(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CryptoError);
    return (e as CryptoError).message;
  }
  throw new Error("expected CryptoError");
}

// Flips one bit in a base64url part (index 1 = iv, 2 = tag, 3 = ciphertext) of a stored value.
function tamper(stored: string, part: 1 | 2 | 3): string {
  const parts = stored.split(":");
  const bytes = Buffer.from(parts[part], "base64url");
  bytes[0] ^= 0x01;
  parts[part] = bytes.toString("base64url");
  return parts.join(":");
}

describe("encryptSecret and decryptSecret", () => {
  it("round-trips without a context", () => {
    expect(decryptSecret(encryptSecret(SECRET, undefined, env), undefined, env)).toBe(SECRET);
  });

  it("round-trips a long token-like string", () => {
    const long = "EAAG" + randomBytes(600).toString("base64url");
    expect(decryptSecret(encryptSecret(long, undefined, env), undefined, env)).toBe(long);
  });

  it("round-trips an empty string", () => {
    const stored = encryptSecret("", undefined, env);
    expect(stored.split(":")[3]).toBe("");
    expect(decryptSecret(stored, undefined, env)).toBe("");
  });

  it("round-trips unicode text", () => {
    const text = "வணக்கம் 🙏 café — ₹1,499";
    expect(decryptSecret(encryptSecret(text, undefined, env), undefined, env)).toBe(text);
  });

  it("stores v1:<iv>:<tag>:<ciphertext> with a 12-byte iv and a 16-byte tag", () => {
    const [version, iv, tag] = encryptSecret(SECRET, undefined, env).split(":");
    expect(version).toBe("v1");
    expect(Buffer.from(iv, "base64url")).toHaveLength(12);
    expect(Buffer.from(tag, "base64url")).toHaveLength(16);
  });

  it("uses a fresh random iv on every call", () => {
    const a = encryptSecret(SECRET, CONTEXT, env);
    const b = encryptSecret(SECRET, CONTEXT, env);
    expect(a).not.toBe(b);
    expect(a.split(":")[1]).not.toBe(b.split(":")[1]);
    expect(decryptSecret(a, CONTEXT, env)).toBe(SECRET);
    expect(decryptSecret(b, CONTEXT, env)).toBe(SECRET);
  });

  it("does not put the plaintext in the stored value", () => {
    expect(encryptSecret(SECRET, undefined, env)).not.toContain(SECRET);
  });

  it("detects a flipped byte in the ciphertext", () => {
    const stored = encryptSecret(SECRET, undefined, env);
    expect(failure(() => decryptSecret(tamper(stored, 3), undefined, env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("detects a flipped byte in the tag", () => {
    const stored = encryptSecret(SECRET, undefined, env);
    expect(failure(() => decryptSecret(tamper(stored, 2), undefined, env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("detects a flipped byte in the iv", () => {
    const stored = encryptSecret(SECRET, undefined, env);
    expect(failure(() => decryptSecret(tamper(stored, 1), undefined, env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("fails with a different key", () => {
    const stored = encryptSecret(SECRET, undefined, env);
    expect(failure(() => decryptSecret(stored, undefined, newKey()))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("fails clearly when the key is missing", () => {
    expect(failure(() => encryptSecret(SECRET, undefined, {}))).toBe("ENCRYPTION_KEY is not set");
    expect(failure(() => decryptSecret("v1:a:b:c", undefined, {}))).toBe(
      "ENCRYPTION_KEY is not set",
    );
  });

  it("fails with a fixed message when the key has the wrong size", () => {
    const short = { ENCRYPTION_KEY: randomBytes(16).toString("base64") };
    const message = failure(() => encryptSecret(SECRET, undefined, short));
    expect(message).toBe("could not encrypt secret");
    expect(message).not.toContain(short.ENCRYPTION_KEY);
  });
});

describe("context (additional authenticated data)", () => {
  it("round-trips with the same context", () => {
    expect(decryptSecret(encryptSecret(SECRET, CONTEXT, env), CONTEXT, env)).toBe(SECRET);
  });

  it("fails with a different context, with the same fixed error", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    expect(failure(() => decryptSecret(stored, `${CONTEXT}x`, env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("fails when a context was used to encrypt but none is given to decrypt", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    expect(failure(() => decryptSecret(stored, undefined, env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("fails when a context is given to decrypt but none was used to encrypt", () => {
    const stored = encryptSecret(SECRET, undefined, env);
    expect(failure(() => decryptSecret(stored, CONTEXT, env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("fails when a secret is moved to another tenant, row or column", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    const other = (over: Partial<Parameters<typeof connectionSecretContext>[0]>) =>
      connectionSecretContext({
        column: "token_enc",
        tenantId: "d0000000-0000-0000-0000-0000000000a1",
        connectionId: "d4000000-0000-0000-0000-0000000000a1",
        ...over,
      });
    for (const swapped of [
      other({ tenantId: "d0000000-0000-0000-0000-0000000000b1" }),
      other({ connectionId: "d4000000-0000-0000-0000-0000000000b1" }),
      other({ column: "app_secret_enc" }),
    ]) {
      expect(failure(() => decryptSecret(stored, swapped, env))).toBe(
        "could not decrypt stored secret",
      );
    }
  });

  it("rejects an empty context on both sides", () => {
    expect(failure(() => encryptSecret(SECRET, "", env))).toBe("context must not be empty");
    const stored = encryptSecret(SECRET, undefined, env);
    expect(failure(() => decryptSecret(stored, "", env))).toBe("context must not be empty");
  });
});

describe("malformed stored values", () => {
  const good = encryptSecret(SECRET, undefined, env);
  const [, iv, tag, data] = good.split(":");

  it.each([
    ["an empty string", ""],
    ["plain text", "plain"],
    ["a wrong version prefix", `v2:${iv}:${tag}:${data}`],
    ["too few parts", `v1:${iv}:${tag}`],
    ["too many parts", `v1:${iv}:${tag}:${data}:extra`],
    ["characters outside base64url", `v1:${iv}:${tag}:${data}+/=`],
    ["an iv of the wrong length", `v1:${iv.slice(0, 8)}:${tag}:${data}`],
    ["a tag of the wrong length", `v1:${iv}:${tag.slice(0, 8)}:${data}`],
    ["an empty iv and tag", `v1:::${data}`],
  ])("throws a clear error for %s", (_why, stored) => {
    expect(failure(() => decryptSecret(stored, undefined, env))).toBe(
      "stored secret is malformed",
    );
  });
});

describe("error messages never leak", () => {
  it("contain no plaintext, key, context or stored value", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    const tamperedKeyOnly = newKey();
    const messages = [
      failure(() => decryptSecret(tamper(stored, 3), CONTEXT, env)),
      failure(() => decryptSecret(tamper(stored, 2), CONTEXT, env)),
      failure(() => decryptSecret(stored, `${CONTEXT}x`, env)),
      failure(() => decryptSecret(stored, undefined, env)),
      failure(() => decryptSecret(stored, CONTEXT, tamperedKeyOnly)),
      failure(() => decryptSecret(`${stored}:extra`, CONTEXT, env)),
      failure(() => decryptSecret("garbage-" + SECRET, CONTEXT, env)),
      failure(() => encryptSecret(SECRET, CONTEXT, { ENCRYPTION_KEY: "AAAA" })),
      failure(() => encryptSecret(SECRET, "", env)),
    ];
    for (const message of messages) {
      for (const secret of [
        SECRET,
        CONTEXT,
        stored,
        env.ENCRYPTION_KEY,
        tamperedKeyOnly.ENCRYPTION_KEY,
        "d0000000-0000-0000-0000-0000000000a1",
      ]) {
        expect(message).not.toContain(secret);
      }
    }
  });
});

describe("connectionSecretContext", () => {
  const ids = {
    tenantId: "d0000000-0000-0000-0000-0000000000a1",
    connectionId: "d4000000-0000-0000-0000-0000000000a1",
  };

  it.each(["token_enc", "app_secret_enc"] as const)("builds the context for %s", (column) => {
    expect(connectionSecretContext({ column, ...ids })).toBe(
      `whatsapp_connections:${column}:${ids.tenantId}:${ids.connectionId}`,
    );
  });

  it("gives different contexts for different columns, tenants and rows", () => {
    const contexts = new Set([
      connectionSecretContext({ column: "token_enc", ...ids }),
      connectionSecretContext({ column: "app_secret_enc", ...ids }),
      connectionSecretContext({ column: "token_enc", ...ids, tenantId: "t2" }),
      connectionSecretContext({ column: "token_enc", ...ids, connectionId: "c2" }),
    ]);
    expect(contexts.size).toBe(4);
  });

  it("rejects an unknown column", () => {
    expect(
      failure(() =>
        connectionSecretContext({ column: "status" as ConnectionSecretColumn, ...ids }),
      ),
    ).toBe("unsupported secret column");
  });

  it("rejects empty ids and ids that contain the separator", () => {
    for (const bad of ["", "a:b"]) {
      const column = "token_enc";
      expect(failure(() => connectionSecretContext({ column, ...ids, tenantId: bad }))).toBe(
        "invalid context part",
      );
      expect(failure(() => connectionSecretContext({ column, ...ids, connectionId: bad }))).toBe(
        "invalid context part",
      );
    }
  });
});

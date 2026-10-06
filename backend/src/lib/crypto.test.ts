import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  connectionSecretContext,
  CryptoError,
  decryptSecret,
  encryptSecret,
  type ConnectionSecretColumn,
  type SecretContext,
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

// For tests that need a context the builder would not make (a near miss, or an empty one).
const asContext = (value: string) => value as SecretContext;

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
  it("round-trips", () => {
    expect(decryptSecret(encryptSecret(SECRET, CONTEXT, env), CONTEXT, env)).toBe(SECRET);
  });

  it("round-trips a long token-like string", () => {
    const long = "EAAG" + randomBytes(600).toString("base64url");
    expect(decryptSecret(encryptSecret(long, CONTEXT, env), CONTEXT, env)).toBe(long);
  });

  it("round-trips an empty string", () => {
    const stored = encryptSecret("", CONTEXT, env);
    expect(stored.split(":")[3]).toBe("");
    expect(decryptSecret(stored, CONTEXT, env)).toBe("");
  });

  it("round-trips unicode text", () => {
    const text = "வணக்கம் 🙏 café — ₹1,499";
    expect(decryptSecret(encryptSecret(text, CONTEXT, env), CONTEXT, env)).toBe(text);
  });

  it("stores v1:<iv>:<tag>:<ciphertext> with a 12-byte iv and a 16-byte tag", () => {
    const [version, iv, tag] = encryptSecret(SECRET, CONTEXT, env).split(":");
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
    expect(encryptSecret(SECRET, CONTEXT, env)).not.toContain(SECRET);
  });

  it("detects a flipped byte in the ciphertext", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    expect(failure(() => decryptSecret(tamper(stored, 3), CONTEXT, env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("detects a flipped byte in the tag", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    expect(failure(() => decryptSecret(tamper(stored, 2), CONTEXT, env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("detects a flipped byte in the iv", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    expect(failure(() => decryptSecret(tamper(stored, 1), CONTEXT, env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("fails with a different key", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    expect(failure(() => decryptSecret(stored, CONTEXT, newKey()))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("fails clearly when the key is missing", () => {
    expect(failure(() => encryptSecret(SECRET, CONTEXT, {}))).toBe("ENCRYPTION_KEY is not set");
    expect(failure(() => decryptSecret("v1:a:b:c", CONTEXT, {}))).toBe(
      "ENCRYPTION_KEY is not set",
    );
  });

  it("fails with a fixed message when the key has the wrong size", () => {
    const short = { ENCRYPTION_KEY: randomBytes(16).toString("base64") };
    const message = failure(() => encryptSecret(SECRET, CONTEXT, short));
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
    expect(failure(() => decryptSecret(stored, asContext(`${CONTEXT}x`), env))).toBe(
      "could not decrypt stored secret",
    );
  });

  it("does not decrypt a value written without any context (the old format is unsupported)", () => {
    // Built by hand the way the first version of this helper wrote values: no additional data.
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(env.ENCRYPTION_KEY, "base64"), iv);
    const data = Buffer.concat([cipher.update(SECRET, "utf8"), cipher.final()]);
    const oldValue = ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
    expect(failure(() => decryptSecret(oldValue, CONTEXT, env))).toBe(
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
    expect(failure(() => encryptSecret(SECRET, asContext(""), env))).toBe("context must not be empty");
    const stored = encryptSecret(SECRET, CONTEXT, env);
    expect(failure(() => decryptSecret(stored, asContext(""), env))).toBe("context must not be empty");
  });
});

describe("malformed stored values", () => {
  const good = encryptSecret(SECRET, CONTEXT, env);
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
    expect(failure(() => decryptSecret(stored, CONTEXT, env))).toBe(
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
      failure(() => decryptSecret(stored, asContext(`${CONTEXT}x`), env)),
      failure(() => decryptSecret(stored, undefined as never, env)),
      failure(() => decryptSecret(stored, CONTEXT, tamperedKeyOnly)),
      failure(() => decryptSecret(`${stored}:extra`, CONTEXT, env)),
      failure(() => decryptSecret("garbage-" + SECRET, CONTEXT, env)),
      failure(() => encryptSecret(SECRET, CONTEXT, { ENCRYPTION_KEY: "AAAA" })),
      failure(() => encryptSecret(SECRET, asContext(""), env)),
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

describe("canonical base64url", () => {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  // Another spelling of the same bytes: only the spare bits of the last character differ.
  function sameBytesOtherString(part: string): string | undefined {
    const bytes = Buffer.from(part, "base64url");
    for (const c of ALPHABET) {
      const alt = part.slice(0, -1) + c;
      if (alt !== part && Buffer.from(alt, "base64url").equals(bytes)) return alt;
    }
    return undefined;
  }

  const withPart = (stored: string, index: 1 | 2 | 3, value: string) => {
    const parts = stored.split(":");
    parts[index] = value;
    return parts.join(":");
  };

  it("rejects a tag written differently but decoding to the same bytes", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    const alt = sameBytesOtherString(stored.split(":")[2]); // 16 bytes = 22 characters, 4 spare bits
    expect(alt).toBeDefined();
    expect(failure(() => decryptSecret(withPart(stored, 2, alt!), CONTEXT, env))).toBe(
      "stored secret is malformed",
    );
  });

  it.each(["a", "ab", "abcd", "abcde"])(
    "rejects a ciphertext of %j rewritten with other spare bits",
    (plaintext) => {
      const stored = encryptSecret(plaintext, CONTEXT, env);
      const alt = sameBytesOtherString(stored.split(":")[3]); // length not a multiple of 3
      expect(alt).toBeDefined();
      expect(failure(() => decryptSecret(withPart(stored, 3, alt!), CONTEXT, env))).toBe(
        "stored secret is malformed",
      );
    },
  );

  it("has no other spelling for an iv (12 bytes = 16 characters, no spare bits)", () => {
    const iv = encryptSecret(SECRET, CONTEXT, env).split(":")[1];
    expect(iv).toHaveLength(16);
    expect(sameBytesOtherString(iv)).toBeUndefined();
  });

  it.each([1, 2, 3] as const)("rejects padding, whitespace and foreign characters in part %i", (index) => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    const part = stored.split(":")[index];
    for (const bad of [`${part}=`, `${part}==`, ` ${part}`, `${part}\n`, `${part.slice(0, -1)}+`, `${part.slice(0, -1)}/`, `${part}!`]) {
      expect(failure(() => decryptSecret(withPart(stored, index, bad), CONTEXT, env))).toBe(
        "stored secret is malformed",
      );
    }
  });

  it("rejects a part with a dangling character", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    const data = stored.split(":")[3];
    expect(failure(() => decryptSecret(withPart(stored, 3, `${data}A`), CONTEXT, env))).toBe(
      "stored secret is malformed",
    );
  });
});

describe("context is required", () => {
  it("throws when encrypting or decrypting without a context", () => {
    const stored = encryptSecret(SECRET, CONTEXT, env);
    expect(failure(() => encryptSecret(SECRET, undefined as never, env))).toBe("context is required");
    expect(failure(() => decryptSecret(stored, undefined as never, env))).toBe("context is required");
    expect(failure(() => encryptSecret(SECRET, 42 as never, env))).toBe("context is required");
  });

  it("rejects a hand-written string at compile time", () => {
    // @ts-expect-error only connectionSecretContext() can make a SecretContext
    expect(() => encryptSecret(SECRET, "tenant-a", env)).not.toThrow();
  });
});

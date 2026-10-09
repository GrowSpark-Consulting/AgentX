import { describe, expect, it } from "vitest";
import { matchStop, STOP_PHRASES } from "./stop-words";

// STOP, in English, Tamil script, Tanglish and Hindi: a fixed list, matched on the WHOLE message only.

const ALL = Object.entries(STOP_PHRASES).flatMap(([language, phrases]) => phrases.map((phrase) => [phrase, language] as const));

describe("the list", () => {
  it("is the approved one: English, Tanglish, Tamil script and Hindi", () => {
    expect(STOP_PHRASES.en).toEqual(expect.arrayContaining(["stop", "stop all", "stopall", "unsubscribe", "opt out", "optout", "stop messages", "stop messaging", "stop messaging me", "do not message me", "dont message me", "remove me", "leave me alone"]));
    expect(STOP_PHRASES["ta-en"]).toEqual(["message panna vendam", "msg panna vendam", "message pannadheenga", "enakku message vendam"]);
    expect(STOP_PHRASES.ta).toEqual(["நிறுத்து", "நிறுத்துங்கள்", "நிறுத்துங்க", "மெசேஜ் அனுப்பாதீர்கள்", "மெசேஜ் அனுப்பாதீங்க", "எனக்கு மெசேஜ் வேண்டாம்"]);
    expect(STOP_PHRASES.hi).toEqual(expect.arrayContaining(["बंद करो", "बंद करें", "मैसेज बंद करो", "मैसेज मत भेजो", "band karo", "message mat bhejo"]));
  });

  it.each(ALL)("%s is a STOP, in %s", (phrase, language) => {
    expect(matchStop(phrase)).toBe(language);
  });
});

describe("what still counts as the same phrase", () => {
  it.each(["STOP", "Stop", "stop.", "STOP!!", "  stop  ", "Stop 🙏", "stop\n", "s t o p".replace(/ /g, "​"), "ＳＴＯＰ", "Stop Messaging Me!", "unsubscribe."])("%j", (text) => {
    expect(matchStop(text)).not.toBeNull();
  });

  it("matches Tamil and Hindi with a full stop or a danda after them", () => {
    expect(matchStop("நிறுத்துங்கள்.")).toBe("ta");
    expect(matchStop("मैसेज बंद करो।")).toBe("hi");
    expect(matchStop("Message panna vendam!")).toBe("ta-en");
    expect(matchStop("Band Karo")).toBe("hi");
  });

  it("matches with an emoji after it, including the variation selector that most phones add (the old check missed these)", () => {
    for (const text of ["Stop \u2764\ufe0f", "STOP \u270b\ufe0f", "stop \u{1F64F}\ufe0f", "Stop \u{1F64F}\u{1F3FD}", "STOP\ufe0f", "नमस्ते बंद करो \ufe0f".replace("नमस्ते ", "")]) {
      expect(matchStop(text), JSON.stringify(text)).not.toBeNull();
    }
  });

  it("matches the typographic apostrophe in \"don't message me\"", () => {
    expect(matchStop("Don’t message me")).toBe("en");
    expect(matchStop("don't message me")).toBe("en");
  });
});

describe("what is not a STOP", () => {
  it.each([
    "bus stop near the project",
    "don't stop calling me",
    "stop by tomorrow at 5",
    "please stop",
    "stop the messages please and call me",
    "I want to unsubscribe from the newsletter but keep the booking",
    "cancel",
    "cancel my booking",
    "no",
    "vendam",
    "band",
    "enough",
    "2BHK price?",
    "",
    "   ",
    "???",
    "😀",
    "stopping",
    "stopover",
    "நிறுத்து இல்லை, விலை சொல்லுங்கள்",
    "ruko",
    "Ruko!",
    "रुको",
    "रुकिए",
    "niruthu",
    "Niruthunga",
    "nirutthu",
    "nirutthunga",
  ])("%j", (text) => {
    expect(matchStop(text)).toBeNull();
  });

  it("is not fooled by a phrase inside a longer message that merely starts or ends with it", () => {
    expect(matchStop("stop. actually, call me tomorrow")).toBeNull();
    expect(matchStop("hello stop")).toBeNull();
  });
});

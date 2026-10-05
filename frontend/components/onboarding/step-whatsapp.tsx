"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CHECKS,
  COEX_OPTIONS,
  MANUAL_MODES,
  OWN_APP_COPY,
  PARTNER_COPY,
  WA_METHODS,
  type CheckKind,
  type CopyItem,
} from "@/features/onboarding/data";
import { bizLabel, type OnboardingState, type SetState } from "@/features/onboarding/state";
import {
  CheckRow,
  CopyRow,
  RuleHeading,
  SquareRadio,
  StepIntro,
  type CheckMark,
  type Tone,
} from "@/components/onboarding/primitives";

export function StepWhatsApp({
  s,
  set,
  onOpenPopup,
  onRunChecks,
}: {
  s: OnboardingState;
  set: SetState;
  onOpenPopup: () => void;
  onRunChecks: (kind: CheckKind) => void;
}) {
  const idle = s.wa === "idle";
  const meta = s.waMethod === "meta";
  const kind = s.chkKind;
  const list = CHECKS[kind];

  const copy = (item: CopyItem) => {
    try {
      navigator.clipboard?.writeText(item.value);
    } catch {
      /* clipboard unavailable */
    }
    set({ copied: item.label });
  };

  const need2 =
    s.coex === "yes"
      ? "Your phone with the WhatsApp Business app, to scan a QR code"
      : "The business phone, to receive a code";

  const liveNote =
    kind === "meta"
      ? s.coex === "yes"
        ? "Connected with Facebook · the WhatsApp Business app keeps working"
        : "Connected with Facebook"
      : kind === "partner"
        ? "Connected through partner access · you keep ownership"
        : "Connected with your own Meta app";

  const metaList: {
    t: string;
    status: string;
    note: string;
    ok: boolean;
  }[] = [
    {
      t: "Display name “" + bizLabel(s) + "” approved",
      status: kind === "meta" ? "Approved" : "In review",
      note:
        kind === "meta"
          ? ""
          : "Meta checks it matches your business. Usually a few hours.",
      ok: kind === "meta",
    },
    {
      t: "Payment method added in Meta",
      status: "Not added",
      note: "Needed before reminders and follow-ups can go out. Add a card in WhatsApp Manager → Payment settings.",
      ok: false,
    },
    {
      t: "Message templates approved",
      status: "9 of 12",
      note: "The rest are in review. You can go live now.",
      ok: false,
    },
    ...(kind === "meta" && s.coex === "yes"
      ? [
          {
            t: "WhatsApp Business app still works on your phone",
            status: "Kept",
            note: "",
            ok: true,
          },
        ]
      : []),
  ];

  return (
    <>
      <StepIntro title="Connect your WhatsApp number">
        Keep the number customers already use. Your assistant replies from it
        once it’s connected.
      </StepIntro>

      {/* ── choose a method ── */}
      {idle && (
        <div
          role="radiogroup"
          aria-label="Connection method"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-2"
        >
          {WA_METHODS.map((wm) => {
            const on = s.waMethod === wm.key;
            const isMeta = wm.key === "meta";
            return (
              <button
                key={wm.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ waMethod: wm.key, cancelStep: null })}
                className={cn(
                  "flex flex-col gap-1 text-left px-4 py-3.5 border-2 text-foreground cursor-pointer",
                  on ? "border-primary bg-brand-100" : "border-divider bg-transparent"
                )}
              >
                <span className="flex gap-2 items-center flex-wrap">
                  <SquareRadio checked={on} />
                  <strong className="text-base">{wm.name}</strong>
                  <span
                    className={cn(
                      "text-[10px] font-extrabold tracking-[.06em] uppercase px-1.5 py-0.5 border",
                      isMeta
                        ? "bg-primary text-white border-primary"
                        : "bg-transparent text-foreground border-foreground"
                    )}
                  >
                    {wm.tag}
                  </span>
                </span>
                <span className="text-[13px] text-neutral-700 pl-6">{wm.description}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Connect with Facebook ── */}
      {idle && meta && (
        <>
          <div className="flex flex-col gap-2">
            <RuleHeading>Is +91 {s.phone} on the WhatsApp Business app today?</RuleHeading>
            <div role="radiogroup" aria-label="WhatsApp Business app" className="flex flex-col">
              {COEX_OPTIONS.map((co) => {
                const on = s.coex === co.key;
                return (
                  <button
                    key={co.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ coex: co.key })}
                    className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 text-left py-3 border-0 border-b border-solid border-divider bg-transparent text-foreground cursor-pointer"
                  >
                    <SquareRadio checked={on} className="mt-0.5" />
                    <span>
                      <strong className="block text-[15px]">{co.name}</strong>
                      <span className="text-[13px] text-neutral-700">{co.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span>You’ll need:</span>
            <span className="flex gap-2">
              <span className="font-extrabold">1</span>Your Facebook login (personal is fine)
            </span>
            <span className="flex gap-2">
              <span className="font-extrabold">2</span>
              {need2}
            </span>
            <span className="flex gap-2">
              <span className="font-extrabold">3</span>About 3 minutes
            </span>
          </div>

          {s.cancelStep && (
            <div
              role="alert"
              className="border-2 border-primary bg-brand-100 text-brand-900 px-3.5 py-3 text-sm"
            >
              <strong>You closed the Meta window at “{s.cancelStep}”.</strong> Nothing
              was changed. Try again when you’re ready.
            </div>
          )}

          <Button
            variant="primary"
            onClick={onOpenPopup}
            className="self-start text-base px-[18px] py-3 min-w-[260px] justify-start"
          >
            Continue with Facebook
          </Button>
        </>
      )}

      {/* ── Manual connection ── */}
      {idle && !meta && (
        <>
          <div
            role="tablist"
            aria-label="Manual connection type"
            className="flex border-2 border-foreground w-max max-w-full overflow-x-auto"
          >
            {MANUAL_MODES.map((mm) => {
              const on = s.mMode === mm.key;
              return (
                <button
                  key={mm.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => set({ mMode: mm.key })}
                  className={cn(
                    "px-3.5 py-2 border-0 text-sm font-extrabold cursor-pointer whitespace-nowrap",
                    on ? "bg-foreground text-background" : "bg-transparent text-foreground"
                  )}
                >
                  {mm.label}
                </button>
              );
            })}
          </div>

          {s.mMode === "partner" && (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-sm text-neutral-700">
                You keep ownership of your WhatsApp account and never share a password
                or token. You can remove our access any time.
              </p>
              <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm items-start">
                <span className="font-extrabold text-lg text-primary">1</span>
                <span>
                  Open <strong>Meta Business Settings → WhatsApp accounts</strong>, pick
                  your account, then <strong>Partners → Assign partner</strong>.
                </span>
                <span className="font-extrabold text-lg text-primary">2</span>
                <div className="flex flex-col gap-2">
                  <span>
                    Enter our Business Portfolio ID and choose <strong>Full control</strong>.
                  </span>
                  <div className="bg-surface px-3.5 py-3">
                    {PARTNER_COPY.map((item) => (
                      <CopyRow
                        key={item.label}
                        item={item}
                        copied={s.copied === item.label}
                        onCopy={() => copy(item)}
                      />
                    ))}
                  </div>
                </div>
                <span className="font-extrabold text-lg text-primary">3</span>
                <span>
                  Paste your account details below. Find them in WhatsApp Manager → Phone
                  numbers.
                </span>
              </div>
            </div>
          )}

          {s.mMode === "own" && (
            <p className="m-0 text-sm text-neutral-700">
              For businesses and agencies running their own Meta app. Copy these from
              your app’s WhatsApp → API setup page.
            </p>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3.5">
            <div>
              <Label htmlFor="pk-waba">WhatsApp Business Account ID</Label>
              <Input
                id="pk-waba"
                value={s.mWaba}
                onChange={(e) => set({ mWaba: e.target.value })}
                placeholder="234567890123456"
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="pk-phone-id">Phone number ID</Label>
              <Input
                id="pk-phone-id"
                value={s.mPhoneId}
                onChange={(e) => set({ mPhoneId: e.target.value })}
                placeholder="109876543210987"
                className="font-mono"
              />
            </div>
          </div>

          {s.mMode === "own" && (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3.5">
                <div>
                  <Label htmlFor="pk-token">Permanent access token</Label>
                  <Input
                    id="pk-token"
                    type="password"
                    value={s.mToken}
                    onChange={(e) => set({ mToken: e.target.value })}
                    placeholder="EAAG…"
                    className="font-mono"
                  />
                  <span className="text-xs text-neutral-700">
                    System user token set to never expire
                  </span>
                </div>
                <div>
                  <Label htmlFor="pk-secret">App secret</Label>
                  <Input
                    id="pk-secret"
                    type="password"
                    value={s.mSecret}
                    onChange={(e) => set({ mSecret: e.target.value })}
                    placeholder="32 characters"
                    className="font-mono"
                  />
                  <span className="text-xs text-neutral-700">
                    Used to check that messages really come from Meta
                  </span>
                </div>
              </div>

              <div className="bg-surface px-4 py-3.5 flex flex-col gap-2.5">
                <div className="text-[13px] font-extrabold">
                  In your Meta app → WhatsApp → Configuration, set the webhook to:
                </div>
                {OWN_APP_COPY.map((item) => (
                  <CopyRow
                    key={item.label}
                    item={item}
                    copied={s.copied === item.label}
                    onCopy={() => copy(item)}
                  />
                ))}
                <span className="text-xs text-neutral-700">
                  Then subscribe to the <strong>messages</strong> field. This address is
                  unique to your business.
                </span>
              </div>
            </>
          )}

          <span className="text-xs text-neutral-700">
            Tokens and secrets are encrypted and never shown again after you save.
          </span>
          <Button
            variant="primary"
            onClick={() => onRunChecks(s.mMode)}
            className="self-start text-base px-[18px] py-3 min-w-[240px] justify-start"
          >
            Check connection
          </Button>
        </>
      )}

      {/* ── Running checks ── */}
      {s.wa === "checking" && (
        <>
          <RuleHeading>
            {kind === "meta" ? "Finishing setup" : "Checking your connection"}
          </RuleHeading>
          <div role="status" aria-live="polite" className="flex flex-col">
            {list.map((c, i) => {
              const done = i < s.chkStep;
              const fail = i === s.chkFail;
              const wait = s.waitHi && i === s.chkStep;
              const cur = !done && !fail && !wait && i === s.chkStep && s.chkFail < 0;
              const mark: CheckMark = done
                ? "done"
                : fail
                  ? "fail"
                  : cur || wait
                    ? "active"
                    : "idle";
              const tone: Tone = fail ? "alert" : "muted";
              return (
                <CheckRow
                  key={c.title}
                  mark={mark}
                  title={c.title}
                  note={fail ? c.error : wait ? "Send “hi” from another phone" : undefined}
                  noteTone={tone}
                  status={
                    done ? "Done" : fail ? "Failed" : wait ? "Waiting" : cur ? "Checking…" : ""
                  }
                  statusTone={tone}
                />
              );
            })}
          </div>

          {s.waitHi && (
            <div className="border-2 border-dashed border-primary px-4 py-3.5 flex gap-3 items-center flex-wrap">
              <span className="flex-1 min-w-[220px] text-sm">
                <strong>Last step:</strong> send “hi” to +91 {s.phone} from any other
                phone. We’ll tick this the moment it arrives.
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  set({ waitHi: false, chkStep: list.length, wa: "live" })
                }
              >
                Prototype: “hi” received
              </Button>
            </div>
          )}

          {s.chkFail >= 0 && (
            <div className="flex gap-2.5 flex-wrap">
              <Button
                variant="primary"
                onClick={() => set({ wa: "idle", chkFail: -1 })}
              >
                Fix details
              </Button>
              <Button variant="secondary" onClick={() => onRunChecks(s.mMode)}>
                Check again
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Connected ── */}
      {s.wa === "live" && (
        <>
          <div className="border-2 border-foreground px-[18px] py-4 flex gap-3 items-center flex-wrap">
            <span className="size-8 bg-whatsapp-green text-white grid place-items-center font-extrabold flex-none">
              ✓
            </span>
            <span className="flex-1 min-w-[200px]">
              <strong className="block text-[17px]">+91 {s.phone} is connected</strong>
              <span className="text-sm text-neutral-700">{liveNote}</span>
            </span>
          </div>

          <RuleHeading>Finish in Meta</RuleHeading>
          <div className="flex flex-col">
            {metaList.map((c) => (
              <CheckRow
                key={c.t}
                mark={c.ok ? "done" : "active"}
                title={c.t}
                note={c.note || undefined}
                noteTone={c.ok ? "muted" : "alert"}
                status={c.status}
                statusTone={c.ok ? "strong" : "alert"}
              />
            ))}
          </div>

          {!s.testSent ? (
            <Button
              variant="secondary"
              onClick={() => set({ testSent: true })}
              className="self-start"
            >
              Send a test message to my phone
            </Button>
          ) : (
            <span className="text-sm font-semibold">
              Test sent to +91 {s.phone}. Check your WhatsApp.
            </span>
          )}
        </>
      )}
    </>
  );
}

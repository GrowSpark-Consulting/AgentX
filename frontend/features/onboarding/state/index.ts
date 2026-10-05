import {
  CHECKS,
  PROFILES,
  type CheckKind,
  type Coex,
  type IndustryKey,
  type ManualMode,
  type StaffMember,
  type WaMethod,
  INDUSTRIES,
} from "@/features/onboarding/data";

export type ImportState = "idle" | "run" | "done";
/** `pending` is kept from the prototype's state model (“Waiting for Meta approval”). */
export type WaState = "idle" | "checking" | "pending" | "live";

export interface OnboardingState {
  step: number;

  /* step 0 — verify phone */
  phone: string;
  otpSent: boolean;
  otp: string;

  /* step 1 — business */
  biz: string;
  bizEdited: boolean;
  ind: number;

  /* step 2 — teach */
  site: string;
  imp: ImportState;
  impStep: number;
  faq: boolean[];

  /* step 4 — WhatsApp */
  wa: WaState;
  waMethod: WaMethod;
  coex: Coex;
  mMode: ManualMode;
  mWaba: string;
  mPhoneId: string;
  mToken: string;
  mSecret: string;
  copied: string | null;
  popup: boolean;
  popStep: number;
  cancelStep: string | null;
  chkKind: CheckKind;
  chkStep: number;
  chkFail: number;
  /** Index the current run is scripted to fail at (-1 = none). */
  chkPlannedFail: number;
  /** Bumped on every run so a re-run restarts the timer even if values repeat. */
  chkRun: number;
  waitHi: boolean;
  testSent: boolean;

  /* step 5 — team */
  staff: StaffMember[];
  cal: boolean;
  feats: boolean[];
}

export const DEFAULT_FAQ = [true, true, true, true, true, false];

export const initialState: OnboardingState = {
  step: 0,
  phone: "98400 12345",
  otpSent: false,
  otp: "",
  biz: "Skyline Homes",
  bizEdited: false,
  ind: 0,
  site: "skylinehomes.in",
  imp: "idle",
  impStep: 0,
  faq: [...DEFAULT_FAQ],
  wa: "idle",
  waMethod: "meta",
  coex: "yes",
  mMode: "partner",
  mWaba: "",
  mPhoneId: "",
  mToken: "",
  mSecret: "",
  copied: null,
  popup: false,
  popStep: 0,
  cancelStep: null,
  chkKind: "meta",
  chkStep: 0,
  chkFail: -1,
  chkPlannedFail: -1,
  chkRun: 0,
  waitHi: false,
  testSent: false,
  staff: PROFILES.re.staff.map((p) => ({ ...p })),
  cal: false,
  feats: [true, true, true, true, true, true],
};

export type Patch =
  | Partial<OnboardingState>
  | ((prev: OnboardingState) => Partial<OnboardingState>);

export type SetState = (patch: Patch) => void;

export function industryKey(state: OnboardingState): IndustryKey {
  return INDUSTRIES[state.ind]?.key ?? "re";
}

export function profileOf(state: OnboardingState) {
  return PROFILES[industryKey(state)];
}

/** Display fallback used in copy (“It already knows your business.”). */
export function bizLabel(state: OnboardingState) {
  return state.biz || "your business";
}

/** Which check index fails for a given run, based on what the user typed. */
export function plannedFailure(kind: CheckKind, s: OnboardingState): number {
  if (kind === "partner") {
    if (!s.mWaba.trim()) return 0;
    if (!s.mPhoneId.trim()) return 1;
  }
  if (kind === "own") {
    if (!s.mToken.trim().startsWith("EAA")) return 0;
    if (!s.mPhoneId.trim() || !s.mWaba.trim()) return 1;
    if (!s.mSecret.trim()) return 3;
  }
  return -1;
}

/** Manual connections pause on the last row until a “hi” arrives. */
export function waitHiIndex(kind: CheckKind) {
  return kind === "meta" ? -1 : CHECKS[kind].length - 1;
}

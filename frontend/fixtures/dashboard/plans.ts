/* eslint-disable */
// TEMPORARY FIXTURE DATA — plans, feature toggles and credits (Features screen, top-up and upgrade dialogs)
// Sample data carried over verbatim from the design prototype. It stands in for API responses until
// the screen is wired to real data; see docs/dashboard-screen-contracts.md for the contract that will
// replace it. Do not import fixtures from new code paths that are meant to ship.

export const PLAN_NAMES: any=['Starter','Growth','Pro'];
export const PLAN_KEYS: any=['starter','growth','pro'];
export const PLAN_CREDITS: any=[1000,3000,8000];
export const FEATURES: any=[
 {g:'Conversations',key:'autoReply',name:'AI auto-reply',desc:'Maya answers new WhatsApp messages. Off means your team replies to everything.',n:1620,plan:0},
 {g:'Conversations',key:'hours',name:'Working-hours mode',desc:'Reply all day, or only when your team is away.',cr:'No extra credits',plan:0,kind:'seg'},
 {g:'Conversations',key:'qualify',name:'Lead qualification',desc:'Asks budget, area and timeline, then marks the lead Hot, Warm or Cold.',cr:'Part of replies',plan:0},
 {g:'Booking',key:'booking',name:'Booking in chat',desc:'Offers free slots from your calendar and books site visits.',cr:'Part of replies',plan:0},
 {g:'Booking',key:'confirm',name:'Booking confirmations',desc:'Sends the visit details with an add-to-calendar link.',n:82,plan:0},
 {g:'Reminders',key:'r24',name:'reminder',desc:'Reminder with Confirm, Reschedule and Cancel buttons.',n:82,plan:0,kind:'timing'},
 {g:'Reminders',key:'r2',name:'2-hour reminder',desc:'Same-day reminder with map link and who to meet.',n:82,plan:0},
 {g:'Follow-up and feedback',key:'nudge',name:'Follow-up nudges',desc:'Gently follows up when a lead stops replying.',n:140,plan:1},
 {g:'Follow-up and feedback',key:'noshow',name:'No-show rebooking',desc:'Offers a new slot when someone misses a visit.',n:16,plan:1},
 {g:'Follow-up and feedback',key:'feedback',name:'Feedback request',desc:'Asks for a rating after the visit.',n:60,plan:1},
 {g:'Follow-up and feedback',key:'review',name:'Google review request',desc:'Sends your Google review link to happy customers.',n:40,plan:1},
 {g:'Team alerts',key:'alerts',name:'Staff WhatsApp alerts',desc:'Pings staff on hot leads, new bookings and handovers.',n:120,plan:0},
 {g:'Team alerts',key:'agenda',name:'Daily agenda',desc:'8 am summary of today’s visits to you and your team.',n:30,plan:1},
 {g:'Team alerts',key:'webhooks',name:'Outbound webhooks',desc:'Sends new leads and bookings to your CRM or Google Sheets.',cr:'No credits',plan:2},
 {g:'Billing',key:'topup',name:'Auto top-up',desc:'Buys 500 credits for ₹1,199 when you hit zero, so Maya never stops.',cr:'Only when used',plan:0},
];
export const GROUPS: any=['Conversations','Booking','Reminders','Follow-up and feedback','Team alerts','Billing'];

// Per plan, indexed like PLAN_KEYS: monthly price (₹), staff seats and WhatsApp numbers (upgrade dialog)
export const PLAN_PRICES: any=[1999,4999,9999];
export const PLAN_SEATS: any=['2','5','15'];
export const PLAN_NUMBERS: any=['1','1','3'];
export const TRIAL_CREDITS=150;
// Credits left for each ?account= / ?credits= combination the prototype can show
export const SAMPLE_BALANCES: any={trial:{healthy:112,low:30,zero:0},paid:{healthy:1840,low:600,zero:0}};
// Top-up packs: [credits, price, leads estimate]
export const TOPUP_PACKS: any=[[500,'₹1,199','About 33 more leads'],[1000,'₹2,398','About 65 more leads'],[2000,'₹4,796','About 130 more leads']];

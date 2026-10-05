/* eslint-disable */
// @ts-nocheck: TEMPORARY typing boundary. Ported prototype code written for `strict: false`;
// typing it is a follow-up (docs/frontend-architecture-map.md, "TypeScript").
// TEMPORARY FIXTURE DATA — Templates screen (all sample industries)
// Sample data carried over verbatim from the design prototype. It stands in for API responses until
// the screen is wired to real data; see docs/dashboard-screen-contracts.md for the contract that will
// replace it. Do not import fixtures from new code paths that are meant to ship.

export const V: any={
 re:{biz:'Skyline Homes',noun:'site visit',where:'Skyline Aster, Velachery',staff:'Ramesh',cust:'Karthik',need:'a 3BHK in Velachery',date:'Sat 24 Oct',time:'11:00 am'},
 salon:{biz:'Glow Studio',noun:'appointment',where:'Glow Studio, Anna Nagar',staff:'Priya',cust:'Ananya',need:'bridal makeup',date:'Sat 24 Oct',time:'11:00 am'},
 int:{biz:'Nest Interiors',noun:'site measurement',where:'your flat, Anna Nagar West',staff:'Arjun',cust:'Suresh',need:'interiors for your 2BHK',date:'Sat 24 Oct',time:'11:00 am'},
 hotel:{biz:'Hotel Kaveri',noun:'stay',where:'Hotel Kaveri, Thanjavur',staff:'Manoj',cust:'Lakshmi',need:'a room in Thanjavur',date:'Sat 24 Oct',time:'12:00 pm'},
 rest:{biz:'Amma’s Kitchen',noun:'table',where:'Amma’s Kitchen, T. Nagar',staff:'Selvi',cust:'Vignesh',need:'a table for your group',date:'Sat 24 Oct',time:'7:30 pm'},
};
export const BASE=v=>[
 {key:'booking_confirmed_v1',label:'Booking confirmation',cat:'Utility',feature:'Booking confirmations',when:'Right after a booking',sentN:82,readPct:'96%',
  en:`Hi {{1}}, your ${v.noun} at ${v.biz} is booked for {{2}} at {{3}}. {{4}} will meet you at ${v.where}.`,ta:`வணக்கம் {{1}}, ${v.biz}-ல் உங்கள் ${v.noun} {{2}} அன்று {{3}} மணிக்கு பதிவு செய்யப்பட்டுள்ளது. {{4}} உங்களை சந்திப்பார்.`,
  st:{en:'Approved',ta:'Approved'},vars:[['{{1}}','Customer name',v.cust],['{{2}}','Date',v.date],['{{3}}','Time',v.time],['{{4}}','Staff name',v.staff]],btns:[['URL','Add to calendar','📅'],['URL','Get directions','📍']],footer:false},
 {key:'reminder_24h_v1',label:'Reminder · day before',cat:'Utility',feature:'24-hour reminder',when:'24 hours before',sentN:79,readPct:'94%',
  en:`Reminder: your ${v.noun} at ${v.biz} is tomorrow, {{1}} at {{2}}. Please confirm or change it below.`,ta:`நினைவூட்டல்: ${v.biz}-ல் உங்கள் ${v.noun} நாளை, {{1}} அன்று {{2}} மணிக்கு. கீழே உறுதிசெய்யவும் அல்லது மாற்றவும்.`,
  st:{en:'Approved',ta:'Approved'},vars:[['{{1}}','Date',v.date],['{{2}}','Time',v.time]],btns:[['Quick reply','Confirm','↩'],['Quick reply','Reschedule','↩'],['Quick reply','Cancel','↩']],footer:false},
 {key:'reminder_2h_v1',label:'Reminder · 2 hours before',cat:'Utility',feature:'2-hour reminder',when:'2 hours before',sentN:74,readPct:'91%',
  en:`See you at {{1}} today! Ask for {{2}} when you arrive.`,ta:`இன்று {{1}} மணிக்கு சந்திப்போம்! வந்ததும் {{2}}-ஐ கேளுங்கள்.`,
  st:{en:'Approved',ta:'Approved'},vars:[['{{1}}','Time',v.time],['{{2}}','Staff name',v.staff]],btns:[['URL','Open map','📍']],footer:false},
 {key:'reschedule_note_v1',label:'Reschedule note',cat:'Utility',feature:'Calendar actions',when:'When staff move a booking',sentN:9,readPct:'100%',
  en:`Your ${v.noun} at ${v.biz} has moved to {{1}} at {{2}}. Reply here if that doesn’t work.`,ta:`${v.biz}-ல் உங்கள் ${v.noun} {{1}} அன்று {{2}} மணிக்கு மாற்றப்பட்டது.`,
  st:{en:'Approved',ta:'In review'},vars:[['{{1}}','New date','Sun 25 Oct'],['{{2}}','New time','2:00 pm']],btns:[],footer:false},
 {key:'followup_nudge_v2',label:'Follow-up nudge',cat:'Marketing',feature:'Follow-up nudges',when:'24 hours after a lead goes quiet',sentN:46,readPct:'78%',
  en:`Hi {{1}}, still looking for ${v.need}? Reply and we’ll pick up where we left off.`,ta:`{{1}}, இன்னும் தேடுகிறீர்களா? பதில் அனுப்புங்கள், தொடர்வோம்.`,
  st:{en:'Approved',ta:'Rejected'},reject:'Message is too short for the number of variables. Add more context around {{1}}.',vars:[['{{1}}','Customer name',v.cust]],btns:[['Quick reply','Yes, continue','↩'],['Quick reply','Not now','↩']],footer:true,
  versions:[['v2','Shorter, adds quick replies','Active'],['v1','First version','Retired']]},
 {key:'noshow_rebook_v1',label:'No-show rebooking',cat:'Marketing',feature:'No-show rebooking',when:'1 hour after a missed booking',sentN:6,readPct:'83%',
  en:`Hi {{1}}, we missed you today at ${v.biz}. Would you like to pick a new time?`,ta:`{{1}}, இன்று உங்களை தவறவிட்டோம். புதிய நேரம் தேர்வு செய்யலாமா?`,
  st:{en:'Approved',ta:'Approved'},vars:[['{{1}}','Customer name',v.cust]],btns:[['Quick reply','Pick a new time','↩']],footer:true},
 {key:'feedback_request_v1',label:'Feedback request',cat:'Marketing',feature:'Feedback request',when:'2 hours after the booking ends',sentN:38,readPct:'88%',
  en:`Thanks for choosing ${v.biz}, {{1}}! How was your ${v.noun}? Tap a rating.`,ta:`${v.biz}-ஐ தேர்ந்தெடுத்ததற்கு நன்றி {{1}}! உங்கள் அனுபவம் எப்படி இருந்தது?`,
  st:{en:'Approved',ta:'Approved'},vars:[['{{1}}','Customer name',v.cust]],btns:[['Quick reply','Great','↩'],['Quick reply','Okay','↩'],['Quick reply','Not good','↩']],footer:true},
 {key:'review_request_v1',label:'Google review request',cat:'Marketing',feature:'Google review request',when:'After a Great rating',sentN:21,readPct:'90%',
  en:`So glad you liked it, {{1}}! Would you leave us a quick Google review? It really helps.`,ta:`உங்களுக்கு பிடித்ததில் மகிழ்ச்சி {{1}}! ஒரு Google review தருவீர்களா?`,
  st:{en:'Approved',ta:'Approved'},vars:[['{{1}}','Customer name',v.cust]],btns:[['URL','Write a review','⭐']],footer:true},
 {key:'staff_alert_v1',label:'Staff alert · hot lead',cat:'Utility',feature:'Staff WhatsApp alerts',when:'To staff, on a hot lead or handover',sentN:64,readPct:'99%',
  en:`Hot lead needs you: {{1}} · {{2}}. Why: {{3}}.`,ta:`உடனடி கவனம்: {{1}} · {{2}}. காரணம்: {{3}}.`,
  st:{en:'Approved',ta:'Approved'},vars:[['{{1}}','Lead name',v.cust],['{{2}}','Need',v.need],['{{3}}','Reason','Asked for a special price']],btns:[['URL','Reply in shared inbox','↗'],['URL','Chat from my number','✆']],footer:false},
 {key:'daily_agenda_v1',label:'Daily agenda',cat:'Utility',feature:'Daily agenda',when:'To staff, 8 am',sentN:26,readPct:'97%',
  en:`Good morning {{1}}. Today’s bookings:\n{{2}}`,ta:`காலை வணக்கம் {{1}}. இன்றைய பதிவுகள்:\n{{2}}`,
  st:{en:'Approved',ta:'Approved'},vars:[['{{1}}','Staff name',v.staff],['{{2}}','Booking list',`${v.time} · ${v.cust}`]],btns:[],footer:false},
];
export const FEATS: any=['Manual · staff send from the inbox','Booking confirmations','24-hour reminder','2-hour reminder','Follow-up nudges','No-show rebooking','Feedback request','Google review request','Staff WhatsApp alerts','Daily agenda'];

/* eslint-disable */
// TEMPORARY FIXTURE DATA — shell, Home and Inbox (real-estate sample tenant)
// Sample data carried over verbatim from the design prototype. It stands in for API responses until
// the screen is wired to real data; see docs/dashboard-screen-contracts.md for the contract that will
// replace it. Do not import fixtures from new code paths that are meant to ship.

export const CLOSED: any={re:'anitha',salon:'reshma',int:'jaya',hotel:'rao',rest:'anitha'};
export const TPLS: any=[['followup_nudge_v2','Follow-up nudge','Marketing',2,'Hi {name}, still interested? Reply and we’ll pick up where we left off.'],['reminder_24h_v1','Reminder · day before','Utility',1,'Reminder: your booking with {biz} is tomorrow. Please confirm or change it below.'],['noshow_rebook_v1','Rebooking offer','Marketing',2,'Hi {name}, would you like to pick a new time with {biz}?']];
export const RE_BIZ: any={name:'Skyline Homes',sector:'Real estate',city:'Chennai',owner:'Arun',ownerIni:'AR',email:'arun@skylinehomes.in',todayTitle:'Today’s visits',emptyToday:'Nothing booked today.',testCode:'TRIAL-7F3K'};
export function convs(){return [
 {id:'karthik',name:'Karthik R',ini:'KR',phone:'+91 98xxx xxx21 · Tamil',time:'9:42 am',status:'waiting',mode:'ai',unread:2,score:82,owner:'Ramesh',
  need:'3BHK in Velachery, ready to move',lang:'Tamil, new customer',
  answers:['Budget ₹85–95 L','Buying within 2 months','Home loan pre-approved','Buying with his brother'],
  booking:'Site visit today, 11:00 am · Skyline Aster, Velachery',why:'Asked for the best price on two flats',mood:'Keen, neutral',
  summary:'Wants a ready-to-move 3BHK in Velachery for himself and his brother. Fits Aster’s price band and is booked for 11 am today.',
  next:'Ramesh to call before 10:30 am and bring a two-flat offer to the visit.',source:'Instagram ad · Aster',
  suggestion:'Hi Karthik, Ramesh here. For two 3BHKs at Aster we can work out a special price. Shall we go over it at your visit today at 11?',
  msgs:[
   {f:'c',t:'Hi, Velachery la 3BHK irukka? Ready to move venum',tm:'9:18 am'},
   {f:'ai',t:'Vanakkam Karthik! I’m Maya, Skyline Homes’ assistant. Yes, Skyline Aster in Velachery has ready-to-move 3BHKs, 1,420–1,610 sq ft. What budget are you looking at?',tm:'9:18 am'},
   {f:'c',t:'85 to 95 L range. Loan already pre-approved',tm:'9:21 am'},
   {f:'ai',t:'Super, that fits. Aster 3BHKs start at ₹88 L. When are you planning to buy?',tm:'9:21 am'},
   {f:'c',t:'2 months kulla. Inniki site visit possible ah?',tm:'9:24 am'},
   {f:'ai',t:'Sure! Free slots today:',tm:'9:24 am',list:['11:00 am','12:30 pm','4:00 pm']},
   {f:'c',t:'11 am ok',tm:'9:25 am'},
   {f:'ai',t:'Booked: today, Sat 24 Oct, 11:00 am at Skyline Aster, Velachery. Ramesh will meet you at the site office.',tm:'9:25 am'},
   {f:'c',t:'One more thing. 2 flats eduthaa best price enna? My brother also interested',tm:'9:41 am'},
   {f:'sys',t:'Handed to team · custom price request · 9:42 am'},
   {f:'ai',t:'Good question! Ramesh from our team will WhatsApp you shortly with the best offer for two flats.',tm:'9:42 am'},
  ]},
 {id:'sanjay',name:'Sanjay K',ini:'SK',phone:'+971 50xxx xx14 · English',time:'9:20 am',status:'waiting',mode:'ai',unread:1,score:71,owner:'Divya',
  need:'3BHK in OMR, NRI buyer in Dubai',lang:'English, new customer',answers:['Budget ₹1–1.1 Cr','Buying in 3 months','Own funds'],
  booking:'Not booked yet',why:'Wants a video walkthrough',mood:'Neutral',summary:'NRI in Dubai looking at Skyline Meadows 3BHKs. Can’t visit in person until December.',next:'Set up a WhatsApp video walkthrough this weekend.',source:'Google profile',
  suggestion:'Hi Sanjay, Divya here from Skyline Homes. I can do a video walkthrough of Meadows tomorrow 6 pm IST. Does that work?',
  msgs:[{f:'c',t:'Hi, interested in Meadows 3BHK. I’m in Dubai, can we do a video walkthrough?',tm:'9:18 am'},{f:'sys',t:'Handed to team · asked for a video call · 9:19 am'},{f:'ai',t:'Of course, Sanjay! Someone from our team will set up a video walkthrough with you shortly.',tm:'9:19 am'},{f:'c',t:'Thanks. Weekend evening IST works best',tm:'9:20 am'}]},
 {id:'lakshmi',name:'Lakshmi V',ini:'LV',phone:'+91 94xxx xxx08 · Tamil',time:'8:51 am',status:'human',mode:'human',unread:0,score:76,owner:'Divya',
  need:'2BHK in Porur',lang:'Tamil, returning',answers:['Budget ₹70–75 L','Buying this month','Loan in process'],booking:'Site visit today, 10:00 am · Skyline Greens, Porur',why:'High-value lead',mood:'Happy',summary:'Visiting Greens today with her husband. Asked about parking.',next:'Divya to share the 2BHK east-facing options at the visit.',source:'Referral',
  suggestion:'See you at 10, ma’am! I’ll keep the east-facing floor plans ready.',
  msgs:[{f:'ai',t:'Reminder: your visit to Skyline Greens, Porur is today at 10:00 am. Divya will meet you.',tm:'8:00 am'},{f:'c',t:'Visit ku varen, parking iruka?',tm:'8:49 am'},{f:'staff',who:'Divya',t:'Yes ma’am, visitor parking right at the site office. See you at 10!',tm:'8:51 am'}]},
 {id:'priya',name:'Priya S',ini:'PS',phone:'+91 99xxx xxx37 · English',time:'9:30 am',status:'ai',mode:'ai',unread:0,score:55,owner:'Divya',
  need:'2BHK in OMR for own stay',lang:'English, new customer',answers:['Budget ₹60–65 L','Moving next year','Works in Sholinganallur'],booking:'Not booked yet',why:'',mood:'Curious',summary:'Early stage. Wants something near her office in Sholinganallur.',next:'Maya will send the Meadows brochure and follow up next week.',source:'Website',
  suggestion:'',
  msgs:[{f:'c',t:'Hi, OMR 2BHK price enna?',tm:'9:26 am'},{f:'ai',t:'Hi Priya! Skyline Meadows on OMR has 2BHKs from ₹62 L (1,050 sq ft). Is this for your own stay or an investment?',tm:'9:26 am'},{f:'c',t:'Own stay. Office in Sholinganallur',tm:'9:29 am'},{f:'ai',t:'Meadows is 6 minutes from Sholinganallur. When are you hoping to move?',tm:'9:30 am'}]},
 {id:'venkat',name:'Venkat S',ini:'VS',phone:'+91 90xxx xxx52 · Tamil',time:'9:12 am',status:'ai',mode:'ai',unread:1,score:48,owner:'Ramesh',
  need:'2BHK or 3BHK in Porur',lang:'Tamil, new customer',answers:['Budget not shared','Possession by mid-2027'],booking:'Not booked yet',why:'',mood:'Neutral',summary:'Asked about possession dates at Greens.',next:'Maya is asking about budget.',source:'99acres',suggestion:'',
  msgs:[{f:'c',t:'Porur project possession date?',tm:'9:11 am'},{f:'ai',t:'Skyline Greens, Porur: possession from March 2027. Are you looking at a 2BHK or 3BHK?',tm:'9:12 am'}]},
 {id:'mohammed',name:'Mohammed A',ini:'MA',phone:'+91 98xxx xxx90 · English',time:'8:55 am',status:'ai',mode:'ai',unread:0,score:30,owner:'Ramesh',
  need:'Villa, prefers ECR',lang:'English, new customer',answers:['Budget ₹1.5 Cr+','Area: ECR (no project)','Timeline: not decided'],booking:'Not booked yet',why:'',mood:'Neutral',summary:'Wants a villa on ECR. Shared the Porur villa brochure instead.',next:'Nurture. Maya will check back in 2 weeks.',source:'Facebook',suggestion:'',
  msgs:[{f:'c',t:'Villa available? ECR side',tm:'8:52 am'},{f:'ai',t:'Hi Mohammed! No villas on ECR right now. Our closest is Skyline Greens Villas in Porur, from ₹1.6 Cr. Shall I share the brochure?',tm:'8:52 am'},{f:'c',t:'Ok send',tm:'8:54 am'},{f:'ai',doc:'Skyline Greens Villas.pdf',docMeta:'12 pages · 4.2 MB',t:'',tm:'8:55 am'}]},
 {id:'deepa',name:'Deepa N',ini:'DN',phone:'+91 97xxx xxx63 · English',time:'8:02 am',status:'ai',mode:'ai',unread:0,score:62,owner:'Divya',
  need:'3BHK in Velachery',lang:'English, new customer',answers:['Budget ₹90 L','Buying in 4 months'],booking:'Site visit today, 4:00 pm · Skyline Aster',why:'',mood:'Happy',summary:'Confirmed today’s 4 pm visit from the reminder.',next:'Nothing needed. Divya meets her at 4.',source:'Instagram ad',suggestion:'',
  msgs:[{f:'ai',t:'Hi Deepa, reminder: your visit to Skyline Aster is today at 4:00 pm.',tm:'8:00 am',list:['Confirm','Reschedule','Cancel']},{f:'c',t:'Confirm',tm:'8:02 am'},{f:'ai',t:'Thanks Deepa! See you at 4:00 pm. Divya will meet you at the site office.',tm:'8:02 am'}]},
 {id:'faizal',name:'Faizal M',ini:'FM',phone:'+91 96xxx xxx11 · Tanglish',time:'Yesterday',status:'ai',mode:'ai',unread:0,score:58,owner:'Ramesh',
  need:'2BHK in OMR',lang:'Tanglish',answers:['Budget ₹65 L','Buying in 3 months'],booking:'Held: today, 12:30 pm · Skyline Meadows',why:'',mood:'Neutral',summary:'Picked a slot but hasn’t confirmed his name for the booking.',next:'Maya will ask once more, then release the slot.',source:'Website',suggestion:'',
  msgs:[{f:'c',t:'Saturday 12.30 ok va?',tm:'7:40 pm'},{f:'ai',t:'Yes, 12:30 pm is free! I’ve held it for you. Can I have your full name for the booking?',tm:'7:40 pm'}]},
 {id:'anitha',name:'Anitha J',ini:'AJ',phone:'+91 93xxx xxx45 · English',time:'Yesterday',status:'ai',mode:'ai',unread:0,score:25,owner:'Ramesh',
  need:'Just checking prices',lang:'English',answers:['Budget not shared','No timeline'],booking:'Not booked yet',why:'',mood:'Neutral',summary:'Browsing prices across all three projects.',next:'Nurture with the monthly price update.',source:'Website',suggestion:'',
  msgs:[{f:'c',t:'Just checking prices for all projects',tm:'6:10 pm'},{f:'ai',t:'Happy to help! Aster (Velachery) from ₹88 L, Meadows (OMR) from ₹62 L, Greens (Porur) from ₹70 L. Any area you prefer?',tm:'6:10 pm'}]},
];}

// Home: month summary, hot leads waiting and today's bookings
export const RE_STATS: any=[['Enquiries','214','+18% vs September'],['Qualified leads','87','41% of enquiries'],['Visits booked','41','6 this weekend'],['After-hours handled','96','Chats after 8 pm']];
export const RE_HOT: any=[
 {id:'karthik',name:'Karthik R',need:'3BHK Velachery',score:82,reason:'Asked for best price on two flats · waiting 14 min',cta:'Reply',urgent:true},
 {id:'sanjay',name:'Sanjay K',need:'3BHK OMR',score:71,reason:'Wants a video walkthrough · waiting 36 min',cta:'Reply',urgent:true},
 {id:'lakshmi',name:'Lakshmi V',need:'2BHK Porur',score:76,reason:'Divya is replying · visit at 10 am',cta:'View',urgent:false}];
export const RE_TODAY: any=[['10:00 am','Lakshmi V','Greens, Porur','Divya','Confirmed'],['11:00 am','Karthik R','Aster, Velachery','Ramesh','Confirmed'],['12:30 pm','Faizal M','Meadows, OMR','Ramesh','Held'],['4:00 pm','Deepa N','Aster, Velachery','Divya','Confirmed']];

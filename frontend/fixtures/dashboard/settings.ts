/* eslint-disable */
// TEMPORARY FIXTURE DATA — Settings screen (all sample industries)
// Sample data carried over verbatim from the design prototype. It stands in for API responses until
// the screen is wired to real data; see docs/dashboard-screen-contracts.md for the contract that will
// replace it. Do not import fixtures from new code paths that are meant to ship.

export const RE_BIZ: any={name:'Skyline Homes',sector:'Real estate',city:'Chennai',owner:'Arun',ownerIni:'AR',email:'arun@skylinehomes.in'};
export const EX: any={
 re:{addr:'12, 4th Main Rd, Velachery',site:'skylinehomes.in',maps:'maps.app.goo.gl/sky-velachery',legal:'Skyline Homes Pvt Ltd',gst:'33AAKCS4821M1Z5',cat:'Real estate agent',about:'Ready-to-move homes in Velachery, OMR and Porur. Site visits 7 days a week.',tpl:'site visit'},
 salon:{addr:'18, 2nd Avenue, Anna Nagar',site:'glowstudio.in',maps:'maps.app.goo.gl/glow-annanagar',legal:'Glow Studio LLP',gst:'33AAJFG2290Q1Z8',cat:'Beauty salon',about:'Bridal, hair and nails in Anna Nagar. Book on WhatsApp, any time.',tpl:'appointment'},
 int:{addr:'44, Habibullah Rd, T. Nagar',site:'nestinteriors.in',maps:'maps.app.goo.gl/nest-tnagar',legal:'Nest Interiors Pvt Ltd',gst:'33AAHCN7712K1Z2',cat:'Interior designer',about:'Full-home interiors, kitchens and wardrobes. Free 3D design after measurement.',tpl:'site measurement'},
 hotel:{addr:'7, Gandhiji Rd, near Big Temple',site:'hotelkaveri.in',maps:'maps.app.goo.gl/kaveri-tanjore',legal:'Kaveri Hospitality Pvt Ltd',gst:'33AACCK5530R1Z9',cat:'Hotel',about:'1 km from the Big Temple. Family suites, heritage rooms and a banquet hall.',tpl:'stay'},
 rest:{addr:'52, Usman Rd, T. Nagar',site:'ammaskitchen.in',maps:'maps.app.goo.gl/amma-tnagar',legal:'Amma’s Kitchen Foods',gst:'33AAMFA6631L1Z4',cat:'South Indian restaurant',about:'Home-style meals, Chettinad specials and party set menus. Tables on WhatsApp.',tpl:'table'},
};
export const SVC: any={
 re:{res:'Site visits',items:[['Site visit · Aster','60 min','Ramesh, Divya','Velachery site office'],['Site visit · Meadows','60 min','Ramesh, Divya','OMR site office'],['Site visit · Greens','60 min','Divya, Arun','Porur site office'],['Video walkthrough','30 min','Divya','WhatsApp video']],buffer:'15 min',notice:'2 hours',ahead:'14 days',hold:'10 min'},
 salon:{res:'Stylists and chairs',items:[['Bridal trial','90 min','Priya','Bridal room'],['Keratin','150 min','Priya, Kavya','Chair 1–3'],['Haircut + colour','90 min','Kavya, Priya','Chair 1–3'],['Gel nails','60 min','Kavya','Nail station']],buffer:'10 min',notice:'1 hour',ahead:'60 days',hold:'10 min'},
 int:{res:'Designers',items:[['Site measurement','60 min','Arjun, Nithya','Customer’s home'],['Showroom visit','45 min','Nithya, Vikram','T. Nagar showroom'],['3D concept review','60 min','Arjun, Nithya','Showroom or video'],['Handover check','90 min','Vikram','Customer’s home']],buffer:'45 min travel',notice:'1 day',ahead:'21 days',hold:'15 min'},
 hotel:{res:'Rooms',items:[['Deluxe','per night','12 rooms','Check-in 12 pm'],['Heritage view','per night','6 rooms','Check-in 12 pm'],['Family suite','per night','4 suites','Check-in 12 pm'],['Banquet hall','per day','1 hall','8 am – 11 pm']],buffer:'Cleaning 2 h',notice:'Same day',ahead:'180 days',hold:'30 min'},
 rest:{res:'Tables',items:[['Table for 2','2 hours','10 tables','Main hall'],['Table for 4–6','2 hours','8 tables','Main hall, terrace'],['Table for 8+','2.5 hours','3 tables','Corner, terrace'],['Private section','3 hours','1 room · 40 seats','First floor']],buffer:'15 min reset',notice:'30 min',ahead:'30 days',hold:'10 min'},
};
export const EVENTS: any=[['hot','Hot lead','Score crosses your Hot line'],['book','New booking','Maya books or reschedules'],['hand','Handover','A chat needs a person'],['sla','Handover not picked up','Nobody replied within 15 minutes, so it escalates to you'],['low','Low credits','20% left, and when you hit zero'],['agenda','Daily agenda','8 am summary of today'],['weekly','Weekly report','Monday: leads, bookings, credits used']];

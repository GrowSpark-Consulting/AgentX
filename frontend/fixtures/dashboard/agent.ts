/* eslint-disable */
// TEMPORARY FIXTURE DATA — Agent settings screen (real-estate sample tenant)
// Sample data carried over verbatim from the design prototype. It stands in for API responses until
// the screen is wired to real data; see docs/dashboard-screen-contracts.md for the contract that will
// replace it. Do not import fixtures from new code paths that are meant to ship.

export const CRIT: any=[['budget','Budget fits a project','within a project’s price band',30],['timeline','Purchase timeline','buying within 3 months',25],['location','Location match','area matches Velachery, OMR or Porur',20],['funding','Funding ready','loan pre-approved or own funds',15],['decider','Decision maker','customer is the buyer or co-buyer',10]];
export const TRIG: any=[['ask','Customer asks for a person','“Can I talk to someone?”',false,true],['angry','Complaint or angry tone','Refund demand, bad experience',true,true],['hot','High-value lead','Score above Hot, or budget over ₹1.5 Cr',true,true],['quote','Custom quote or negotiation','“Best price if I book two flats?”',false,true],['gap','Maya doesn’t know the answer','Two questions in a row not in your knowledge base',false,true],['stuck','Maya is stuck','Same question 3 times, or booking fails twice',false,true],['credits','Credits run out','Owner gets alerted to top up',true,true]];
export const LANGS: any=['English','Tamil','Tanglish','Malayalam','Hindi','Telugu'];

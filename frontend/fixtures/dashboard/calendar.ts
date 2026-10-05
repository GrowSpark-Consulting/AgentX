/* eslint-disable */
// TEMPORARY FIXTURE DATA — Calendar screen (real-estate sample tenant)
// Sample data carried over verbatim from the design prototype. It stands in for API responses until
// the screen is wired to real data; see docs/dashboard-screen-contracts.md for the contract that will
// replace it. Do not import fixtures from new code paths that are meant to ship.

export const DAYS: any=[['Mon','19'],['Tue','20'],['Wed','21'],['Thu','22'],['Fri','23'],['Sat','24'],['Sun','25']];
export const TODAY=5;
export const STAFF: any=['Ramesh','Divya','Arun'];
export const INIT: any=[
 {id:1,d:0,s:11,name:'Prakash N',staff:'Arun',place:'Greens, Porur',status:'completed',phone:'+91 98xxx xxx02'},
 {id:2,d:1,s:12,name:'Meena K',staff:'Ramesh',place:'Aster, Velachery',status:'completed',phone:'+91 95xxx xxx70'},
 {id:3,d:1,s:16,name:'Arjun B',staff:'Divya',place:'Meadows, OMR',status:'noshow',phone:'+91 99xxx xxx18'},
 {id:4,d:2,s:11,name:'Suresh P',staff:'Divya',place:'Meadows, OMR',status:'completed',phone:'+91 91xxx xxx33'},
 {id:5,d:3,s:17,name:'Nisha R',staff:'Divya',place:'Aster, Velachery',status:'noshow',phone:'+91 90xxx xxx81'},
 {id:6,d:4,s:10.5,name:'Harish V',staff:'Ramesh',place:'Greens, Porur',status:'completed',phone:'+91 97xxx xxx29'},
 {id:7,d:5,s:10,name:'Lakshmi V',staff:'Divya',place:'Greens, Porur',status:'confirmed',phone:'+91 94xxx xxx08'},
 {id:8,d:5,s:11,name:'Karthik R',staff:'Ramesh',place:'Aster, Velachery',status:'confirmed',phone:'+91 98xxx xxx21'},
 {id:9,d:5,s:12.5,name:'Faizal M',staff:'Ramesh',place:'Meadows, OMR',status:'held',phone:'+91 96xxx xxx11'},
 {id:10,d:5,s:15,name:'Rajan T',staff:'Arun',place:'Greens Villas, Porur',status:'confirmed',phone:'+91 93xxx xxx66'},
 {id:11,d:5,s:16,name:'Deepa N',staff:'Divya',place:'Aster, Velachery',status:'confirmed',phone:'+91 97xxx xxx63'},
 {id:12,d:6,s:11,name:'Vijay M',staff:'Ramesh',place:'Aster, Velachery',status:'confirmed',phone:'+91 98xxx xxx47'},
 {id:13,d:6,s:12,name:'Kavya S',staff:'Divya',place:'Meadows, OMR',status:'held',phone:'+91 99xxx xxx12'},
];
export const RE_CAL: any={staff:STAFF,sub:null,type:'Site visit · 60 min',word:'visits',start:9,slots:[[6,10,'Sun 25 · 10 am'],[6,14,'Sun 25 · 2 pm'],[6,17,'Sun 25 · 5 pm'],[5,18,'Today · 6 pm']],list:INIT};

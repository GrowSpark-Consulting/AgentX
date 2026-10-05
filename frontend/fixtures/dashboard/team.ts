/* eslint-disable */
// TEMPORARY FIXTURE DATA — Team screen (real-estate sample tenant)
// Sample data carried over verbatim from the design prototype. It stands in for API responses until
// the screen is wired to real data; see docs/dashboard-screen-contracts.md for the contract that will
// replace it. Do not import fixtures from new code paths that are meant to ship.

export const ALERTS: any=['Hot leads','Bookings','Handovers','Daily agenda','Low credits'];
export const INIT: any=[
 {id:'arun',name:'Arun',ini:'AR',role:'Owner',phone:'+91 98400 xxx10',alerts:{'Hot leads':true,'Bookings':false,'Handovers':true,'Daily agenda':true,'Low credits':true},mode:'default'},
 {id:'ramesh',name:'Ramesh',ini:'RA',role:'Sales',phone:'+91 99620 xxx45',alerts:{'Hot leads':true,'Bookings':true,'Handovers':true,'Daily agenda':true,'Low credits':false},mode:'own'},
 {id:'divya',name:'Divya',ini:'DI',role:'Sales',phone:'+91 97890 xxx72',alerts:{'Hot leads':true,'Bookings':true,'Handovers':true,'Daily agenda':false,'Low credits':false},mode:'shared'},
];

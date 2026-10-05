/* eslint-disable */
// @ts-nocheck: TEMPORARY typing boundary. Ported prototype code written for `strict: false`;
// typing it is a follow-up (docs/frontend-architecture-map.md, "TypeScript").
"use client";
// Ported from the "Pakka App First Round" design. Logic and mock data are kept as authored;
// the markup is the original template expressed as JSX.

import React, { Fragment } from "react";
import { DCLogic, createDC, I, L, css } from "@/components/dashboard/runtime";
import { RE_BIZ, EX, SVC, EVENTS } from "@/fixtures/dashboard/settings";
import { PAKKA_IND } from "@/fixtures/dashboard/industries";


/** Editable props declared by the original component (editor metadata, kept for reference). */
export const PakkaSettingsProps = {"industry":{"editor":"enum","options":["re","salon","int","hotel","rest"],"default":"re","tsType":"string"},"section":{"editor":"enum","options":["profile","business","whatsapp","notif","security","data"],"default":"profile","tsType":"string"},"isMobile":{"editor":"boolean","default":false,"tsType":"boolean"},"plan":{"editor":null,"tsType":"string"},"nonce":{"editor":null,"tsType":"number"},"productName":{"editor":null,"tsType":"string"}} as const;

const IX=k=>(k&&k!=='re'&&PAKKA_IND&&PAKKA_IND[k])||null;
const SECTIONS: any=[
 ['profile','My profile','M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'],
 ['business','Business','M3 21h18 M5 21V7l7-4 7 4v14 M9 21v-6h6v6'],
 ['services','Services & slots','M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18 M8 15h3'],
 ['whatsapp','WhatsApp number','M7.9 20A9 9 0 1 0 4 16.1L2 22z'],
 ['notif','Notifications','M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0'],
 ['security','Security & login','M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10'],
 ['data','Data & privacy','M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3z M3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6 M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6'],
];
const sw=on=>({on,bd:on?'var(--color-accent)':'var(--color-neutral-500)',tbg:on?'var(--color-accent)':'transparent',kl:on?'22px':'2px',kb:on?'#fff':'var(--color-neutral-500)'});
const ck=on=>({tick:on?'✓':'',bd:on?'var(--color-accent)':'var(--color-neutral-500)',bg:on?'var(--color-accent)':'transparent'});
class PakkaSettingsLogic extends DCLogic {
  state: any = {sec:null,lastNonce:null,edits:{},uiLang:'English',alerts:{hot:true,hand:true,low:true,agenda:true},
    mx:{sla:[1,0,1],hot:[1,0,1],book:[0,0,1],hand:[1,0,1],low:[1,1,1],agenda:[1,0,0],weekly:[0,1,0]},quiet:true,hotThrough:true,twofa:false,
    killed:{},closeOpen:false,conn:'connected',discOpen:false,health:'09:00 today',connEvents:[],confirmText:'',saved:'',toast:null};
  // Remember the nonce we mounted with; otherwise the first update after mount (e.g. the first
  // section click) is mistaken for a new navigation and resets the section to the prop's value.
  componentDidMount(){this.setState({lastNonce:this.props.nonce});if(!PAKKA_IND){this._rd=()=>this.forceUpdate();window.addEventListener('pakka-ind-ready',this._rd);}}
  componentWillUnmount(){clearTimeout(this.tt);this._rd&&window.removeEventListener('pakka-ind-ready',this._rd);}
  componentDidUpdate(){const n=this.props.nonce;if(n!==undefined&&n!==this.state.lastNonce)this.setState({lastNonce:n,sec:this.props.section||'profile'});}
  flash(t){clearTimeout(this.tt);this.setState({toast:t});this.tt=setTimeout(()=>this.setState({toast:null}),2600);}
  renderVals(){
    const s=this.state,P=this.props,m=!!P.isMobile;
    const X=IX(P.industry),K=X?P.industry:'re',biz=X?X.biz:RE_BIZ,ex=EX[K];
    const e=s.edits[K]||{};
    const ed=(k,v)=>this.setState(st=>({edits:{...st.edits,[K]:{...(st.edits[K]||{}),[k]:v}},saved:''}));
    const sec=s.sec||P.section||'profile';
    const pname=e.pname??biz.owner, waAbout=e.about??ex.about;
    const ini=(pname||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const pro=(P.plan||'growth')==='pro';
    const sessions: any=[['web','Chrome on Windows','Chennai · active now','M2 4h20v12H2z M8 20h8 M12 16v4',true],['phone','Android phone · Chrome','Chennai · 2 hours ago','M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 18h.01',false],['ipad','Safari on iPad','Coimbatore · 5 days ago','M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 18h.01',false]].filter((x:any)=>!s.killed[x[0]]);
    const staff=X?X.cal.staff:['Ramesh','Divya'];
    return{
      productName:P.productName||'Pakka',biz,ex,
      pad:m?'20px 16px 40px':'32px 40px 56px',h1:m?'30px':'42px',
      shellCols:m?'minmax(0,1fr)':'220px minmax(0,1fr)',shellGap:m?'16px':'40px',navDir:m?'row':'column',navPos:m?'static':'sticky',navBt:m?'2px solid var(--color-text)':'0',navBb:m?'2px solid var(--color-divider)':'0',
      twoCol:m?'minmax(0,1fr)':'minmax(0,1fr) minmax(0,1fr)',
      sections:SECTIONS.map(([k,label,d])=>({label,d,pick:()=>this.setState({sec:k,saved:''}),bg:sec===k?'var(--color-text)':'transparent',fg:sec===k?'var(--color-bg)':'var(--color-text)',fw:sec===k?800:400})),
      isProfile:sec==='profile',isBusiness:sec==='business',isWhatsApp:sec==='whatsapp',isServices:sec==='services',svc:SVC[K],svcRows:SVC[K].items.map(([n,d,r,w])=>({n,d,r,w})),
      rules:[['Gap between bookings','Keeps time free to travel, clean or reset',SVC[K].buffer],['Earliest booking','How soon a customer can book from now',SVC[K].notice],['Book ahead up to','How far out Maya offers slots',SVC[K].ahead],['Hold a picked slot for','While the customer confirms their name',SVC[K].hold]].map(([n,d,v])=>({n,d,v})),
      addService:()=>this.flash('Add a service: name, length and who serves it'),disconnectCal:()=>this.flash('Prototype: calendar would disconnect. Maya then uses your set slots.'),isNotif:sec==='notif',isSecurity:sec==='security',isData:sec==='data',
      ini,pname,onPname:ev=>ed('pname',ev.target.value),pphone:'+91 98400 12345',pemail:e.pemail??biz.email,onPemail:ev=>ed('pemail',ev.target.value),
      changePhone:()=>this.flash('We’ll send a code to your new number on WhatsApp'),fakePhoto:()=>this.flash('Choose a square image, at least 400 × 400'),
      uiLangs:['English','தமிழ்','हिन्दी'].map(l=>({l,pick:()=>this.setState({uiLang:l,saved:''}),bg:s.uiLang===l?'var(--color-text)':'transparent',fg:s.uiLang===l?'var(--color-bg)':'var(--color-text)'})),
      myAlerts:[['hot','Hot leads','Name, need and why it’s hot, with a reply button'],['hand','Handovers','When Maya passes a chat to the team'],['low','Low credits','So Maya never stops replying'],['agenda','Daily agenda','8 am list of today’s bookings']].map(([k,name,desc])=>{const on=!!s.alerts[k];return{name,desc,...sw(on),flip:()=>this.setState(st=>({alerts:{...st.alerts,[k]:!on},saved:''}))};}),
      save:()=>{this.setState({saved:'Saved'});this.flash('Saved');},saveNote:s.saved?'All changes saved':'',
      bname:e.bname??biz.name,onBname:ev=>ed('bname',ev.target.value),bizIni:(e.bname??biz.name)[0],
      waCols:m?'minmax(0,1fr)':'minmax(0,1.6fr) repeat(3,minmax(0,1fr))',waBr:m?'0':'1px solid var(--color-divider)',waBb:m?'1px solid var(--color-divider)':'0',
      waStats:[['Quality',s.conn==='attention'?'Medium':'High',s.conn==='attention'?'6 blocks this week':'No blocks this month'],['Daily limit','1,000','new customers a day'],['Display name','Approved','by Meta, 13 Sep']].map(([k,v,n])=>({k,v,n})),
      conn:(()=>{const c=s.conn,M={connected:['Connected','transparent','var(--color-text)','var(--color-text)','#25d366','✓'],attention:['Needs attention','var(--color-accent-100)','var(--color-accent-800)','var(--color-accent)','var(--color-accent)','!'],disconnected:['Disconnected','var(--color-neutral-200)','var(--color-neutral-800)','var(--color-neutral-400)','var(--color-neutral-500)','×']}[c];
        return{status:M[0],sBg:M[1],sFg:M[2],sBd:M[3],dotBg:M[4],icon:M[5],on:c!=='disconnected',off:c==='disconnected',attention:c==='attention',lastCheck:s.health,method:K==='hotel'?'Connected manually · partner access':'Connected with Facebook · WhatsApp Business app still works'};})(),
      runHealth:()=>{this.setState({health:'just now',conn:s.conn==='disconnected'?'disconnected':(K==='hotel'?'attention':'connected')});this.flash(K==='hotel'?'Health check: quality rating is Medium':'Health check passed · all good');},
      clearAttention:()=>this.setState({conn:'connected'}),
      discOpen:s.discOpen,askDisconnect:()=>this.setState({discOpen:true}),closeDisc:()=>this.setState({discOpen:false}),
      doDisconnect:()=>{this.setState(st=>({discOpen:false,conn:'disconnected',connEvents:[['Just now',pname,'disconnected the number'],...st.connEvents]}));this.flash('Disconnected. Tokens deleted.');},
      metaChecklist:[['Display name approved','Meta approved “'+biz.name+'” on 13 Sep','Done',true],['Payment method added in Meta','Needed for reminders and follow-ups outside 24 hours','Done',true],['Message templates approved','10 approved, 1 in review','10 of 11',false]].map(([t,note,st,ok])=>({t,note,s:st,sColor:ok?'var(--color-text)':'var(--color-accent-700)',tick:ok?'✓':'',bg:ok?'var(--color-text)':'transparent',bd:ok?'var(--color-text)':'var(--color-accent)'})),
      connLog:[...s.connEvents,...(K==='hotel'?[['13 Sep','Raja (Pakka team)','connected the number through partner access · assisted onboarding'],['13 Sep',pname,'gave Pakka partner access in Meta Business Settings']]:[['13 Sep',pname,'connected the number with Facebook'],['13 Sep','System','registered the number and submitted 11 templates']])].map(([w,who,t])=>({w,who,t})),
      addNumber:()=>this.flash(pro?'Starting Meta login for a second number…':'Extra numbers are on Pro (up to 3)'),reconnect:()=>{this.setState(st=>({conn:'connected',health:'just now',connEvents:[['Just now',pname,'reconnected the number'],...st.connEvents]}));this.flash('Reconnected');},openTemplates:()=>P.onOpenTemplates&&P.onOpenTemplates(),
      waAbout,onWaAbout:ev=>ed('about',ev.target.value.slice(0,139)),waAboutLen:waAbout.length,
      templates:[['Booking confirmation',`Hi {{name}}, your ${ex.tpl} at ${biz.name} is booked for {{date}} at {{time}}.`,'Approved'],['Reminder',`Reminder: your ${ex.tpl} at ${biz.name} is on {{date}} at {{time}}. Confirm, reschedule or cancel.`,'Approved'],['Feedback request',`Thanks for visiting ${biz.name}! How was it? Reply 1 to 5.`,'Approved'],['Follow-up',`Hi {{name}}, just checking in. Would you like to book a ${ex.tpl}?`,'Approved'],['Festival offer',`Diwali greetings from ${biz.name}! Book this week and get a special offer.`,'In review'],['Staff alert','Hot lead: {{name}} · {{need}}. Tap to reply.','Approved']].map(([n,p,st])=>({n,p,s:st,bg:st==='Approved'?'transparent':'var(--color-accent-100)',fg:st==='Approved'?'var(--color-text)':'var(--color-accent-800)',bd:st==='Approved'?'var(--color-text)':'var(--color-accent-300)'})),
      matrix:EVENTS.map(([k,n,d])=>({n,d,cells:['WhatsApp','Email','Dashboard'].map((ch,i)=>{const on=!!s.mx[k][i];return{label:`${n} by ${ch}`,...ck(on),flip:()=>this.setState(st=>{const r: any=[...st.mx[k]];r[i]=r[i]?0:1;return{mx:{...st.mx,[k]:r},saved:''};})};})})),
      quiet:sw(s.quiet),flipQuiet:()=>this.setState({quiet:!s.quiet,saved:''}),hotThrough:ck(s.hotThrough),flipHotThrough:()=>this.setState({hotThrough:!s.hotThrough}),
      twofa:sw(s.twofa),flip2fa:()=>{this.setState({twofa:!s.twofa});this.flash(s.twofa?'Extra check off':'Extra check on for new devices');},
      sessions:sessions.map(([id,dev,where,d,cur])=>({dev,where,d,current:cur,other:!cur,out:()=>{this.setState(st=>({killed:{...st.killed,[id]:true}}));this.flash(`Logged out of ${dev}`);}})),
      hasOtherSessions:sessions.some(x=>!x[4]),signOutOthers:()=>{this.setState({killed:{phone:true,ipad:true}});this.flash('Logged out of all other devices');},
      activity:[['Today 9:44',staff[0],'took over a chat from Maya'],['Today 8:02',pname,'logged in on Chrome, Windows'],['Yesterday','You','changed reminder timing to 24 hours'],['22 Oct','You','invited '+staff[1]+' to the team'],['20 Oct','You','topped up 500 credits']].map(([w,who,t])=>({w,who,t})),
      doExport:()=>this.flash(`Export started. We’ll email ${e.pemail??biz.email} in a few minutes.`),
      closeOpen:s.closeOpen,openClose:()=>this.setState({closeOpen:true,confirmText:''}),closeDialog:()=>this.setState({closeOpen:false}),stop:ev=>ev.stopPropagation(),
      confirmText:s.confirmText,onConfirm:ev=>this.setState({confirmText:ev.target.value}),closeOff:s.confirmText.trim()!==biz.name,
      doClose:()=>{this.setState({closeOpen:false});this.flash('Prototype: account would close here');},
      hasToast:!!s.toast,toast:s.toast,
    };
  }
}

function renderPakkaSettings($v: any) {
  return (
    <>
      <div data-screen-label="15 Settings" style={{ position: "relative", padding: `${$v.pad ?? ""}`, display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1180px", color: "var(--color-text)", fontFamily: "var(--font-body)" } as React.CSSProperties}>
        {" "}
        <div>
          {" "}
          <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
            Settings
          </h1>
          {" "}
          <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)" }}>
            {"Your profile, "}{I($v.biz?.name)}{"’s details and how "}{I($v.productName)}{" reaches you."}
          </p>
          {" "}
        </div>
        {" "}
        <div style={{ display: "grid", gridTemplateColumns: `${$v.shellCols ?? ""}`, gap: `${$v.shellGap ?? ""}`, alignItems: "start" } as React.CSSProperties}>
          {" "}
          <nav style={{ display: "flex", flexDirection: `${$v.navDir ?? ""}`, gap: "2px", overflowX: "auto", position: `${$v.navPos ?? ""}`, top: "0", borderTop: `${$v.navBt ?? ""}`, borderBottom: `${$v.navBb ?? ""}` } as React.CSSProperties}>
            {" "}
            {L($v.sections).map((sc: any, $index: number) => (
              <Fragment key={$index}>
                {" "}
                <button onClick={sc?.pick} className="hover:[box-shadow:inset_0_0_0_2px_var(--color-text)]!" style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "0", background: `${sc?.bg ?? ""}`, color: `${sc?.fg ?? ""}`, font: "inherit", fontSize: "14px", fontWeight: `${sc?.fw ?? ""}`, textAlign: "left", cursor: "pointer", whiteSpace: "nowrap" } as React.CSSProperties}>
                  {" "}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", flex: "none" }}>
                    <path d={sc?.d} />
                  </svg>
                  {I(sc?.label)}{" "}
                </button>
                {" "}
              </Fragment>
            ))}
            {" "}
          </nav>
          {" "}
          <div style={{ display: "flex", flexDirection: "column", gap: "28px", minWidth: "0" }}>
            {" "}
            {$v.isProfile ? (
              <>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    My profile
                  </h2>
                  {" "}
                  <div style={{ display: "flex", gap: "18px", alignItems: "center", flexWrap: "wrap" }}>
                    {" "}
                    <span style={{ width: "84px", height: "84px", background: "var(--color-text)", color: "var(--color-bg)", display: "grid", placeItems: "center", fontWeight: "800", fontSize: "30px", flex: "none" }}>
                      {I($v.ini)}
                    </span>
                    {" "}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0", flex: "1 1 200px" }}>
                      {" "}
                      <div style={{ fontWeight: "800", fontSize: "22px", lineHeight: "1.1" }}>
                        {I($v.pname)}
                      </div>
                      {" "}
                      <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                        {"Owner · "}{I($v.biz?.name)}{" · member since 12 Sep 2026"}
                      </div>
                      {" "}
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button className="btn btn-secondary" onClick={$v.fakePhoto} style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                          Change photo
                        </button>
                        <button className="btn btn-ghost" onClick={$v.fakePhoto} style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                          Remove
                        </button>
                      </div>
                      {" "}
                    </div>
                    {" "}
                  </div>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: `${$v.twoCol ?? ""}`, gap: "16px" } as React.CSSProperties}>
                    {" "}
                    <div className="field">
                      <label>
                        Full name
                      </label>
                      <input className="input" value={$v.pname ?? ""} onChange={$v.onPname} />
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        Role
                      </label>
                      <input className="input" value="Owner" disabled={true} />
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        WhatsApp number · used to log in
                      </label>
                      {" "}
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input className="input" value={$v.pphone ?? ""} disabled={true} style={{ flex: "1" }} />
                        <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "4px 8px", border: "1px solid var(--color-text)" }}>
                          Verified
                        </span>
                      </div>
                      {" "}
                      <button className="btn btn-ghost" onClick={$v.changePhone} style={{ alignSelf: "flex-start", paddingLeft: "0", fontSize: "13px" }}>
                        Change number
                      </button>
                      {" "}
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        Email · for invoices and reports
                      </label>
                      <input className="input" value={$v.pemail ?? ""} onChange={$v.onPemail} />
                    </div>
                    {" "}
                  </div>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: `${$v.twoCol ?? ""}`, gap: "16px" } as React.CSSProperties}>
                    {" "}
                    <div className="field">
                      <label>
                        Dashboard language
                      </label>
                      {" "}
                      <div style={{ display: "flex", border: "2px solid var(--color-text)", width: "max-content", maxWidth: "100%", overflowX: "auto" }}>
                        {" "}
                        {L($v.uiLangs).map((ul: any, $index: number) => (
                          <Fragment key={$index}>
                            <button onClick={ul?.pick} style={{ padding: "7px 14px", border: "0", background: `${ul?.bg ?? ""}`, color: `${ul?.fg ?? ""}`, font: "inherit", fontSize: "14px", fontWeight: "800", cursor: "pointer" } as React.CSSProperties}>
                              {I(ul?.l)}
                            </button>
                          </Fragment>
                        ))}
                        {" "}
                      </div>
                      {" "}
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        Time zone
                      </label>
                      <select className="input">
                        <option>
                          India (IST, UTC+5:30)
                        </option>
                        <option>
                          Dubai (GST, UTC+4)
                        </option>
                        <option>
                          Singapore (SGT, UTC+8)
                        </option>
                      </select>
                    </div>
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    My alerts
                  </h2>
                  {" "}
                  {L($v.myAlerts).map((ma: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--color-divider)" }}>
                        {" "}
                        <div>
                          <div style={{ fontWeight: "600", fontSize: "15px" }}>
                            {I(ma?.name)}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                            {I(ma?.desc)}
                          </div>
                        </div>
                        {" "}
                        <button onClick={ma?.flip} role="switch" aria-checked={ma?.on} aria-label={ma?.name} style={{ width: "48px", height: "28px", border: `2px solid ${ma?.bd ?? ""}`, background: `${ma?.tbg ?? ""}`, position: "relative", padding: "0", cursor: "pointer" } as React.CSSProperties}>
                          <span style={{ position: "absolute", top: "2px", left: `${ma?.kl ?? ""}`, width: "20px", height: "20px", background: `${ma?.kb ?? ""}`, transition: "left .15s" } as React.CSSProperties}></span>
                        </button>
                        {" "}
                      </div>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                  <span style={{ fontSize: "13px", color: "var(--color-neutral-700)", marginTop: "8px" }}>
                    {"Alerts arrive on WhatsApp from “"}{I($v.biz?.name)}{" Alerts”. Set them for your staff in Team."}
                  </span>
                  {" "}
                </section>
                {" "}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", borderTop: "2px solid var(--color-text)", paddingTop: "14px" }}>
                  {" "}
                  <button className="btn btn-primary" onClick={$v.save}>
                    Save profile
                  </button>
                  {" "}
                  <a className="btn btn-secondary" href="Pakka Landing.dc.html" style={{ color: "var(--color-text)" }}>
                    Log out
                  </a>
                  {" "}
                  <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                    {I($v.saveNote)}
                  </span>
                  {" "}
                </div>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.isBusiness ? (
              <>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Business details
                  </h2>
                  {" "}
                  <div style={{ display: "flex", gap: "18px", alignItems: "center", flexWrap: "wrap" }}>
                    {" "}
                    <span style={{ width: "72px", height: "72px", background: "var(--color-accent)", color: "#fff", display: "grid", placeItems: "center", fontWeight: "800", fontSize: "30px", flex: "none" }}>
                      {I($v.bizIni)}
                    </span>
                    {" "}
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <button className="btn btn-secondary" onClick={$v.fakePhoto} style={{ padding: "6px 12px", justifyContent: "flex-start" }}>
                        Upload logo
                      </button>
                      <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                        Used as your WhatsApp profile photo and on invoices
                      </span>
                    </div>
                    {" "}
                  </div>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: `${$v.twoCol ?? ""}`, gap: "16px" } as React.CSSProperties}>
                    {" "}
                    <div className="field">
                      <label>
                        Business name
                      </label>
                      <input className="input" value={$v.bname ?? ""} onChange={$v.onBname} />
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        Industry
                      </label>
                      <input className="input" value={$v.biz?.sector ?? ""} disabled={true} />
                      <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                        Sets your lead questions and templates. Contact support to change.
                      </span>
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        Address
                      </label>
                      <input className="input" value={$v.ex?.addr ?? ""} />
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        City
                      </label>
                      <input className="input" value={$v.biz?.city ?? ""} />
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        Website
                      </label>
                      <input className="input" value={$v.ex?.site ?? ""} />
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        Google Maps link
                      </label>
                      <input className="input" value={$v.ex?.maps ?? ""} />
                      <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                        Sent with confirmations and 2-hour reminders
                      </span>
                    </div>
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Billing details
                  </h2>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: `${$v.twoCol ?? ""}`, gap: "16px" } as React.CSSProperties}>
                    {" "}
                    <div className="field">
                      <label>
                        Legal name
                      </label>
                      <input className="input" value={$v.ex?.legal ?? ""} />
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        GSTIN
                      </label>
                      <input className="input" value={$v.ex?.gst ?? ""} />
                      <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                        Shown on your tax invoices
                      </span>
                    </div>
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", borderTop: "2px solid var(--color-text)", paddingTop: "14px" }}>
                  <button className="btn btn-primary" onClick={$v.save}>
                    Save business details
                  </button>
                  <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                    {I($v.saveNote)}
                  </span>
                </div>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.isServices ? (
              <>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {" "}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px", gap: "12px" }}>
                    <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                      What customers can book
                    </h2>
                    <button className="btn btn-ghost" onClick={$v.addService} style={{ padding: "2px 0" }}>
                      + Add
                    </button>
                  </div>
                  {" "}
                  <div style={{ overflowX: "auto" }}>
                    {" "}
                    <table className="table" style={{ minWidth: "520px" }}>
                      {" "}
                      <thead>
                        <tr>
                          <th>
                            Service
                          </th>
                          <th>
                            Length
                          </th>
                          <th>
                            {I($v.svc?.res)}
                          </th>
                          <th>
                            Where
                          </th>
                        </tr>
                      </thead>
                      {" "}
                      <tbody>
                        {L($v.svcRows).map((sv: any, $index: number) => (
                          <Fragment key={$index}>
                            <tr>
                              <td style={{ fontWeight: "600" }}>
                                {I(sv?.n)}
                              </td>
                              <td>
                                {I(sv?.d)}
                              </td>
                              <td>
                                {I(sv?.r)}
                              </td>
                              <td style={{ color: "var(--color-neutral-700)" }}>
                                {I(sv?.w)}
                              </td>
                            </tr>
                          </Fragment>
                        ))}
                      </tbody>
                      {" "}
                    </table>
                    {" "}
                  </div>
                  {" "}
                  <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                    Prices live in the Knowledge base. Length sets how long each booking blocks the calendar.
                  </span>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Booking rules
                  </h2>
                  {" "}
                  {L($v.rules).map((ru: any, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--color-divider)" }}>
                        <div>
                          <div style={{ fontWeight: "600", fontSize: "15px" }}>
                            {I(ru?.n)}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                            {I(ru?.d)}
                          </div>
                        </div>
                        <span style={{ fontWeight: "800", fontSize: "15px", padding: "6px 10px", border: "2px solid var(--color-text)", whiteSpace: "nowrap" }}>
                          {I(ru?.v)}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Calendar
                  </h2>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "12px", alignItems: "center", padding: "4px 0" }}>
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "15px" }}>
                        Google Calendar connected
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                        {I($v.pemail)}{" · busy times block slots, bookings appear as events"}
                      </div>
                    </div>
                    <button className="btn btn-secondary" onClick={$v.disconnectCal}>
                      Disconnect
                    </button>
                  </div>
                  {" "}
                </section>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.isWhatsApp ? (
              <>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Connected number
                  </h2>
                  {" "}
                  <div style={{ border: "2px solid var(--color-text)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "0", background: "var(--color-bg)", overflow: "hidden" }}>
                    {" "}
                    <div style={{ gridColumn: "1 / -1", padding: "16px", display: "flex", gap: "12px", alignItems: "center", boxShadow: "0 0 0 1px var(--color-divider)" }}>
                      <span style={{ width: "40px", height: "40px", background: `${$v.conn?.dotBg ?? ""}`, color: "#fff", display: "grid", placeItems: "center", fontWeight: "800", flex: "none" } as React.CSSProperties}>
                        {I($v.conn?.icon)}
                      </span>
                      <span style={{ flex: "1", minWidth: "0" }}>
                        <strong style={{ display: "block", fontSize: "18px", whiteSpace: "nowrap" }}>
                          +91 98400 12345
                        </strong>
                        <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                          {"Shows as “"}{I($v.biz?.name)}{"” · "}{I($v.conn?.method)}
                        </span>
                      </span>
                      <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "3px 8px", background: `${$v.conn?.sBg ?? ""}`, color: `${$v.conn?.sFg ?? ""}`, border: `1px solid ${$v.conn?.sBd ?? ""}` } as React.CSSProperties}>
                        {I($v.conn?.status)}
                      </span>
                    </div>
                    {" "}
                    {L($v.waStats).map((w: any, $index: number) => (
                      <Fragment key={$index}>
                        <div style={{ padding: "16px", minWidth: "0", boxShadow: "0 0 0 1px var(--color-divider)" }}>
                          <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                            {I(w?.k)}
                          </div>
                          <div style={{ fontWeight: "800", fontSize: "18px" }}>
                            {I(w?.v)}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                            {I(w?.n)}
                          </div>
                        </div>
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {" "}
                    <button className="btn btn-secondary" onClick={$v.runHealth}>
                      Run health check
                    </button>
                    {" "}
                    <button className="btn btn-secondary" onClick={$v.addNumber}>
                      Add another number
                    </button>
                    {" "}
                    {$v.conn?.on ? (
                      <>
                        <button className="btn btn-ghost" onClick={$v.askDisconnect} style={{ color: "var(--color-accent-700)" }}>
                          Disconnect
                        </button>
                      </>
                    ) : null}
                    {" "}
                    {$v.conn?.off ? (
                      <>
                        <button className="btn btn-primary" onClick={$v.reconnect}>
                          Reconnect
                        </button>
                      </>
                    ) : null}
                    {" "}
                  </div>
                  {" "}
                  <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                    {"Checked daily: token, quality rating and messaging limit. Last check "}{I($v.conn?.lastCheck)}{". If something breaks we email you and show it here."}
                  </span>
                  {" "}
                </section>
                {" "}
                {$v.conn?.attention ? (
                  <>
                    {" "}
                    <div style={{ border: "2px solid var(--color-accent)", background: "var(--color-accent-100)", color: "var(--color-accent-900)", padding: "14px 16px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ flex: "1", minWidth: "220px", fontSize: "14px" }}>
                        <strong>
                          Needs attention:
                        </strong>
                        {" your quality rating dropped to Medium after 6 customers blocked the number this week. Maya is still replying. Check recent follow-ups for anything too pushy."}
                      </span>
                      <button className="btn btn-secondary" onClick={$v.clearAttention}>
                        Mark as seen
                      </button>
                    </div>
                    {" "}
                  </>
                ) : null}
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Finish in Meta
                  </h2>
                  {" "}
                  {L($v.metaChecklist).map((mc: any, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) auto", gap: "12px", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                        <span style={{ width: "20px", height: "20px", background: `${mc?.bg ?? ""}`, border: `2px solid ${mc?.bd ?? ""}`, color: "#fff", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "800" } as React.CSSProperties}>
                          {I(mc?.tick)}
                        </span>
                        <span style={{ minWidth: "0" }}>
                          <span style={{ display: "block", fontWeight: "600" }}>
                            {I(mc?.t)}
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                            {I(mc?.note)}
                          </span>
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: `${mc?.sColor ?? ""}`, whiteSpace: "nowrap" } as React.CSSProperties}>
                          {I(mc?.s)}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Connection history
                  </h2>
                  {" "}
                  {L($v.connLog).map((cl: any, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr)", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                        <span style={{ color: "var(--color-neutral-700)" }}>
                          {I(cl?.w)}
                        </span>
                        <span>
                          <strong>
                            {I(cl?.who)}
                          </strong>
                          {" "}{I(cl?.t)}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    WhatsApp profile
                  </h2>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: `${$v.twoCol ?? ""}`, gap: "16px" } as React.CSSProperties}>
                    {" "}
                    <div className="field">
                      <label>
                        About · max 139 characters
                      </label>
                      <input className="input" value={$v.waAbout ?? ""} onChange={$v.onWaAbout} />
                      <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                        {I($v.waAboutLen)}{" of 139"}
                      </span>
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        Category
                      </label>
                      <input className="input" value={$v.ex?.cat ?? ""} />
                    </div>
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px", gap: "12px", flexWrap: "wrap" }}>
                    <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                      Message templates
                    </h2>
                    <button className="btn btn-ghost" onClick={$v.openTemplates} style={{ padding: "2px 0" }}>
                      Manage templates →
                    </button>
                  </div>
                  {" "}
                  {L($v.templates).map((tp: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "12px", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--color-divider)" }}>
                        {" "}
                        <div style={{ minWidth: "0" }}>
                          <div style={{ fontWeight: "600", fontSize: "15px" }}>
                            {I(tp?.n)}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-neutral-700)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {I(tp?.p)}
                          </div>
                        </div>
                        {" "}
                        <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "3px 8px", background: `${tp?.bg ?? ""}`, color: `${tp?.fg ?? ""}`, border: `1px solid ${tp?.bd ?? ""}` } as React.CSSProperties}>
                          {I(tp?.s)}
                        </span>
                        {" "}
                      </div>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                </section>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.isNotif ? (
              <>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Where we tell you
                  </h2>
                  {" "}
                  <div style={{ overflowX: "auto" }}>
                    {" "}
                    <table className="table" style={{ minWidth: "520px" }}>
                      {" "}
                      <thead>
                        <tr>
                          <th>
                            Event
                          </th>
                          <th style={{ textAlign: "center" }}>
                            WhatsApp
                          </th>
                          <th style={{ textAlign: "center" }}>
                            Email
                          </th>
                          <th style={{ textAlign: "center" }}>
                            Dashboard
                          </th>
                        </tr>
                      </thead>
                      {" "}
                      <tbody>
                        {" "}
                        {L($v.matrix).map((mx: any, $index: number) => (
                          <Fragment key={$index}>
                            <tr>
                              {" "}
                              <td>
                                <div style={{ fontWeight: "600" }}>
                                  {I(mx?.n)}
                                </div>
                                <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                                  {I(mx?.d)}
                                </div>
                              </td>
                              {" "}
                              {L(mx?.cells).map((cl: any, $index: number) => (
                                <Fragment key={$index}>
                                  <td style={{ textAlign: "center" }}>
                                    <button onClick={cl?.flip} aria-label={cl?.label} style={{ width: "24px", height: "24px", border: `2px solid ${cl?.bd ?? ""}`, background: `${cl?.bg ?? ""}`, color: "#fff", font: "inherit", fontSize: "13px", fontWeight: "800", display: "inline-grid", placeItems: "center", cursor: "pointer", padding: "0" } as React.CSSProperties}>
                                      {I(cl?.tick)}
                                    </button>
                                  </td>
                                </Fragment>
                              ))}
                              {" "}
                            </tr>
                          </Fragment>
                        ))}
                        {" "}
                      </tbody>
                      {" "}
                    </table>
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Quiet hours
                  </h2>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", alignItems: "center" }}>
                    {" "}
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "15px" }}>
                        Pause staff alerts at night
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                        Maya keeps replying to customers. Alerts wait until morning.
                      </div>
                    </div>
                    {" "}
                    <button onClick={$v.flipQuiet} role="switch" aria-checked={$v.quiet?.on} aria-label="Quiet hours" style={{ width: "48px", height: "28px", border: `2px solid ${$v.quiet?.bd ?? ""}`, background: `${$v.quiet?.tbg ?? ""}`, position: "relative", padding: "0", cursor: "pointer" } as React.CSSProperties}>
                      <span style={{ position: "absolute", top: "2px", left: `${$v.quiet?.kl ?? ""}`, width: "20px", height: "20px", background: `${$v.quiet?.kb ?? ""}`, transition: "left .15s" } as React.CSSProperties}></span>
                    </button>
                    {" "}
                  </div>
                  {" "}
                  {$v.quiet?.on ? (
                    <>
                      {" "}
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
                        {" "}
                        <div className="field">
                          <label>
                            From
                          </label>
                          <select className="input" defaultValue="10:00 pm" style={{ width: "auto" }}>
                            <option>
                              9:00 pm
                            </option>
                            <option>
                              10:00 pm
                            </option>
                            <option>
                              11:00 pm
                            </option>
                          </select>
                        </div>
                        {" "}
                        <div className="field">
                          <label>
                            Until
                          </label>
                          <select className="input" defaultValue="7:00 am" style={{ width: "auto" }}>
                            <option>
                              6:00 am
                            </option>
                            <option>
                              7:00 am
                            </option>
                            <option>
                              8:00 am
                            </option>
                          </select>
                        </div>
                        {" "}
                        <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "14px", paddingBottom: "10px", cursor: "pointer" }}>
                          <button onClick={$v.flipHotThrough} aria-label="Hot leads still alert" style={{ width: "20px", height: "20px", border: `2px solid ${$v.hotThrough?.bd ?? ""}`, background: `${$v.hotThrough?.bg ?? ""}`, color: "#fff", fontSize: "12px", fontWeight: "800", display: "grid", placeItems: "center", padding: "0", cursor: "pointer" } as React.CSSProperties}>
                            {I($v.hotThrough?.tick)}
                          </button>
                          Hot leads still come through
                        </label>
                        {" "}
                      </div>
                      {" "}
                    </>
                  ) : null}
                  {" "}
                </section>
                {" "}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", borderTop: "2px solid var(--color-text)", paddingTop: "14px" }}>
                  <button className="btn btn-primary" onClick={$v.save}>
                    Save notifications
                  </button>
                  <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                    {I($v.saveNote)}
                  </span>
                </div>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.isSecurity ? (
              <>
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Login
                  </h2>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
                    {" "}
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "15px" }}>
                        WhatsApp code
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                        {"We send a 6-digit code to "}{I($v.pphone)}{". No password to remember."}
                      </div>
                    </div>
                    {" "}
                    <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "3px 8px", border: "1px solid var(--color-text)" }}>
                      On
                    </span>
                    {" "}
                  </div>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
                    {" "}
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "15px" }}>
                        Extra check on new devices
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                        Also ask for an email code the first time you log in somewhere new.
                      </div>
                    </div>
                    {" "}
                    <button onClick={$v.flip2fa} role="switch" aria-checked={$v.twofa?.on} aria-label="Extra check" style={{ width: "48px", height: "28px", border: `2px solid ${$v.twofa?.bd ?? ""}`, background: `${$v.twofa?.tbg ?? ""}`, position: "relative", padding: "0", cursor: "pointer" } as React.CSSProperties}>
                      <span style={{ position: "absolute", top: "2px", left: `${$v.twofa?.kl ?? ""}`, width: "20px", height: "20px", background: `${$v.twofa?.kb ?? ""}`, transition: "left .15s" } as React.CSSProperties}></span>
                    </button>
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px", gap: "12px" }}>
                    <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                      Where you’re logged in
                    </h2>
                    {$v.hasOtherSessions ? (
                      <>
                        <button className="btn btn-ghost" onClick={$v.signOutOthers} style={{ padding: "4px 0" }}>
                          Log out everywhere else
                        </button>
                      </>
                    ) : null}
                  </div>
                  {" "}
                  {L($v.sessions).map((se: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <div style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr) auto", gap: "12px", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--color-divider)" }}>
                        {" "}
                        <span style={{ width: "36px", height: "36px", border: "2px solid var(--color-text)", display: "grid", placeItems: "center" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d={se?.d} />
                          </svg>
                        </span>
                        {" "}
                        <div style={{ minWidth: "0" }}>
                          <div style={{ fontWeight: "600", fontSize: "15px" }}>
                            {I(se?.dev)}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                            {I(se?.where)}
                          </div>
                        </div>
                        {" "}
                        {se?.current ? (
                          <>
                            <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "3px 8px", background: "var(--color-text)", color: "var(--color-bg)" }}>
                              This device
                            </span>
                          </>
                        ) : null}
                        {" "}
                        {se?.other ? (
                          <>
                            <button className="btn btn-secondary" onClick={se?.out} style={{ padding: "5px 10px" }}>
                              Log out
                            </button>
                          </>
                        ) : null}
                        {" "}
                      </div>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Recent activity
                  </h2>
                  {" "}
                  {L($v.activity).map((ac: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr)", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                        <span style={{ color: "var(--color-neutral-700)" }}>
                          {I(ac?.w)}
                        </span>
                        <span>
                          <strong>
                            {I(ac?.who)}
                          </strong>
                          {" "}{I(ac?.t)}
                        </span>
                      </div>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                </section>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.isData ? (
              <>
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Your data
                  </h2>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
                    {" "}
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "15px" }}>
                        Export leads and chats
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                        {"A CSV of every lead with answers and score, plus chat history. Sent to "}{I($v.pemail)}{"."}
                      </div>
                    </div>
                    {" "}
                    <button className="btn btn-secondary" onClick={$v.doExport}>
                      Export
                    </button>
                    {" "}
                  </div>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
                    {" "}
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "15px" }}>
                        Keep chats for
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                        Older chats are deleted. Lead details stay.
                      </div>
                    </div>
                    {" "}
                    <select className="input" defaultValue="12 months" style={{ width: "auto" }}>
                      <option>
                        6 months
                      </option>
                      <option>
                        12 months
                      </option>
                      <option>
                        24 months
                      </option>
                    </select>
                    {" "}
                  </div>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
                    {" "}
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "15px" }}>
                        Customer opt-out
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                        Customers who reply STOP never get follow-ups or reminders again. 14 people have opted out.
                      </div>
                    </div>
                    {" "}
                    <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "3px 8px", border: "1px solid var(--color-text)" }}>
                      Always on
                    </span>
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "12px", border: "2px solid var(--color-accent)", padding: "18px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
                    Close account
                  </h2>
                  {" "}
                  <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.5", maxWidth: "620px" }}>
                    Maya stops replying straight away and your WhatsApp number is released. Leads and chats are deleted after 30 days. Unused credits are not refunded.
                  </p>
                  {" "}
                  <button className="btn btn-secondary" onClick={$v.openClose} style={{ alignSelf: "flex-start", color: "var(--color-accent-700)", borderColor: "var(--color-accent)" }}>
                    {"Close "}{I($v.biz?.name)}{"’s account"}
                  </button>
                  {" "}
                </section>
                {" "}
              </>
            ) : null}
            {" "}
          </div>
          {" "}
        </div>
        {" "}
        {$v.discOpen ? (
          <>
            {" "}
            <div className="dialog-backdrop" onClick={$v.closeDisc} style={{ position: "fixed", zIndex: "50" }}>
              {" "}
              <div className="dialog" onClick={$v.stop} style={{ background: "var(--color-bg)", width: "min(460px,100%)" }}>
                {" "}
                <div className="dialog-title">
                  Disconnect +91 98400 12345?
                </div>
                {" "}
                <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
                  Maya stops replying on this number straight away. We unsubscribe from your WhatsApp account and delete the stored tokens. Your chats and leads stay in the dashboard.
                </div>
                {" "}
                <div className="dialog-actions" style={{ justifyContent: "flex-start" }}>
                  <button className="btn btn-primary" onClick={$v.doDisconnect}>
                    Disconnect
                  </button>
                  <button className="btn btn-secondary" onClick={$v.closeDisc}>
                    Keep connected
                  </button>
                </div>
                {" "}
              </div>
              {" "}
            </div>
            {" "}
          </>
        ) : null}
        {" "}
        {$v.closeOpen ? (
          <>
            {" "}
            <div className="dialog-backdrop" onClick={$v.closeDialog} style={{ position: "fixed", zIndex: "50" }}>
              {" "}
              <div className="dialog" onClick={$v.stop} style={{ background: "var(--color-bg)", width: "min(460px,100%)" }}>
                {" "}
                <div className="dialog-title">
                  {"Close "}{I($v.biz?.name)}{"’s account?"}
                </div>
                {" "}
                <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
                  Type the business name to confirm. This can’t be undone after 30 days.
                </div>
                {" "}
                <input className="input" value={$v.confirmText ?? ""} onChange={$v.onConfirm} placeholder={$v.biz?.name} />
                {" "}
                <div className="dialog-actions" style={{ justifyContent: "flex-start" }}>
                  <button className="btn btn-primary" onClick={$v.doClose} disabled={$v.closeOff}>
                    Close account
                  </button>
                  <button className="btn btn-secondary" onClick={$v.closeDialog}>
                    Keep my account
                  </button>
                </div>
                {" "}
              </div>
              {" "}
            </div>
            {" "}
          </>
        ) : null}
        {" "}
        {$v.hasToast ? (
          <>
            <div style={{ position: "fixed", left: "16px", bottom: "16px", zIndex: "60", background: "var(--color-text)", color: "var(--color-bg)", padding: "12px 16px", fontSize: "14px", fontWeight: "600" }}>
              {I($v.toast)}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

const PakkaSettings = createDC("Pakka Settings", PakkaSettingsLogic, renderPakkaSettings);
export default PakkaSettings;

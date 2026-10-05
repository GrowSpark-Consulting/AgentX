/* eslint-disable */
// @ts-nocheck: TEMPORARY typing boundary. Ported prototype code written for `strict: false`;
// typing it is a follow-up (docs/frontend-architecture-map.md, "TypeScript").
"use client";
// Ported from the "Pakka App First Round" design. Logic and mock data are kept as authored;
// the markup is the original template expressed as JSX.

import React, { Fragment } from "react";
import { DCLogic, createDC, I, L, css } from "@/components/dashboard/runtime";
import { DAYS, TODAY, STAFF, INIT, RE_CAL } from "@/fixtures/dashboard/calendar";
import { PAKKA_IND } from "@/fixtures/dashboard/industries";


/** Editable props declared by the original component (editor metadata, kept for reference). */
export const PakkaCalendarProps = {"industry":{"editor":"enum","options":["re","salon","int","hotel","rest"],"default":"re"},"isMobile":{"editor":"boolean","default":false}} as const;

const LBL: any={confirmed:'Confirmed',held:'Held',completed:'Completed',noshow:'No-show'};
const STY: any={confirmed:{bg:'var(--color-surface)',fg:'var(--color-text)',bd:'var(--color-text)',bstyle:'solid',deco:'none'},held:{bg:'var(--color-accent-100)',fg:'var(--color-accent-800)',bd:'var(--color-accent)',bstyle:'dashed',deco:'none'},completed:{bg:'var(--color-text)',fg:'var(--color-bg)',bd:'var(--color-text)',bstyle:'solid',deco:'none'},noshow:{bg:'var(--color-neutral-300)',fg:'var(--color-neutral-800)',bd:'var(--color-neutral-300)',bstyle:'solid',deco:'line-through'}};
const tfmt=h=>{const H=Math.floor(h),M=Math.round((h-H)*60),ap=H>=12?'pm':'am',h12=((H+11)%12)+1;return `${h12}:${String(M).padStart(2,'0')} ${ap}`;};
const PXH=60,START=9;
const IX=k=>(k&&k!=='re'&&PAKKA_IND&&PAKKA_IND[k])||null;
class PakkaCalendarLogic extends DCLogic {
  state: any = {view:'day',staff:'All',day:TODAY,lists:{},selK:'re',sel:null,resched:false,prev:null,toast:null};
  key(){return IX(this.props.industry)?this.props.industry:'re';}
  D(){const X=IX(this.props.industry);return X?X.cal:RE_CAL;}
  getList(s){return (s.lists||{})[this.key()]||this.D().list;}
  componentDidMount(){if(!PAKKA_IND){this._rd=()=>this.forceUpdate();window.addEventListener('pakka-ind-ready',this._rd);}}
  flash(t){clearTimeout(this.tt);this.setState({toast:t});this.tt=setTimeout(()=>this.setState({toast:null}),2600);}
  componentWillUnmount(){clearTimeout(this.tt);this._rd&&window.removeEventListener('pakka-ind-ready',this._rd);}
  upd(id,patch,msg?){this.setState(s=>{const L=this.getList(s);return{prev:L.find(b=>b.id===id),lists:{...s.lists,[this.key()]:L.map(b=>b.id===id?{...b,...patch}:b)},resched:false};});if(msg)this.flash(msg);}
  renderVals(){
    const s0=this.state,P=this.props,m=!!P.isMobile,D=this.D(),K=this.key(),ST=D.start,nowIn=9.93>=ST,list=this.getList(s0);
    const s: any={...s0,staff:s0.staff==='All'||D.staff.includes(s0.staff)?s0.staff:'All'};
    const vis=list.filter(b=>s.staff==='All'||b.staff===s.staff);
    const deco=b=>({...b,...STY[b.status],status:LBL[b.status],time:tfmt(b.s),open:()=>this.setState({sel:b.id,selK:K,resched:false}),top:(b.s-ST)*PXH+2+'px',h:PXH-4+'px',sel:s.sel===b.id?'0 0 0 2px var(--color-accent)':'none'});
    let cols;
    if(s.view==='day'){
      const who=s.staff==='All'?D.staff:[s.staff];
      cols=who.map(st=>({title:st,sub:D.sub?D.sub[st]:(st==='Arun'?'Owner':'Site visits'),items:vis.filter(b=>b.d===s.day&&b.staff===st).map(b=>({...deco(b),extra:''})),showNow:s.day===TODAY&&nowIn,headBg:'transparent',bodyBg:'transparent'}));
    }else{
      cols=DAYS.map(([dw,n],i)=>({title:`${dw} ${n}`,sub:i===TODAY?'Today':'Oct',items:vis.filter(b=>b.d===i).map(b=>({...deco(b),extra:b.staff})),showNow:i===TODAY&&nowIn,headBg:i===TODAY?'var(--color-surface)':'transparent',bodyBg:i===TODAY?'color-mix(in srgb,var(--color-surface) 50%,transparent)':'transparent'}));
    }
    const ag=(s.view==='day'?vis.filter(b=>b.d===s.day):vis).slice().sort((a,b)=>a.d-b.d||a.s-b.s);
    const agenda=ag.map((b,i)=>({...deco(b),showHead:s.view==='week'&&(i===0||ag[i-1].d!==b.d),dayLabel:`${DAYS[b.d][0]} ${DAYS[b.d][1]} Oct${b.d===TODAY?' · Today':''}`}));
    const sb=s.selK===K?list.find(b=>b.id===s.sel):null;
    const sel=sb?{...sb,...STY[sb.status],status:LBL[sb.status]}:{};
    const today=list.filter(b=>b.d===TODAY);
    const live=sb&&(sb.status==='confirmed'||sb.status==='held');
    const day=DAYS[s.day];
    return{
      isMobile:m,isDesktop:!m,pad:m?'20px 16px 32px':'32px 40px 48px',h1:m?'30px':'42px',
      heading:s.view==='day'?`${day[0]==='Sat'?'Saturday':day[0]}, ${day[1]} Oct`:'Week of 19 Oct',
      subline:`${today.length} ${D.word} today · ${today.filter(b=>b.status==='held').length} held, waiting for confirmation`,
      setDay:()=>this.setState({view:'day'}),setWeek:()=>this.setState({view:'week'}),
      dayBg:s.view==='day'?'var(--color-text)':'transparent',dayFg:s.view==='day'?'var(--color-bg)':'var(--color-text)',weekBg:s.view==='week'?'var(--color-text)':'transparent',weekFg:s.view==='week'?'var(--color-bg)':'var(--color-text)',
      staffChips:['All',...D.staff].map(st=>({label:st==='All'?'All staff':st,pick:()=>this.setState({staff:st}),bg:s.staff===st?'var(--color-text)':'transparent',fg:s.staff===st?'var(--color-bg)':'var(--color-text)',bd:s.staff===st?'var(--color-text)':'var(--color-divider)'})),
      dayStrip:DAYS.map(([dow,num],i)=>({dow,num,pick:()=>this.setState({day:i,view:'day'}),bg:i===s.day&&s.view==='day'?'var(--color-text)':i===TODAY?'var(--color-surface)':'transparent',fg:i===s.day&&s.view==='day'?'var(--color-bg)':'var(--color-text)'})),
      agenda,agendaEmpty:!agenda.length,
      cols,colCount:cols.length,gridMin:56+cols.length*140+'px',
      hours:Array.from({length:11},(_,i)=>({top:i*PXH+'px',label:tfmt(ST+i).replace(':00','')})),nowTop:(9.93-ST)*PXH+'px',
      hasSel:!!sb,sel,close:()=>this.setState({sel:null,resched:false}),
      panelPos:m?'absolute':'sticky',panelLeft:m?'0':'auto',panelTop:m?'auto':'0',panelW:m?'auto':'340px',panelBl:m?'0':'2px solid var(--color-divider)',panelBt:m?'2px solid var(--color-text)':'0',panelSh:m?'var(--shadow-lg)':'none',
      selRows:sb?[['When',`${DAYS[sb.d][0]} ${DAYS[sb.d][1]} Oct, ${tfmt(sb.s)}`],['Where',sb.place],['With',sb.staff],['Type',D.type],['Reminders',live?'24 h and 2 h before':'—']].map(([k,v])=>({k,v})):[],
      canAct:live,isDone:sb&&!live,doneNote:sb?(sb.status==='completed'?'Visit done. Maya sends the feedback request this evening.':'Marked no-show. Maya will offer a new slot.'):'',
      resched:s.resched,toggleResched:()=>this.setState({resched:!s.resched}),
      slots:D.slots.map(([d,h,label])=>({label,pick:()=>this.upd(sb.id,{d,s:h,status:'confirmed'},`Moved. ${sb.name.split(' ')[0]} gets the new time on WhatsApp.`)})),
      markVisited:()=>this.upd(sb.id,{status:'completed'},'Marked visited'),markNoShow:()=>this.upd(sb.id,{status:'noshow'},'Marked no-show'),
      cancel:()=>{this.setState(st=>({lists:{...st.lists,[K]:this.getList(st).filter(b=>b.id!==sb.id)},sel:null}));this.flash(`Cancelled. ${sb.name.split(' ')[0]} has been told on WhatsApp.`);},
      undo:()=>{if(s.prev)this.upd(s.prev.id,{status:s.prev.status});},
      hasToast:!!s.toast,toast:s.toast,
    };
  }
}

function renderPakkaCalendar($v: any) {
  return (
    <>
      <div data-screen-label="06 Calendar" style={{ position: "relative", display: "flex", minHeight: "100%", color: "var(--color-text)", fontFamily: "var(--font-body)" }}>
        {" "}
        <div style={{ flex: "1", minWidth: "0", padding: `${$v.pad ?? ""}`, display: "flex", flexDirection: "column", gap: "16px" } as React.CSSProperties}>
          {" "}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            {" "}
            <div>
              <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
                {I($v.heading)}
              </h1>
              <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)" }}>
                {I($v.subline)}
              </p>
            </div>
            {" "}
            <div style={{ display: "flex", border: "2px solid var(--color-text)" }}>
              {" "}
              <button onClick={$v.setDay} style={{ padding: "6px 14px", border: "0", background: `${$v.dayBg ?? ""}`, color: `${$v.dayFg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer" } as React.CSSProperties}>
                Day
              </button>
              {" "}
              <button onClick={$v.setWeek} style={{ padding: "6px 14px", border: "0", background: `${$v.weekBg ?? ""}`, color: `${$v.weekFg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer" } as React.CSSProperties}>
                Week
              </button>
              {" "}
            </div>
            {" "}
          </div>
          {" "}
          <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            {" "}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {" "}
              {L($v.staffChips).map((c: any, $index: number) => (
                <Fragment key={$index}>
                  <button onClick={c?.pick} style={{ border: `1px solid ${c?.bd ?? ""}`, background: `${c?.bg ?? ""}`, color: `${c?.fg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "600", padding: "6px 12px", cursor: "pointer" } as React.CSSProperties}>
                    {I(c?.label)}
                  </button>
                </Fragment>
              ))}
              {" "}
            </div>
            {" "}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "12px", color: "var(--color-neutral-700)" }}>
              {" "}
              <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ width: "12px", height: "12px", border: "2px solid var(--color-text)", background: "var(--color-surface)" }}></span>
                Confirmed
              </span>
              {" "}
              <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ width: "12px", height: "12px", border: "2px dashed var(--color-accent)", background: "var(--color-accent-100)" }}></span>
                Held
              </span>
              {" "}
              <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ width: "12px", height: "12px", background: "var(--color-text)" }}></span>
                Completed
              </span>
              {" "}
              <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ width: "12px", height: "12px", background: "var(--color-neutral-300)" }}></span>
                No-show
              </span>
              {" "}
            </div>
            {" "}
          </div>
          {" "}
          {$v.isMobile ? (
            <>
              {" "}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", border: "2px solid var(--color-text)" }}>
                {" "}
                {L($v.dayStrip).map((d: any, $index: number) => (
                  <Fragment key={$index}>
                    <button onClick={d?.pick} style={{ padding: "6px 0", border: "0", borderRight: "1px solid var(--color-divider)", background: `${d?.bg ?? ""}`, color: `${d?.fg ?? ""}`, font: "inherit", cursor: "pointer", lineHeight: "1.2" } as React.CSSProperties}>
                      <span style={{ display: "block", fontSize: "10px", fontWeight: "600" }}>
                        {I(d?.dow)}
                      </span>
                      <span style={{ fontSize: "16px", fontWeight: "800" }}>
                        {I(d?.num)}
                      </span>
                    </button>
                  </Fragment>
                ))}
                {" "}
              </div>
              {" "}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {" "}
                {L($v.agenda).map((g: any, $index: number) => (
                  <Fragment key={$index}>
                    {" "}
                    {g?.showHead ? (
                      <>
                        <div style={{ fontSize: "12px", fontWeight: "800", letterSpacing: ".08em", textTransform: "uppercase", padding: "14px 0 6px", borderBottom: "2px solid var(--color-text)" }}>
                          {I(g?.dayLabel)}
                        </div>
                      </>
                    ) : null}
                    {" "}
                    <button onClick={g?.open} style={{ display: "grid", gridTemplateColumns: "64px minmax(0,1fr)", gap: "12px", alignItems: "center", padding: "10px 0", border: "0", borderBottom: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", font: "inherit", textAlign: "left", cursor: "pointer" }}>
                      {" "}
                      <span style={{ fontWeight: "800", fontSize: "15px" }}>
                        {I(g?.time)}
                      </span>
                      {" "}
                      <span style={{ padding: "10px 12px", background: `${g?.bg ?? ""}`, color: `${g?.fg ?? ""}`, border: `2px ${g?.bstyle ?? ""} ${g?.bd ?? ""}`, minWidth: "0" } as React.CSSProperties}>
                        <span style={{ display: "block", fontWeight: "800", fontSize: "14px", textDecoration: `${g?.deco ?? ""}` } as React.CSSProperties}>
                          {I(g?.name)}
                        </span>
                        <span style={{ fontSize: "12px", opacity: ".85" }}>
                          {I(g?.place)}{" · "}{I(g?.staff)}
                        </span>
                      </span>
                      {" "}
                    </button>
                    {" "}
                  </Fragment>
                ))}
                {" "}
                {$v.agendaEmpty ? (
                  <>
                    <p style={{ padding: "20px 0", margin: "0", color: "var(--color-neutral-700)" }}>
                      No visits on this day.
                    </p>
                  </>
                ) : null}
                {" "}
              </div>
              {" "}
            </>
          ) : null}
          {" "}
          {$v.isDesktop ? (
            <>
              {" "}
              <div style={{ overflowX: "auto", borderTop: "2px solid var(--color-text)" }}>
                {" "}
                <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${$v.colCount ?? ""},minmax(140px,1fr))`, minWidth: `${$v.gridMin ?? ""}` } as React.CSSProperties}>
                  {" "}
                  <div style={{ borderBottom: "2px solid var(--color-divider)" }}></div>
                  {" "}
                  {L($v.cols).map((c: any, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ padding: "10px 10px", borderBottom: "2px solid var(--color-divider)", borderLeft: "1px solid var(--color-divider)", background: `${c?.headBg ?? ""}` } as React.CSSProperties}>
                        <div style={{ fontWeight: "800", fontSize: "14px" }}>
                          {I(c?.title)}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                          {I(c?.sub)}
                        </div>
                      </div>
                    </Fragment>
                  ))}
                  {" "}
                  <div style={{ position: "relative", height: "660px" }}>
                    {" "}
                    {L($v.hours).map((h: any, $index: number) => (
                      <Fragment key={$index}>
                        <div style={{ position: "absolute", top: `${h?.top ?? ""}`, left: "0", right: "8px", fontSize: "11px", color: "var(--color-neutral-700)", textAlign: "right", transform: "translateY(-7px)" } as React.CSSProperties}>
                          {I(h?.label)}
                        </div>
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                  {L($v.cols).map((c: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <div style={{ position: "relative", height: "660px", borderLeft: "1px solid var(--color-divider)", background: `${c?.bodyBg ?? ""}` } as React.CSSProperties}>
                        {" "}
                        {L($v.hours).map((h: any, $index: number) => (
                          <Fragment key={$index}>
                            <div style={{ position: "absolute", top: `${h?.top ?? ""}`, left: "0", right: "0", borderTop: "1px solid var(--color-neutral-300)" } as React.CSSProperties}></div>
                          </Fragment>
                        ))}
                        {" "}
                        {c?.showNow ? (
                          <>
                            <div style={{ position: "absolute", top: `${$v.nowTop ?? ""}`, left: "0", right: "0", borderTop: "2px solid var(--color-accent)", zIndex: "2" } as React.CSSProperties}></div>
                          </>
                        ) : null}
                        {" "}
                        {L(c?.items).map((b: any, $index: number) => (
                          <Fragment key={$index}>
                            {" "}
                            <button onClick={b?.open} style={{ position: "absolute", top: `${b?.top ?? ""}`, height: `${b?.h ?? ""}`, left: "4px", right: "4px", zIndex: "3", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "1px", padding: "6px 8px", background: `${b?.bg ?? ""}`, color: `${b?.fg ?? ""}`, border: `2px ${b?.bstyle ?? ""} ${b?.bd ?? ""}`, font: "inherit", textAlign: "left", cursor: "pointer", overflow: "hidden", boxShadow: `${b?.sel ?? ""}` } as React.CSSProperties}>
                              {" "}
                              <span style={{ fontWeight: "800", fontSize: "13px", textDecoration: `${b?.deco ?? ""}` } as React.CSSProperties}>
                                {I(b?.name)}
                              </span>
                              {" "}
                              <span style={{ fontSize: "11px", opacity: ".85" }}>
                                {I(b?.time)}{" · "}{I(b?.place)}
                              </span>
                              {" "}
                              <span style={{ fontSize: "11px", opacity: ".85" }}>
                                {I(b?.extra)}
                              </span>
                              {" "}
                            </button>
                            {" "}
                          </Fragment>
                        ))}
                        {" "}
                      </div>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                </div>
                {" "}
              </div>
              {" "}
            </>
          ) : null}
          {" "}
        </div>
        {" "}
        {$v.hasSel ? (
          <>
            {" "}
            {$v.isMobile ? (
              <>
                <div onClick={$v.close} style={{ position: "absolute", inset: "0", background: "color-mix(in srgb,var(--color-neutral-900) 50%,transparent)", zIndex: "20" }}></div>
              </>
            ) : null}
            {" "}
            <aside style={{ position: `${$v.panelPos ?? ""}`, right: "0", bottom: "0", left: `${$v.panelLeft ?? ""}`, top: `${$v.panelTop ?? ""}`, width: `${$v.panelW ?? ""}`, zIndex: "21", background: "var(--color-bg)", borderLeft: `${$v.panelBl ?? ""}`, borderTop: `${$v.panelBt ?? ""}`, padding: "20px", display: "flex", flexDirection: "column", gap: "16px", overflow: "auto", flex: "none", boxShadow: `${$v.panelSh ?? ""}` } as React.CSSProperties}>
              {" "}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {" "}
                <span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: ".06em", textTransform: "uppercase", padding: "3px 7px", background: `${$v.sel?.bg ?? ""}`, color: `${$v.sel?.fg ?? ""}`, border: `2px ${$v.sel?.bstyle ?? ""} ${$v.sel?.bd ?? ""}` } as React.CSSProperties}>
                  {I($v.sel?.status)}
                </span>
                {" "}
                <button className="btn btn-icon" onClick={$v.close} aria-label="Close" style={{ width: "32px", height: "32px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2" }}>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
                {" "}
              </div>
              {" "}
              <div>
                {" "}
                <div style={{ fontWeight: "800", fontSize: "24px", lineHeight: "1.15" }}>
                  {I($v.sel?.name)}
                </div>
                {" "}
                <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
                  {I($v.sel?.phone)}
                </div>
                {" "}
              </div>
              {" "}
              <div style={{ borderTop: "2px solid var(--color-text)" }}>
                {" "}
                {L($v.selRows).map((r: any, $index: number) => (
                  <Fragment key={$index}>
                    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "10px", padding: "9px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                      <span style={{ color: "var(--color-neutral-700)" }}>
                        {I(r?.k)}
                      </span>
                      <span style={{ fontWeight: "600" }}>
                        {I(r?.v)}
                      </span>
                    </div>
                  </Fragment>
                ))}
                {" "}
              </div>
              {" "}
              {$v.resched ? (
                <>
                  {" "}
                  <div style={{ background: "var(--color-surface)", padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {" "}
                    <div style={{ fontSize: "13px", fontWeight: "800" }}>
                      {"Pick a new slot for "}{I($v.sel?.staff)}
                    </div>
                    {" "}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      {" "}
                      {L($v.slots).map((sl: any, $index: number) => (
                        <Fragment key={$index}>
                          <button onClick={sl?.pick} className="btn btn-secondary" style={{ justifyContent: "flex-start", background: "var(--color-bg)" }}>
                            {I(sl?.label)}
                          </button>
                        </Fragment>
                      ))}
                      {" "}
                    </div>
                    {" "}
                    <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                      Maya will WhatsApp the new time and reset reminders.
                    </div>
                    {" "}
                  </div>
                  {" "}
                </>
              ) : null}
              {" "}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {" "}
                {$v.canAct ? (
                  <>
                    {" "}
                    <button className="btn btn-primary" onClick={$v.markVisited} style={{ justifyContent: "flex-start" }}>
                      Mark visited
                    </button>
                    {" "}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      {" "}
                      <button className="btn btn-secondary" onClick={$v.toggleResched} style={{ justifyContent: "flex-start" }}>
                        Reschedule
                      </button>
                      {" "}
                      <button className="btn btn-secondary" onClick={$v.markNoShow} style={{ justifyContent: "flex-start" }}>
                        Mark no-show
                      </button>
                      {" "}
                    </div>
                    {" "}
                    <button className="btn btn-ghost" onClick={$v.cancel} style={{ alignSelf: "flex-start", paddingLeft: "0" }}>
                      Cancel booking
                    </button>
                    {" "}
                  </>
                ) : null}
                {" "}
                {$v.isDone ? (
                  <>
                    <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
                      {I($v.doneNote)}
                    </div>
                    <button className="btn btn-secondary" onClick={$v.undo} style={{ alignSelf: "flex-start" }}>
                      Undo
                    </button>
                  </>
                ) : null}
                {" "}
              </div>
              {" "}
            </aside>
            {" "}
          </>
        ) : null}
        {" "}
        {$v.hasToast ? (
          <>
            <div style={{ position: "absolute", left: "16px", bottom: "16px", zIndex: "30", background: "var(--color-text)", color: "var(--color-bg)", padding: "12px 16px", fontSize: "14px", fontWeight: "600" }}>
              {I($v.toast)}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

const PakkaCalendar = createDC("Pakka Calendar", PakkaCalendarLogic, renderPakkaCalendar);
export default PakkaCalendar;

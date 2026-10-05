/* eslint-disable */
// @ts-nocheck: TEMPORARY typing boundary. Ported prototype code written for `strict: false`;
// typing it is a follow-up (docs/frontend-architecture-map.md, "TypeScript").
"use client";
// Ported from the "Pakka App First Round" design. Logic and mock data are kept as authored;
// the markup is the original template expressed as JSX.

import React, { Fragment } from "react";
import { DCLogic, createDC, I, L, css } from "@/components/dashboard/runtime";
import { STAGES, LEADS, OWNERS, RE_TIMELINE } from "@/fixtures/dashboard/leads";
import { PAKKA_IND } from "@/fixtures/dashboard/industries";


/** Editable props declared by the original component (editor metadata, kept for reference). */
export const PakkaLeadsProps = {"industry":{"editor":"enum","options":["re","salon","int","hotel","rest"],"default":"re"},"isMobile":{"editor":"boolean","default":false},"firstDay":{"editor":"boolean","default":false},"onOpenChat":{"editor":null,"tsType":"(id:string)=&gt;void"}} as const;

const IX=k=>(k&&k!=='re'&&PAKKA_IND&&PAKKA_IND[k])||null;

function badge(s){if(s>=70)return{label:'Hot',bg:'var(--color-accent-600)',fg:'#fff'};if(s>=40)return{label:'Warm',bg:'var(--color-accent-200)',fg:'var(--color-accent-800)'};return{label:'Cold',bg:'var(--color-neutral-300)',fg:'var(--color-neutral-800)'};}
function timeline(l,X){
  const st=X?X.leads.stages:STAGES,i=st.indexOf(l.stage),T=X?X.leads:RE_TIMELINE;
  const base: any=[{when:'Thu 22 Oct\n6:12 pm',kind:'Enquiry',text:'First WhatsApp message from '+l.name+' via '+l.source+'.',dot:'var(--color-bg)',dotBd:'var(--color-text)'},
   {when:'Thu 22 Oct\n6:14 pm',kind:'Maya',text:'Asked the qualifying questions. Score set to '+l.score+'.',dot:'var(--color-bg)',dotBd:'var(--color-text)'}];
  if(i>=3&&i<=5)base.push({when:'Fri 23 Oct\n9:25 am',kind:'Booking',text:T.booked,dot:'var(--color-text)',dotBd:'var(--color-text)'},{when:'Fri 23 Oct\n9:25 am',kind:'Alert',text:l.owner+' got a WhatsApp alert with the lead card.',dot:'var(--color-bg)',dotBd:'var(--color-text)'});
  if(l.id===T.handoverId)base.push({when:'Today\n9:42 am',kind:'Handover',text:T.handover,dot:'var(--color-accent)',dotBd:'var(--color-accent)'});
  if(i===4||i===5)base.push({when:'Tue 20 Oct\n12:10 pm',kind:st[4],text:T.visited,dot:'var(--color-text)',dotBd:'var(--color-text)'});
  if(i===5)base.push({when:'Sun 18 Oct',kind:st[5],text:T.won,dot:'var(--color-accent)',dotBd:'var(--color-accent)'});
  if(i===6)base.push({when:'Fri 23 Oct',kind:'Lost',text:T.lost,dot:'var(--color-neutral-400)',dotBd:'var(--color-neutral-400)'});
  return base.map(t=>({...t,kindColor:t.kind==='Handover'||t.kind===st[5]?'var(--color-accent-700)':'var(--color-neutral-700)'}));
}
class PakkaLeadsLogic extends DCLogic {
  state: any = {sel:null,score:'all',src:'all',over:{}};
  componentDidMount(){if(!PAKKA_IND){this._rd=()=>this.forceUpdate();window.addEventListener('pakka-ind-ready',this._rd);}}
  componentWillUnmount(){this._rd&&window.removeEventListener('pakka-ind-ready',this._rd);}
  renderVals(){
    const s=this.state,P=this.props,m=!!P.isMobile;
    const X=IX(P.industry),STG=X?X.leads.stages:STAGES,OWN=X?X.leads.owners:OWNERS;
    const leads=(X?X.leads.list:LEADS).map(l=>({...l,...(s.over[l.id]||{})}));
    const srcs: any=[...new Set(leads.map(x=>x.source))];const src=srcs.includes(s.src)?s.src:'all';
    const fl=leads.filter(l=>s.score==='all'||badge(l.score).label.toLowerCase()===s.score).filter(l=>src==='all'||l.source===src);
    const empty=!!P.firstDay;
    const columns=STG.map(st=>{const cards=empty?[]:fl.filter(l=>l.stage===st).map(l=>({...l,...badge(l.score),open:()=>this.setState({sel:l.id})}));return{name:st,count:cards.length,cards,isEmpty:!cards.length};});
    const l=leads.find(x=>x.id===s.sel);
    const set=(k,v)=>this.setState(st=>({over:{...st.over,[l.id]:{...(st.over[l.id]||{}),[k]:v}}}));
    const side=m?'16px':'40px';
    return{
      isBoard:!l,isDetail:!!l,empty,hasLeads:!empty,
      padTop:m?'20px 16px 12px':'32px 40px 16px',padSide:`8px ${side}`,sideOnly:side,h1:m?'30px':'42px',colW:m?'260px':'232px',
      subline:empty?'Day one':`${leads.filter(x=>![STG[5],STG[6]].includes(x.stage)).length} open · ${leads.filter(x=>x.score>=70&&x.stage!==STG[5]).length} hot`,
      scoreFilters:[['all','All'],['hot','Hot'],['warm','Warm'],['cold','Cold']].map(([k,lb])=>({label:lb,pick:()=>this.setState({score:k}),bg:s.score===k?'var(--color-text)':'transparent',fg:s.score===k?'var(--color-bg)':'var(--color-text)',bd:s.score===k?'var(--color-text)':'var(--color-divider)'})),
      columns,src,onSrc:e=>this.setState({src:e.target.value}),srcOpts:[{v:'all',l:'All sources'},...srcs.map(x=>({v:x,l:`${x} · ${leads.filter(y=>y.source===x).length}`}))],
      lead:l?{...l,...badge(l.score)}:{},back:()=>this.setState({sel:null}),openChat:()=>P.onOpenChat&&P.onOpenChat(l.id),
      stageSteps:l?STG.map(st=>{const on=st===l.stage,lost=st===STG[6];return{name:st,pick:()=>set('stage',st),bg:on?(lost?'var(--color-neutral-700)':'var(--color-accent)'):'transparent',fg:on?'#fff':'var(--color-text)'};}):[],
      stageFs:m?'10px':'13px',detailCols:m?'minmax(0,1fr)':'minmax(0,1fr) minmax(0,1fr)',
      fields:l?[['Need',l.need],...l.fields].map(([k,v])=>({k,v})):[],
      owners:l?OWN.map(([n,ini])=>({name:n,ini,pick:()=>set('owner',n),bd:l.owner===n?'var(--color-text)':'var(--color-divider)',bg:l.owner===n?'var(--color-surface)':'transparent'})):[],
      timeline:l?timeline(l,X):[],
    };
  }
}

function renderPakkaLeads($v: any) {
  return (
    <>
      <div data-screen-label="05 Leads" style={{ display: "flex", flexDirection: "column", minHeight: "100%", color: "var(--color-text)", fontFamily: "var(--font-body)" }}>
        {$v.isBoard ? (
          <>
            {" "}
            <div style={{ padding: `${$v.padTop ?? ""}`, display: "flex", flexDirection: "column", gap: "14px" } as React.CSSProperties}>
              {" "}
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                {" "}
                <div>
                  <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
                    Leads
                  </h1>
                  <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)" }}>
                    {I($v.subline)}
                  </p>
                </div>
                {" "}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                  {" "}
                  <select className="input" value={$v.src ?? ""} onChange={$v.onSrc} aria-label="Source" style={{ width: "auto", minHeight: "34px", fontSize: "13px", padding: "4px 8px" }}>
                    {L($v.srcOpts).map((so: any, $index: number) => (
                      <Fragment key={$index}>
                        <option value={so?.v ?? ""}>
                          {I(so?.l)}
                        </option>
                      </Fragment>
                    ))}
                  </select>
                  {" "}
                  {L($v.scoreFilters).map((sf: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <button onClick={sf?.pick} style={{ border: `1px solid ${sf?.bd ?? ""}`, background: `${sf?.bg ?? ""}`, color: `${sf?.fg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "600", padding: "6px 12px", cursor: "pointer" } as React.CSSProperties}>
                        {I(sf?.label)}
                      </button>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                </div>
                {" "}
              </div>
              {" "}
            </div>
            {" "}
            {$v.empty ? (
              <>
                {" "}
                <div style={{ padding: `${$v.padSide ?? ""}`, display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", maxWidth: "480px" } as React.CSSProperties}>
                  {" "}
                  <div style={{ width: "48px", height: "48px", border: "2px solid var(--color-text)", display: "grid", placeItems: "center" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2" }}>
                      <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 3v18 M15 3v18" />
                    </svg>
                  </div>
                  {" "}
                  <h3 style={{ margin: "0", fontSize: "20px" }}>
                    No leads yet
                  </h3>
                  {" "}
                  <p style={{ margin: "0", color: "var(--color-neutral-700)", fontSize: "14px" }}>
                    Every new WhatsApp enquiry becomes a lead here. Maya fills in their details and moves them along as they reply.
                  </p>
                  {" "}
                </div>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.hasLeads ? (
              <>
                {" "}
                <div style={{ flex: "1", overflowX: "auto", padding: `4px ${$v.sideOnly ?? ""} 32px` } as React.CSSProperties}>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(7,${$v.colW ?? ""})`, gap: "2px", background: "var(--color-divider)", borderTop: "2px solid var(--color-text)", minHeight: "420px", width: "max-content" } as React.CSSProperties}>
                    {" "}
                    {L($v.columns).map((col: any, $index: number) => (
                      <Fragment key={$index}>
                        {" "}
                        <div style={{ background: "var(--color-bg)", display: "flex", flexDirection: "column", gap: "8px", padding: "12px 10px 16px" }}>
                          {" "}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 2px 6px" }}>
                            {" "}
                            <span style={{ fontSize: "12px", fontWeight: "800", letterSpacing: ".08em", textTransform: "uppercase" }}>
                              {I(col?.name)}
                            </span>
                            {" "}
                            <span style={{ fontSize: "13px", color: "var(--color-neutral-700)", fontWeight: "600" }}>
                              {I(col?.count)}
                            </span>
                            {" "}
                          </div>
                          {" "}
                          {L(col?.cards).map((l: any, $index: number) => (
                            <Fragment key={$index}>
                              {" "}
                              <button onClick={l?.open} className="hover:[box-shadow:inset_0_0_0_2px_var(--color-text)]!" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", padding: "12px", border: "0", background: "var(--color-surface)", color: "var(--color-text)", font: "inherit", cursor: "pointer" }}>
                                {" "}
                                <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                                  {" "}
                                  <span style={{ fontWeight: "800", fontSize: "15px" }}>
                                    {I(l?.name)}
                                  </span>
                                  {" "}
                                  <span style={{ fontSize: "10px", fontWeight: "800", padding: "2px 6px", background: `${l?.bg ?? ""}`, color: `${l?.fg ?? ""}`, whiteSpace: "nowrap" } as React.CSSProperties}>
                                    {I(l?.label)}{" "}{I(l?.score)}
                                  </span>
                                  {" "}
                                </span>
                                {" "}
                                <span style={{ fontSize: "13px", lineHeight: "1.35", color: "var(--color-neutral-800)" }}>
                                  {I(l?.need)}
                                </span>
                                {" "}
                                <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "11px", color: "var(--color-neutral-700)", borderTop: "1px solid var(--color-divider)", paddingTop: "6px", marginTop: "2px" }}>
                                  {" "}
                                  <span>
                                    {I(l?.source)}
                                  </span>
                                  <span style={{ fontWeight: "600" }}>
                                    {I(l?.owner)}
                                  </span>
                                  {" "}
                                </span>
                                {" "}
                              </button>
                              {" "}
                            </Fragment>
                          ))}
                          {" "}
                          {col?.isEmpty ? (
                            <>
                              <div style={{ fontSize: "12px", color: "var(--color-neutral-600)", padding: "8px 2px" }}>
                                Nothing here
                              </div>
                            </>
                          ) : null}
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
          </>
        ) : null}
        {$v.isDetail ? (
          <>
            {" "}
            <div style={{ padding: `${$v.padTop ?? ""}`, display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1100px" } as React.CSSProperties}>
              {" "}
              <button className="btn btn-ghost" onClick={$v.back} style={{ alignSelf: "flex-start", paddingLeft: "0" }}>
                ← All leads
              </button>
              {" "}
              <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                {" "}
                <span style={{ width: "64px", height: "64px", background: `${$v.lead?.bg ?? ""}`, color: `${$v.lead?.fg ?? ""}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: "1", flex: "none" } as React.CSSProperties}>
                  <span style={{ fontSize: "26px", fontWeight: "800" }}>
                    {I($v.lead?.score)}
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: "600", marginTop: "3px" }}>
                    {I($v.lead?.label)}
                  </span>
                </span>
                {" "}
                <div style={{ flex: "1", minWidth: "200px" }}>
                  {" "}
                  <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
                    {I($v.lead?.name)}
                  </h1>
                  {" "}
                  <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
                    {I($v.lead?.phone)}{" · "}{I($v.lead?.source)}
                  </div>
                  {" "}
                </div>
                {" "}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {" "}
                  <button className="btn btn-primary" onClick={$v.openChat}>
                    Open chat
                  </button>
                  {" "}
                </div>
                {" "}
              </div>
              {" "}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {" "}
                <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: "600", color: "var(--color-neutral-700)" }}>
                  Stage
                </div>
                {" "}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", border: "2px solid var(--color-text)", overflowX: "auto" }}>
                  {" "}
                  {L($v.stageSteps).map((sg: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <button onClick={sg?.pick} style={{ padding: "9px 4px", border: "0", borderRight: "1px solid var(--color-divider)", background: `${sg?.bg ?? ""}`, color: `${sg?.fg ?? ""}`, font: "inherit", fontSize: `${$v.stageFs ?? ""}`, fontWeight: "800", cursor: "pointer", minWidth: "0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as React.CSSProperties}>
                        {I(sg?.name)}
                      </button>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                </div>
                {" "}
              </div>
              {" "}
              <div style={{ display: "grid", gridTemplateColumns: `${$v.detailCols ?? ""}`, gap: "32px" } as React.CSSProperties}>
                {" "}
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {" "}
                  <section>
                    {" "}
                    <h2 style={{ margin: "0 0 4px", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                      Details
                    </h2>
                    {" "}
                    {L($v.fields).map((fd: any, $index: number) => (
                      <Fragment key={$index}>
                        {" "}
                        <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0,1fr)", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                          {" "}
                          <span style={{ color: "var(--color-neutral-700)" }}>
                            {I(fd?.k)}
                          </span>
                          <span style={{ fontWeight: "600" }}>
                            {I(fd?.v)}
                          </span>
                          {" "}
                        </div>
                        {" "}
                      </Fragment>
                    ))}
                    {" "}
                  </section>
                  {" "}
                  <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {" "}
                    <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                      Owner
                    </h2>
                    {" "}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {" "}
                      {L($v.owners).map((o: any, $index: number) => (
                        <Fragment key={$index}>
                          <button onClick={o?.pick} style={{ display: "flex", alignItems: "center", gap: "8px", border: `2px solid ${o?.bd ?? ""}`, background: `${o?.bg ?? ""}`, color: "var(--color-text)", font: "inherit", fontSize: "14px", fontWeight: "600", padding: "6px 12px 6px 6px", cursor: "pointer" } as React.CSSProperties}>
                            <span style={{ width: "26px", height: "26px", background: "var(--color-neutral-300)", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "800" }}>
                              {I(o?.ini)}
                            </span>
                            {I(o?.name)}
                          </button>
                        </Fragment>
                      ))}
                      {" "}
                    </div>
                    {" "}
                  </section>
                  {" "}
                  <section style={{ background: "var(--color-surface)", padding: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {" "}
                    <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: "600", color: "var(--color-neutral-700)" }}>
                      AI summary
                    </div>
                    {" "}
                    <div style={{ fontSize: "14px", lineHeight: "1.5" }}>
                      {I($v.lead?.summary)}
                    </div>
                    {" "}
                  </section>
                  {" "}
                </div>
                {" "}
                <section>
                  {" "}
                  <h2 style={{ margin: "0 0 4px", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Timeline
                  </h2>
                  {" "}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {" "}
                    {L($v.timeline).map((t: any, $index: number) => (
                      <Fragment key={$index}>
                        {" "}
                        <div style={{ display: "grid", gridTemplateColumns: "72px 14px minmax(0,1fr)", gap: "10px", padding: "12px 0", borderBottom: "1px solid var(--color-divider)" }}>
                          {" "}
                          <span style={{ fontSize: "12px", color: "var(--color-neutral-700)", lineHeight: "1.3" }}>
                            {I(t?.when)}
                          </span>
                          {" "}
                          <span style={{ width: "10px", height: "10px", marginTop: "4px", background: `${t?.dot ?? ""}`, border: `2px solid ${t?.dotBd ?? ""}`, display: "block" } as React.CSSProperties}></span>
                          {" "}
                          <span style={{ minWidth: "0" }}>
                            <span style={{ display: "block", fontSize: "12px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", color: `${t?.kindColor ?? ""}` } as React.CSSProperties}>
                              {I(t?.kind)}
                            </span>
                            <span style={{ fontSize: "14px", lineHeight: "1.45" }}>
                              {I(t?.text)}
                            </span>
                          </span>
                          {" "}
                        </div>
                        {" "}
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
              </div>
              {" "}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

const PakkaLeads = createDC("Pakka Leads", PakkaLeadsLogic, renderPakkaLeads);
export default PakkaLeads;

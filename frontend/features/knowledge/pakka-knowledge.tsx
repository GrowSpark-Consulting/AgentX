/* eslint-disable */
// @ts-nocheck: TEMPORARY typing boundary. Ported prototype code written for `strict: false`;
// typing it is a follow-up (docs/frontend-architecture-map.md, "TypeScript").
"use client";
// Ported from the "Pakka App First Round" design. Logic and mock data are kept as authored;
// the markup is the original template expressed as JSX.

import React, { Fragment } from "react";
import { DCLogic, createDC, I, L, css } from "@/components/dashboard/runtime";
import { GAPS, FAQS } from "@/fixtures/dashboard/knowledge";
import { PAKKA_IND } from "@/fixtures/dashboard/industries";


/** Editable props declared by the original component (editor metadata, kept for reference). */
export const PakkaKnowledgeProps = {"industry":{"editor":"enum","options":["re","salon","int","hotel","rest"],"default":"re"},"isMobile":{"editor":"boolean","default":false},"firstDay":{"editor":"boolean","default":false}} as const;

const IX=k=>(k&&k!=='re'&&PAKKA_IND&&PAKKA_IND[k])||null;
class PakkaKnowledgeLogic extends DCLogic {
  state: any = {editing:null,draft:'',done:{},added:[],open:{0:true},toast:null};
  componentDidMount(){if(!PAKKA_IND){this._rd=()=>this.forceUpdate();window.addEventListener('pakka-ind-ready',this._rd);}}
  flash(t){clearTimeout(this.tt);this.setState({toast:t});this.tt=setTimeout(()=>this.setState({toast:null}),2600);}
  componentWillUnmount(){clearTimeout(this.tt);this._rd&&window.removeEventListener('pakka-ind-ready',this._rd);}
  renderVals(){
    const s=this.state,m=!!this.props.isMobile,empty=!!this.props.firstDay,X=IX(this.props.industry),KB=X?X.kb:null,site=KB?KB.site:'skylinehomes.in',cols=KB?KB.cols:['Project','Area','Homes','Price range','Status'];
    const gaps=(KB?KB.gaps:GAPS).filter(g=>!s.done[g.id]).map(g=>({...g,editing:s.editing===g.id,closed:s.editing!==g.id,open:()=>this.setState({editing:g.id,draft:''}),
      save:()=>{const a=s.draft.trim();if(!a)return;this.setState(st=>({done:{...st.done,[g.id]:true},added:[{q:g.q,a,isNew:true},...st.added],editing:null,draft:'',open:{...st.open,['n0']:true}}));this.flash('Saved. Maya will use this answer from now.');}}));
    const all: any=[...s.added.map((f,i)=>({...f,key:'n'+i})),...(KB?KB.faqs:FAQS).map((f,i)=>({...f,key:i}))];
    return{
      pad:m?'20px 16px 40px':'32px 40px 56px',h1:m?'30px':'42px',empty,hasData:!empty,
      gaps,gapCount:gaps.length,noGaps:!gaps.length,draft:s.draft,onDraft:e=>this.setState({draft:e.target.value}),closeEdit:()=>this.setState({editing:null}),
      site,importWhat:KB?KB.importWhat:'projects, prices and common questions',svcTitle:KB?KB.title:'Projects & prices',c0:cols[0],c1:cols[1],c2:cols[2],c3:cols[3],c4:cols[4],
      services:(KB?KB.services:[['Skyline Aster','Velachery','3BHK · 1,420–1,610 sq ft','₹88 L – ₹1.02 Cr','Ready to move'],['Skyline Meadows','OMR','2BHK · 1,050 sq ft; 3BHK · 1,380 sq ft','₹62 L – ₹1.1 Cr','Possession Jun 2026'],['Skyline Greens','Porur','2BHK · 980 sq ft; 3BHK · 1,320 sq ft','₹70 – 96 L','Possession Mar 2027'],['Greens Villas','Porur','4BHK villa · 2,400 sq ft','₹1.6 – 1.9 Cr','Possession Mar 2027']]).map(([name,area,type,price,status])=>({name,area,type,price,status})),
      faqs:all.map(f=>({...f,isNew:!!f.isNew,open:!!s.open[f.key],sign:s.open[f.key]?'−':'+',toggle:()=>this.setState(st=>({open:{...st.open,[f.key]:!st.open[f.key]}}))})),faqCount:all.length,
      docs:(KB?KB.docs:[['PDF','Skyline Aster brochure.pdf','14 pages · sent 62 times'],['PDF','Meadows floor plans.pdf','8 pages · sent 41 times'],['PDF','Greens Villas.pdf','12 pages · sent 9 times'],['XLS','Price list Oct 2026.xlsx','Updated 1 Oct · not sent to customers'],['JPG','Aster site map.jpg','Sent with 2-hour reminders']]).map(([ext,name,meta])=>({ext,name,meta})),
      resync:()=>this.flash('Checking '+site+' for changes…'),
      hasToast:!!s.toast,toast:s.toast,
    };
  }
}

function renderPakkaKnowledge($v: any) {
  return (
    <>
      <div data-screen-label="09 Knowledge base" style={{ position: "relative", padding: `${$v.pad ?? ""}`, display: "flex", flexDirection: "column", gap: "36px", maxWidth: "1040px", color: "var(--color-text)", fontFamily: "var(--font-body)" } as React.CSSProperties}>
        {" "}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
          {" "}
          <div>
            <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
              Knowledge base
            </h1>
            <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)" }}>
              {"Maya only answers from what’s here. Last synced from "}{I($v.site)}{" on 20 Oct."}
            </p>
          </div>
          {" "}
          <button className="btn btn-secondary" onClick={$v.resync}>
            Sync website again
          </button>
          {" "}
        </div>
        {" "}
        {$v.empty ? (
          <>
            {" "}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", maxWidth: "520px" }}>
              {" "}
              <div style={{ width: "48px", height: "48px", border: "2px solid var(--color-text)", display: "grid", placeItems: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2" }}>
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              {" "}
              <h3 style={{ margin: "0", fontSize: "20px" }}>
                Teach Maya about your business
              </h3>
              {" "}
              <p style={{ margin: "0", color: "var(--color-neutral-700)", fontSize: "14px" }}>
                {"Paste your website or Google profile and we’ll pull in "}{I($v.importWhat)}{" for you to check."}
              </p>
              {" "}
              <div style={{ display: "flex", gap: "8px", width: "100%", flexWrap: "wrap" }}>
                <input className="input" placeholder={$v.site} style={{ flex: "1", minWidth: "200px", minHeight: "40px" }} />
                <button className="btn btn-primary">
                  Import
                </button>
              </div>
              {" "}
              <button className="btn btn-ghost" style={{ paddingLeft: "0" }}>
                Or upload a brochure or price list
              </button>
              {" "}
            </div>
            {" "}
          </>
        ) : null}
        {" "}
        {$v.hasData ? (
          <>
            {" "}
            <section style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {" "}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-accent)", paddingBottom: "8px", gap: "12px", flexWrap: "wrap" }}>
                {" "}
                <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
                  {"Questions Maya couldn’t answer · "}{I($v.gapCount)}
                </h2>
                {" "}
                <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                  Answer once, Maya uses it forever
                </span>
                {" "}
              </div>
              {" "}
              {$v.noGaps ? (
                <>
                  <p style={{ padding: "16px 0", margin: "0", color: "var(--color-neutral-700)" }}>
                    All caught up. Nothing new this week.
                  </p>
                </>
              ) : null}
              {" "}
              {L($v.gaps).map((g: any, $index: number) => (
                <Fragment key={$index}>
                  {" "}
                  <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: "10px" }}>
                    {" "}
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "12px", alignItems: "center" }}>
                      {" "}
                      <div>
                        <div style={{ fontWeight: "600", fontSize: "15px" }}>
                          {"“"}{I(g?.q)}{"”"}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                          {"Asked "}{I(g?.times)}{" · last by "}{I(g?.who)}
                        </div>
                      </div>
                      {" "}
                      {g?.closed ? (
                        <>
                          <button className="btn btn-secondary" onClick={g?.open}>
                            Add answer
                          </button>
                        </>
                      ) : null}
                      {" "}
                    </div>
                    {" "}
                    {g?.editing ? (
                      <>
                        {" "}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {" "}
                          <textarea className="input" placeholder="Type the answer the way you’d say it to a customer" value={$v.draft ?? ""} onChange={$v.onDraft} style={{ minHeight: "80px" }} />
                          {" "}
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button className="btn btn-primary" onClick={g?.save}>
                              Save answer
                            </button>
                            <button className="btn btn-secondary" onClick={$v.closeEdit}>
                              Cancel
                            </button>
                          </div>
                          {" "}
                        </div>
                        {" "}
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
            <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {" "}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                {" "}
                <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                  {I($v.svcTitle)}
                </h2>
                {" "}
                <button className="btn btn-ghost">
                  Add
                </button>
                {" "}
              </div>
              {" "}
              <div style={{ overflowX: "auto" }}>
                {" "}
                <table className="table" style={{ minWidth: "560px" }}>
                  {" "}
                  <thead>
                    <tr>
                      <th>
                        {I($v.c0)}
                      </th>
                      <th>
                        {I($v.c1)}
                      </th>
                      <th>
                        {I($v.c2)}
                      </th>
                      <th>
                        {I($v.c3)}
                      </th>
                      <th>
                        {I($v.c4)}
                      </th>
                    </tr>
                  </thead>
                  {" "}
                  <tbody>
                    {" "}
                    {L($v.services).map((sv: any, $index: number) => (
                      <Fragment key={$index}>
                        <tr>
                          <td style={{ fontWeight: "600" }}>
                            {I(sv?.name)}
                          </td>
                          <td>
                            {I(sv?.area)}
                          </td>
                          <td>
                            {I(sv?.type)}
                          </td>
                          <td style={{ fontWeight: "600" }}>
                            {I(sv?.price)}
                          </td>
                          <td>
                            <span style={{ fontSize: "11px", fontWeight: "600", padding: "3px 8px", border: "1px solid var(--color-text)" }}>
                              {I(sv?.status)}
                            </span>
                          </td>
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
            <section style={{ display: "flex", flexDirection: "column" }}>
              {" "}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                {" "}
                <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                  {"FAQs · "}{I($v.faqCount)}
                </h2>
                {" "}
                <button className="btn btn-ghost">
                  Add
                </button>
                {" "}
              </div>
              {" "}
              {L($v.faqs).map((f: any, $index: number) => (
                <Fragment key={$index}>
                  {" "}
                  <div style={{ borderBottom: "1px solid var(--color-divider)" }}>
                    {" "}
                    <button onClick={f?.toggle} style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", padding: "14px 0", border: "0", background: "transparent", color: "var(--color-text)", font: "inherit", fontSize: "15px", fontWeight: "600", textAlign: "left", cursor: "pointer" }}>
                      {" "}
                      <span style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        {I(f?.q)}
                        {f?.isNew ? (
                          <>
                            <span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: ".06em", textTransform: "uppercase", padding: "2px 6px", background: "var(--color-accent)", color: "#fff" }}>
                              New
                            </span>
                          </>
                        ) : null}
                      </span>
                      {" "}
                      <span style={{ fontSize: "20px", fontWeight: "400", lineHeight: "1" }}>
                        {I(f?.sign)}
                      </span>
                      {" "}
                    </button>
                    {" "}
                    {f?.open ? (
                      <>
                        <p style={{ margin: "0 0 14px", fontSize: "14px", color: "var(--color-neutral-800)", maxWidth: "720px" }}>
                          {I(f?.a)}
                        </p>
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
            <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {" "}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                {" "}
                <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                  Documents Maya can send
                </h2>
                {" "}
                <button className="btn btn-ghost">
                  Upload
                </button>
                {" "}
              </div>
              {" "}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "12px" }}>
                {" "}
                {L($v.docs).map((d: any, $index: number) => (
                  <Fragment key={$index}>
                    {" "}
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", padding: "14px", background: "var(--color-surface)" }}>
                      {" "}
                      <span style={{ width: "36px", height: "44px", background: "var(--color-text)", color: "var(--color-bg)", fontSize: "10px", fontWeight: "800", display: "grid", placeItems: "center", flex: "none" }}>
                        {I(d?.ext)}
                      </span>
                      {" "}
                      <span style={{ minWidth: "0" }}>
                        <span style={{ display: "block", fontWeight: "600", fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {I(d?.name)}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                          {I(d?.meta)}
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
          </>
        ) : null}
        {" "}
        {$v.hasToast ? (
          <>
            <div style={{ position: "fixed", left: "16px", bottom: "16px", zIndex: "30", background: "var(--color-text)", color: "var(--color-bg)", padding: "12px 16px", fontSize: "14px", fontWeight: "600" }}>
              {I($v.toast)}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

const PakkaKnowledge = createDC("Pakka Knowledge", PakkaKnowledgeLogic, renderPakkaKnowledge);
export default PakkaKnowledge;

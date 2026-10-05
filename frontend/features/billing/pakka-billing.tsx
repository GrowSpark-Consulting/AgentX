/* eslint-disable */
// @ts-nocheck: TEMPORARY typing boundary. Ported prototype code written for `strict: false`;
// typing it is a follow-up (docs/frontend-architecture-map.md, "TypeScript").
"use client";
// Ported from the "Pakka App First Round" design. Logic and mock data are kept as authored;
// the markup is the original template expressed as JSX.

import React, { Fragment } from "react";
import { DCLogic, createDC, I, L, css } from "@/components/dashboard/runtime";
import { PLANS, USE } from "@/fixtures/dashboard/billing";


/** Editable props declared by the original component (editor metadata, kept for reference). */
export const PakkaBillingProps = {"isMobile":{"editor":"boolean","default":false},"plan":{"editor":"enum","options":["starter","growth","pro"],"default":"growth"},"creditsLeft":{"editor":"int","default":1840},"creditsTotal":{"editor":"int","default":3000},"trial":{"editor":"boolean","default":false},"onTopup":{"editor":null,"tsType":"()=&gt;void"},"onChangePlan":{"editor":null,"tsType":"(plan:string)=&gt;void"}} as const;

const fmt=n=>Number(n).toLocaleString('en-IN');
class PakkaBillingLogic extends DCLogic {
  state: any = {cycle:'monthly',yearlyOn:false,setup:false};
  renderVals(){
    const P=this.props,m=!!P.isMobile,s=this.state,yr=s.cycle==='yearly';
    const plan=Math.max(0,['starter','growth','pro'].indexOf(P.plan||'growth'));
    const left=P.creditsLeft??1840,total=P.creditsTotal??3000,trial=!!P.trial;
    const used=USE.reduce((a:any,b:any)=>a+b,0);
    const max=180;
    const bars=Array.from({length:31},(_,i)=>{const v=USE[i];const dow=(i+4)%7;const wk=dow===5||dow===6;
      return{h:((v??110)/max*100)+'%',bg:v==null?'var(--color-neutral-300)':wk?'var(--color-accent)':'var(--color-text)',tip:`${i+1} Oct: ${v??'~110 (forecast)'}`,lbl:(i===0||(i+1)%7===0)?String(i+1):''};});
    return{
      pad:m?'20px 16px 40px':'32px 40px 56px',h1:m?'30px':'42px',
      topCols:m?'repeat(2,minmax(0,1fr))':'repeat(4,minmax(0,1fr))',splitCols:m?'minmax(0,1fr)':'minmax(0,3fr) minmax(0,2fr)',planCols:m?'minmax(0,1fr)':'repeat(3,minmax(0,1fr))',
      planName:trial?'Free trial':PLANS[plan].name,planLine:trial?'Growth features · ends Wed 28 Oct':`₹${fmt(PLANS[plan].price)}/month · since 8 Sep 2026`,
      leftFmt:fmt(left),totalFmt:fmt(total),usedFmt:fmt(used),leftColor:left/total<=0.2?'var(--color-accent-700)':'var(--color-text)',
      nextBill:fmt(PLANS[plan].price),peak:Math.max(...USE),
      topup:()=>P.onTopup&&P.onTopup(),bars,
      history:[['24 Oct','AI replies · 38 chats','−112','1,840'],['24 Oct','Reminders · 4 visits','−8','1,952'],['23 Oct','Staff alerts · 9','−9','1,960'],['23 Oct','Feedback requests · 3','−6','1,969'],['23 Oct','AI replies · 41 chats','−118','1,975'],['22 Oct','Top-up pack','+500','2,093'],['1 Oct','Growth plan credits','+3,000','3,000']].map(([d,w,c,b])=>({d,w,c,b,fw:c[0]==='+'?800:400})),
      packs:[[500,'₹1,199','About 33 leads','₹2.40 a credit'],[1000,'₹2,398','About 65 leads','₹2.40 a credit'],[2000,'₹4,796','About 130 leads','₹2.40 a credit']].map(([c,p,l,per])=>({c:fmt(c),p,l,per})),
      setupItems:['We import your website, prices and FAQs','We connect your WhatsApp number with Meta','We add staff and connect Google Calendar','30-minute training for your team'],
      setMonthly:()=>this.setState({cycle:'monthly'}),setYearly:()=>this.setState({cycle:'yearly'}),
      moBg:yr?'transparent':'var(--color-text)',moFg:yr?'var(--color-text)':'var(--color-bg)',yrBg:yr?'var(--color-text)':'transparent',yrFg:yr?'var(--color-bg)':'var(--color-text)',
      switchYearly:()=>this.setState({yearlyOn:true}),renewLine:s.yearlyOn?'Moves to yearly on 1 Nov · ₹'+fmt(PLANS[plan].price*10):'Renews 1 Nov',
      setupOpen:!s.setup,setupDone:s.setup,bookSetup:()=>this.setState({setup:true}),
      plans:PLANS.map((p,i)=>({...p,price:'₹'+fmt(yr?Math.floor(p.price*10/12):p.price),billLine:yr?`Billed ₹${fmt(p.price*10)} a year · save ₹${fmt(p.price*2)}`:'Billed monthly · cancel anytime',billColor:yr?'var(--color-accent-700)':'var(--color-neutral-700)',save:'₹'+fmt(p.price*2),canYearly:!s.yearlyOn,noYearly:s.yearlyOn,credits:fmt(i===0?1000:p.credits),current:!trial&&i===plan,isUp:trial||i>plan,isDown:!trial&&i<plan,downLabel:`Switch to ${p.name} from 1 Nov`,bg:!trial&&i===plan?'var(--color-surface)':'var(--color-bg)',act:()=>P.onChangePlan&&P.onChangePlan(p.k)})),
      invoices:[['1 Oct 2026','INV-2610-0381','Growth plan · Oct','₹5,899'],['22 Oct 2026','INV-2610-0544','Top-up 500 credits','₹1,415'],['8 Sep 2026','INV-2609-0127','Growth plan · Sep (prorated)','₹4,524']].map(([d,n,f,a])=>({d,n,f,a})),
    };
  }
}

function renderPakkaBilling($v: any) {
  return (
    <>
      <div data-screen-label="10 Billing" style={{ padding: `${$v.pad ?? ""}`, display: "flex", flexDirection: "column", gap: "40px", maxWidth: "1120px", color: "var(--color-text)", fontFamily: "var(--font-body)" } as React.CSSProperties}>
        {" "}
        <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
          {"Billing & credits"}
        </h1>
        {" "}
        <section style={{ display: "grid", gridTemplateColumns: `${$v.topCols ?? ""}`, gap: "2px", background: "var(--color-divider)", borderTop: "2px solid var(--color-text)", borderBottom: "2px solid var(--color-divider)" } as React.CSSProperties}>
          {" "}
          <div style={{ background: "var(--color-bg)", padding: "18px 18px 18px 0", display: "flex", flexDirection: "column", gap: "6px" }}>
            {" "}
            <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
              Current plan
            </span>
            {" "}
            <span style={{ fontSize: "32px", fontWeight: "800", lineHeight: "1.05" }}>
              {I($v.planName)}
            </span>
            {" "}
            <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
              {I($v.planLine)}
            </span>
            {" "}
          </div>
          {" "}
          <div style={{ background: "var(--color-bg)", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {" "}
            <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
              Credits left
            </span>
            {" "}
            <span style={{ fontSize: "32px", fontWeight: "800", lineHeight: "1.05", color: `${$v.leftColor ?? ""}` } as React.CSSProperties}>
              {I($v.leftFmt)}
            </span>
            {" "}
            <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
              {"of "}{I($v.totalFmt)}{" · resets 1 Nov"}
            </span>
            {" "}
          </div>
          {" "}
          <div style={{ background: "var(--color-bg)", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {" "}
            <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
              Used this month
            </span>
            {" "}
            <span style={{ fontSize: "32px", fontWeight: "800", lineHeight: "1.05" }}>
              {I($v.usedFmt)}
            </span>
            {" "}
            <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
              ≈ 15 credits per lead
            </span>
            {" "}
          </div>
          {" "}
          <div style={{ background: "var(--color-bg)", padding: "18px", display: "flex", flexDirection: "column", gap: "8px", justifyContent: "center" }}>
            {" "}
            <button className="btn btn-primary" onClick={$v.topup} style={{ justifyContent: "flex-start" }}>
              Top up credits
            </button>
            {" "}
            <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
              {"Next bill ₹"}{I($v.nextBill)}{" + GST on 1 Nov · UPI autopay"}
            </span>
            {" "}
          </div>
          {" "}
        </section>
        {" "}
        <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {" "}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px", gap: "12px", flexWrap: "wrap" }}>
            {" "}
            <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
              Credits used in October
            </h2>
            {" "}
            <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
              {"Busiest day: Sun 18 Oct · "}{I($v.peak)}{" credits"}
            </span>
            {" "}
          </div>
          {" "}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(31,minmax(0,1fr))", gap: "3px", alignItems: "end", height: "160px" }}>
            {" "}
            {L($v.bars).map((b: any, $index: number) => (
              <Fragment key={$index}>
                <span title={b?.tip} style={{ height: `${b?.h ?? ""}`, background: `${b?.bg ?? ""}`, display: "block" } as React.CSSProperties}></span>
              </Fragment>
            ))}
            {" "}
          </div>
          {" "}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(31,minmax(0,1fr))", gap: "3px", fontSize: "10px", color: "var(--color-neutral-700)" }}>
            {" "}
            {L($v.bars).map((b: any, $index: number) => (
              <Fragment key={$index}>
                <span>
                  {I(b?.lbl)}
                </span>
              </Fragment>
            ))}
            {" "}
          </div>
          {" "}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12px", color: "var(--color-neutral-700)" }}>
            {" "}
            <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ width: "10px", height: "10px", background: "var(--color-text)" }}></span>
              Used
            </span>
            {" "}
            <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ width: "10px", height: "10px", background: "var(--color-accent)" }}></span>
              Weekend
            </span>
            {" "}
            <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ width: "10px", height: "10px", background: "var(--color-neutral-300)" }}></span>
              Forecast
            </span>
            {" "}
          </div>
          {" "}
        </section>
        {" "}
        <section style={{ display: "grid", gridTemplateColumns: `${$v.splitCols ?? ""}`, gap: "32px" } as React.CSSProperties}>
          {" "}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
            {" "}
            <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
              Credit history
            </h2>
            {" "}
            <table className="table">
              {" "}
              <thead>
                <tr>
                  <th>
                    Date
                  </th>
                  <th>
                    What
                  </th>
                  <th style={{ textAlign: "right" }}>
                    Credits
                  </th>
                  <th style={{ textAlign: "right" }}>
                    Balance
                  </th>
                </tr>
              </thead>
              {" "}
              <tbody>
                {L($v.history).map((h: any, $index: number) => (
                  <Fragment key={$index}>
                    <tr>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {I(h?.d)}
                      </td>
                      <td>
                        {I(h?.w)}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: `${h?.fw ?? ""}` } as React.CSSProperties}>
                        {I(h?.c)}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--color-neutral-700)" }}>
                        {I(h?.b)}
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
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {" "}
            <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
              Top-up packs
            </h2>
            {" "}
            {L($v.packs).map((p: any, $index: number) => (
              <Fragment key={$index}>
                {" "}
                <button onClick={$v.topup} className="hover:[border-color:var(--color-accent)]!" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", alignItems: "center", padding: "14px", border: "2px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", font: "inherit", textAlign: "left", cursor: "pointer" }}>
                  {" "}
                  <span style={{ fontWeight: "800", fontSize: "17px" }}>
                    {I(p?.c)}{" credits"}
                  </span>
                  <span style={{ fontWeight: "800", fontSize: "17px" }}>
                    {I(p?.p)}
                  </span>
                  {" "}
                  <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                    {I(p?.l)}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                    {I(p?.per)}
                  </span>
                  {" "}
                </button>
                {" "}
              </Fragment>
            ))}
            {" "}
            <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
              Top-ups last 90 days and are used after plan credits.
            </span>
            {" "}
          </div>
          {" "}
        </section>
        {" "}
        <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {" "}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px", gap: "12px", flexWrap: "wrap" }}>
            {" "}
            <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
              Plans
            </h2>
            {" "}
            <div role="group" aria-label="Billing cycle" style={{ display: "flex", border: "2px solid var(--color-text)" }}>
              {" "}
              <button onClick={$v.setMonthly} style={{ padding: "7px 14px", border: "0", background: `${$v.moBg ?? ""}`, color: `${$v.moFg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer" } as React.CSSProperties}>
                Monthly
              </button>
              {" "}
              <button onClick={$v.setYearly} style={{ display: "flex", gap: "6px", alignItems: "center", padding: "7px 14px", border: "0", background: `${$v.yrBg ?? ""}`, color: `${$v.yrFg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer" } as React.CSSProperties}>
                Yearly
                <span style={{ fontSize: "10px", letterSpacing: ".04em", textTransform: "uppercase", padding: "1px 5px", background: "var(--color-accent)", color: "#fff" }}>
                  2 months free
                </span>
              </button>
              {" "}
            </div>
            {" "}
          </div>
          {" "}
          <div style={{ display: "grid", gridTemplateColumns: `${$v.planCols ?? ""}`, gap: "2px", background: "var(--color-divider)" } as React.CSSProperties}>
            {" "}
            {L($v.plans).map((pl: any, $index: number) => (
              <Fragment key={$index}>
                {" "}
                <div style={{ background: `${pl?.bg ?? ""}`, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" } as React.CSSProperties}>
                  {" "}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "800", fontSize: "20px" }}>
                      {I(pl?.name)}
                    </span>
                    {pl?.current ? (
                      <>
                        <span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: ".06em", textTransform: "uppercase", padding: "2px 6px", background: "var(--color-text)", color: "var(--color-bg)" }}>
                          Your plan
                        </span>
                      </>
                    ) : null}
                  </div>
                  {" "}
                  <div>
                    <span style={{ fontSize: "34px", fontWeight: "800", letterSpacing: "-0.02em" }}>
                      {I(pl?.price)}
                    </span>
                    <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                      {" /month + GST"}
                    </span>
                    <div style={{ fontSize: "12px", color: `${pl?.billColor ?? ""}`, fontWeight: "600", marginTop: "2px" } as React.CSSProperties}>
                      {I(pl?.billLine)}
                    </div>
                  </div>
                  {" "}
                  <div style={{ fontSize: "14px", fontWeight: "600" }}>
                    {I(pl?.credits)}{" credits · about "}{I(pl?.leads)}{" leads"}
                  </div>
                  {" "}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", flex: "1" }}>
                    {" "}
                    {L(pl?.feats).map((f: any, $index: number) => (
                      <Fragment key={$index}>
                        <span style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                          <span style={{ width: "5px", height: "5px", background: "var(--color-text)", flex: "none", transform: "translateY(-2px)" }}></span>
                          {I(f)}
                        </span>
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                  {pl?.isUp ? (
                    <>
                      <button className="btn btn-primary" onClick={pl?.act} style={{ justifyContent: "flex-start" }}>
                        {"Upgrade to "}{I(pl?.name)}
                      </button>
                    </>
                  ) : null}
                  {" "}
                  {pl?.isDown ? (
                    <>
                      <button className="btn btn-secondary" onClick={pl?.act} style={{ justifyContent: "flex-start" }}>
                        {I(pl?.downLabel)}
                      </button>
                    </>
                  ) : null}
                  {" "}
                  {pl?.current ? (
                    <>
                      {pl?.canYearly ? (
                        <>
                          <button className="btn btn-secondary" onClick={$v.switchYearly} style={{ justifyContent: "flex-start" }}>
                            {"Switch to yearly · save "}{I(pl?.save)}
                          </button>
                        </>
                      ) : null}
                      {pl?.noYearly ? (
                        <>
                          <span style={{ fontSize: "13px", color: "var(--color-neutral-700)", padding: "8px 0" }}>
                            {I($v.renewLine)}
                          </span>
                        </>
                      ) : null}
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
          <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
            Upgrades start today. Downgrades and cycle changes start at your next renewal. Credits are given monthly on both cycles.
          </span>
          {" "}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: "16px 32px", alignItems: "center", padding: "20px", border: "2px solid var(--color-text)" }}>
            {" "}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {" "}
              <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
                Optional add-on
              </span>
              {" "}
              <span style={{ fontWeight: "800", fontSize: "22px" }}>
                Done-for-you setup
              </span>
              {" "}
              <span style={{ fontSize: "14px", color: "var(--color-neutral-700)", maxWidth: "460px", textWrap: "pretty" }}>
                We set everything up for you on a call: knowledge base, WhatsApp number, staff, calendar and features. Live in 2 working days.
              </span>
              {" "}
            </div>
            {" "}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "14px" }}>
              {" "}
              {L($v.setupItems).map((si: any, $index: number) => (
                <Fragment key={$index}>
                  <span style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                    <span style={{ width: "5px", height: "5px", background: "var(--color-text)", flex: "none", transform: "translateY(-2px)" }}></span>
                    {I(si)}
                  </span>
                </Fragment>
              ))}
              {" "}
            </div>
            {" "}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start" }}>
              {" "}
              <div>
                <span style={{ fontSize: "36px", fontWeight: "800", letterSpacing: "-0.02em" }}>
                  ₹4,999
                </span>
                <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                  {" one-time + GST"}
                </span>
              </div>
              {" "}
              {$v.setupOpen ? (
                <>
                  <button className="btn btn-primary" onClick={$v.bookSetup} style={{ justifyContent: "flex-start" }}>
                    Book setup call
                  </button>
                </>
              ) : null}
              {$v.setupDone ? (
                <>
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>
                    Booked · Mon 26 Oct, 11 am. We’ll WhatsApp you the link.
                  </span>
                </>
              ) : null}
              {" "}
            </div>
            {" "}
          </div>
          {" "}
        </section>
        {" "}
        <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {" "}
          <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
            Invoices
          </h2>
          {" "}
          <div style={{ overflowX: "auto" }}>
            {" "}
            <table className="table" style={{ minWidth: "480px" }}>
              {" "}
              <thead>
                <tr>
                  <th>
                    Date
                  </th>
                  <th>
                    Invoice
                  </th>
                  <th>
                    For
                  </th>
                  <th style={{ textAlign: "right" }}>
                    Amount
                  </th>
                  <th></th>
                </tr>
              </thead>
              {" "}
              <tbody>
                {L($v.invoices).map((i: any, $index: number) => (
                  <Fragment key={$index}>
                    <tr>
                      <td>
                        {I(i?.d)}
                      </td>
                      <td style={{ color: "var(--color-neutral-700)" }}>
                        {I(i?.n)}
                      </td>
                      <td>
                        {I(i?.f)}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: "600" }}>
                        {I(i?.a)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <a href="#" style={{ fontSize: "13px", fontWeight: "600" }}>
                          PDF
                        </a>
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
        </section>
      </div>
    </>
  );
}

const PakkaBilling = createDC("Pakka Billing", PakkaBillingLogic, renderPakkaBilling);
export default PakkaBilling;

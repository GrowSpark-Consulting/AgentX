/* eslint-disable */
// @ts-nocheck: TEMPORARY typing boundary. Ported prototype code written for `strict: false`;
// typing it is a follow-up (docs/frontend-architecture-map.md, "TypeScript").
"use client";
// Ported from the "Pakka App First Round" design. Logic and mock data are kept as authored;
// the markup is the original template expressed as JSX.

import React, { Fragment } from "react";
import { DCLogic, createDC, I, L, css } from "@/components/dashboard/runtime";
import { ALERTS, INIT } from "@/fixtures/dashboard/team";
import { PAKKA_IND } from "@/fixtures/dashboard/industries";


/** Editable props declared by the original component (editor metadata, kept for reference). */
export const PakkaTeamProps = {"industry":{"editor":"enum","options":["re","salon","int","hotel","rest"],"default":"re"},"isMobile":{"editor":"boolean","default":false}} as const;

const IX=k=>(k&&k!=='re'&&PAKKA_IND&&PAKKA_IND[k])||null;
class PakkaTeamLogic extends DCLogic {
  state: any = {lists:{},inviting:false,name:'',phone:'',role:'Sales',toast:null};
  flash(t){clearTimeout(this.tt);this.setState({toast:t});this.tt=setTimeout(()=>this.setState({toast:null}),2600);}
  componentWillUnmount(){clearTimeout(this.tt);this._rd&&window.removeEventListener('pakka-ind-ready',this._rd);}
  key(){return IX(this.props.industry)?this.props.industry:'re';}
  getList(s){const X=IX(this.props.industry);return (s.lists||{})[this.key()]||(X?X.team:INIT);}
  componentDidMount(){if(!PAKKA_IND){this._rd=()=>this.forceUpdate();window.addEventListener('pakka-ind-ready',this._rd);}}
  upd(id,fn){this.setState(s=>({lists:{...s.lists,[this.key()]:this.getList(s).map(p=>p.id===id?fn(p):p)}}));}
  renderVals(){
    const s=this.state,m=!!this.props.isMobile,list=this.getList(s),used=list.length;
    return{
      pad:m?'20px 16px 40px':'32px 40px 56px',h1:m?'30px':'42px',
      used,full:used>=5,seats:Array.from({length:5},(_,i)=>({bg:i<used?'var(--color-text)':'var(--color-neutral-300)'})),
      inviting:s.inviting,openInvite:()=>this.setState({inviting:true}),closeInvite:()=>this.setState({inviting:false}),
      invName:s.name,invPhone:s.phone,invRole:s.role,onName:e=>this.setState({name:e.target.value}),onPhone:e=>this.setState({phone:e.target.value}),onRole:e=>this.setState({role:e.target.value}),
      invCols:m?'minmax(0,1fr)':'repeat(3,minmax(0,1fr))',
      sendInvite:()=>{const n=s.name.trim()||'Meera';this.setState(st=>({inviting:false,name:'',phone:'',lists:{...st.lists,[this.key()]:[...this.getList(st),{id:'n'+Date.now(),name:n,ini:n.slice(0,2).toUpperCase(),role:st.role,phone:st.phone||'+91 98xxx xxxxx',alerts:{'Hot leads':true,'Bookings':true,'Handovers':true},mode:'default',pending:true}]}}));this.flash(`Invite sent to ${n} on WhatsApp`);},
      rowCols:m?'minmax(0,1fr)':'minmax(0,1.1fr) minmax(0,1.6fr) minmax(0,1fr)',
      members:list.map(p=>({...p,pending:!!p.pending,avBg:p.role==='Owner'?'var(--color-text)':'var(--color-neutral-300)',avFg:p.role==='Owner'?'var(--color-bg)':'var(--color-text)',
        alerts:ALERTS.map(a=>{const on=!!p.alerts[a];return{name:a,flip:()=>this.upd(p.id,q=>({...q,alerts:{...q.alerts,[a]:!on}})),bg:on?'var(--color-text)':'transparent',fg:on?'var(--color-bg)':'var(--color-neutral-700)',bd:on?'var(--color-text)':'var(--color-divider)'};}),
        setMode:e=>{const v=e.target.value;this.upd(p.id,q=>({...q,mode:v}));}})),
      hasToast:!!s.toast,toast:s.toast,
    };
  }
}

function renderPakkaTeam($v: any) {
  return (
    <>
      <div data-screen-label="11 Team" style={{ position: "relative", padding: `${$v.pad ?? ""}`, display: "flex", flexDirection: "column", gap: "28px", maxWidth: "1120px", color: "var(--color-text)", fontFamily: "var(--font-body)" } as React.CSSProperties}>
        {" "}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
          {" "}
          <div>
            <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
              Team
            </h1>
            <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)" }}>
              Who gets alerts and who can reply to customers.
            </p>
          </div>
          {" "}
          <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
            {" "}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "120px" }}>
              {" "}
              <span style={{ fontSize: "13px" }}>
                <strong style={{ fontSize: "18px", fontWeight: "800" }}>
                  {I($v.used)}{" of 5"}
                </strong>
                {" seats used"}
              </span>
              {" "}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "3px", height: "8px" }}>
                {L($v.seats).map((s: any, $index: number) => (
                  <Fragment key={$index}>
                    <span style={{ background: `${s?.bg ?? ""}` } as React.CSSProperties}></span>
                  </Fragment>
                ))}
              </div>
              {" "}
            </div>
            {" "}
            <button className="btn btn-primary" onClick={$v.openInvite} disabled={$v.full}>
              Invite staff
            </button>
            {" "}
          </div>
          {" "}
        </div>
        {" "}
        {$v.inviting ? (
          <>
            {" "}
            <div style={{ background: "var(--color-surface)", padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {" "}
              <div style={{ fontWeight: "800", fontSize: "17px" }}>
                Invite a team member
              </div>
              {" "}
              <div style={{ display: "grid", gridTemplateColumns: `${$v.invCols ?? ""}`, gap: "12px" } as React.CSSProperties}>
                {" "}
                <div className="field">
                  <label>
                    Name
                  </label>
                  <input className="input" value={$v.invName ?? ""} onChange={$v.onName} placeholder="Meera" />
                </div>
                {" "}
                <div className="field">
                  <label>
                    WhatsApp number
                  </label>
                  <input className="input" value={$v.invPhone ?? ""} onChange={$v.onPhone} placeholder="+91 98xxx xxxxx" />
                </div>
                {" "}
                <div className="field">
                  <label>
                    Role
                  </label>
                  <select className="input" value={$v.invRole ?? ""} onChange={$v.onRole}>
                    <option>
                      Sales
                    </option>
                    <option>
                      Admin
                    </option>
                    <option>
                      Front desk
                    </option>
                  </select>
                </div>
                {" "}
              </div>
              {" "}
              <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                They’ll get a WhatsApp message with a login link. No app to install.
              </div>
              {" "}
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn btn-primary" onClick={$v.sendInvite}>
                  Send invite
                </button>
                <button className="btn btn-secondary" onClick={$v.closeInvite}>
                  Cancel
                </button>
              </div>
              {" "}
            </div>
            {" "}
          </>
        ) : null}
        {" "}
        <div style={{ display: "flex", flexDirection: "column", borderTop: "2px solid var(--color-text)" }}>
          {" "}
          {L($v.members).map((p: any, $index: number) => (
            <Fragment key={$index}>
              {" "}
              <div style={{ display: "grid", gridTemplateColumns: `${$v.rowCols ?? ""}`, gap: "14px 24px", padding: "18px 0", borderBottom: "1px solid var(--color-divider)", alignItems: "start" } as React.CSSProperties}>
                {" "}
                <div style={{ display: "flex", gap: "12px", alignItems: "center", minWidth: "0" }}>
                  {" "}
                  <span style={{ width: "44px", height: "44px", flex: "none", background: `${p?.avBg ?? ""}`, color: `${p?.avFg ?? ""}`, display: "grid", placeItems: "center", fontWeight: "800", fontSize: "14px" } as React.CSSProperties}>
                    {I(p?.ini)}
                  </span>
                  {" "}
                  <div style={{ minWidth: "0" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: "800", fontSize: "16px" }}>
                        {I(p?.name)}
                      </span>
                      <span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: ".06em", textTransform: "uppercase", padding: "2px 6px", border: "1px solid var(--color-divider)" }}>
                        {I(p?.role)}
                      </span>
                      {p?.pending ? (
                        <>
                          <span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: ".06em", textTransform: "uppercase", padding: "2px 6px", background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}>
                            Invite sent
                          </span>
                        </>
                      ) : null}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                      {I(p?.phone)}
                    </div>
                  </div>
                  {" "}
                </div>
                {" "}
                <div>
                  {" "}
                  <div style={{ fontSize: "12px", color: "var(--color-neutral-700)", marginBottom: "6px" }}>
                    WhatsApp alerts
                  </div>
                  {" "}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {" "}
                    {L(p?.alerts).map((a: any, $index: number) => (
                      <Fragment key={$index}>
                        <button onClick={a?.flip} style={{ border: `1px solid ${a?.bd ?? ""}`, background: `${a?.bg ?? ""}`, color: `${a?.fg ?? ""}`, font: "inherit", fontSize: "12px", fontWeight: "600", padding: "4px 9px", cursor: "pointer" } as React.CSSProperties}>
                          {I(a?.name)}
                        </button>
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                </div>
                {" "}
                <div className="field">
                  {" "}
                  <label>
                    Takes over chats via
                  </label>
                  {" "}
                  <select className="input" value={p?.mode ?? ""} onChange={p?.setMode} style={{ fontSize: "13px" }}>
                    {" "}
                    <option value="default">
                      Business default (Shared inbox)
                    </option>
                    {" "}
                    <option value="shared">
                      Shared inbox
                    </option>
                    {" "}
                    <option value="own">
                      My own number
                    </option>
                    {" "}
                    <option value="ask">
                      Ask each time
                    </option>
                    {" "}
                  </select>
                  {" "}
                </div>
                {" "}
              </div>
              {" "}
            </Fragment>
          ))}
          {" "}
        </div>
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

const PakkaTeam = createDC("Pakka Team", PakkaTeamLogic, renderPakkaTeam);
export default PakkaTeam;

/* eslint-disable */
// @ts-nocheck: TEMPORARY typing boundary. Ported prototype code written for `strict: false`;
// typing it is a follow-up (docs/frontend-architecture-map.md, "TypeScript").
"use client";
// Ported from the "Pakka App First Round" design. Logic and mock data are kept as authored;
// the markup is the original template expressed as JSX.

import React, { Fragment } from "react";
import { DCLogic, createDC, I, L, css } from "@/components/dashboard/runtime";
import { V, BASE, FEATS } from "@/fixtures/dashboard/templates";


/** Editable props declared by the original component (editor metadata, kept for reference). */
export const PakkaTemplatesProps = {"industry":{"editor":"enum","options":["re","salon","int","hotel","rest"],"default":"re","tsType":"string"},"isMobile":{"editor":"boolean","default":false,"tsType":"boolean"}} as const;

const LANG: any={en:'English',ta:'Tamil'};
const DUMMY: any={key:'',body:'',cat:'Utility'};
const VAR_NAMES: any=['Customer name','Date','Time','Staff name','Business name','Link'];
const ST: any={'Not added':['transparent','var(--color-neutral-600)','var(--color-divider)'],Approved:['transparent','var(--color-text)','var(--color-text)'],'In review':['var(--color-accent-100)','var(--color-accent-800)','var(--color-accent-300)'],Rejected:['var(--color-accent)','#fff','var(--color-accent)'],Draft:['var(--color-neutral-200)','var(--color-neutral-800)','var(--color-neutral-300)']};
function tagsOf(s){return (s.match(/\{\{\d+\}\}/g)||[]).filter((x,i,a)=>a.indexOf(x)===i);}
class PakkaTemplatesLogic extends DCLogic {
  bset(p){this.setState(x=>({b:{...x.b,...p}}));}
  fromTpl(t,resubmit){const nextKey=k=>k.replace(/_v(\d+)$/,(x,n)=>'_v'+(+n+1));
    const vn: any={},sm={};(t.vars||[]).forEach(([tag,what,sample])=>{vn[tag]=what;sm[tag]=sample;});
    const quick=(t.btns||[]).some(b=>b[0]==='Quick reply');
    return{isNew:false,resubmit,base:t,key:resubmit?t.key:nextKey(t.key),label:t.label,cat:t.cat,feature:FEATS.includes(t.feature)?t.feature:FEATS[0],langs:{en:true,ta:!!t.ta},lang:'en',body:{en:t.en||'',ta:t.ta||''},headerType:t.headerType||'None',headerText:t.headerText||'',footer:'',
      btnKind:(t.btns||[]).length?(quick?'quick':'cta'):'None',btns:(t.btns||[]).map(([type,text])=>({type:type==='Quick reply'?'Quick reply':(type==='URL'?'URL':'Phone'),text,value:type==='URL'?'https://':''})),varNames:vn,samples:sm};}
  commit(status){const s=this.state,b=s.b,K=V[this.props.industry]?this.props.industry:'re';
    const tags: any=[...new Set([...tagsOf(b.body.en||''),...(b.langs.ta?tagsOf(b.body.ta||''):[])])].sort();
    const st: any={en:b.langs.en?status:'Not added',ta:b.langs.ta?status:'Not added'};
    const icon=x=>x.type==='Quick reply'?'↩':x.type==='URL'?'🔗':'✆';
    const out: any={key:b.key,label:b.label||b.key,cat:b.cat,feature:b.feature,when:b.base?b.base.when:'Manual, from the inbox',en:b.body.en,ta:b.langs.ta?b.body.ta:'',st,vars:tags.map(tg=>[tg,b.varNames[tg]||'Variable',b.samples[tg]||'']),btns:b.btns.map(x=>[x.type,x.text,icon(x)]),footer:b.cat==='Marketing'||!!b.footer,headerType:b.headerType,headerText:b.headerText,reject:''};
    if(b.base&&b.base.key===b.key){this.setState(x=>({over:{...x.over,[K+b.key]:{...(x.over[K+b.key]||{}),...out}},sel:b.key,mode:'view',lang:'en'}));}
    else{const nt: any={...out,ind:K,sentN:0,readPct:'—',versions:[[b.key.slice(-2),status==='Draft'?'Draft':'Submitted today',status],...(b.base?[[b.base.key.slice(-2),'Keeps sending until approved','Active']]:[])]};
      this.setState(x=>({added:[nt,...x.added.filter(a=>!(a.key===nt.key&&a.ind===K))],sel:nt.key,mode:'view',lang:'en'}));}
    this.flash(status==='Draft'?'Draft saved':`${b.key} submitted to Meta`);}
  state: any = {sel:null,mode:'view',lang:'en',filter:'all',over:{},added:[],form:null,toast:null};
  flash(t){clearTimeout(this.tt);this.setState({toast:t});this.tt=setTimeout(()=>this.setState({toast:null}),2800);}
  componentWillUnmount(){clearTimeout(this.tt);}
  builderVals(v,m){const s=this.state,b=s.b;if(!b||s.mode!=='edit')return{};
    const lang=b.lang,body=b.body[lang]||'',tags=tagsOf(body);
    const allTags: any=[...new Set([...tagsOf(b.body.en||''),...tagsOf(b.body.ta||'')])];
    const defs: any={'Customer name':v.cust,'Date':v.date,'Time':v.time,'Staff name':v.staff,'Business name':v.biz,'Link':'pakka.link/k3x'};
    let preview=body||'Your message preview shows here.';tags.forEach(tg=>{preview=preview.split(tg).join(b.samples[tg]||tg);});
    const mkt=b.cat==='Marketing',cta=b.btnKind==='cta',max=b.btnKind==='quick'?3:cta?2:0;
    const nums=tags.map(x=>+x.replace(/\D/g,''));const ordered=nums.every((n,i)=>n===i+1);
    const trimmed=body.trim();
    const req: any=[['Name is lowercase and ends with a version, like _v1',/^[a-z0-9_]+_v\d+$/.test(b.key)],['Label added so your team can find it',!!b.label.trim()],['Message is at least a full sentence',trimmed.length>=12],['Doesn’t start or end with a variable',!(/^\{\{\d+\}\}/.test(trimmed)||/\{\{\d+\}\}[.!?]?$/.test(trimmed))||!trimmed],['Every variable has a sample value',tags.every(tg=>(b.samples[tg]||'').trim())],['Variables are numbered in order',ordered],['Under 1,024 characters',body.length<=1024],['Every button has text',b.btns.every(x=>x.text.trim())]];
    if(b.langs.ta)req.push(['Tamil version written',!!(b.body.ta||'').trim()]);
    const checks: any=[...req.map(([t,ok])=>({t,ok,tag:ok?'':'Required'})),...(b.langs.ta?[]:[{t:'Add a Tamil version so Tamil speakers get their own',ok:false,tag:'Recommended',soft:true}]),...(mkt?[{t:'Opt-out line included',ok:true,tag:''}]:[])];
    const footerVal=mkt?'Reply STOP to opt out':b.footer;
    const setBtn=(i,p)=>this.bset({btns:b.btns.map((x,j)=>j===i?{...x,...p}:x)});
    return{
      b:{...b,kicker:b.isNew?'New template':b.resubmit?'Fix and resubmit':'New version of '+b.base.key,title:b.label||(b.isNew?'Untitled template':b.base.label),lockKey:!b.isNew&&!!b.resubmit,
        langName:lang==='en'?'English':'Tamil',body,len:body.length,lenColor:body.length>1024?'var(--color-accent-700)':'var(--color-neutral-700)',
        hText:b.headerType==='Text',hMedia:b.headerType==='Image'||b.headerType==='Document',headerPreview:b.headerText||'Header text',
        footer:footerVal,footerLocked:mkt,footerPh:'e.g. '+v.biz,hasFooterPrev:!!footerVal,footerPrev:footerVal,preview,crLine:mkt?'2 credits per message':'1 credit per message'},
      onLabel:e=>this.bset({label:e.target.value}),onBKey:e=>this.bset({key:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_')}),onFeature:e=>this.bset({feature:e.target.value}),featureOpts:FEATS,
      bCats:[['Utility','1 credit','Confirms or updates something the customer asked for'],['Marketing','2 credits','Nudges, offers, feedback and reviews. Adds an opt-out line.']].map(([l,cr,d])=>({l,cr,d,off:!b.isNew&&!!b.resubmit,pick:()=>this.bset({cat:l}),bd:b.cat===l?'var(--color-accent)':'var(--color-divider)',bg:b.cat===l?'var(--color-accent-100)':'transparent'})),
      bLangs:[['en','English'],['ta','Tamil']].map(([c,name])=>{const on=!!b.langs[c],cur=lang===c;return{name,op:on?1:0.5,sign:on?'×':'+',toggleLabel:(on?'Remove ':'Add ')+name,
        pick:()=>{if(on)this.bset({lang:c});},toggle:()=>{if(on&&Object.values(b.langs).filter(Boolean).length===1)return;const langs: any={...b.langs,[c]:!on};this.bset({langs,lang:!on?c:(cur?(c==='en'?'ta':'en'):lang)});},
        bd:cur?'var(--color-text)':'var(--color-divider)',bg:cur?'var(--color-text)':'transparent',fg:cur?'var(--color-bg)':'var(--color-text)'};}),
      headerOpts:['None','Text','Image','Document'].map(l=>({l,pick:()=>this.bset({headerType:l}),bg:b.headerType===l?'var(--color-text)':'transparent',fg:b.headerType===l?'var(--color-bg)':'var(--color-text)'})),
      onHeaderText:e=>this.bset({headerText:e.target.value}),onBBody:e=>this.bset({body:{...b.body,[lang]:e.target.value}}),onFooter:e=>this.bset({footer:e.target.value}),
      varChips:VAR_NAMES.map(l=>({l,add:()=>{const existing=Object.entries(b.varNames).find(([tg,nm])=>nm===l&&allTags.includes(tg));const tg=existing?existing[0]:`{{${Math.max(0,...allTags.map(x=>+x.replace(/\D/g,'')))+1}}}`;
        const sep=body&&!/\s$/.test(body)?' ':'';this.bset({body:{...b.body,[lang]:body+sep+tg},varNames:{...b.varNames,[tg]:l},samples:{...b.samples,[tg]:b.samples[tg]||defs[l]}});}})),
      bVars:tags.map(tg=>({tag:tg,what:b.varNames[tg]||'Variable',sample:b.samples[tg]||'',onSample:e=>this.bset({samples:{...b.samples,[tg]:e.target.value}})})),bNoVars:!tags.length,
      btnKinds:[['None','None'],['quick','Quick replies · up to 3'],['cta','Call to action · up to 2']].map(([k,l])=>({l,pick:()=>this.bset({btnKind:k,btns:k==='None'?[]:k==='quick'?[{type:'Quick reply',text:'Yes, interested',value:''}]:[{type:'URL',text:'View details',value:'https://'+(v.biz.toLowerCase().replace(/[^a-z]/g,''))+'.in'}]}),bg:b.btnKind===k?'var(--color-text)':'transparent',fg:b.btnKind===k?'var(--color-bg)':'var(--color-text)'})),
      bBtns:b.btns.map((x,i)=>({...x,isCta:cta,textPrev:x.text||'Button',icon:x.type==='Quick reply'?'↩':x.type==='URL'?'🔗':'✆',valuePh:x.type==='Phone'?'+91 98400 12345':'https://',
        onType:e=>setBtn(i,{type:e.target.value,value:e.target.value==='Phone'?'+91 98400 12345':'https://'}),onText:e=>setBtn(i,{text:e.target.value}),onValue:e=>setBtn(i,{value:e.target.value}),remove:()=>this.bset({btns:b.btns.filter((_,j)=>j!==i),btnKind:b.btns.length===1?'None':b.btnKind})})),
      btnCols:cta?(m?'minmax(0,1fr) minmax(0,1fr) 38px':'150px minmax(0,1fr) minmax(0,1.2fr) 38px'):'minmax(0,1fr) 38px',
      canAddBtn:max>0&&b.btns.length<max,btnLeft:max-b.btns.length,addBtn:()=>this.bset({btns:[...b.btns,{type:cta?'URL':'Quick reply',text:'',value:cta?'https://':''}]}),
      checks:checks.map(c=>({...c,tick:c.ok?'✓':'',bg:c.ok?'var(--color-text)':'transparent',bd:c.ok?'var(--color-text)':(c.soft?'var(--color-neutral-500)':'var(--color-accent)'),fg:c.soft?'var(--color-neutral-700)':'var(--color-accent-700)'})),
      bSubmitOff:!req.every(r=>r[1]),bSubmit:()=>this.commit('In review'),saveDraft:()=>this.commit('Draft'),
    };}
  renderVals(){
    const s=this.state,P=this.props,m=!!P.isMobile,K=V[P.industry]?P.industry:'re',v=V[K];
    const all: any=[...s.added.filter(a=>a.ind===K),...BASE(v)].filter((x,i,arr)=>arr.findIndex(y=>y.key===x.key)===i).map(t=>({...t,...(s.over[K+t.key]||{}),st:{...t.st,...((s.over[K+t.key]||{}).st||{})}}));
    const attn=t=>Object.values(t.st).some(x=>x!=='Approved');
    const fl: any={all:()=>true,util:t=>t.cat==='Utility',mkt:t=>t.cat==='Marketing',attn};
    const t=all.find(x=>x.key===s.sel);
    const editing=s.mode==='edit', form=editing?(s.form||DUMMY):(t?{key:t.key,body:t[s.lang],cat:t.cat}:{key:'',body:'',cat:'Utility'});
    const cur=editing?((s.form||{}).base||t):t;
    const varsList=editing?(form.body.match(/\{\{\d+\}\}/g)||[]).filter((x,i,a)=>a.indexOf(x)===i).map(tag=>{const o=(cur&&cur.vars||[]).find(z=>z[0]===tag);return o||[tag,'Variable','Sample value'];}):(t?t.vars:[]);
    let preview=form.body||'Your message preview shows here.';
    varsList.forEach(([tag,,sample])=>{preview=preview.split(tag).join(sample);});
    const status=t&&!editing?t.st[s.lang]:'Draft';
    const label=editing?(t?t.label:'New template'):(t?t.label:'');
    const nextKey=k=>k.replace(/_v(\d+)$/,(x,n)=>'_v'+(+n+1));
    return{
      pad:m?'20px 16px 40px':'32px 40px 56px',h1:m?'30px':'42px',
      isList:!t&&!editing,isDetail:!!t&&!editing,isBuilder:editing&&!!s.b,
      attnCount:all.filter(attn).length,attnColor:all.some(attn)?'var(--color-accent-700)':'var(--color-text)',
      filters:[['all','All'],['util','Utility'],['mkt','Marketing'],['attn','Needs attention']].map(([k,l])=>({label:l,count:all.filter(fl[k]).length,pick:()=>this.setState({filter:k}),bg:s.filter===k?'var(--color-text)':'transparent',fg:s.filter===k?'var(--color-bg)':'var(--color-text)',bd:s.filter===k?'var(--color-text)':'var(--color-divider)'})),
      rowCols:'repeat(auto-fit,minmax(min(100%,170px),1fr))',
      rows:all.filter(fl[s.filter]).map(r=>({...r,cr:r.cat==='Utility'?'1 cr':'2 cr',catBd:r.cat==='Marketing'?'var(--color-accent)':'var(--color-text)',catFg:r.cat==='Marketing'?'var(--color-accent-700)':'var(--color-text)',
        langs:Object.keys(LANG).map(c=>{const st=r.st[c]||'Draft';const [bg,fg,bd]=ST[st];return{code:c.toUpperCase(),s:st,bg,fg,bd};}),use:r.when,sent:r.sentN?r.sentN+' sent':'—',
        open:()=>this.setState({sel:r.key,mode:'view',lang:r.st.en!=='Approved'?'en':(r.st.ta==='Rejected'?'ta':'en')})})),
      newTpl:()=>this.setState({sel:null,mode:'edit',lang:'en',form:DUMMY,b:{isNew:true,key:'custom_offer_v1',label:'',cat:'Marketing',feature:FEATS[0],langs:{en:true,ta:false},lang:'en',body:{en:'',ta:''},headerType:'None',headerText:'',footer:'',btnKind:'None',btns:[],varNames:{},samples:{}}}),
      back:()=>this.setState({sel:null,mode:'view'}),
      isEditing:editing,isViewing:!editing,readOnly:!editing,lockName:!editing||!(s.form&&s.form.isNew),
      t:t?{...t,label,crSpent:t.sentN*(t.cat==='Utility'?1:2)}:{label,key:form.key},
      form,onKey:e=>this.setState({form:{...s.form,key:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_')}}),onBody:e=>this.setState({form:{...s.form,body:e.target.value}}),
      cats:['Utility','Marketing'].map(c=>({l:c,off:!editing,pick:()=>this.setState({form:{...s.form,cat:c}}),bg:form.cat===c?'var(--color-text)':'transparent',fg:form.cat===c?'var(--color-bg)':'var(--color-text)'})),
      langTabs:Object.entries(LANG).map(([c,name])=>{const st=editing?'Draft':(t&&t.st[c])||'Draft';const [sbg,sfg]=ST[st];return{name,s:st,sbg,sfg,pick:()=>this.setState(x=>({lang:c,form:x.mode==='edit'&&cur?{...x.form,body:cur[c]}:x.form})),bd:s.lang===c?'var(--color-text)':'var(--color-divider)',bg:s.lang===c?'var(--color-surface)':'transparent'};}),
      langName:LANG[s.lang],
      hasReject:!editing&&status==='Rejected',rejectReason:t&&t.reject||'',hasReview:!editing&&status==='In review',
      approve:()=>{this.setState(x=>({over:{...x.over,[K+t.key]:{...(x.over[K+t.key]||{}),st:{...((x.over[K+t.key]||{}).st||{}),[s.lang]:'Approved'}}}}));this.flash('Approved by Meta · now sending');},
      versionLabel:status==='Rejected'?'Fix and resubmit':'Create new version',
      newVersion:()=>this.setState({mode:'edit',form:DUMMY,b:this.fromTpl(t,status==='Rejected')}),
      hint:editing?'Approved templates are never edited in place. Submitting creates a new version for Meta to review.':`${status} · ${form.cat==='Utility'?'1 credit':'2 credits'} per message`,
      vars:varsList.map(([tag,what,sample])=>({tag,what,sample})),noVars:!varsList.length,
      addVar:()=>{const n=varsList.length+1;this.setState({form:{...s.form,body:s.form.body+`{{${n}}}`}});},
      btns:(cur&&cur.btns||[]).map(([type,text,icon])=>({type,text,icon})),hasFooter:editing?form.cat==='Marketing':!!(t&&t.footer),
      versions:(t&&t.versions||[[t?t.key.slice(-2):'v1','Current version','Active']]).map(([vv,note,st])=>({v:vv,note,s:st})),
      bizName:v.biz,preview,
      submitOff:!form.body||form.body.trim().length<12||!form.key,
      submit:()=>{const f=s.form;const base=f.base;
        if(base&&base.key===f.key){this.setState(x=>({over:{...x.over,[K+f.key]:{...(x.over[K+f.key]||{}),[s.lang]:f.body,reject:'',st:{...((x.over[K+f.key]||{}).st||{}),[s.lang]:'In review'}}},sel:f.key,mode:'view'}));this.flash(`${f.key} resubmitted to Meta`);return;}
        const nt: any={...(base||{label:'Custom offer',feature:'Sent by staff from the inbox',when:'Manual, outside 24 hours',sentN:0,readPct:'—',vars:[],btns:[],footer:f.cat==='Marketing',en:'',ta:''}),key:f.key,cat:f.cat,[s.lang]:f.body,st:{en:'Draft',ta:'Draft',[s.lang]:'In review'},ind:K,versions:[[f.key.slice(-2),'Submitted today','In review'],...(base?[[base.key.slice(-2),'Keeps sending until approved','Active']]:[])],sentN:0,readPct:'—',reject:''};
        this.setState(x=>({added:[nt,...x.added],sel:nt.key,mode:'view'}));this.flash(`${f.key} submitted to Meta`);},
      detailCols:m?'minmax(0,1fr)':'minmax(0,1.3fr) minmax(0,1fr)',twoCol:m?'minmax(0,1fr)':'minmax(0,1fr) minmax(0,1fr)',prevPos:m?'static':'sticky',
      ...this.builderVals(v,m),
      hasToast:!!s.toast,toast:s.toast,
    };
  }
}

function renderPakkaTemplates($v: any) {
  return (
    <>
      <div data-screen-label="16 Templates" style={{ position: "relative", padding: `${$v.pad ?? ""}`, display: "flex", flexDirection: "column", gap: "22px", maxWidth: "1240px", color: "var(--color-text)", fontFamily: "var(--font-body)" } as React.CSSProperties}>
        {$v.isList ? (
          <>
            {" "}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
              {" "}
              <div>
                <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
                  Message templates
                </h1>
                <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)", maxWidth: "640px", textWrap: "pretty" }}>
                  WhatsApp only allows free replies within 24 hours of the customer’s last message. After that, reminders and follow-ups go out as these Meta-approved templates.
                </p>
              </div>
              {" "}
              <button className="btn btn-primary" onClick={$v.newTpl} style={{ whiteSpace: "nowrap" }}>
                New template
              </button>
              {" "}
            </div>
            {" "}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: "2px", background: "var(--color-divider)", borderTop: "2px solid var(--color-text)", borderBottom: "2px solid var(--color-divider)" }}>
              {" "}
              <div style={{ background: "var(--color-bg)", padding: "14px 16px 14px 0" }}>
                <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                  Utility
                </div>
                <div style={{ fontSize: "22px", fontWeight: "800" }}>
                  1 credit
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                  Confirmations, reminders, reschedules
                </div>
              </div>
              {" "}
              <div style={{ background: "var(--color-bg)", padding: "14px 16px" }}>
                <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                  Marketing
                </div>
                <div style={{ fontSize: "22px", fontWeight: "800" }}>
                  2 credits
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                  Nudges, feedback, reviews, rebooking
                </div>
              </div>
              {" "}
              <div style={{ background: "var(--color-bg)", padding: "14px 16px" }}>
                <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                  Needs attention
                </div>
                <div style={{ fontSize: "22px", fontWeight: "800", color: `${$v.attnColor ?? ""}` } as React.CSSProperties}>
                  {I($v.attnCount)}
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                  Rejected or waiting for Meta
                </div>
              </div>
              {" "}
            </div>
            {" "}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {" "}
              {L($v.filters).map((f: any, $index: number) => (
                <Fragment key={$index}>
                  <button onClick={f?.pick} style={{ border: `1px solid ${f?.bd ?? ""}`, background: `${f?.bg ?? ""}`, color: `${f?.fg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "600", padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" } as React.CSSProperties}>
                    {I(f?.label)}{" "}{I(f?.count)}
                  </button>
                </Fragment>
              ))}
              {" "}
            </div>
            {" "}
            <div style={{ display: "flex", flexDirection: "column", borderTop: "2px solid var(--color-text)" }}>
              {" "}
              {L($v.rows).map((r: any, $index: number) => (
                <Fragment key={$index}>
                  {" "}
                  <button onClick={r?.open} className="hover:[background:var(--color-neutral-200)]!" style={{ display: "grid", gridTemplateColumns: `${$v.rowCols ?? ""}`, gap: "8px 20px", alignItems: "center", padding: "14px 0", border: "0", borderBottom: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", font: "inherit", textAlign: "left", cursor: "pointer" } as React.CSSProperties}>
                    {" "}
                    <span style={{ minWidth: "0" }}>
                      <span style={{ display: "block", fontWeight: "800", fontSize: "15px" }}>
                        {I(r?.label)}
                      </span>
                      <span style={{ display: "block", font: "500 12px ui-monospace,Menlo,monospace", color: "var(--color-neutral-700)" }}>
                        {I(r?.key)}
                      </span>
                    </span>
                    {" "}
                    <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "3px 7px", justifySelf: "start", whiteSpace: "nowrap", border: `1px solid ${r?.catBd ?? ""}`, color: `${r?.catFg ?? ""}` } as React.CSSProperties}>
                      {I(r?.cat)}{" · "}{I(r?.cr)}
                    </span>
                    {" "}
                    <span style={{ display: "flex", gap: "4px", flexWrap: "wrap", minWidth: "0", alignItems: "flex-start" }}>
                      {" "}
                      {L(r?.langs).map((lg: any, $index: number) => (
                        <Fragment key={$index}>
                          <span style={{ fontSize: "11px", fontWeight: "800", padding: "3px 7px", whiteSpace: "nowrap", background: `${lg?.bg ?? ""}`, color: `${lg?.fg ?? ""}`, border: `1px solid ${lg?.bd ?? ""}` } as React.CSSProperties}>
                            {I(lg?.code)}{" · "}{I(lg?.s)}
                          </span>
                        </Fragment>
                      ))}
                      {" "}
                    </span>
                    {" "}
                    <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                      {I(r?.use)}
                    </span>
                    {" "}
                    <span style={{ fontSize: "13px", fontWeight: "600", textAlign: "right", whiteSpace: "nowrap" }}>
                      {I(r?.sent)}
                    </span>
                    {" "}
                  </button>
                  {" "}
                </Fragment>
              ))}
              {" "}
            </div>
            {" "}
            <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
              Every template ends with “Reply STOP to opt out” where Meta requires it. Customers who opt out never get templates again.
            </span>
          </>
        ) : null}
        {$v.isDetail ? (
          <>
            {" "}
            <button className="btn btn-ghost" onClick={$v.back} style={{ alignSelf: "flex-start", paddingLeft: "0" }}>
              ← All templates
            </button>
            {" "}
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap" }}>
              {" "}
              <div style={{ minWidth: "0" }}>
                <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
                  {I($v.t?.label)}
                </h1>
                <div style={{ font: "500 13px ui-monospace,Menlo,monospace", color: "var(--color-neutral-700)" }}>
                  {I($v.t?.key)}
                </div>
              </div>
              {" "}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {" "}
                {$v.isEditing ? (
                  <>
                    <button className="btn btn-primary" onClick={$v.submit} disabled={$v.submitOff}>
                      Submit to Meta
                    </button>
                    <button className="btn btn-secondary" onClick={$v.back}>
                      Cancel
                    </button>
                  </>
                ) : null}
                {" "}
                {$v.isViewing ? (
                  <>
                    <button className="btn btn-primary" onClick={$v.newVersion}>
                      {I($v.versionLabel)}
                    </button>
                  </>
                ) : null}
                {" "}
              </div>
              {" "}
            </div>
            {" "}
            {$v.hasReject ? (
              <>
                {" "}
                <div style={{ border: "2px solid var(--color-accent)", background: "var(--color-accent-100)", color: "var(--color-accent-900)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {" "}
                  <strong>
                    {"Meta rejected the "}{I($v.langName)}{" version"}
                  </strong>
                  <span style={{ fontSize: "14px" }}>
                    {I($v.rejectReason)}
                  </span>
                  {" "}
                </div>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.hasReview ? (
              <>
                {" "}
                <div style={{ border: "2px dashed var(--color-accent)", padding: "12px 16px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ flex: "1", minWidth: "200px", fontSize: "14px" }}>
                    <strong>
                      Waiting for Meta.
                    </strong>
                    {" Usually approved within a few minutes to 24 hours. The previous version keeps sending until then."}
                  </span>
                  <button className="btn btn-ghost" onClick={$v.approve}>
                    Prototype: approve
                  </button>
                </div>
                {" "}
              </>
            ) : null}
            {" "}
            <div style={{ display: "grid", gridTemplateColumns: `${$v.detailCols ?? ""}`, gap: "32px", alignItems: "start" } as React.CSSProperties}>
              {" "}
              <div style={{ display: "flex", flexDirection: "column", gap: "18px", minWidth: "0" }}>
                {" "}
                <div style={{ display: "grid", gridTemplateColumns: `${$v.twoCol ?? ""}`, gap: "16px" } as React.CSSProperties}>
                  {" "}
                  <div className="field">
                    <label>
                      Name
                    </label>
                    <input className="input" value={$v.form?.key ?? ""} onChange={$v.onKey} disabled={$v.lockName} style={{ fontFamily: "ui-monospace,Menlo,monospace" }} />
                  </div>
                  {" "}
                  <div className="field">
                    <label>
                      Category
                    </label>
                    {" "}
                    <div style={{ display: "flex", border: "2px solid var(--color-text)", width: "max-content" }}>
                      {" "}
                      {L($v.cats).map((c: any, $index: number) => (
                        <Fragment key={$index}>
                          <button onClick={c?.pick} disabled={c?.off} style={{ padding: "7px 14px", border: "0", background: `${c?.bg ?? ""}`, color: `${c?.fg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer" } as React.CSSProperties}>
                            {I(c?.l)}
                          </button>
                        </Fragment>
                      ))}
                      {" "}
                    </div>
                    {" "}
                  </div>
                  {" "}
                </div>
                {" "}
                <div className="field">
                  <label>
                    Language
                  </label>
                  {" "}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {" "}
                    {L($v.langTabs).map((l: any, $index: number) => (
                      <Fragment key={$index}>
                        <button onClick={l?.pick} style={{ display: "flex", gap: "8px", alignItems: "center", border: `2px solid ${l?.bd ?? ""}`, background: `${l?.bg ?? ""}`, color: "var(--color-text)", font: "inherit", fontSize: "13px", fontWeight: "700", padding: "6px 12px", cursor: "pointer" } as React.CSSProperties}>
                          {I(l?.name)}
                          <span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "1px 5px", background: `${l?.sbg ?? ""}`, color: `${l?.sfg ?? ""}` } as React.CSSProperties}>
                            {I(l?.s)}
                          </span>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                    <label>
                      Message
                    </label>
                    {$v.isEditing ? (
                      <>
                        <button className="btn btn-ghost" onClick={$v.addVar} style={{ padding: "2px 0", fontSize: "13px" }}>
                          + Add variable
                        </button>
                      </>
                    ) : null}
                  </div>
                  {" "}
                  <textarea className="input" value={$v.form?.body ?? ""} onChange={$v.onBody} disabled={$v.readOnly} style={{ minHeight: "140px", fontSize: "15px", lineHeight: "1.5" }} />
                  {" "}
                  <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                    {I($v.hint)}
                  </span>
                  {" "}
                </div>
                {" "}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <div style={{ fontSize: "12px", color: "var(--color-neutral-700)", paddingBottom: "6px", borderBottom: "2px solid var(--color-text)" }}>
                    Variables · sample values Meta reviews
                  </div>
                  {" "}
                  {L($v.vars).map((v: any, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) minmax(0,1fr)", gap: "12px", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                        <span style={{ font: "700 13px ui-monospace,Menlo,monospace" }}>
                          {I(v?.tag)}
                        </span>
                        <span style={{ color: "var(--color-neutral-700)" }}>
                          {I(v?.what)}
                        </span>
                        <span style={{ fontWeight: "600" }}>
                          {I(v?.sample)}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                  {" "}
                  {$v.noVars ? (
                    <>
                      <div style={{ padding: "10px 0", fontSize: "13px", color: "var(--color-neutral-700)" }}>
                        No variables.
                      </div>
                    </>
                  ) : null}
                  {" "}
                </div>
                {" "}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <div style={{ fontSize: "12px", color: "var(--color-neutral-700)", paddingBottom: "6px", borderBottom: "2px solid var(--color-text)" }}>
                    Buttons
                  </div>
                  {" "}
                  {L($v.btns).map((b: any, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr)", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                        <span style={{ color: "var(--color-neutral-700)" }}>
                          {I(b?.type)}
                        </span>
                        <span style={{ fontWeight: "600" }}>
                          {I(b?.text)}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                  {" "}
                </div>
                {" "}
                {$v.isViewing ? (
                  <>
                    {" "}
                    <div style={{ display: "grid", gridTemplateColumns: `${$v.twoCol ?? ""}`, gap: "16px" } as React.CSSProperties}>
                      {" "}
                      <div style={{ background: "var(--color-surface)", padding: "14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                          Sent by
                        </span>
                        <strong style={{ fontSize: "15px" }}>
                          {I($v.t?.feature)}
                        </strong>
                        <span style={{ fontSize: "13px" }}>
                          {I($v.t?.when)}
                        </span>
                      </div>
                      {" "}
                      <div style={{ background: "var(--color-surface)", padding: "14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                          Last 30 days
                        </span>
                        <strong style={{ fontSize: "15px" }}>
                          {I($v.t?.sentN)}{" sent · "}{I($v.t?.readPct)}{" read"}
                        </strong>
                        <span style={{ fontSize: "13px" }}>
                          {I($v.t?.crSpent)}{" credits used"}
                        </span>
                      </div>
                      {" "}
                    </div>
                    {" "}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {" "}
                      <div style={{ fontSize: "12px", color: "var(--color-neutral-700)", paddingBottom: "6px", borderBottom: "2px solid var(--color-text)" }}>
                        Versions
                      </div>
                      {" "}
                      {L($v.versions).map((vh: any, $index: number) => (
                        <Fragment key={$index}>
                          <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: "12px", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                            <span style={{ font: "700 13px ui-monospace,Menlo,monospace" }}>
                              {I(vh?.v)}
                            </span>
                            <span style={{ color: "var(--color-neutral-700)" }}>
                              {I(vh?.note)}
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "2px 6px", border: "1px solid var(--color-divider)" }}>
                              {I(vh?.s)}
                            </span>
                          </div>
                        </Fragment>
                      ))}
                      {" "}
                    </div>
                    {" "}
                  </>
                ) : null}
                {" "}
              </div>
              {" "}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", position: `${$v.prevPos ?? ""}`, top: "0" } as React.CSSProperties}>
                {" "}
                <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                  Preview · what the customer sees
                </div>
                {" "}
                <div style={{ background: "#efeae2", padding: "16px 14px", border: "2px solid var(--color-text)", fontFamily: "-apple-system,system-ui,sans-serif", color: "#111b21", display: "flex", flexDirection: "column", gap: "3px" }}>
                  {" "}
                  <div style={{ alignSelf: "center", fontSize: "11px", background: "#fff", color: "#54656f", padding: "3px 9px", borderRadius: "7px", marginBottom: "6px" }}>
                    TODAY
                  </div>
                  {" "}
                  <div style={{ alignSelf: "flex-start", maxWidth: "92%", background: "#fff", borderRadius: "8px", padding: "7px 9px 4px", boxShadow: "0 1px .5px rgba(11,20,26,.13)" }}>
                    {" "}
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "#008069", marginBottom: "2px" }}>
                      {I($v.bizName)}
                    </div>
                    {" "}
                    <div style={{ fontSize: "14.5px", lineHeight: "1.4", whiteSpace: "pre-wrap" }}>
                      {I($v.preview)}
                    </div>
                    {" "}
                    {$v.hasFooter ? (
                      <>
                        <div style={{ fontSize: "12.5px", color: "#667781", marginTop: "4px" }}>
                          Reply STOP to opt out
                        </div>
                      </>
                    ) : null}
                    {" "}
                    <div style={{ fontSize: "11px", color: "#667781", textAlign: "right" }}>
                      9:41 am
                    </div>
                    {" "}
                  </div>
                  {" "}
                  {L($v.btns).map((b: any, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ alignSelf: "flex-start", width: "92%", background: "#fff", borderRadius: "8px", padding: "8px", textAlign: "center", color: "#027eb5", fontSize: "14.5px", fontWeight: "500", boxShadow: "0 1px .5px rgba(11,20,26,.13)" }}>
                        {I(b?.icon)}{" "}{I(b?.text)}
                      </div>
                    </Fragment>
                  ))}
                  {" "}
                </div>
                {" "}
              </div>
              {" "}
            </div>
          </>
        ) : null}
        {$v.isBuilder ? (
          <>
            {" "}
            <button className="btn btn-ghost" onClick={$v.back} style={{ alignSelf: "flex-start", paddingLeft: "0" }}>
              ← All templates
            </button>
            {" "}
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", borderBottom: "2px solid var(--color-text)", paddingBottom: "14px" }}>
              {" "}
              <div>
                <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
                  {I($v.b?.kicker)}
                </span>
                <h1 style={{ margin: "2px 0 0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
                  {I($v.b?.title)}
                </h1>
              </div>
              {" "}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button className="btn btn-secondary" onClick={$v.saveDraft}>
                  Save draft
                </button>
                <button className="btn btn-primary" onClick={$v.bSubmit} disabled={$v.bSubmitOff}>
                  Submit to Meta
                </button>
              </div>
              {" "}
            </div>
            {" "}
            <div style={{ display: "grid", gridTemplateColumns: `${$v.detailCols ?? ""}`, gap: "32px", alignItems: "start" } as React.CSSProperties}>
              {" "}
              <div style={{ display: "flex", flexDirection: "column", gap: "26px", minWidth: "0" }}>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                    <span style={{ color: "var(--color-accent-700)" }}>
                      1
                    </span>
                    {" · Basics"}
                  </h2>
                  {" "}
                  <div style={{ display: "grid", gridTemplateColumns: `${$v.twoCol ?? ""}`, gap: "16px" } as React.CSSProperties}>
                    {" "}
                    <div className="field">
                      <label>
                        Label · only your team sees this
                      </label>
                      <input className="input" value={$v.b?.label ?? ""} onChange={$v.onLabel} placeholder="Diwali offer" />
                    </div>
                    {" "}
                    <div className="field">
                      <label>
                        Template name
                      </label>
                      <input className="input" value={$v.b?.key ?? ""} onChange={$v.onBKey} disabled={$v.b?.lockKey} style={{ fontFamily: "ui-monospace,Menlo,monospace" }} />
                      <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                        Lowercase and underscores, ending in a version like _v1. Can’t change after submitting.
                      </span>
                    </div>
                    {" "}
                  </div>
                  {" "}
                  <div className="field">
                    <label>
                      Category
                    </label>
                    {" "}
                    <div style={{ display: "grid", gridTemplateColumns: `${$v.twoCol ?? ""}`, gap: "8px" } as React.CSSProperties}>
                      {" "}
                      {L($v.bCats).map((c: any, $index: number) => (
                        <Fragment key={$index}>
                          <button onClick={c?.pick} disabled={c?.off} style={{ display: "flex", flexDirection: "column", gap: "3px", textAlign: "left", padding: "12px 14px", border: `2px solid ${c?.bd ?? ""}`, background: `${c?.bg ?? ""}`, color: "var(--color-text)", font: "inherit", cursor: "pointer" } as React.CSSProperties}>
                            <span style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                              <strong style={{ fontSize: "15px" }}>
                                {I(c?.l)}
                              </strong>
                              <span style={{ fontSize: "12px", fontWeight: "800" }}>
                                {I(c?.cr)}
                              </span>
                            </span>
                            <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                              {I(c?.d)}
                            </span>
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
                      Sent by
                    </label>
                    {" "}
                    <select className="input" value={$v.b?.feature ?? ""} onChange={$v.onFeature}>
                      {L($v.featureOpts).map((fo: any, $index: number) => (
                        <Fragment key={$index}>
                          <option value={fo ?? ""}>
                            {I(fo)}
                          </option>
                        </Fragment>
                      ))}
                    </select>
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                    <span style={{ color: "var(--color-accent-700)" }}>
                      2
                    </span>
                    {" · Languages"}
                  </h2>
                  {" "}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {" "}
                    {L($v.bLangs).map((l: any, $index: number) => (
                      <Fragment key={$index}>
                        {" "}
                        <div style={{ display: "flex", border: `2px solid ${l?.bd ?? ""}` } as React.CSSProperties}>
                          {" "}
                          <button onClick={l?.pick} style={{ padding: "7px 12px", border: "0", background: `${l?.bg ?? ""}`, color: `${l?.fg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer", opacity: `${l?.op ?? ""}` } as React.CSSProperties}>
                            {I(l?.name)}
                          </button>
                          {" "}
                          <button onClick={l?.toggle} aria-label={l?.toggleLabel} style={{ padding: "7px 10px", border: "0", borderLeft: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer" }}>
                            {I(l?.sign)}
                          </button>
                          {" "}
                        </div>
                        {" "}
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                  <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                    Maya picks the version that matches the customer’s language. Each language is reviewed by Meta separately.
                  </span>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                    <span style={{ color: "var(--color-accent-700)" }}>
                      3
                    </span>
                    {" · Message · "}{I($v.b?.langName)}
                  </h2>
                  {" "}
                  <div className="field">
                    <label>
                      Header · optional
                    </label>
                    {" "}
                    <div style={{ display: "flex", border: "2px solid var(--color-text)", width: "max-content", maxWidth: "100%", overflowX: "auto" }}>
                      {" "}
                      {L($v.headerOpts).map((h: any, $index: number) => (
                        <Fragment key={$index}>
                          <button onClick={h?.pick} style={{ padding: "6px 12px", border: "0", background: `${h?.bg ?? ""}`, color: `${h?.fg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer" } as React.CSSProperties}>
                            {I(h?.l)}
                          </button>
                        </Fragment>
                      ))}
                      {" "}
                    </div>
                    {" "}
                    {$v.b?.hText ? (
                      <>
                        <input className="input" value={$v.b?.headerText ?? ""} onChange={$v.onHeaderText} placeholder="Booking confirmed" maxLength={60} style={{ marginTop: "6px" }} />
                      </>
                    ) : null}
                    {" "}
                    {$v.b?.hMedia ? (
                      <>
                        <div style={{ marginTop: "6px", border: "2px dashed var(--color-neutral-500)", padding: "14px", fontSize: "13px", color: "var(--color-neutral-700)" }}>
                          {"Drop a sample "}{I($v.b?.headerType)}{" for Meta to review. You choose the real file each time it’s sent."}
                        </div>
                      </>
                    ) : null}
                    {" "}
                  </div>
                  {" "}
                  <div className="field">
                    {" "}
                    <label>
                      Body
                    </label>
                    {" "}
                    <textarea className="input" value={$v.b?.body ?? ""} onChange={$v.onBBody} placeholder="Write the message. Use the buttons below to add the customer’s name, date and so on." style={{ minHeight: "150px", fontSize: "15px", lineHeight: "1.5" }} />
                    {" "}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12px", color: "var(--color-neutral-700)" }}>
                      <span>
                        Insert a variable
                      </span>
                      <span style={{ color: `${$v.b?.lenColor ?? ""}` } as React.CSSProperties}>
                        {I($v.b?.len)}{" / 1,024"}
                      </span>
                    </div>
                    {" "}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {" "}
                      {L($v.varChips).map((vc: any, $index: number) => (
                        <Fragment key={$index}>
                          <button onClick={vc?.add} className="hover:[background:var(--color-neutral-200)]!" style={{ border: "1px solid var(--color-text)", background: "transparent", color: "var(--color-text)", font: "inherit", fontSize: "12px", fontWeight: "700", padding: "4px 9px", cursor: "pointer" }}>
                            {"+ "}{I(vc?.l)}
                          </button>
                        </Fragment>
                      ))}
                      {" "}
                    </div>
                    {" "}
                  </div>
                  {" "}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {" "}
                    <div style={{ fontSize: "12px", color: "var(--color-neutral-700)", paddingBottom: "6px", borderBottom: "2px solid var(--color-text)" }}>
                      Sample values · Meta reviews the message with these
                    </div>
                    {" "}
                    {L($v.bVars).map((v: any, $index: number) => (
                      <Fragment key={$index}>
                        <div style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) minmax(0,1.2fr)", gap: "12px", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                          <span style={{ font: "700 13px ui-monospace,Menlo,monospace" }}>
                            {I(v?.tag)}
                          </span>
                          <span style={{ color: "var(--color-neutral-700)" }}>
                            {I(v?.what)}
                          </span>
                          <input className="input" value={v?.sample ?? ""} onChange={v?.onSample} style={{ minHeight: "34px", fontSize: "14px" }} />
                        </div>
                      </Fragment>
                    ))}
                    {" "}
                    {$v.bNoVars ? (
                      <>
                        <div style={{ padding: "10px 0", fontSize: "13px", color: "var(--color-neutral-700)" }}>
                          No variables yet. Add one above to personalise the message.
                        </div>
                      </>
                    ) : null}
                    {" "}
                  </div>
                  {" "}
                  <div className="field">
                    <label>
                      Footer · optional
                    </label>
                    {" "}
                    <input className="input" value={$v.b?.footer ?? ""} onChange={$v.onFooter} placeholder={$v.b?.footerPh} maxLength={60} disabled={$v.b?.footerLocked} />
                    {" "}
                    {$v.b?.footerLocked ? (
                      <>
                        <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                          Marketing templates always end with the opt-out line.
                        </span>
                      </>
                    ) : null}
                    {" "}
                  </div>
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {" "}
                  <h2 style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
                    <span style={{ color: "var(--color-accent-700)" }}>
                      4
                    </span>
                    {" · Buttons · optional"}
                  </h2>
                  {" "}
                  <div style={{ display: "flex", border: "2px solid var(--color-text)", width: "max-content", maxWidth: "100%", overflowX: "auto" }}>
                    {" "}
                    {L($v.btnKinds).map((k: any, $index: number) => (
                      <Fragment key={$index}>
                        <button onClick={k?.pick} style={{ padding: "6px 12px", border: "0", background: `${k?.bg ?? ""}`, color: `${k?.fg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer", whiteSpace: "nowrap" } as React.CSSProperties}>
                          {I(k?.l)}
                        </button>
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                  {L($v.bBtns).map((bt: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <div style={{ display: "grid", gridTemplateColumns: `${$v.btnCols ?? ""}`, gap: "8px", alignItems: "center" } as React.CSSProperties}>
                        {" "}
                        {bt?.isCta ? (
                          <>
                            <select className="input" value={bt?.type ?? ""} onChange={bt?.onType} style={{ minHeight: "38px" }}>
                              <option value="URL">
                                Visit website
                              </option>
                              <option value="Phone">
                                Call phone
                              </option>
                            </select>
                          </>
                        ) : null}
                        {" "}
                        <input className="input" value={bt?.text ?? ""} onChange={bt?.onText} placeholder="Button text" maxLength={25} style={{ minHeight: "38px" }} />
                        {" "}
                        {bt?.isCta ? (
                          <>
                            <input className="input" value={bt?.value ?? ""} onChange={bt?.onValue} placeholder={bt?.valuePh} style={{ minHeight: "38px" }} />
                          </>
                        ) : null}
                        {" "}
                        <button className="btn btn-icon" onClick={bt?.remove} aria-label="Remove button" style={{ width: "38px", height: "38px" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2" }}>
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                        {" "}
                      </div>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                  {$v.canAddBtn ? (
                    <>
                      <button className="btn btn-ghost" onClick={$v.addBtn} style={{ alignSelf: "flex-start", paddingLeft: "0" }}>
                        {"+ Add button · "}{I($v.btnLeft)}{" left"}
                      </button>
                    </>
                  ) : null}
                  {" "}
                </section>
                {" "}
                <section style={{ display: "flex", flexDirection: "column" }}>
                  {" "}
                  <h2 style={{ margin: "0 0 4px", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                    Before you submit
                  </h2>
                  {" "}
                  {L($v.checks).map((ck: any, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) auto", gap: "10px", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                        <span style={{ width: "18px", height: "18px", background: `${ck?.bg ?? ""}`, border: `2px solid ${ck?.bd ?? ""}`, color: "#fff", fontSize: "11px", fontWeight: "800", display: "grid", placeItems: "center" } as React.CSSProperties}>
                          {I(ck?.tick)}
                        </span>
                        <span>
                          {I(ck?.t)}
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", color: `${ck?.fg ?? ""}` } as React.CSSProperties}>
                          {I(ck?.tag)}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                  {" "}
                </section>
                {" "}
              </div>
              {" "}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", position: `${$v.prevPos ?? ""}`, top: "0" } as React.CSSProperties}>
                {" "}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--color-neutral-700)" }}>
                  <span>
                    {"Preview · "}{I($v.b?.langName)}
                  </span>
                  <span>
                    {I($v.b?.crLine)}
                  </span>
                </div>
                {" "}
                <div style={{ background: "#efeae2", padding: "16px 14px", border: "2px solid var(--color-text)", fontFamily: "-apple-system,system-ui,sans-serif", color: "#111b21", display: "flex", flexDirection: "column", gap: "3px" }}>
                  {" "}
                  <div style={{ alignSelf: "center", fontSize: "11px", background: "#fff", color: "#54656f", padding: "3px 9px", borderRadius: "7px", marginBottom: "6px" }}>
                    TODAY
                  </div>
                  {" "}
                  <div style={{ alignSelf: "flex-start", maxWidth: "92%", minWidth: "60%", background: "#fff", borderRadius: "8px", padding: "6px 6px 4px", boxShadow: "0 1px .5px rgba(11,20,26,.13)" }}>
                    {" "}
                    {$v.b?.hMedia ? (
                      <>
                        <div style={{ height: "120px", borderRadius: "6px", background: "#d1d7db", display: "grid", placeItems: "center", color: "#54656f", fontSize: "13px", marginBottom: "6px" }}>
                          {I($v.b?.headerType)}
                        </div>
                      </>
                    ) : null}
                    {" "}
                    <div style={{ padding: "0 3px" }}>
                      {" "}
                      {$v.b?.hText ? (
                        <>
                          <div style={{ fontWeight: "700", fontSize: "15px", marginBottom: "3px" }}>
                            {I($v.b?.headerPreview)}
                          </div>
                        </>
                      ) : null}
                      {" "}
                      <div style={{ fontSize: "14.5px", lineHeight: "1.4", whiteSpace: "pre-wrap" }}>
                        {I($v.b?.preview)}
                      </div>
                      {" "}
                      {$v.b?.hasFooterPrev ? (
                        <>
                          <div style={{ fontSize: "12.5px", color: "#667781", marginTop: "4px" }}>
                            {I($v.b?.footerPrev)}
                          </div>
                        </>
                      ) : null}
                      {" "}
                      <div style={{ fontSize: "11px", color: "#667781", textAlign: "right" }}>
                        9:41 am
                      </div>
                      {" "}
                    </div>
                    {" "}
                  </div>
                  {" "}
                  {L($v.bBtns).map((bt: any, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ alignSelf: "flex-start", width: "92%", minWidth: "60%", background: "#fff", borderRadius: "8px", padding: "8px", textAlign: "center", color: "#027eb5", fontSize: "14.5px", fontWeight: "500", boxShadow: "0 1px .5px rgba(11,20,26,.13)" }}>
                        {I(bt?.icon)}{" "}{I(bt?.textPrev)}
                      </div>
                    </Fragment>
                  ))}
                  {" "}
                </div>
                {" "}
                <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                  Meta usually reviews within minutes, sometimes up to 24 hours. You’ll see the result here and on WhatsApp.
                </span>
                {" "}
              </div>
              {" "}
            </div>
          </>
        ) : null}
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

const PakkaTemplates = createDC("Pakka Templates", PakkaTemplatesLogic, renderPakkaTemplates);
export default PakkaTemplates;

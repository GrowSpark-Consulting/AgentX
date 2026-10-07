/* eslint-disable */
// @ts-nocheck: TEMPORARY typing boundary. Ported prototype code written for `strict: false`;
// typing it is a follow-up (docs/frontend-architecture-map.md, "TypeScript").
"use client";
// Ported from the "Pakka App First Round" design. Logic and mock data are kept as authored;
// the markup is the original template expressed as JSX.

import React, { Fragment } from "react";
import { DCLogic, createDC, I, L, css } from "@/components/dashboard/runtime";
import { CLOSED, TPLS, RE_BIZ, convs, RE_STATS, RE_HOT, RE_TODAY } from "@/fixtures/dashboard/shell";
import { PLAN_NAMES, PLAN_KEYS, PLAN_CREDITS, FEATURES, GROUPS, PLAN_PRICES, PLAN_SEATS, PLAN_NUMBERS, TRIAL_CREDITS, SAMPLE_BALANCES, TOPUP_PACKS } from "@/fixtures/dashboard/plans";
import { PAKKA_IND } from "@/fixtures/dashboard/industries";
import PakkaLeads from "@/features/leads/pakka-leads";
import PakkaCalendar from "@/features/calendar/pakka-calendar";
import PakkaAgent from "@/features/agent/pakka-agent";
import PakkaKnowledge from "@/features/knowledge/pakka-knowledge";
import PakkaTemplates from "@/features/templates/pakka-templates";
import PakkaBilling from "@/features/billing/pakka-billing";
import PakkaSettings from "@/features/settings/pakka-settings";
import PakkaTeam from "@/features/team/pakka-team";

/** Editable props declared by the original component (editor metadata, kept for reference). */
export const PakkaAppProps = {"industry":{"editor":"enum","options":["re","salon","int","hotel","rest"],"default":"re","section":"Industry"},"theme":{"editor":"enum","options":["light","dark"],"default":"light","section":"View"},"frame":{"editor":"enum","options":["fit","phone"],"default":"fit","section":"View"},"account":{"editor":"enum","options":["paid","trial","ended"],"default":"paid","section":"Account state"},"credits":{"editor":"enum","options":["healthy","low","zero"],"default":"healthy","section":"Account state"},"plan":{"editor":"enum","options":["starter","growth","pro"],"default":"growth","section":"Account state"},"firstDay":{"editor":"boolean","default":false,"section":"Account state"},"productName":{"editor":"text","default":"Pakka","section":"Brand"}} as const;

const NAV: any=[
 ['home','Home','M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10'],
 ['inbox','Inbox','M7.9 20A9 9 0 1 0 4 16.1L2 22z'],
 ['leads','Leads','M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 3v18 M15 3v18'],
 ['calendar','Calendar','M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18'],
 ['features','Features','M8 6h8a6 6 0 0 1 0 12H8A6 6 0 0 1 8 6z M16 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z'],
 ['agent','Agent settings','M21 4h-7 M10 4H3 M21 12h-9 M8 12H3 M21 20h-5 M12 20H3 M14 2v4 M8 10v4 M16 18v4'],
 ['knowledge','Knowledge base','M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
 ['templates','Templates','M4 4h16v12H5.2L4 17.2z M8 8h8 M8 12h5'],
 ['billing','Billing & credits','M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M2 10h20'],
 ['team','Team','M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75'],
 ['settings','Settings','M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'],
];
const MORE_D='M4 6h16 M4 12h16 M4 18h16';
const IX=k=>(k&&k!=='re'&&PAKKA_IND&&PAKKA_IND[k])||null;
const fmt=n=>Number(n).toLocaleString('en-IN');
function badge(s){
 if(s>=70) return {label:'Hot',bg:'var(--color-accent-600)',fg:'#fff'};
 if(s>=40) return {label:'Warm',bg:'var(--color-accent-200)',fg:'var(--color-accent-800)'};
 return {label:'Cold',bg:'var(--color-neutral-300)',fg:'var(--color-neutral-800)'};
}

class PakkaAppLogic extends DCLogic {
  state: any = {tplSent:{},tplPick:0,indKey:'re',indPick:null,setSection:'profile',setNonce:0,screen:'home',w:typeof window!=='undefined'?window.innerWidth:1200,chatId:'karthik',filter:'all',q:'',convs:convs(),draft:'',modal:null,pack:0,extra:0,doneCredits:0,planOverride:null,dark:null,sheet:false,mobileChat:false,more:false,toast:null,
    on:{autoReply:true,qualify:true,booking:true,confirm:true,r24:true,r2:true,alerts:true,nudge:true,noshow:false,feedback:true,review:true,agenda:true,webhooks:false,topup:false},hours:'247',remind:'24',up:null};
  appRef=React.createRef<any>(); msgsRef=React.createRef<any>();
  measure=()=>{const w=Math.round(document.documentElement.clientWidth||window.innerWidth);if(w&&w!==this.state.w)this.setState({w});};
  componentDidMount(){
    window.addEventListener('resize',this.measure);
    if(window.ResizeObserver){this.ro=new ResizeObserver(this.measure);this.ro.observe(document.documentElement);}
    try{const u=new URLSearchParams(window.location.search);const c=u.get('chat'),sc=u.get('screen');this.urlInd=u.get('industry');this.pendingChat=c;
      if(!c&&sc&&NAV.find(n=>n[0]===sc))this.setState({screen:sc});}catch(e){}
    this._rd=()=>{this.forceUpdate();this.syncInd();};window.addEventListener('pakka-ind-ready',this._rd);
    this.syncInd();
    this.measure();requestAnimationFrame(this.measure);this.timers=[0,100,500].map(t=>setTimeout(this.measure,t));
    this.scroll();
  }
  componentWillUnmount(){window.removeEventListener('pakka-ind-ready',this._rd);this.ro&&this.ro.disconnect();window.removeEventListener('resize',this.measure);(this.timers||[]).forEach(clearTimeout);clearTimeout(this.tt);}
  componentDidUpdate(pp){if(pp&&pp.industry!==this.props.industry&&this.state.indPick)this.setState({indPick:null});this.syncInd();const s=this.state,k=[s.convs,s.chatId,s.screen,s.mobileChat,s.w];if(!this._last||k.some((v,i)=>v!==this._last[i])){this._last=k;this.scroll();}}
  indWant(){const p=this.props.industry;return this.state.indPick||(p&&p!=='re'?p:null)||this.urlInd||'re';}
  syncInd(){const k=this.indWant(),X=IX(k),key=X?k:'re';
    if(key!==this.state.indKey){const cv=X?JSON.parse(JSON.stringify(X.convs)):convs();this.setState({indKey:key,convs:cv,chatId:cv[0].id,sheet:false,mobileChat:false,filter:'all',q:''},()=>this.openPending());}
    else this.openPending();}
  openPending(){const c=this.pendingChat;if(!c)return;
    if(this.state.convs.find(x=>x.id===c)){this.pendingChat=null;this.openChat(c);this.setState({sheet:true});this.flash('Opened from staff alert · lead card pinned');}
    else if(!(this.urlInd&&this.urlInd!=='re'&&!PAKKA_IND))this.pendingChat=null;}
  scroll(){requestAnimationFrame(()=>{const m=this.msgsRef.current;if(m)m.scrollTop=m.scrollHeight;});}
  flash(t){clearTimeout(this.tt);this.setState({toast:t});this.tt=setTimeout(()=>this.setState({toast:null}),2600);}
  upd(id,fn){this.setState(s=>({convs:s.convs.map(c=>c.id===id?fn(c):c)}));}
  go(screen){this.setState(st=>({screen,more:false,sheet:false,mobileChat:false,...(screen==='settings'?{setSection:'business',setNonce:st.setNonce+1}:{})}));}
  openChat(id){this.setState({screen:'inbox',chatId:id,mobileChat:true,sheet:false,more:false,draft:''});this.upd(id,c=>({...c,unread:0}));}
  setMode(m){
    const id=this.state.chatId,c=this.state.convs.find(x=>x.id===id);if(!c||c.mode===m)return;
    if(m==='human')this.upd(id,c=>({...c,mode:'human',status:'human',owner:'You',msgs:[...c.msgs,{f:'sys',t:this.owner()+' took over · Maya paused'}]}));
    else{this.upd(id,c=>({...c,mode:'ai',status:'ai',why:'',msgs:[...c.msgs,{f:'sys',t:'Back to Maya · she has the full chat'}]}));this.setState({draft:''});this.flash('Maya is back on this chat');}
  }
  send(){
    const t=this.state.draft.trim();if(!t)return;const id=this.state.chatId;
    this.upd(id,c=>({...c,time:'9:56 am',msgs:[...c.msgs,{f:'staff',who:this.owner(),t,tm:'9:56 am'}],suggestion:''}));
    this.setState({draft:''});
  }
  owner(){const X=IX(this.state.indKey);return X?X.biz.owner:'Arun';}
  plan(){const p=this.state.planOverride??this.props.plan??'growth';return Math.max(0,PLAN_KEYS.indexOf(p));}

  renderVals(){
    const s=this.state,P=this.props;
    const X=IX(s.indKey),biz=X?X.biz:RE_BIZ;
    const dark=s.dark??(P.theme==='dark');
    const phone=(P.frame??'fit')==='phone';
    const acct=P.account??'paid', lvl=P.credits??'healthy', firstDay=!!P.firstDay;
    const isMobile=phone||s.w<720, isDesktop=!isMobile, isWide=isDesktop&&s.w>=1180;
    const plan=this.plan(), planName=acct==='paid'?PLAN_NAMES[plan]:'Free trial';
    const trial=acct!=='paid';
    const total=trial?TRIAL_CREDITS:PLAN_CREDITS[plan];
    let left=trial?SAMPLE_BALANCES.trial[lvl]:SAMPLE_BALANCES.paid[lvl];
    if(acct==='ended')left=0;
    if(firstDay&&!trial)left=total;
    left=Math.min(total,left)+s.extra;
    const totalShown=Math.max(total,left);
    const paused=acct==='ended'||left<=0, low=!paused&&left/totalShown<=0.2;
    const meterColor=paused||low?'var(--color-accent)':'var(--color-text)';
    const filled=Math.round(left/totalShown*30);
    const creditCells=Array.from({length:30},(_,i)=>({bg:i<filled?meterColor:'var(--color-neutral-300)'}));

    let banner=null;
    if(acct==='ended')banner={k:'paused',t:'Your trial has ended. Maya is paused, new chats go to your inbox.',cta:'Choose a plan',a:()=>this.go('billing')};
    else if(paused)banner={k:'paused',t:'Assistant paused, new chats go to your inbox. You’re out of credits.',cta:'Top up',a:()=>this.setState({modal:'topup'})};
    else if(low)banner={k:'soft',t:`You’ve used ${Math.round((1-left/totalShown)*100)}% of your credits. ${fmt(left)} left.`,cta:'Top up',a:()=>this.setState({modal:'topup'}),bg:'var(--color-accent-100)',fg:'var(--color-accent-800)'};
    else if(acct==='trial')banner={k:'soft',t:`4 days left in your trial · ${fmt(left)} of ${TRIAL_CREDITS} trial credits left`,cta:'Choose a plan',a:()=>this.go('billing'),bg:'var(--color-surface)',fg:'var(--color-text)'};

    const list=firstDay?[]:s.convs;
    const waitingN=list.filter(c=>c.status==='waiting').length;
    const nav=NAV.map(([k,l,d])=>({key:k,label:l,d,go:()=>this.go(k),bg:s.screen===k?'var(--color-text)':'transparent',fg:s.screen===k?'var(--color-bg)':'var(--color-text)',fw:s.screen===k?800:400,hasBadge:k==='inbox'&&waitingN>0,badge:waitingN}));
    const tabKeys: any=['home','inbox','leads','calendar'];
    const inMore=!tabKeys.includes(s.screen);
    const tabItems: any=[...nav.filter(n=>tabKeys.includes(n.key)).map(n=>({...n,fg:s.screen===n.key?'var(--color-accent)':'var(--color-text)',bar:s.screen===n.key?'var(--color-accent)':'transparent'})),
      {label:'More',d:MORE_D,go:()=>this.setState({more:true}),fg:inMore?'var(--color-accent)':'var(--color-text)',bar:inMore?'var(--color-accent)':'transparent',hasBadge:false}];
    const moreItems=nav.filter(n=>!tabKeys.includes(n.key));

    const filt: any={all:()=>true,ai:c=>c.mode==='ai'&&c.status!=='waiting',human:c=>c.status==='waiting',unread:c=>c.unread>0};
    const fLabels: any=[['all','All'],['ai','AI handling'],['human','Needs human'],['unread','Unread']];
    const filters=fLabels.map(([k,l])=>{const a=s.filter===k;return{label:l,count:list.filter(filt[k]).length,pick:()=>this.setState({filter:k}),bg:a?'var(--color-text)':'transparent',fg:a?'var(--color-bg)':'var(--color-text)',bd:a?'var(--color-text)':'var(--color-divider)'};});
    const q=s.q.trim().toLowerCase();
    const shown=list.filter(filt[s.filter]).filter(c=>!q||c.name.toLowerCase().includes(q)||c.phone.includes(q));
    const chatRows=shown.map(c=>{const b=badge(c.score);const last: any=[...c.msgs].reverse().find(m=>m.f!=='sys');const sel=c.id===s.chatId&&isDesktop;
      const tag=c.status==='waiting'?'Needs human':c.status==='human'?(c.owner==='You'?'You':c.owner):'AI';
      return{...c,time:CLOSED[s.indKey]===c.id?'Wed':c.time,open:()=>this.openChat(c.id),bg:sel?'var(--color-surface)':'transparent',fw:c.unread?800:600,sbg:b.bg,sfg:b.fg,score:`${b.label} ${c.score}`,
       preview:(last.f==='c'?'':last.f==='staff'?last.who+': ':'Maya: ')+(last.t||last.doc),tag,tbg:c.status==='waiting'?'var(--color-accent)':c.status==='human'?'var(--color-text)':'var(--color-neutral-200)',tfg:c.status==='waiting'||c.status==='human'?(c.status==='waiting'?'#fff':'var(--color-bg)'):'var(--color-neutral-800)',
       hasUnread:c.unread>0,timeColor:c.unread?'var(--wa-dark)':'var(--color-neutral-700)'};});
    const chat=list.find(c=>c.id===s.chatId);
    const closed=!!chat&&CLOSED[s.indKey]===chat.id&&!s.tplSent[s.indKey+chat.id];
    const chatMsgs=chat?chat.msgs.map(m=>{const out=m.f!=='c';return{...m,isSys:m.f==='sys',isBubble:m.f!=='sys',align:out?'flex-end':'flex-start',bg:out?'var(--wa-out)':'var(--wa-in)',hasWho:out,who:m.f==='ai'?'Maya · AI':m.who,whoColor:m.f==='ai'?'var(--wa-dark)':'#c2410c',hasDoc:!!m.doc,hasText:!!m.t,hasList:!!m.list};}):[];
    const lb: any=chat?badge(chat.score):{};
    const lead: any=chat?{...chat,bg:lb.bg,fg:lb.fg,label:lb.label,hasWhy:!!chat.why,owner:chat.owner==='You'?biz.owner+' (you)':chat.owner}:{};
    const sheetMode=!isWide;
    const mode=chat?chat.mode:'ai';

    const toggleOn=k=>!!s.on[k];
    const est=FEATURES.reduce((a,f)=>a+((f.n&&toggleOn(f.key)&&f.plan<=plan)?f.n:0),0);
    const featureGroups=GROUPS.map(g=>{
      const items=FEATURES.filter(f=>f.g===g).map(f=>{
        const locked=f.plan>plan&&!trial, isSeg=f.kind==='seg', on=isSeg?true:toggleOn(f.key);
        const name=f.kind==='timing'?`${s.remind}-hour reminder`:f.name;
        return{...f,desc:(X&&X.featDesc[f.key])||f.desc,name,locked,on,isSeg,isTiming:f.kind==='timing'&&!locked,isToggle:!locked&&!isSeg,
          cr:f.cr||`≈ ${fmt(f.n)} credits/month`,crColor:on&&!locked?'var(--color-text)':'var(--color-neutral-600)',
          hasPlan:f.plan>0,planLabel:PLAN_NAMES[f.plan],planBd:locked?'var(--color-accent)':'var(--color-divider)',planFg:locked?'var(--color-accent-700)':'var(--color-neutral-700)',planBg:'transparent',
          nameColor:locked?'var(--color-neutral-700)':'var(--color-text)',cursor:locked?'pointer':'default',
          onRow:locked?(e)=>{e&&e.stopPropagation&&e.stopPropagation();this.setState({modal:'upgrade',up:f.key});}:undefined,
          flip:()=>{this.setState(st=>({on:{...st.on,[f.key]:!st.on[f.key]}}));this.flash(`${name} ${on?'off':'on'}`);},
          trackBg:on?'var(--color-accent)':'transparent',trackBd:on?'var(--color-accent)':'var(--color-neutral-500)',knobLeft:on?'22px':'2px',knobBg:on?'#fff':'var(--color-neutral-500)'};
      });
      const avail=items.filter(i=>!i.locked);
      return{name:g,items,summary:`${avail.filter(i=>i.on).length} of ${items.length} on`};
    });
    const upF=FEATURES.find(f=>f.key===s.up)||FEATURES[13];
    const upPlan=PLAN_NAMES[upF.plan];

    const packs: any=TOPUP_PACKS.map(([c,p,l],i)=>({credits:fmt(c),price:p,leads:l,pick:()=>this.setState({pack:i}),bd:s.pack===i?'var(--color-accent)':'var(--color-divider)',bg:s.pack===i?'var(--color-accent-100)':'transparent',dot:s.pack===i?'var(--color-accent)':'transparent'}));
    const packCredits: any=TOPUP_PACKS[s.pack][0];

    const stats=firstDay?[['Enquiries','0','Day one'],['Qualified leads','0','—'],['Visits booked','0','—'],['After-hours handled','0','—']]:X?X.stats:RE_STATS;
    const hot=firstDay?[]:X?X.hot:RE_HOT;
    const st: any={Confirmed:['transparent','var(--color-text)','var(--color-text)'],Held:['var(--color-accent-100)','var(--color-accent-800)','var(--color-accent-300)']};
    const bookings=firstDay?[]:(X?X.bookings:RE_TODAY)
      .map(([time,name,place,staff,status])=>({time,name,place,staff,status,bg:st[status][0],fg:st[status][1],bd:st[status][2]}));

    const pad=isMobile?'20px 16px 32px':'32px 40px 48px';
    const showChat=!isMobile||s.mobileChat;
    return{
      productName:P.productName||'Spark Agent',biz,indKey:s.indKey,onIndustry:e=>{const v=e.target.value;this.urlInd=null;this.setState({indPick:v,screen:s.screen});},
      themeClass:dark?'pk-dark':'pk-light',
      outerBg:phone?'var(--color-neutral-300)':'var(--color-bg)',outerPad:phone?'32px 16px':'0',
      appRef:this.appRef,msgsRef:this.msgsRef,
      appW:phone?'390px':'100%',appH:phone?'844px':'calc(100vh - var(--preview-banner-h, 0px))',appBorder:phone?'2px solid var(--color-text)':'0',appShadow:phone?'var(--shadow-lg)':'none',
      isDesktop,isMobile,planName,
      navItems:nav,tabItems,moreItems,moreOpen:s.more&&isMobile,closeMore:()=>this.setState({more:false}),
      showTabbar:isMobile&&!(s.screen==='inbox'&&s.mobileChat),
      showTopbar:!(isMobile&&s.screen==='inbox'&&s.mobileChat),
      topPad:isMobile?'10px 16px':'14px 40px',sidePad:isMobile?'16px':'40px',
      title:({home:'Home',inbox:'Inbox',leads:'Leads',calendar:'Calendar',features:'Features',agent:'Agent settings',knowledge:'Knowledge base',billing:'Billing & credits',team:'Team',settings:'Settings',templates:'Message templates'})[s.screen],
      mayaDot:paused||!s.on.autoReply?'var(--color-accent)':'var(--wa-green)',mayaStatus:paused?'Maya is paused':!s.on.autoReply?'Auto-reply off':'Maya is replying',
      creditsLeftFmt:fmt(left),creditsTotalFmt:fmt(totalShown),creditPct:Math.max(0,Math.min(100,left/totalShown*100))+'%',meterColor,pillBorder:paused||low?'var(--color-accent)':'var(--color-divider)',
      creditNumColor:paused||low?'var(--color-accent-700)':'var(--color-text)',creditCells,
      resetText:trial?'Trial ends Wed, 28 Oct':'Resets 1 Nov',
      leadsLeftText:paused?'New chats go to your inbox until you top up.':`Enough for about ${fmt(Math.round(left/15))} more leads at your pace.`,
      openTopup:()=>this.setState({modal:'topup'}),toggleDark:()=>this.setState({dark:!dark}),
      bannerPaused:banner&&banner.k==='paused',bannerSoft:banner&&banner.k==='soft',bannerText:banner?banner.t:'',bannerCta:banner?banner.cta:'',bannerAction:banner?banner.a:null,softBg:banner&&banner.bg,softFg:banner&&banner.fg,
      mainOverflow:s.screen==='inbox'?'hidden':'auto',
      isHome:s.screen==='home',isInbox:s.screen==='inbox',isFeatures:s.screen==='features',
      isLeads:s.screen==='leads',isCalendar:s.screen==='calendar',isAgent:s.screen==='agent',isKnowledge:s.screen==='knowledge',isBilling:s.screen==='billing',isTeam:s.screen==='team',isSettings:s.screen==='settings',isTemplates:s.screen==='templates',setSection:s.setSection,setNonce:s.setNonce,
      goProfile:()=>this.setState(st=>({screen:'settings',setSection:'profile',setNonce:st.setNonce+1,more:false,sheet:false,mobileChat:false})),profBg:s.screen==='settings'?'var(--color-surface)':'transparent',
      openChatById:id=>this.openChat(id),planKey:PLAN_KEYS[plan],creditsLeftNum:left,creditsTotalNum:totalShown,isTrial:trial,
      changePlan:k=>{const np=PLAN_KEYS.indexOf(k);if(trial||np>plan){this.setState(st=>({planOverride:k,extra:st.extra+Math.max(0,PLAN_CREDITS[np]-PLAN_CREDITS[plan])}));this.flash(`You’re on ${PLAN_NAMES[np]}. Extra credits added.`);}else this.flash(`You’ll move to ${PLAN_NAMES[np]} on 1 Nov`);},
      pad,h1:isMobile?'30px':'42px',statSize:isMobile?'32px':'40px',
      homeSub:firstDay?'Maya is live. Your first enquiries will show up here.':`Maya handled 9 chats overnight. ${waitingN} people are waiting for your team.`,
      homeTopCols:isWide?'minmax(0,5fr) minmax(0,6fr)':'minmax(0,1fr)',homeBotCols:isWide?'minmax(0,1fr) minmax(0,1fr)':'minmax(0,1fr)',
      stats:stats.map(([label,value,note],i)=>({label,value,note,pl:i%2?'16px':'0'})),
      firstDay,hotCount:firstDay?'':`${hot.filter(h=>h.urgent).length} waiting`,
      hotLeads:hot.map(h=>{const b=badge(h.score);return{...h,...b,open:()=>this.openChat(h.id),reasonColor:h.urgent?'var(--color-accent-700)':'var(--color-neutral-700)'};}),
      bookings,goCalendar:()=>this.go('calendar'),goLeads:()=>this.go('leads'),goHome:()=>this.go('home'),
      inboxCols:isMobile?'minmax(0,1fr)':isWide?'320px minmax(0,1fr) 360px':'300px minmax(0,1fr)',
      showList:!isMobile||!s.mobileChat,showChat,
      q:s.q,onQ:e=>this.setState({q:e.target.value}),filters,chatRows,
      inboxEmpty:firstDay,noFilterMatch:!firstDay&&shown.length===0,copyLink:()=>this.flash('Test link copied: wa.me/9190xxxxxx?text='+biz.testCode),
      winClosed:closed,dayChip:chat&&CLOSED[s.indKey]===chat.id?'WEDNESDAY':'TODAY',winOpen:!closed,chatFirst:chat?chat.name.split(' ')[0]:'',openTpl:()=>this.setState({modal:'tpl',tplPick:0}),modalTpl:s.modal==='tpl',
      tplOpts:TPLS.map(([key,label,cat,cr,text],i)=>({label,cat,cr,text:text.split('{name}').join(chat?chat.name.split(' ')[0]:'').split('{biz}').join(biz.name),pick:()=>this.setState({tplPick:i}),bd:s.tplPick===i?'var(--color-accent)':'var(--color-divider)',bg:s.tplPick===i?'var(--color-accent-100)':'transparent',dot:s.tplPick===i?'var(--color-accent)':'transparent'})),
      sendTpl:()=>{const [key,,cat,cr,text]=TPLS[s.tplPick];const t=text.split('{name}').join(chat.name.split(' ')[0]).split('{biz}').join(biz.name);this.upd(chat.id,c=>({...c,time:'9:56 am',msgs:[...c.msgs,{f:'sys',t:`Template sent · ${key} · ${cr} credit${cr>1?'s':''}`},{f:'staff',who:this.owner(),t,tm:'9:56 am'}]}));this.setState(st=>({modal:null,tplSent:{...st.tplSent,[st.indKey+chat.id]:true},extra:st.extra-cr}));this.flash('Template sent. Free typing opens when they reply.');},
      goTemplates:()=>{this.setState({modal:null});this.go('templates');},
      hasChat:!!chat,chat:chat||{},chatMsgs,bubbleMax:isMobile?'86%':'72%',
      backToList:()=>this.setState({mobileChat:false,sheet:false}),
      setAI:()=>this.setMode('ai'),setHuman:()=>this.setMode('human'),
      aiBg:mode==='ai'?'var(--color-text)':'transparent',aiFg:mode==='ai'?'var(--color-bg)':'var(--color-text)',
      huBg:mode==='human'?'var(--color-accent)':'transparent',huFg:mode==='human'?'#fff':'var(--color-text)',
      stripWaiting:chat&&chat.status==='waiting',stripHuman:chat&&chat.mode==='human',stripAI:chat&&chat.status==='ai',
      chatWhy:chat?(chat.why||'').toLowerCase():'',chatOwner:chat&&chat.owner==='You'?'You’re':(chat?chat.owner+' is':''),
      showSuggestion:chat&&chat.status!=='ai'&&!!chat.suggestion,chatSuggestion:chat?chat.suggestion:'',useSuggestion:()=>{if(chat.mode!=='human')this.setMode('human');this.setState({draft:chat.suggestion});},
      draft:s.draft,onDraft:e=>this.setState({draft:e.target.value}),onKey:e=>{if(e.key==='Enter')this.send();},send:()=>this.send(),
      composerOff:mode!=='human',composerPh:mode==='human'?'Type a message':'Maya is replying. Switch to Human to type.',
      sendOff:mode!=='human'||!s.draft.trim(),sendOpacity:mode!=='human'||!s.draft.trim()?0.4:1,
      showLeadBtn:!isWide,openSheet:()=>this.setState({sheet:true}),closeSheet:()=>this.setState({sheet:false}),
      leadVisible:!!chat&&(isWide||(s.sheet&&showChat)),sheetMode,sheetBackdrop:sheetMode?'block':'none',
      lpPos:sheetMode?'absolute':'static',lpMaxH:sheetMode?'82%':'none',lpBl:sheetMode?'0':'2px solid var(--color-divider)',lpBt:sheetMode?'2px solid var(--color-text)':'0',lpSh:sheetMode?'var(--shadow-lg)':'none',
      lead,
      featureGroups,rowCols:isMobile?'minmax(0,1fr) auto':'minmax(0,1fr) 170px 120px',
      remind:s.remind,onRemind:e=>this.setState({remind:e.target.value}),
      setHours247:()=>this.setState({hours:'247'}),setHoursAfter:()=>this.setState({hours:'after'}),
      h247Bg:s.hours==='247'?'var(--color-text)':'transparent',h247Fg:s.hours==='247'?'var(--color-bg)':'var(--color-text)',
      hAfterBg:s.hours==='after'?'var(--color-text)':'transparent',hAfterFg:s.hours==='after'?'var(--color-bg)':'var(--color-text)',
      estFmt:fmt(est),planCreditsFmt:fmt(total)+(trial?' trial credits':' a month'),estPct:Math.min(100,est/PLAN_CREDITS[plan]*100)+'%',
      modalTopup:s.modal==='topup',modalTopupDone:s.modal==='topupDone',modalUpgrade:s.modal==='upgrade',
      closeModal:()=>this.setState({modal:null}),stop:e=>e.stopPropagation(),
      packs,packPrice:TOPUP_PACKS[s.pack][1],doneCredits:fmt(s.doneCredits),
      payTopup:()=>this.setState(st=>({modal:'topupDone',extra:st.extra+packCredits,doneCredits:packCredits})),
      goBillingFromModal:e=>{e&&e.preventDefault&&e.preventDefault();this.setState({modal:null});this.go('billing');},
      upFeature:upF.name,upPlan,upDesc:upF.desc,
      upRows:[['Price','₹'+fmt(PLAN_PRICES[plan])+'/mo','₹'+fmt(PLAN_PRICES[upF.plan])+'/mo'],['Credits a month',fmt(PLAN_CREDITS[plan]),fmt(PLAN_CREDITS[upF.plan])],['Staff seats',PLAN_SEATS[plan],PLAN_SEATS[upF.plan]],['WhatsApp numbers',PLAN_NUMBERS[plan],PLAN_NUMBERS[upF.plan]]].map(([k,a,b])=>({k,a,b})),
      doUpgrade:()=>{const np=PLAN_KEYS[upF.plan];this.setState(st=>({modal:null,planOverride:np,on:{...st.on,[upF.key]:true},extra:st.extra+(PLAN_CREDITS[upF.plan]-PLAN_CREDITS[plan])}));this.flash(`You’re on ${upPlan}. ${upF.name} is on.`);},
      hasToast:!!s.toast,toast:s.toast,toastBottom:isMobile&&!(s.screen==='inbox'&&s.mobileChat)?'72px':'16px',
    };
  }
}

function renderPakkaApp($v: any) {
  return (
    <>
      <div className={$v.themeClass} style={{ minHeight: "calc(100vh - var(--preview-banner-h, 0px))", background: `${$v.outerBg ?? ""}`, color: "var(--color-text)", fontFamily: "var(--font-body)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: `${$v.outerPad ?? ""}` } as React.CSSProperties}>
        <div ref={$v.appRef} style={{ position: "relative", display: "flex", width: `${$v.appW ?? ""}`, height: `${$v.appH ?? ""}`, background: "var(--color-bg)", overflow: "hidden", border: `${$v.appBorder ?? ""}`, boxShadow: `${$v.appShadow ?? ""}` } as React.CSSProperties}>
          {$v.isDesktop ? (
            <>
              <nav style={{ width: "236px", flex: "none", display: "flex", flexDirection: "column", borderRight: "2px solid var(--color-divider)", height: "100%" }}>
                {" "}
                <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid var(--color-divider)" }}>
                  {" "}
                  <span style={{ width: "20px", height: "20px", background: "var(--color-accent)", display: "block" }}></span>
                  {" "}
                  <span style={{ fontWeight: "800", fontSize: "20px", letterSpacing: "-0.02em" }}>
                    {I($v.productName)}
                  </span>
                  {" "}
                </div>
                {" "}
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}>
                  {" "}
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>
                    {I($v.biz?.name)}
                  </div>
                  {" "}
                  <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                    {I($v.biz?.sector)}{" · "}{I($v.biz?.city)}{" · "}{I($v.planName)}
                  </div>
                  {" "}
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "10px", fontSize: "10px", fontWeight: "600", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>
                    {"Sample industry "}
                    <select className="input" value={$v.indKey ?? ""} onChange={$v.onIndustry} style={{ minHeight: "32px", fontSize: "13px", padding: "4px 8px", textTransform: "none", letterSpacing: "0", fontWeight: "600" }}>
                      {" "}
                      <option value="re">
                        Real estate
                      </option>
                      <option value="salon">
                        Salon
                      </option>
                      <option value="int">
                        Interior design
                      </option>
                      <option value="hotel">
                        Hotel
                      </option>
                      <option value="rest">
                        Restaurant
                      </option>
                      {" "}
                    </select>
                    {" "}
                  </label>
                  {" "}
                </div>
                {" "}
                <div style={{ display: "flex", flexDirection: "column", padding: "10px", gap: "2px", flex: "1", overflow: "auto" }}>
                  {" "}
                  {L($v.navItems).map((n: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <button onClick={n?.go} className="hover:[box-shadow:inset_0_0_0_2px_var(--color-text)]!" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "9px 12px", border: "0", background: `${n?.bg ?? ""}`, color: `${n?.fg ?? ""}`, font: "inherit", fontSize: "14px", fontWeight: `${n?.fw ?? ""}`, cursor: "pointer", textAlign: "left" } as React.CSSProperties}>
                        {" "}
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", flex: "none" }}>
                          <path d={n?.d} />
                        </svg>
                        {" "}
                        <span style={{ flex: "1" }}>
                          {I(n?.label)}
                        </span>
                        {" "}
                        {n?.hasBadge ? (
                          <>
                            <span style={{ fontSize: "11px", fontWeight: "800", background: "var(--color-accent)", color: "#fff", padding: "1px 7px" }}>
                              {I(n?.badge)}
                            </span>
                          </>
                        ) : null}
                        {" "}
                      </button>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                </div>
                {" "}
                <div style={{ padding: "16px 20px", borderTop: "2px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {" "}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "var(--color-neutral-700)" }}>
                      Credits left
                    </span>
                    <span style={{ fontWeight: "800" }}>
                      {I($v.creditsLeftFmt)}{" / "}{I($v.creditsTotalFmt)}
                    </span>
                  </div>
                  {" "}
                  <div style={{ height: "6px", background: "var(--color-neutral-300)" }}>
                    <div style={{ height: "6px", width: `${$v.creditPct ?? ""}`, background: `${$v.meterColor ?? ""}` } as React.CSSProperties}></div>
                  </div>
                  {" "}
                  <button className="btn btn-secondary" onClick={$v.openTopup} style={{ justifyContent: "flex-start", marginTop: "4px" }}>
                    Top up
                  </button>
                  {" "}
                </div>
                {" "}
                <button onClick={$v.goProfile} className="hover:[background:var(--color-neutral-200)]!" style={{ padding: "12px 20px", border: "0", borderTop: "1px solid var(--color-divider)", background: `${$v.profBg ?? ""}`, color: "var(--color-text)", font: "inherit", display: "flex", alignItems: "center", gap: "10px", textAlign: "left", cursor: "pointer" } as React.CSSProperties}>
                  {" "}
                  <span style={{ width: "32px", height: "32px", background: "var(--color-text)", color: "var(--color-bg)", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "800" }}>
                    {I($v.biz?.ownerIni)}
                  </span>
                  {" "}
                  <div style={{ fontSize: "13px", lineHeight: "1.3", flex: "1" }}>
                    <div style={{ fontWeight: "600" }}>
                      {I($v.biz?.owner)}
                    </div>
                    <div style={{ color: "var(--color-neutral-700)", fontSize: "12px" }}>
                      Owner · My profile
                    </div>
                  </div>
                  {" "}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2.5" }}>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  {" "}
                </button>
              </nav>
            </>
          ) : null}
          <div style={{ position: "relative", flex: "1", minWidth: "0", display: "flex", flexDirection: "column", height: "100%" }}>
            {" "}
            {$v.showTopbar ? (
              <>
                {" "}
                <header style={{ display: "flex", alignItems: "center", gap: "12px", padding: `${$v.topPad ?? ""}`, borderBottom: "2px solid var(--color-divider)", flex: "none" } as React.CSSProperties}>
                  {" "}
                  {$v.isMobile ? (
                    <>
                      {" "}
                      <span style={{ width: "16px", height: "16px", background: "var(--color-accent)", display: "block", flex: "none" }}></span>
                      {" "}
                      <div style={{ lineHeight: "1.15", minWidth: "0" }}>
                        <div style={{ fontWeight: "800", fontSize: "16px" }}>
                          {I($v.title)}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-neutral-700)" }}>
                          {I($v.biz?.name)}
                        </div>
                      </div>
                      {" "}
                    </>
                  ) : null}
                  {" "}
                  {$v.isDesktop ? (
                    <>
                      <div style={{ fontWeight: "800", fontSize: "18px" }}>
                        {I($v.title)}
                      </div>
                    </>
                  ) : null}
                  {" "}
                  <div style={{ flex: "1" }}></div>
                  {" "}
                  {$v.isDesktop ? (
                    <>
                      {" "}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                        <span style={{ width: "8px", height: "8px", background: `${$v.mayaDot ?? ""}`, display: "block" } as React.CSSProperties}></span>
                        {I($v.mayaStatus)}
                      </div>
                      {" "}
                    </>
                  ) : null}
                  {" "}
                  <button onClick={$v.openTopup} className="hover:[background:var(--color-neutral-200)]!" style={{ display: "flex", alignItems: "center", gap: "8px", border: `2px solid ${$v.pillBorder ?? ""}`, background: "transparent", color: "var(--color-text)", font: "inherit", fontSize: "13px", fontWeight: "600", padding: "5px 10px", cursor: "pointer" } as React.CSSProperties}>
                    {" "}
                    <span style={{ width: "8px", height: "8px", background: `${$v.meterColor ?? ""}`, display: "block" } as React.CSSProperties}></span>
                    {I($v.creditsLeftFmt)}{" credits "}
                  </button>
                  {" "}
                  <button className="btn btn-secondary btn-icon" onClick={$v.toggleDark} aria-label="Toggle dark mode" style={{ width: "36px", height: "36px" }}>
                    {" "}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                    {" "}
                  </button>
                  {" "}
                  {$v.isMobile ? (
                    <>
                      <button onClick={$v.goProfile} aria-label="My profile" style={{ width: "36px", height: "36px", flex: "none", border: "0", background: "var(--color-text)", color: "var(--color-bg)", font: "inherit", fontSize: "12px", fontWeight: "800", cursor: "pointer" }}>
                        {I($v.biz?.ownerIni)}
                      </button>
                    </>
                  ) : null}
                  {" "}
                </header>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.bannerPaused ? (
              <>
                {" "}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: `12px ${$v.sidePad ?? ""}`, background: "var(--color-accent)", color: "#fff", flex: "none" } as React.CSSProperties}>
                  {" "}
                  <div style={{ flex: "1", minWidth: "200px", fontWeight: "800", fontSize: "15px", lineHeight: "1.3" }}>
                    {I($v.bannerText)}
                  </div>
                  {" "}
                  <button onClick={$v.bannerAction} className="hover:[background:var(--color-accent-100)]!" style={{ background: "#fff", color: "var(--color-accent-700)", border: "0", font: "inherit", fontWeight: "800", fontSize: "14px", padding: "8px 14px", cursor: "pointer" }}>
                    {I($v.bannerCta)}
                  </button>
                  {" "}
                </div>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.bannerSoft ? (
              <>
                {" "}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: `10px ${$v.sidePad ?? ""}`, background: `${$v.softBg ?? ""}`, color: `${$v.softFg ?? ""}`, borderBottom: "1px solid var(--color-divider)", flex: "none" } as React.CSSProperties}>
                  {" "}
                  <div style={{ flex: "1", minWidth: "200px", fontWeight: "600", fontSize: "14px" }}>
                    {I($v.bannerText)}
                  </div>
                  {" "}
                  <button className="btn btn-secondary" onClick={$v.bannerAction} style={{ color: "inherit", borderColor: "currentColor" }}>
                    {I($v.bannerCta)}
                  </button>
                  {" "}
                </div>
                {" "}
              </>
            ) : null}
            {" "}
            <main style={{ flex: "1", minHeight: "0", overflow: `${$v.mainOverflow ?? ""}`, display: "flex", flexDirection: "column" } as React.CSSProperties}>
              {" "}
              {$v.isHome ? (
                <>
                  {" "}
                  <div data-screen-label="03 Home" style={{ padding: `${$v.pad ?? ""}`, display: "flex", flexDirection: "column", gap: "28px", maxWidth: "1240px", width: "100%" } as React.CSSProperties}>
                    {" "}
                    <div>
                      {" "}
                      <div style={{ fontSize: "12px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-neutral-700)", marginBottom: "6px" }}>
                        Saturday, 24 Oct 2026
                      </div>
                      {" "}
                      <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
                        {"Good morning, "}{I($v.biz?.owner)}
                      </h1>
                      {" "}
                      <p style={{ margin: "6px 0 0", color: "var(--color-neutral-700)", fontSize: "15px", textWrap: "pretty" }}>
                        {I($v.homeSub)}
                      </p>
                      {" "}
                    </div>
                    {" "}
                    <div style={{ display: "grid", gridTemplateColumns: `${$v.homeTopCols ?? ""}`, gap: "24px" } as React.CSSProperties}>
                      {" "}
                      <div style={{ background: "var(--color-surface)", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                        {" "}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                          {" "}
                          <span style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-accent-700)", fontWeight: "600" }}>
                            {"Credits · "}{I($v.planName)}
                          </span>
                          {" "}
                          <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                            {I($v.resetText)}
                          </span>
                          {" "}
                        </div>
                        {" "}
                        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                          {" "}
                          <span style={{ fontSize: "56px", fontWeight: "800", lineHeight: "1", letterSpacing: "-0.03em", color: `${$v.creditNumColor ?? ""}` } as React.CSSProperties}>
                            {I($v.creditsLeftFmt)}
                          </span>
                          {" "}
                          <span style={{ fontSize: "15px", color: "var(--color-neutral-700)" }}>
                            {"of "}{I($v.creditsTotalFmt)}{" left"}
                          </span>
                          {" "}
                        </div>
                        {" "}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(30,minmax(0,1fr))", gap: "3px", height: "28px" }}>
                          {" "}
                          {L($v.creditCells).map((c: any, $index: number) => (
                            <Fragment key={$index}>
                              <span style={{ background: `${c?.bg ?? ""}`, display: "block" } as React.CSSProperties}></span>
                            </Fragment>
                          ))}
                          {" "}
                        </div>
                        {" "}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          {" "}
                          <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                            {I($v.leadsLeftText)}
                          </span>
                          {" "}
                          <button className="btn btn-primary" onClick={$v.openTopup}>
                            Top up credits
                          </button>
                          {" "}
                        </div>
                        {" "}
                      </div>
                      {" "}
                      <div>
                        {" "}
                        <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-700)", fontWeight: "600", marginBottom: "10px" }}>
                          This month
                        </div>
                        {" "}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "2px", background: "var(--color-divider)", borderTop: "2px solid var(--color-text)", borderBottom: "2px solid var(--color-divider)" }}>
                          {" "}
                          {L($v.stats).map((s: any, $index: number) => (
                            <Fragment key={$index}>
                              {" "}
                              <div style={{ background: "var(--color-bg)", padding: "16px 16px 18px 0", paddingLeft: `${s?.pl ?? ""}`, display: "flex", flexDirection: "column", gap: "4px" } as React.CSSProperties}>
                                {" "}
                                <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                                  {I(s?.label)}
                                </span>
                                {" "}
                                <span style={{ fontSize: `${$v.statSize ?? ""}`, fontWeight: "800", lineHeight: "1.05", letterSpacing: "-0.02em" } as React.CSSProperties}>
                                  {I(s?.value)}
                                </span>
                                {" "}
                                <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                                  {I(s?.note)}
                                </span>
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
                    </div>
                    {" "}
                    <div style={{ display: "grid", gridTemplateColumns: `${$v.homeBotCols ?? ""}`, gap: "32px" } as React.CSSProperties}>
                      {" "}
                      <section>
                        {" "}
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                          {" "}
                          <h2 style={{ margin: "0", fontSize: "20px" }}>
                            Hot leads needing you
                          </h2>
                          {" "}
                          <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                            {I($v.hotCount)}
                          </span>
                          {" "}
                        </div>
                        {" "}
                        {$v.firstDay ? (
                          <>
                            <p style={{ padding: "20px 0", color: "var(--color-neutral-700)", margin: "0" }}>
                              No leads yet. Hot leads show up here the moment Maya spots one.
                            </p>
                          </>
                        ) : null}
                        {" "}
                        {L($v.hotLeads).map((h: any, $index: number) => (
                          <Fragment key={$index}>
                            {" "}
                            <button onClick={h?.open} className="hover:[background:var(--color-neutral-200)]!" style={{ width: "100%", display: "grid", gridTemplateColumns: "52px minmax(0,1fr) auto", gap: "14px", alignItems: "center", padding: "14px 0", border: "0", borderBottom: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", font: "inherit", textAlign: "left", cursor: "pointer" }}>
                              {" "}
                              <span style={{ width: "52px", height: "52px", background: `${h?.bg ?? ""}`, color: `${h?.fg ?? ""}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: "1" } as React.CSSProperties}>
                                <span style={{ fontSize: "20px", fontWeight: "800" }}>
                                  {I(h?.score)}
                                </span>
                                <span style={{ fontSize: "10px", fontWeight: "600", marginTop: "2px" }}>
                                  {I(h?.label)}
                                </span>
                              </span>
                              {" "}
                              <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                                {" "}
                                <span style={{ fontWeight: "800", fontSize: "15px" }}>
                                  {I(h?.name)}{" "}
                                  <span style={{ fontWeight: "400", color: "var(--color-neutral-700)", fontSize: "13px" }}>
                                    {"· "}{I(h?.need)}
                                  </span>
                                </span>
                                {" "}
                                <span style={{ fontSize: "13px", color: `${h?.reasonColor ?? ""}`, fontWeight: "600" } as React.CSSProperties}>
                                  {I(h?.reason)}
                                </span>
                                {" "}
                              </span>
                              {" "}
                              <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-accent-700)", display: "flex", alignItems: "center", gap: "4px", paddingRight: "6px" }}>
                                {I(h?.cta)}{" "}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2.5" }}>
                                  <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                              </span>
                              {" "}
                            </button>
                            {" "}
                          </Fragment>
                        ))}
                        {" "}
                      </section>
                      {" "}
                      <section>
                        {" "}
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                          {" "}
                          <h2 style={{ margin: "0", fontSize: "20px" }}>
                            {I($v.biz?.todayTitle)}
                          </h2>
                          {" "}
                          <button className="btn btn-ghost" onClick={$v.goCalendar}>
                            Calendar
                          </button>
                          {" "}
                        </div>
                        {" "}
                        {$v.firstDay ? (
                          <>
                            <p style={{ padding: "20px 0", color: "var(--color-neutral-700)", margin: "0" }}>
                              {I($v.biz?.emptyToday)}
                            </p>
                          </>
                        ) : null}
                        {" "}
                        {L($v.bookings).map((b: any, $index: number) => (
                          <Fragment key={$index}>
                            {" "}
                            <div style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) auto", gap: "14px", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
                              {" "}
                              <span style={{ fontWeight: "800", fontSize: "17px", letterSpacing: "-0.01em" }}>
                                {I(b?.time)}
                              </span>
                              {" "}
                              <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                                {" "}
                                <span style={{ fontWeight: "600", fontSize: "15px" }}>
                                  {I(b?.name)}
                                </span>
                                {" "}
                                <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                                  {I(b?.place)}{" · "}{I(b?.staff)}
                                </span>
                                {" "}
                              </span>
                              {" "}
                              <span style={{ fontSize: "11px", fontWeight: "600", padding: "3px 8px", background: `${b?.bg ?? ""}`, color: `${b?.fg ?? ""}`, border: `1px solid ${b?.bd ?? ""}` } as React.CSSProperties}>
                                {I(b?.status)}
                              </span>
                              {" "}
                            </div>
                            {" "}
                          </Fragment>
                        ))}
                        {" "}
                      </section>
                      {" "}
                    </div>
                    {" "}
                  </div>
                  {" "}
                </>
              ) : null}
              {" "}
              {$v.isInbox ? (
                <>
                  {" "}
                  <div data-screen-label="04 Inbox" style={{ display: "grid", gridTemplateColumns: `${$v.inboxCols ?? ""}`, flex: "1", minHeight: "0", height: "100%" } as React.CSSProperties}>
                    {" "}
                    {$v.showList ? (
                      <>
                        {" "}
                        <div style={{ display: "flex", flexDirection: "column", minHeight: "0", borderRight: "2px solid var(--color-divider)" }}>
                          {" "}
                          <div style={{ padding: "14px 16px 10px", display: "flex", flexDirection: "column", gap: "10px", borderBottom: "1px solid var(--color-divider)" }}>
                            {" "}
                            <input className="input" placeholder="Search name or number" value={$v.q ?? ""} onChange={$v.onQ} style={{ minHeight: "40px" }} />
                            {" "}
                            <div style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
                              {" "}
                              {L($v.filters).map((fl: any, $index: number) => (
                                <Fragment key={$index}>
                                  {" "}
                                  <button onClick={fl?.pick} style={{ flex: "none", border: `1px solid ${fl?.bd ?? ""}`, background: `${fl?.bg ?? ""}`, color: `${fl?.fg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "600", padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" } as React.CSSProperties}>
                                    {I(fl?.label)}{" "}{I(fl?.count)}
                                  </button>
                                  {" "}
                                </Fragment>
                              ))}
                              {" "}
                            </div>
                            {" "}
                          </div>
                          {" "}
                          <div style={{ flex: "1", overflow: "auto" }}>
                            {" "}
                            {$v.inboxEmpty ? (
                              <>
                                {" "}
                                <div style={{ padding: "28px 20px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
                                  {" "}
                                  <div style={{ width: "48px", height: "48px", border: "2px solid var(--color-text)", display: "grid", placeItems: "center" }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
                                    </svg>
                                  </div>
                                  {" "}
                                  <h3 style={{ margin: "0", fontSize: "20px" }}>
                                    No chats yet
                                  </h3>
                                  {" "}
                                  <p style={{ margin: "0", color: "var(--color-neutral-700)", fontSize: "14px", textWrap: "pretty" }}>
                                    When customers WhatsApp you, Maya replies and every chat lands here. Try it yourself first.
                                  </p>
                                  {" "}
                                  <button className="btn btn-primary" onClick={$v.copyLink}>
                                    Copy my test link
                                  </button>
                                  {" "}
                                </div>
                                {" "}
                              </>
                            ) : null}
                            {" "}
                            {$v.noFilterMatch ? (
                              <>
                                <p style={{ padding: "20px 16px", margin: "0", color: "var(--color-neutral-700)", fontSize: "14px" }}>
                                  No chats here right now.
                                </p>
                              </>
                            ) : null}
                            {" "}
                            {L($v.chatRows).map((r: any, $index: number) => (
                              <Fragment key={$index}>
                                {" "}
                                <button onClick={r?.open} className="hover:[background:var(--color-neutral-200)]!" style={{ width: "100%", display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto", gap: "12px", padding: "12px 16px", border: "0", borderBottom: "1px solid var(--color-divider)", background: `${r?.bg ?? ""}`, color: "var(--color-text)", font: "inherit", textAlign: "left", cursor: "pointer" } as React.CSSProperties}>
                                  {" "}
                                  <span style={{ width: "40px", height: "40px", background: "var(--color-neutral-300)", display: "grid", placeItems: "center", fontWeight: "800", fontSize: "13px" }}>
                                    {I(r?.ini)}
                                  </span>
                                  {" "}
                                  <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                                    {" "}
                                    <span style={{ display: "flex", gap: "6px", alignItems: "center", minWidth: "0" }}>
                                      <span style={{ fontWeight: `${r?.fw ?? ""}`, fontSize: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as React.CSSProperties}>
                                        {I(r?.name)}
                                      </span>
                                      <span style={{ fontSize: "10px", fontWeight: "800", padding: "1px 5px", background: `${r?.sbg ?? ""}`, color: `${r?.sfg ?? ""}` } as React.CSSProperties}>
                                        {I(r?.score)}
                                      </span>
                                    </span>
                                    {" "}
                                    <span style={{ fontSize: "13px", color: "var(--color-neutral-700)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {I(r?.preview)}
                                    </span>
                                    {" "}
                                  </span>
                                  {" "}
                                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px" }}>
                                    {" "}
                                    <span style={{ fontSize: "11px", color: `${r?.timeColor ?? ""}` } as React.CSSProperties}>
                                      {I(r?.time)}
                                    </span>
                                    {" "}
                                    <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                                      {" "}
                                      <span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", padding: "2px 5px", background: `${r?.tbg ?? ""}`, color: `${r?.tfg ?? ""}` } as React.CSSProperties}>
                                        {I(r?.tag)}
                                      </span>
                                      {" "}
                                      {r?.hasUnread ? (
                                        <>
                                          <span style={{ minWidth: "18px", height: "18px", borderRadius: "9px", background: "var(--wa-green)", color: "#fff", fontSize: "11px", fontWeight: "800", display: "grid", placeItems: "center", padding: "0 5px" }}>
                                            {I(r?.unread)}
                                          </span>
                                        </>
                                      ) : null}
                                      {" "}
                                    </span>
                                    {" "}
                                  </span>
                                  {" "}
                                </button>
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
                    {$v.showChat ? (
                      <>
                        {" "}
                        <div style={{ display: "flex", flexDirection: "column", minHeight: "0", minWidth: "0" }}>
                          {" "}
                          {$v.inboxEmpty ? (
                            <>
                              {" "}
                              <div style={{ flex: "1", background: "var(--wa-bg)", display: "flex", alignItems: "center", padding: "40px" }}>
                                <div style={{ maxWidth: "360px", color: "var(--wa-ink)" }}>
                                  <div style={{ fontWeight: "800", fontSize: "22px", marginBottom: "6px" }}>
                                    Your first chat will open here
                                  </div>
                                  <div style={{ fontSize: "14px", opacity: ".75" }}>
                                    You can jump in any time with the AI / Human switch.
                                  </div>
                                </div>
                              </div>
                              {" "}
                            </>
                          ) : null}
                          {" "}
                          {$v.hasChat ? (
                            <>
                              {" "}
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderBottom: "2px solid var(--color-divider)", flex: "none" }}>
                                {" "}
                                {$v.isMobile ? (
                                  <>
                                    <button className="btn btn-icon" onClick={$v.backToList} aria-label="Back" style={{ width: "36px", height: "36px", marginLeft: "-6px" }}>
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                        <path d="m15 18-6-6 6-6" />
                                      </svg>
                                    </button>
                                  </>
                                ) : null}
                                {" "}
                                <span style={{ width: "38px", height: "38px", flex: "none", background: "var(--color-neutral-300)", display: "grid", placeItems: "center", fontWeight: "800", fontSize: "13px" }}>
                                  {I($v.chat?.ini)}
                                </span>
                                {" "}
                                <div style={{ minWidth: "0", flex: "1", lineHeight: "1.25" }}>
                                  {" "}
                                  <div style={{ fontWeight: "800", fontSize: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {I($v.chat?.name)}
                                  </div>
                                  {" "}
                                  <div style={{ fontSize: "12px", color: "var(--color-neutral-700)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {I($v.chat?.phone)}
                                  </div>
                                  {" "}
                                </div>
                                {" "}
                                <div role="group" aria-label="Who replies" style={{ display: "flex", border: "2px solid var(--color-text)", flex: "none" }}>
                                  {" "}
                                  <button onClick={$v.setAI} style={{ padding: "6px 12px", border: "0", background: `${$v.aiBg ?? ""}`, color: `${$v.aiFg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer" } as React.CSSProperties}>
                                    AI
                                  </button>
                                  {" "}
                                  <button onClick={$v.setHuman} style={{ padding: "6px 12px", border: "0", background: `${$v.huBg ?? ""}`, color: `${$v.huFg ?? ""}`, font: "inherit", fontSize: "13px", fontWeight: "800", cursor: "pointer" } as React.CSSProperties}>
                                    Human
                                  </button>
                                  {" "}
                                </div>
                                {" "}
                                {$v.showLeadBtn ? (
                                  <>
                                    <button className="btn btn-secondary" onClick={$v.openSheet} style={{ flex: "none", padding: "7px 10px" }}>
                                      Lead
                                    </button>
                                  </>
                                ) : null}
                                {" "}
                              </div>
                              {" "}
                              {$v.stripWaiting ? (
                                <>
                                  {" "}
                                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", padding: "9px 14px", background: "var(--color-accent-100)", color: "var(--color-accent-800)", fontSize: "13px", borderBottom: "1px solid var(--color-divider)", flex: "none" }}>
                                    {" "}
                                    <span style={{ flex: "1", minWidth: "180px" }}>
                                      <strong>
                                        Needs you:
                                      </strong>
                                      {" "}{I($v.chatWhy)}{". Maya is paused on this chat."}
                                    </span>
                                    {" "}
                                    <button className="btn btn-primary" onClick={$v.setHuman} style={{ padding: "6px 12px" }}>
                                      Take over
                                    </button>
                                    {" "}
                                  </div>
                                  {" "}
                                </>
                              ) : null}
                              {" "}
                              {$v.stripHuman ? (
                                <>
                                  {" "}
                                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", padding: "9px 14px", background: "var(--color-surface)", fontSize: "13px", borderBottom: "1px solid var(--color-divider)", flex: "none" }}>
                                    {" "}
                                    <span style={{ flex: "1", minWidth: "180px" }}>
                                      <strong>
                                        {I($v.chatOwner)}{" replying."}
                                      </strong>
                                      {" Maya is paused and won’t message."}
                                    </span>
                                    {" "}
                                    <button className="btn btn-secondary" onClick={$v.setAI} style={{ padding: "6px 12px" }}>
                                      Return to AI
                                    </button>
                                    {" "}
                                  </div>
                                  {" "}
                                </>
                              ) : null}
                              {" "}
                              {$v.stripAI ? (
                                <>
                                  {" "}
                                  <div style={{ padding: "8px 14px", fontSize: "13px", color: "var(--color-neutral-700)", borderBottom: "1px solid var(--color-divider)", flex: "none" }}>
                                    Maya is handling this chat. Switch to Human to reply yourself.
                                  </div>
                                  {" "}
                                </>
                              ) : null}
                              {" "}
                              <div ref={$v.msgsRef} style={{ flex: "1", minHeight: "0", overflow: "auto", background: "var(--wa-bg)", padding: "16px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                                {" "}
                                <div style={{ alignSelf: "center", fontSize: "11px", fontWeight: "600", letterSpacing: ".04em", background: "var(--wa-in)", color: "var(--wa-ink)", padding: "4px 10px", opacity: ".85" }}>
                                  {I($v.dayChip)}
                                </div>
                                {" "}
                                {L($v.chatMsgs).map((m: any, $index: number) => (
                                  <Fragment key={$index}>
                                    {" "}
                                    {m?.isSys ? (
                                      <>
                                        <div style={{ alignSelf: "center", maxWidth: "90%", textAlign: "center", fontSize: "12px", background: "var(--wa-sys)", color: "var(--wa-ink)", padding: "5px 10px", margin: "4px 0" }}>
                                          {I(m?.t)}
                                        </div>
                                      </>
                                    ) : null}
                                    {" "}
                                    {m?.isBubble ? (
                                      <>
                                        {" "}
                                        <div style={{ alignSelf: `${m?.align ?? ""}`, maxWidth: `${$v.bubbleMax ?? ""}`, background: `${m?.bg ?? ""}`, color: "var(--wa-ink)", padding: "6px 9px 4px", boxShadow: "0 1px 0.5px rgba(11,20,26,.13)" } as React.CSSProperties}>
                                          {" "}
                                          {m?.hasWho ? (
                                            <>
                                              <div style={{ fontSize: "12px", fontWeight: "600", color: `${m?.whoColor ?? ""}`, marginBottom: "2px" } as React.CSSProperties}>
                                                {I(m?.who)}
                                              </div>
                                            </>
                                          ) : null}
                                          {" "}
                                          {m?.hasDoc ? (
                                            <>
                                              {" "}
                                              <div style={{ display: "flex", gap: "10px", alignItems: "center", background: "rgba(0,0,0,.05)", padding: "8px", marginBottom: "4px", minWidth: "220px" }}>
                                                {" "}
                                                <span style={{ width: "32px", height: "38px", background: "#e2412f", color: "#fff", fontSize: "10px", fontWeight: "800", display: "grid", placeItems: "center" }}>
                                                  PDF
                                                </span>
                                                {" "}
                                                <span style={{ fontSize: "13px", lineHeight: "1.3" }}>
                                                  <span style={{ fontWeight: "600", display: "block" }}>
                                                    {I(m?.doc)}
                                                  </span>
                                                  <span style={{ opacity: ".65" }}>
                                                    {I(m?.docMeta)}
                                                  </span>
                                                </span>
                                                {" "}
                                              </div>
                                              {" "}
                                            </>
                                          ) : null}
                                          {" "}
                                          {m?.hasText ? (
                                            <>
                                              <div style={{ fontSize: "14px", lineHeight: "1.4", whiteSpace: "pre-wrap", textWrap: "pretty" }}>
                                                {I(m?.t)}
                                              </div>
                                            </>
                                          ) : null}
                                          {" "}
                                          <div style={{ fontSize: "11px", opacity: ".6", textAlign: "right", marginTop: "1px" }}>
                                            {I(m?.tm)}
                                          </div>
                                          {" "}
                                          {m?.hasList ? (
                                            <>
                                              {" "}
                                              <div style={{ borderTop: "1px solid rgba(127,127,127,.25)", marginTop: "4px", display: "flex", flexDirection: "column" }}>
                                                {" "}
                                                {L(m?.list).map((o: any, $index: number) => (
                                                  <Fragment key={$index}>
                                                    <div style={{ padding: "7px 0", textAlign: "center", color: "var(--wa-link)", fontWeight: "600", fontSize: "14px", borderBottom: "1px solid rgba(127,127,127,.15)" }}>
                                                      {I(o)}
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
                                      </>
                                    ) : null}
                                    {" "}
                                  </Fragment>
                                ))}
                                {" "}
                              </div>
                              {" "}
                              <div style={{ borderTop: "2px solid var(--color-divider)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", flex: "none" }}>
                                {" "}
                                {$v.showSuggestion ? (
                                  <>
                                    {" "}
                                    <button onClick={$v.useSuggestion} className="hover:[background:var(--color-accent-200)]!" style={{ display: "flex", gap: "8px", alignItems: "flex-start", textAlign: "left", border: "1px solid var(--color-accent)", background: "var(--color-accent-100)", color: "var(--color-accent-800)", padding: "8px 10px", font: "inherit", fontSize: "13px", lineHeight: "1.4", cursor: "pointer" }}>
                                      {" "}
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2", strokeLinejoin: "round", flex: "none", marginTop: "1px" }}>
                                        <path d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.5l-1.9-5.9L4 10.7l6.1-1.9z" />
                                      </svg>
                                      {" "}
                                      <span>
                                        <strong>
                                          Suggested reply
                                        </strong>
                                        {" · "}{I($v.chatSuggestion)}
                                      </span>
                                      {" "}
                                    </button>
                                    {" "}
                                  </>
                                ) : null}
                                {" "}
                                {$v.winClosed ? (
                                  <>
                                    {" "}
                                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", padding: "10px 12px", background: "var(--color-surface)", fontSize: "13px" }}>
                                      {" "}
                                      <span style={{ flex: "1", minWidth: "200px" }}>
                                        <strong>
                                          24-hour window closed.
                                        </strong>
                                        {" "}{I($v.chatFirst)}{" last wrote on Wednesday, so WhatsApp only allows an approved template."}
                                      </span>
                                      {" "}
                                      <button className="btn btn-primary" onClick={$v.openTpl} style={{ padding: "6px 12px" }}>
                                        Send a template
                                      </button>
                                      {" "}
                                    </div>
                                    {" "}
                                  </>
                                ) : null}
                                {" "}
                                {$v.winOpen ? (
                                  <>
                                    {" "}
                                    <div style={{ display: "flex", gap: "8px" }}>
                                      {" "}
                                      <input className="input" value={$v.draft ?? ""} onChange={$v.onDraft} onKeyDown={$v.onKey} placeholder={$v.composerPh} disabled={$v.composerOff} style={{ flex: "1", minHeight: "44px", fontSize: "15px" }} />
                                      {" "}
                                      <button onClick={$v.send} disabled={$v.sendOff} aria-label="Send" style={{ width: "44px", height: "44px", flex: "none", background: "var(--wa-dark)", color: "#fff", border: "0", display: "grid", placeItems: "center", cursor: "pointer", opacity: `${$v.sendOpacity ?? ""}` } as React.CSSProperties}>
                                        {" "}
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                          <path d="m22 2-7 20-4-9-9-4Z" />
                                          <path d="M22 2 11 13" />
                                        </svg>
                                        {" "}
                                      </button>
                                      {" "}
                                    </div>
                                    {" "}
                                  </>
                                ) : null}
                                {" "}
                              </div>
                              {" "}
                            </>
                          ) : null}
                          {" "}
                        </div>
                        {" "}
                      </>
                    ) : null}
                    {" "}
                    {$v.leadVisible ? (
                      <>
                        {" "}
                        <div onClick={$v.closeSheet} style={{ display: `${$v.sheetBackdrop ?? ""}`, position: "absolute", inset: "0", background: "color-mix(in srgb,var(--color-neutral-900) 50%,transparent)", zIndex: "30" } as React.CSSProperties}></div>
                        {" "}
                        <aside style={{ position: `${$v.lpPos ?? ""}`, left: "0", right: "0", bottom: "0", maxHeight: `${$v.lpMaxH ?? ""}`, zIndex: "31", overflow: "auto", background: "var(--color-bg)", borderLeft: `${$v.lpBl ?? ""}`, borderTop: `${$v.lpBt ?? ""}`, boxShadow: `${$v.lpSh ?? ""}`, minHeight: "0" } as React.CSSProperties}>
                          {" "}
                          <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            {" "}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              {" "}
                              <span style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-700)", fontWeight: "600" }}>
                                Lead card · pinned
                              </span>
                              {" "}
                              {$v.sheetMode ? (
                                <>
                                  <button className="btn btn-icon" onClick={$v.closeSheet} aria-label="Close" style={{ width: "32px", height: "32px" }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2" }}>
                                      <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                </>
                              ) : null}
                              {" "}
                            </div>
                            {" "}
                            <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                              {" "}
                              <span style={{ width: "60px", height: "60px", flex: "none", background: `${$v.lead?.bg ?? ""}`, color: `${$v.lead?.fg ?? ""}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: "1" } as React.CSSProperties}>
                                <span style={{ fontSize: "24px", fontWeight: "800" }}>
                                  {I($v.lead?.score)}
                                </span>
                                <span style={{ fontSize: "11px", fontWeight: "600", marginTop: "3px" }}>
                                  {I($v.lead?.label)}
                                </span>
                              </span>
                              {" "}
                              <div style={{ minWidth: "0" }}>
                                <div style={{ fontWeight: "800", fontSize: "20px", lineHeight: "1.15" }}>
                                  {I($v.lead?.name)}
                                </div>
                                <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                                  {I($v.lead?.phone)}{" · "}{I($v.lead?.lang)}
                                </div>
                              </div>
                              {" "}
                            </div>
                            {" "}
                            <div style={{ borderTop: "2px solid var(--color-text)", display: "flex", flexDirection: "column" }}>
                              {" "}
                              <div style={{ padding: "10px 0", borderBottom: "1px solid var(--color-divider)" }}>
                                <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                                  Need
                                </div>
                                <div style={{ fontWeight: "600", fontSize: "14px" }}>
                                  {I($v.lead?.need)}
                                </div>
                              </div>
                              {" "}
                              <div style={{ padding: "10px 0", borderBottom: "1px solid var(--color-divider)" }}>
                                <div style={{ fontSize: "12px", color: "var(--color-neutral-700)", marginBottom: "4px" }}>
                                  Qualifying answers
                                </div>
                                {" "}
                                {L($v.lead?.answers).map((a: any, $index: number) => (
                                  <Fragment key={$index}>
                                    <div style={{ fontSize: "14px", display: "flex", gap: "8px", alignItems: "baseline" }}>
                                      <span style={{ width: "5px", height: "5px", background: "var(--color-text)", flex: "none", display: "block", transform: "translateY(-2px)" }}></span>
                                      {I(a)}
                                    </div>
                                  </Fragment>
                                ))}
                                {" "}
                              </div>
                              {" "}
                              <div style={{ padding: "10px 0", borderBottom: "1px solid var(--color-divider)" }}>
                                <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                                  Booking
                                </div>
                                <div style={{ fontSize: "14px", fontWeight: "600" }}>
                                  {I($v.lead?.booking)}
                                </div>
                              </div>
                              {" "}
                              {$v.lead?.hasWhy ? (
                                <>
                                  <div style={{ padding: "10px 0", borderBottom: "1px solid var(--color-divider)" }}>
                                    <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                                      Why handed over
                                    </div>
                                    <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-accent-700)" }}>
                                      {I($v.lead?.why)}
                                    </div>
                                  </div>
                                </>
                              ) : null}
                              {" "}
                              <div style={{ padding: "10px 0", borderBottom: "1px solid var(--color-divider)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                {" "}
                                <div>
                                  <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                                    Mood
                                  </div>
                                  <div style={{ fontSize: "14px" }}>
                                    {I($v.lead?.mood)}
                                  </div>
                                </div>
                                {" "}
                                <div>
                                  <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                                    Owner
                                  </div>
                                  <div style={{ fontSize: "14px" }}>
                                    {I($v.lead?.owner)}
                                  </div>
                                </div>
                                {" "}
                              </div>
                              {" "}
                            </div>
                            {" "}
                            <div style={{ background: "var(--color-surface)", padding: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                              {" "}
                              <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: "600", color: "var(--color-neutral-700)" }}>
                                AI summary
                              </div>
                              {" "}
                              <div style={{ fontSize: "14px", lineHeight: "1.5", textWrap: "pretty" }}>
                                {I($v.lead?.summary)}
                              </div>
                              {" "}
                              <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: "600", color: "var(--color-accent-700)", marginTop: "6px" }}>
                                Suggested next step
                              </div>
                              {" "}
                              <div style={{ fontSize: "14px", fontWeight: "600", lineHeight: "1.45", textWrap: "pretty" }}>
                                {I($v.lead?.next)}
                              </div>
                              {" "}
                            </div>
                            {" "}
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {" "}
                              <button className="btn btn-secondary" onClick={$v.goLeads}>
                                Open lead
                              </button>
                              {" "}
                              <button className="btn btn-ghost" onClick={$v.goCalendar}>
                                See booking
                              </button>
                              {" "}
                            </div>
                            {" "}
                            <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                              {"Source: "}{I($v.lead?.source)}
                            </div>
                            {" "}
                          </div>
                          {" "}
                        </aside>
                        {" "}
                      </>
                    ) : null}
                    {" "}
                  </div>
                  {" "}
                </>
              ) : null}
              {" "}
              {$v.isFeatures ? (
                <>
                  {" "}
                  <div data-screen-label="07 Features" style={{ padding: `${$v.pad ?? ""}`, display: "flex", flexDirection: "column", gap: "32px", maxWidth: "960px", width: "100%" } as React.CSSProperties}>
                    {" "}
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      {" "}
                      <h1 style={{ margin: "0", fontSize: `${$v.h1 ?? ""}` } as React.CSSProperties}>
                        What Maya does for you
                      </h1>
                      {" "}
                      <p style={{ margin: "0", color: "var(--color-neutral-700)", fontSize: "15px" }}>
                        Switch anything on or off. Changes apply from the next message.
                      </p>
                      {" "}
                      <div style={{ background: "var(--color-surface)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {" "}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
                          {" "}
                          <span style={{ fontSize: "14px" }}>
                            <strong style={{ fontSize: "22px", fontWeight: "800" }}>
                              {"≈ "}{I($v.estFmt)}
                            </strong>
                            {" credits a month with what’s on"}
                          </span>
                          {" "}
                          <span style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                            {"Your plan gives "}{I($v.planCreditsFmt)}
                          </span>
                          {" "}
                        </div>
                        {" "}
                        <div style={{ height: "8px", background: "var(--color-neutral-300)" }}>
                          <div style={{ height: "8px", width: `${$v.estPct ?? ""}`, background: "var(--color-text)" } as React.CSSProperties}></div>
                        </div>
                        {" "}
                      </div>
                      {" "}
                    </div>
                    {" "}
                    {L($v.featureGroups).map((g: any, $index: number) => (
                      <Fragment key={$index}>
                        {" "}
                        <section style={{ display: "flex", flexDirection: "column" }}>
                          {" "}
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px" }}>
                            {" "}
                            <h2 style={{ fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", margin: "0" }}>
                              {I(g?.name)}
                            </h2>
                            {" "}
                            <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                              {I(g?.summary)}
                            </span>
                            {" "}
                          </div>
                          {" "}
                          {L(g?.items).map((f: any, $index: number) => (
                            <Fragment key={$index}>
                              {" "}
                              <div onClick={f?.onRow} style={{ display: "grid", gridTemplateColumns: `${$v.rowCols ?? ""}`, gap: "6px 24px", alignItems: "center", padding: "16px 0", borderBottom: "1px solid var(--color-divider)", cursor: `${f?.cursor ?? ""}` } as React.CSSProperties}>
                                {" "}
                                <div style={{ minWidth: "0" }}>
                                  {" "}
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                    {" "}
                                    <span style={{ fontWeight: "600", fontSize: "15px", color: `${f?.nameColor ?? ""}` } as React.CSSProperties}>
                                      {I(f?.name)}
                                    </span>
                                    {" "}
                                    {f?.locked ? (
                                      <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2.2", color: "var(--color-neutral-700)" }}>
                                          <rect width="18" height="11" x="3" y="11" />
                                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                      </>
                                    ) : null}
                                    {" "}
                                    {f?.hasPlan ? (
                                      <>
                                        <span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: ".06em", textTransform: "uppercase", padding: "2px 6px", border: `1px solid ${f?.planBd ?? ""}`, color: `${f?.planFg ?? ""}`, background: `${f?.planBg ?? ""}` } as React.CSSProperties}>
                                          {I(f?.planLabel)}
                                        </span>
                                      </>
                                    ) : null}
                                    {" "}
                                  </div>
                                  {" "}
                                  <div style={{ fontSize: "13px", color: "var(--color-neutral-700)", marginTop: "2px", textWrap: "pretty" }}>
                                    {I(f?.desc)}
                                  </div>
                                  {" "}
                                  {$v.isMobile ? (
                                    <>
                                      <div style={{ fontSize: "12px", marginTop: "4px", fontWeight: "600" }}>
                                        {I(f?.cr)}
                                      </div>
                                    </>
                                  ) : null}
                                  {" "}
                                  {f?.isTiming ? (
                                    <>
                                      {" "}
                                      <select className="input" value={$v.remind ?? ""} onChange={$v.onRemind} style={{ width: "auto", minHeight: "32px", marginTop: "8px", fontSize: "13px", padding: "4px 8px" }}>
                                        {" "}
                                        <option value="48">
                                          Send 48 hours before
                                        </option>
                                        {" "}
                                        <option value="24">
                                          Send 24 hours before
                                        </option>
                                        {" "}
                                        <option value="12">
                                          Send 12 hours before
                                        </option>
                                        {" "}
                                        <option value="6">
                                          Send 6 hours before
                                        </option>
                                        {" "}
                                      </select>
                                      {" "}
                                    </>
                                  ) : null}
                                  {" "}
                                </div>
                                {" "}
                                {$v.isDesktop ? (
                                  <>
                                    <div style={{ fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", color: `${f?.crColor ?? ""}` } as React.CSSProperties}>
                                      {I(f?.cr)}
                                    </div>
                                  </>
                                ) : null}
                                {" "}
                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                  {" "}
                                  {f?.locked ? (
                                    <>
                                      <button className="btn btn-secondary" onClick={f?.onRow} style={{ padding: "6px 12px" }}>
                                        Upgrade
                                      </button>
                                    </>
                                  ) : null}
                                  {" "}
                                  {f?.isToggle ? (
                                    <>
                                      {" "}
                                      <button onClick={f?.flip} role="switch" aria-checked={f?.on} aria-label={f?.name} style={{ width: "48px", height: "28px", flex: "none", border: `2px solid ${f?.trackBd ?? ""}`, background: `${f?.trackBg ?? ""}`, position: "relative", padding: "0", cursor: "pointer" } as React.CSSProperties}>
                                        {" "}
                                        <span style={{ position: "absolute", top: "2px", left: `${f?.knobLeft ?? ""}`, width: "20px", height: "20px", background: `${f?.knobBg ?? ""}`, transition: "left .15s ease" } as React.CSSProperties}></span>
                                        {" "}
                                      </button>
                                      {" "}
                                    </>
                                  ) : null}
                                  {" "}
                                  {f?.isSeg ? (
                                    <>
                                      {" "}
                                      <div style={{ display: "flex", border: "2px solid var(--color-text)" }}>
                                        {" "}
                                        <button onClick={$v.setHours247} style={{ padding: "5px 10px", border: "0", background: `${$v.h247Bg ?? ""}`, color: `${$v.h247Fg ?? ""}`, font: "inherit", fontSize: "12px", fontWeight: "800", cursor: "pointer", whiteSpace: "nowrap" } as React.CSSProperties}>
                                          24×7
                                        </button>
                                        {" "}
                                        <button onClick={$v.setHoursAfter} style={{ padding: "5px 10px", border: "0", background: `${$v.hAfterBg ?? ""}`, color: `${$v.hAfterFg ?? ""}`, font: "inherit", fontSize: "12px", fontWeight: "800", cursor: "pointer", whiteSpace: "nowrap" } as React.CSSProperties}>
                                          After hours
                                        </button>
                                        {" "}
                                      </div>
                                      {" "}
                                    </>
                                  ) : null}
                                  {" "}
                                </div>
                                {" "}
                              </div>
                              {" "}
                            </Fragment>
                          ))}
                          {" "}
                        </section>
                        {" "}
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                </>
              ) : null}
              {" "}
              {$v.isLeads ? (
                <>
                  <PakkaLeads industry={$v.indKey} isMobile={$v.isMobile} firstDay={$v.firstDay} onOpenChat={$v.openChatById} />
                </>
              ) : null}
              {" "}
              {$v.isCalendar ? (
                <>
                  <PakkaCalendar industry={$v.indKey} isMobile={$v.isMobile} />
                </>
              ) : null}
              {" "}
              {$v.isAgent ? (
                <>
                  <PakkaAgent industry={$v.indKey} isMobile={$v.isMobile} />
                </>
              ) : null}
              {" "}
              {$v.isKnowledge ? (
                <>
                  <PakkaKnowledge industry={$v.indKey} isMobile={$v.isMobile} firstDay={$v.firstDay} />
                </>
              ) : null}
              {" "}
              {$v.isTemplates ? (
                <>
                  <PakkaTemplates industry={$v.indKey} isMobile={$v.isMobile} />
                </>
              ) : null}
              {" "}
              {$v.isBilling ? (
                <>
                  <PakkaBilling isMobile={$v.isMobile} plan={$v.planKey} creditsLeft={$v.creditsLeftNum} creditsTotal={$v.creditsTotalNum} trial={$v.isTrial} onTopup={$v.openTopup} onChangePlan={$v.changePlan} />
                </>
              ) : null}
              {" "}
              {$v.isSettings ? (
                <>
                  <PakkaSettings industry={$v.indKey} isMobile={$v.isMobile} section={$v.setSection} nonce={$v.setNonce} plan={$v.planKey} productName={$v.productName} onOpenTemplates={$v.goTemplates} />
                </>
              ) : null}
              {" "}
              {$v.isTeam ? (
                <>
                  <PakkaTeam industry={$v.indKey} isMobile={$v.isMobile} />
                </>
              ) : null}
              {" "}
            </main>
            {" "}
            {$v.showTabbar ? (
              <>
                {" "}
                <nav style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", borderTop: "2px solid var(--color-divider)", background: "var(--color-bg)", flex: "none" }}>
                  {" "}
                  {L($v.tabItems).map((t: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <button onClick={t?.go} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", padding: "8px 0 10px", minHeight: "56px", border: "0", borderTop: `3px solid ${t?.bar ?? ""}`, marginTop: "-2px", background: "transparent", color: `${t?.fg ?? ""}`, font: "inherit", fontSize: "11px", fontWeight: "600", cursor: "pointer" } as React.CSSProperties}>
                        {" "}
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d={t?.d} />
                        </svg>
                        {" "}{I(t?.label)}{" "}
                        {t?.hasBadge ? (
                          <>
                            <span style={{ position: "absolute", top: "5px", left: "calc(50% + 6px)", fontSize: "10px", fontWeight: "800", background: "var(--color-accent)", color: "#fff", padding: "0 5px" }}>
                              {I(t?.badge)}
                            </span>
                          </>
                        ) : null}
                        {" "}
                      </button>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                </nav>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.moreOpen ? (
              <>
                {" "}
                <div onClick={$v.closeMore} style={{ position: "absolute", inset: "0", background: "color-mix(in srgb,var(--color-neutral-900) 50%,transparent)", zIndex: "40" }}></div>
                {" "}
                <div style={{ position: "absolute", left: "0", right: "0", bottom: "0", zIndex: "41", background: "var(--color-bg)", borderTop: "2px solid var(--color-text)", padding: "8px 0 16px" }}>
                  {" "}
                  <div style={{ padding: "10px 20px", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-700)", fontWeight: "600" }}>
                    More
                  </div>
                  {" "}
                  {L($v.moreItems).map((n: any, $index: number) => (
                    <Fragment key={$index}>
                      {" "}
                      <button onClick={n?.go} style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "14px 20px", border: "0", borderBottom: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", font: "inherit", fontSize: "16px", fontWeight: "600", textAlign: "left", cursor: "pointer" }}>
                        {" "}
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d={n?.d} />
                        </svg>
                        {I(n?.label)}{" "}
                      </button>
                      {" "}
                    </Fragment>
                  ))}
                  {" "}
                </div>
                {" "}
              </>
            ) : null}
            {" "}
            {$v.hasToast ? (
              <>
                {" "}
                <div style={{ position: "absolute", left: "16px", bottom: `${$v.toastBottom ?? ""}`, zIndex: "60", background: "var(--color-text)", color: "var(--color-bg)", padding: "12px 16px", fontSize: "14px", fontWeight: "600", boxShadow: "var(--shadow-md)" } as React.CSSProperties}>
                  {I($v.toast)}
                </div>
                {" "}
              </>
            ) : null}
          </div>
          {$v.modalTopup ? (
            <>
              {" "}
              <div className="dialog-backdrop" onClick={$v.closeModal} style={{ position: "absolute", zIndex: "50" }}>
                {" "}
                <div className="dialog" onClick={$v.stop} style={{ width: "min(480px,100%)", background: "var(--color-bg)" }}>
                  {" "}
                  <div className="dialog-title">
                    Top up credits
                  </div>
                  {" "}
                  <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
                    {"You have "}
                    <strong style={{ color: "var(--color-text)" }}>
                      {I($v.creditsLeftFmt)}
                    </strong>
                    {" credits left. Top-up credits last 90 days and are used after your plan credits."}
                  </div>
                  {" "}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {" "}
                    {L($v.packs).map((p: any, $index: number) => (
                      <Fragment key={$index}>
                        {" "}
                        <button onClick={p?.pick} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: "12px", alignItems: "center", padding: "14px", border: `2px solid ${p?.bd ?? ""}`, background: `${p?.bg ?? ""}`, color: "var(--color-text)", font: "inherit", textAlign: "left", cursor: "pointer" } as React.CSSProperties}>
                          {" "}
                          <span style={{ width: "16px", height: "16px", border: `2px solid ${p?.bd ?? ""}`, display: "grid", placeItems: "center" } as React.CSSProperties}>
                            <span style={{ width: "8px", height: "8px", background: `${p?.dot ?? ""}`, display: "block" } as React.CSSProperties}></span>
                          </span>
                          {" "}
                          <span>
                            <span style={{ fontWeight: "800", fontSize: "16px" }}>
                              {I(p?.credits)}{" credits"}
                            </span>
                            <span style={{ display: "block", fontSize: "12px", color: "var(--color-neutral-700)" }}>
                              {I(p?.leads)}
                            </span>
                          </span>
                          {" "}
                          <span style={{ fontWeight: "800", fontSize: "16px" }}>
                            {I(p?.price)}
                          </span>
                          {" "}
                        </button>
                        {" "}
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                  <div style={{ fontSize: "13px", background: "var(--color-surface)", padding: "10px 12px" }}>
                    {"Using a lot? "}
                    <strong>
                      Pro
                    </strong>
                    {" gives 8,000 credits a month for ₹9,999 — cheaper per credit. "}
                    <a href="#" onClick={$v.goBillingFromModal}>
                      Compare plans
                    </a>
                  </div>
                  {" "}
                  <div className="dialog-actions" style={{ justifyContent: "flex-start" }}>
                    {" "}
                    <button className="btn btn-primary" onClick={$v.payTopup}>
                      {"Pay "}{I($v.packPrice)}{" with UPI"}
                    </button>
                    {" "}
                    <button className="btn btn-secondary" onClick={$v.closeModal}>
                      Cancel
                    </button>
                    {" "}
                  </div>
                  {" "}
                </div>
                {" "}
              </div>
            </>
          ) : null}
          {$v.modalTopupDone ? (
            <>
              {" "}
              <div className="dialog-backdrop" onClick={$v.closeModal} style={{ position: "absolute", zIndex: "50" }}>
                {" "}
                <div className="dialog" onClick={$v.stop} style={{ background: "var(--color-bg)" }}>
                  {" "}
                  <div style={{ width: "48px", height: "48px", background: "var(--color-text)", color: "var(--color-bg)", display: "grid", placeItems: "center" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "3", strokeLinecap: "square" }}>
                      <path d="M4 12l5 5L20 6" />
                    </svg>
                  </div>
                  {" "}
                  <div className="dialog-title">
                    {I($v.doneCredits)}{" credits added"}
                  </div>
                  {" "}
                  <div style={{ fontSize: "15px" }}>
                    {"New balance: "}
                    <strong>
                      {I($v.creditsLeftFmt)}
                    </strong>
                    . Maya is replying to chats again.
                  </div>
                  {" "}
                  <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                    {"Receipt sent to "}{I($v.biz?.email)}{" · GST invoice in Billing"}
                  </div>
                  {" "}
                  <div className="dialog-actions" style={{ justifyContent: "flex-start" }}>
                    <button className="btn btn-primary" onClick={$v.closeModal}>
                      Done
                    </button>
                  </div>
                  {" "}
                </div>
                {" "}
              </div>
            </>
          ) : null}
          {$v.modalTpl ? (
            <>
              {" "}
              <div className="dialog-backdrop" onClick={$v.closeModal} style={{ position: "absolute", zIndex: "50" }}>
                {" "}
                <div className="dialog" onClick={$v.stop} style={{ width: "min(520px,100%)", background: "var(--color-bg)" }}>
                  {" "}
                  <div className="dialog-title">
                    {"Send a template to "}{I($v.chatFirst)}
                  </div>
                  {" "}
                  <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
                    {"Only Meta-approved templates can start a chat after 24 hours. When "}{I($v.chatFirst)}{" replies, you can type freely again."}
                  </div>
                  {" "}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {" "}
                    {L($v.tplOpts).map((tp: any, $index: number) => (
                      <Fragment key={$index}>
                        {" "}
                        <button onClick={tp?.pick} style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: "12px", alignItems: "start", padding: "12px", border: `2px solid ${tp?.bd ?? ""}`, background: `${tp?.bg ?? ""}`, color: "var(--color-text)", font: "inherit", textAlign: "left", cursor: "pointer" } as React.CSSProperties}>
                          {" "}
                          <span style={{ width: "16px", height: "16px", marginTop: "2px", border: `2px solid ${tp?.bd ?? ""}`, display: "grid", placeItems: "center" } as React.CSSProperties}>
                            <span style={{ width: "8px", height: "8px", background: `${tp?.dot ?? ""}`, display: "block" } as React.CSSProperties}></span>
                          </span>
                          {" "}
                          <span style={{ minWidth: "0" }}>
                            <span style={{ display: "block", fontWeight: "800", fontSize: "15px" }}>
                              {I(tp?.label)}
                            </span>
                            <span style={{ display: "block", fontSize: "13px", color: "var(--color-neutral-700)", marginTop: "2px" }}>
                              {I(tp?.text)}
                            </span>
                          </span>
                          {" "}
                          <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                            {I(tp?.cat)}{" · "}{I(tp?.cr)}{" cr"}
                          </span>
                          {" "}
                        </button>
                        {" "}
                      </Fragment>
                    ))}
                    {" "}
                  </div>
                  {" "}
                  <div className="dialog-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                    {" "}
                    <button className="btn btn-primary" onClick={$v.sendTpl}>
                      Send template
                    </button>
                    {" "}
                    <button className="btn btn-secondary" onClick={$v.goTemplates}>
                      Manage templates
                    </button>
                    {" "}
                  </div>
                  {" "}
                </div>
                {" "}
              </div>
            </>
          ) : null}
          {$v.modalUpgrade ? (
            <>
              {" "}
              <div className="dialog-backdrop" onClick={$v.closeModal} style={{ position: "absolute", zIndex: "50" }}>
                {" "}
                <div className="dialog" onClick={$v.stop} style={{ width: "min(480px,100%)", background: "var(--color-bg)" }}>
                  {" "}
                  <span style={{ alignSelf: "flex-start", fontSize: "10px", fontWeight: "800", letterSpacing: ".06em", textTransform: "uppercase", padding: "2px 6px", background: "var(--color-accent)", color: "#fff" }}>
                    {I($v.upPlan)}
                  </span>
                  {" "}
                  <div className="dialog-title">
                    {I($v.upFeature)}{" is on the "}{I($v.upPlan)}{" plan"}
                  </div>
                  {" "}
                  <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
                    {I($v.upDesc)}
                  </div>
                  {" "}
                  <table className="table" style={{ fontSize: "14px" }}>
                    {" "}
                    <thead>
                      <tr>
                        <th></th>
                        <th>
                          {I($v.planName)}{" · now"}
                        </th>
                        <th>
                          {I($v.upPlan)}
                        </th>
                      </tr>
                    </thead>
                    {" "}
                    <tbody>
                      {" "}
                      {L($v.upRows).map((u: any, $index: number) => (
                        <Fragment key={$index}>
                          <tr>
                            <td style={{ color: "var(--color-neutral-700)" }}>
                              {I(u?.k)}
                            </td>
                            <td>
                              {I(u?.a)}
                            </td>
                            <td style={{ fontWeight: "800" }}>
                              {I(u?.b)}
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                      {" "}
                    </tbody>
                    {" "}
                  </table>
                  {" "}
                  <div style={{ fontSize: "13px", color: "var(--color-neutral-700)" }}>
                    Upgrades start today. You get extra credits for the rest of this month.
                  </div>
                  {" "}
                  <div className="dialog-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                    {" "}
                    <button className="btn btn-primary" onClick={$v.doUpgrade}>
                      {"Upgrade to "}{I($v.upPlan)}
                    </button>
                    {" "}
                    <button className="btn btn-secondary" onClick={$v.goBillingFromModal}>
                      Compare all plans
                    </button>
                    {" "}
                  </div>
                  {" "}
                </div>
                {" "}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

const PakkaApp = createDC("Pakka App First Round", PakkaAppLogic, renderPakkaApp);
export default PakkaApp;

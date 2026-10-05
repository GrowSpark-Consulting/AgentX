"use client";
/* eslint-disable */
// Minimal runtime that reproduces the semantics the original design ran on:
//  • a logic class (`DCLogic`) whose state updates synchronously, with a React host re-rendering it
//  • render values = { ...props, ...logic.renderVals() }
//  • every component wrapped in a plain <div class="sc-host">
//  • interpolated values rendered inside <span class="sc-interp">, null/boolean rendered as nothing
import React from "react";

export class DCLogic {
  [key: string]: any;
  props: any;
  state: any = {};
  __host: any;
  constructor(props: any) {
    this.props = props || {};
  }
  setState(update: any, cb?: () => void) {
    this.__host && this.__host.__setLogicState(update, cb);
  }
  forceUpdate() {
    this.__host && this.__host.forceUpdate();
  }
  componentDidMount() {}
  componentDidUpdate(_prevProps: any) {}
  componentWillUnmount() {}
  renderVals(): any {
    return {};
  }
}

export function createDC(name: string, Logic: new (props: any) => DCLogic, render: (vals: any) => React.ReactNode) {
  class Host extends React.Component<any, { __v: number }> {
    static displayName = name.replace(/\s+/g, "");
    logic: DCLogic;
    constructor(props: any) {
      super(props);
      this.state = { __v: 0 };
      this.logic = new Logic(props);
      this.logic.__host = this;
    }
    __setLogicState(update: any, cb?: () => void) {
      const prev = this.logic.state;
      const patch = typeof update === "function" ? update(prev) : update;
      this.logic.state = { ...prev, ...patch };
      this.setState((s) => ({ __v: s.__v + 1 }), cb);
    }
    componentDidMount() {
      this.logic.componentDidMount();
    }
    componentDidUpdate(prevProps: any) {
      this.logic.componentDidUpdate(prevProps);
    }
    componentWillUnmount() {
      this.logic.componentWillUnmount();
    }
    render() {
      this.logic.props = this.props;
      const vals = { ...this.props, ...(this.logic.renderVals() || {}) };
      return (
        <div className="sc-host" data-sc-name={name}>
          {render(vals)}
        </div>
      );
    }
  }
  return Host;
}

/** Interpolation: mirrors how `{{ value }}` text bindings were rendered. */
export function I(v: any): React.ReactNode {
  if (v === undefined || v === null || typeof v === "boolean") return null;
  if (React.isValidElement(v) || Array.isArray(v)) return v as React.ReactNode;
  return <span className="sc-interp">{String(v)}</span>;
}

/** List binding: anything that isn't an array renders as an empty list. */
export function L(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

/** A whole-attribute style binding may be a CSS string or a style object. */
export function css(v: any): React.CSSProperties | undefined {
  if (typeof v !== "string") return v ?? undefined;
  const o: any = {};
  for (const decl of v.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    o[prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = decl.slice(i + 1).trim();
  }
  return o;
}

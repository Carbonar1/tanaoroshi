"use client";

import React from "react";

type Props = { children: React.ReactNode; fallback?: React.ReactNode };
type State = { error: Error | null };

// 「上の帯」や「流れの案内」などで予期しないエラーが出ても、画面全体を落とさない。
// エラーが起きたときは fallback（省略時は何も表示しない）を代わりに描く。
export default class SafeBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[SafeBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

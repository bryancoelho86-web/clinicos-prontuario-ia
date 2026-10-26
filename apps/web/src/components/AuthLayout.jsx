import React from "react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center page-paper-bg px-4 relative overflow-hidden">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-5">
            <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <p
            className="text-[11px] font-medium uppercase mb-2"
            style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.14em', color: 'var(--text-secondary)' }}
          >
            Clínica Exemplo
          </p>
          <h1
            className="text-[32px] inline-block pb-1"
            style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: 'var(--heading-accent)', borderBottom: '1px solid var(--gold)' }}
          >
            {title}
          </h1>
          {subtitle && <p className="text-muted-foreground mt-3">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm p-8" style={{ borderTop: '3px solid var(--gold)' }}>
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}

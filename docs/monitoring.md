# Token Usage & Monitoring Tools

To maintain visibility on token usage and avoid cost limits, the following monitoring tools are recommended. Run these commands in your terminal:

- **ccusage**: `npx ccusage@latest`
  Provides token usage from local logs with daily, session, and 5-hour window reports.

- **ccburn**: `npx ccburn --compact`
  Visual burn-up charts showing if you'll hit 100% of your limits before reset. You can feed `ccburn --json` back into Claude for self-regulation.

- **Claude-Code-Usage-Monitor**: 
  A real-time terminal dashboard with burn rate and predictive warnings.

- **ccstatusline / claude-powerline**: 
  Tools to add active token usage statistics directly to your terminal status bar or prompt.
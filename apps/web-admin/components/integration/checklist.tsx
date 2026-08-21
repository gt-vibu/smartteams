import { Card, CardContent, CardDescription, CardHeader, CardTitle, Icon } from '@smarteam/ui';

const checklist = [
  {
    title: 'Generate an mTLS-bound client',
    detail: 'Share the client_id and one-time client_secret with the BlizBooks integration owner.',
  },
  {
    title: 'Issue the least-privilege grant',
    detail: 'The grant binds the client to one organization and an explicit scope set.',
  },
  {
    title: 'Configure OAuth in BlizBooks',
    detail: 'Use POST /v1/oauth/token with client credentials and the registered certificate.',
  },
  {
    title: 'Configure webhook verification',
    detail:
      'Smarteam signs outbound events with RSA-SHA256; the private key remains deployment-managed.',
  },
] as const;

export function IntegrationChecklist() {
  return (
    <Card className="h-fit border-primary/15 bg-primary/[0.035] shadow-none">
      <CardHeader>
        <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" name="clipboard" />
        </div>
        <CardTitle>Connection checklist</CardTitle>
        <CardDescription>
          What BlizBooks needs before its first authenticated request.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {checklist.map((item, index) => (
          <div className="flex gap-3" key={item.title}>
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-primary/20 text-[11px] font-bold text-primary">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        ))}
        <div className="mt-1 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/5 p-3 text-xs leading-5 text-warning-foreground">
          <Icon className="mt-0.5 size-4 shrink-0" name="warning" />
          <p>
            Never paste a private signing key or client secret into this UI. Keep deployment secrets
            in the configured secret manager.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

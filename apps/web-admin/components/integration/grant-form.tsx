'use client';

import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle, Button, Icon, Input, Select } from '@smarteam/ui';
import {
  createFederationGrant,
  type AdminSession,
  type FederationClientResult,
  type FederationGrantResult,
  type OrganizationResult,
} from '../../lib/api-client';
import { FEDERATION_SCOPES, todayInputValue } from '../../lib/integration';
import { FormField } from './form-field';

export function GrantForm({
  session,
  organization,
  client,
  grant,
  onCreated,
}: {
  session: AdminSession;
  organization: OrganizationResult | null;
  client: FederationClientResult | null;
  grant: FederationGrantResult | null;
  onCreated: (result: FederationGrantResult) => void;
}) {
  const [clientId, setClientId] = useState(client?.client.id ?? '');
  const [organizationId, setOrganizationId] = useState(organization?.id ?? '');
  const [scopes, setScopes] = useState<string[]>(() => FEDERATION_SCOPES.map(({ code }) => code));
  const [effect, setEffect] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [startsAt, setStartsAt] = useState(todayInputValue());
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('Authorize the BlizBooks UAT integration');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleScope(code: string) {
    setScopes((current) =>
      current.includes(code) ? current.filter((scope) => scope !== code) : [...current, code],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await createFederationGrant(session, {
          clientId,
          organizationId,
          scopes,
          effect,
          startsAt,
          endsAt,
          reason,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The federation grant could not be created.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (grant) {
    return (
      <Alert className="border-success/20 bg-success/5 text-success-foreground">
        <AlertTitle className="flex items-center gap-2">
          <Icon className="size-4" name="check" /> Access grant is active
        </AlertTitle>
        <AlertDescription>
          Grant <code className="rounded bg-success/10 px-1.5 py-0.5">{grant.id}</code> is ready for
          the federation client.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error && (
        <Alert className="border-destructive/20 bg-destructive/5 text-destructive">
          <AlertTitle>Could not create grant</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          hint="Database UUID, not public client_id"
          id="grant-client-id"
          label="Federation client ID"
        >
          <Input
            id="grant-client-id"
            onChange={(event) => setClientId(event.target.value)}
            required
            value={clientId}
          />
        </FormField>
        <FormField hint="Database UUID" id="grant-organization-id" label="Organization ID">
          <Input
            id="grant-organization-id"
            onChange={(event) => setOrganizationId(event.target.value)}
            required
            value={organizationId}
          />
        </FormField>
        <FormField id="grant-starts" label="Starts on">
          <Input
            id="grant-starts"
            onChange={(event) => setStartsAt(event.target.value)}
            required
            type="date"
            value={startsAt}
          />
        </FormField>
        <FormField hint="Optional" id="grant-ends" label="Ends on">
          <Input
            id="grant-ends"
            min={startsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            type="date"
            value={endsAt}
          />
        </FormField>
        <FormField id="grant-effect" label="Access effect">
          <Select
            id="grant-effect"
            onChange={(event) => {
              if (event.target.value === 'ALLOW' || event.target.value === 'DENY')
                setEffect(event.target.value);
            }}
            value={effect}
          >
            <option value="ALLOW">Allow selected scopes</option>
            <option value="DENY">Deny selected scopes</option>
          </Select>
        </FormField>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium text-foreground">Federation scopes</legend>
        <p className="text-xs leading-5 text-muted-foreground">
          The complete UAT capability set is selected by default. Remove anything BlizBooks will not
          use before creating the grant.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEDERATION_SCOPES.map((scope) => (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors has-checked:border-primary/35 has-checked:bg-primary/5"
              key={scope.code}
            >
              <input
                checked={scopes.includes(scope.code)}
                className="mt-0.5 size-4 accent-primary"
                onChange={() => toggleScope(scope.code)}
                type="checkbox"
              />
              <span>
                <span className="block text-sm font-medium">{scope.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {scope.description}
                </span>
                <code className="mt-1 block text-[10px] text-primary">{scope.code}</code>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <FormField hint="Required for the audit record" id="grant-reason" label="Reason">
        <Input
          id="grant-reason"
          minLength={5}
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </FormField>
      <div className="flex justify-end">
        <Button disabled={busy || scopes.length === 0} type="submit">
          {busy ? 'Applying grant…' : 'Create access grant'}{' '}
          {!busy && <Icon className="size-4" name="shield" />}
        </Button>
      </div>
    </form>
  );
}

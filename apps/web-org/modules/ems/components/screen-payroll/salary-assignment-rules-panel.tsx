'use client';

import { LoadingIndicator, Badge, Button, DatePicker, Input, Label, Select } from '@smarteam/ui';
import type { PayrollAssignmentRule, PayrollPolicy } from '@smarteam/contracts';
import { useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { useDepartments } from '../../hooks/use-departments';
import { useOrganization } from '../../hooks/use-organization';
import { payrollRepository } from '../../repositories/payroll.repository';
import { localDateKey } from '../../lib/local-date';

type CriterionKey = 'departmentIds' | 'branchIds' | 'employmentTypes' | 'jobTitles' | 'gradeValues';
type Editor = { id?: string; name: string; payrollPolicyId: string; conditions: Array<{ criterion: CriterionKey; value: string }>; priority: string; effectiveFrom: string; effectiveTo: string; enabled: boolean };
const emptyEditor = (): Editor => ({ name: '', payrollPolicyId: '', conditions: [{ criterion: 'departmentIds', value: '' }], priority: '100', effectiveFrom: localDateKey(), effectiveTo: '', enabled: true });
const labels: Record<CriterionKey, string> = {
  departmentIds: 'Department', branchIds: 'Branch', employmentTypes: 'Employment type', jobTitles: 'Job title', gradeValues: 'Grade',
};
const employmentTypes = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'];

export function SalaryAssignmentRulesPanel({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const { session } = useSession();
  const departments = useDepartments();
  const organization = useOrganization();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const rules = useAsyncResource<PayrollAssignmentRule[]>(
    () => payrollRepository.listAssignmentRules(organizationId),
    [organizationId, refresh],
  );
  const policies = useAsyncResource<PayrollPolicy[]>(
    () => payrollRepository.listPolicies(organizationId),
    [organizationId],
  );
  const choicesFor = (criterion: CriterionKey): Array<{ value: string; label: string }> => criterion === 'departmentIds'
    ? departments.departments.map((item) => ({ value: item.id, label: item.name }))
    : criterion === 'branchIds'
      ? organization.branches.map((item) => ({ value: item.id, label: item.name }))
      : criterion === 'employmentTypes'
        ? employmentTypes.map((value) => ({ value, label: value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) }))
        : [];
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !session) return;
    setSaving(true); setError('');
    try {
      const criteria: Partial<Record<CriterionKey, string[]>> = {};
      for (const condition of editor.conditions) {
        const value = condition.value.trim();
        if (!value) continue;
        (criteria[condition.criterion] ??= []).push(value);
      }
      if (!Object.keys(criteria).length) throw new Error('Add at least one employee match condition.');
      await payrollRepository.saveAssignmentRule(organizationId, {
        ...(editor.id ? { id: editor.id } : {}),
        name: editor.name.trim(), payrollPolicyId: editor.payrollPolicyId, criteria,
        priority: Number(editor.priority), effectiveFrom: editor.effectiveFrom,
        ...(editor.effectiveTo ? { effectiveTo: editor.effectiveTo } : {}), enabled: editor.enabled,
      });
      setEditor(null); setRefresh((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this salary rule.');
    } finally { setSaving(false); }
  };
  const edit = (rule: PayrollAssignmentRule) => {
    const conditions = Object.entries(rule.criteria).flatMap(([key, values]) => (values ?? []).map((value) => ({ criterion: key as CriterionKey, value })));
    setEditor({ id: rule.id, name: rule.name, payrollPolicyId: rule.payrollPolicyId, conditions: conditions.length ? conditions : [{ criterion: 'departmentIds', value: '' }], priority: String(rule.priority), effectiveFrom: rule.effectiveFrom.slice(0, 10), effectiveTo: rule.effectiveTo?.slice(0, 10) ?? '', enabled: rule.enabled });
  };
  const policyName = new Map(policies.data?.map((policy) => [policy.id, policy.name ?? 'Salary structure']));

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Salary assignment rules">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Who gets each salary structure?</h2><p className="mt-1 max-w-2xl text-xs text-muted-foreground">Set a default in Payroll policy. Add rules for departments, branches, employment types, job titles or grades. A lower priority number wins; equal-priority matches for different structures are reported as a conflict.</p></div>
        {canWrite && <Button size="sm" type="button" onClick={() => { setError(''); setEditor(emptyEditor()); }}>Add assignment rule</Button>}
      </div>
      {(rules.loading || policies.loading) && <LoadingIndicator variant="panel" label="Loading salary rules" className="py-5 text-center text-xs text-muted-foreground" />}
      {(rules.error || policies.error) && <p className="text-xs text-destructive" role="alert">{rules.error || policies.error}</p>}
      {!rules.loading && !rules.error && (rules.data?.length ?? 0) === 0 && <p className="rounded-lg border border-dashed border-border px-4 py-5 text-xs text-muted-foreground">No category rules yet. Employees will inherit the organization default structure.</p>}
      {!!rules.data?.length && <div className="divide-y divide-border rounded-lg border border-border">
        {rules.data.map((rule) => <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5" key={rule.id}>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs">{rule.name}</strong><Badge variant={rule.enabled ? 'success' : 'secondary'}>{rule.enabled ? 'Active' : 'Paused'}</Badge><span className="text-[11px] text-muted-foreground">Priority {rule.priority}</span></div><p className="mt-1 text-[11px] text-muted-foreground">{policyName.get(rule.payrollPolicyId) ?? rule.payrollPolicy?.name ?? 'Structure'} · {Object.entries(rule.criteria).flatMap(([key, values]) => (values ?? []).map((value) => `${labels[key as CriterionKey] ?? key}: ${value}`)).join(' · ')} · From {rule.effectiveFrom.slice(0, 10)}</p></div>
          {canWrite && <Button size="sm" type="button" variant="outline" onClick={() => edit(rule)}>Edit</Button>}
        </div>)}
      </div>}
      {editor && <form onSubmit={(event) => void save(event)} className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
        <h3 className="text-xs font-semibold">{editor.id ? 'Edit salary rule' : 'New salary rule'}</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="salary-rule-name">Rule name</Label><Input id="salary-rule-name" value={editor.name} maxLength={100} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="e.g. Engineering team" required /></div>
          <div className="space-y-1"><Label htmlFor="salary-rule-policy">Salary structure</Label><Select id="salary-rule-policy" value={editor.payrollPolicyId} onChange={(event) => setEditor({ ...editor, payrollPolicyId: event.target.value })} required><option value="">Choose a structure</option>{(policies.data ?? []).map((policy) => <option key={policy.id} value={policy.id}>{policy.name ?? 'Salary structure'}</option>)}</Select></div>
          <div className="space-y-2 sm:col-span-2 xl:col-span-3"><Label>Employee match conditions</Label><p className="text-[11px] text-muted-foreground">All selected categories must match; multiple values within one category are alternatives.</p>{editor.conditions.map((condition, index) => { const choices = choicesFor(condition.criterion); return <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={index}><Select aria-label={`Condition ${index + 1} category`} value={condition.criterion} onChange={(event) => { const conditions = [...editor.conditions]; conditions[index] = { criterion: event.target.value as CriterionKey, value: '' }; setEditor({ ...editor, conditions }); }}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>{choices.length ? <Select aria-label={`Condition ${index + 1} value`} value={condition.value} onChange={(event) => { const conditions = [...editor.conditions]; conditions[index] = { ...condition, value: event.target.value }; setEditor({ ...editor, conditions }); }} required><option value="">Choose a value</option>{choices.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</Select> : <Input aria-label={`Condition ${index + 1} value`} value={condition.value} maxLength={100} onChange={(event) => { const conditions = [...editor.conditions]; conditions[index] = { ...condition, value: event.target.value }; setEditor({ ...editor, conditions }); }} placeholder={condition.criterion === 'jobTitles' ? 'Enter the job title' : 'Enter the grade'} required />}<Button type="button" variant="outline" disabled={editor.conditions.length <= 1} onClick={() => setEditor({ ...editor, conditions: editor.conditions.filter((_, itemIndex) => itemIndex !== index) })}>Remove</Button></div>; })}<Button type="button" size="sm" variant="outline" onClick={() => setEditor({ ...editor, conditions: [...editor.conditions, { criterion: 'departmentIds', value: '' }] })}>Add condition</Button></div>
          <div className="space-y-1"><Label htmlFor="salary-rule-priority">Priority (lower wins)</Label><Input id="salary-rule-priority" type="number" min="1" max="10000" step="1" value={editor.priority} onChange={(event) => setEditor({ ...editor, priority: event.target.value })} required /></div>
          <div className="space-y-1"><Label htmlFor="salary-rule-from">Effective from</Label><DatePicker id="salary-rule-from" value={editor.effectiveFrom} onChange={(value) => setEditor({ ...editor, effectiveFrom: value })} /></div>
          <div className="space-y-1"><Label htmlFor="salary-rule-to">Effective to (optional)</Label><DatePicker id="salary-rule-to" value={editor.effectiveTo} onChange={(value) => setEditor({ ...editor, effectiveTo: value })} /></div>
          <label className="flex items-center gap-2 pt-5 text-xs"><input type="checkbox" checked={editor.enabled} onChange={(event) => setEditor({ ...editor, enabled: event.target.checked })} /> Rule is active</label>
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</Button></div>
      </form>}
    </section>
  );
}

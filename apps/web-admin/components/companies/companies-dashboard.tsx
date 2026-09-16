'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button, Card, Icon, Input } from '@smarteam/ui';
import {
  deactivateOrganization,
  listOrganizations,
  type OnboardOrganizationResult,
  type OrganizationSummary,
} from '../../lib/api-client';
import { OnboardCompanyDialog } from './onboard-company-dialog';
import { CredentialConfirmationDialog } from './credential-confirmation-dialog';
import { CompanyRow } from './company-row';
import { CompaniesEmptyRow, CompaniesLoadingRow } from './companies-table-states';
import { CompaniesStats } from './companies-stats';

export function CompaniesDashboard() {
  const [companies, setCompanies] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnboardDialog, setShowOnboardDialog] = useState(false);
  const [onboardResult, setOnboardResult] = useState<OnboardOrganizationResult | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const fetchCompanies = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOrganizations();
      setCompanies(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load companies.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCompanies();
  }, []);

  const handleDeactivate = async (company: OrganizationSummary) => {
    const confirmReason = window.prompt(
      `Are you sure you want to deactivate ${company.name}? Please provide a reason:`,
      'Deactivated by Super Admin',
    );
    if (!confirmReason) return;

    setDeactivatingId(company.id);
    try {
      await deactivateOrganization(company.id, confirmReason);
      await fetchCompanies();
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : 'Failed to deactivate organization.');
    } finally {
      setDeactivatingId(null);
    }
  };

  const filteredCompanies = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.slug.toLowerCase().includes(term) ||
        c.adminUser?.email.toLowerCase().includes(term) ||
        c.adminUser?.displayName.toLowerCase().includes(term),
    );
  }, [companies, searchTerm]);

  return (
    <section className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Companies
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={fetchCompanies}
            size="sm"
            type="button"
            variant="outline"
            disabled={loading}
          >
            <Icon className={`size-4 ${loading ? 'animate-spin' : ''}`} name="refresh" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={() => setShowOnboardDialog(true)} size="sm" type="button">
            <Icon className="size-4" name="plus" />
            <span>Add Company</span>
          </Button>
        </div>
      </div>

      <CompaniesStats companies={companies} />

      <div className="w-full sm:w-96">
        <Input
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search companies"
          value={searchTerm}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="size-4 shrink-0" name="warning" />
            <span>{error}</span>
          </div>
          <Button onClick={fetchCompanies} size="sm" variant="outline">
            Retry
          </Button>
        </div>
      )}

      {/* Companies Table */}
      <Card className="overflow-hidden border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground font-semibold">
                <th className="py-3.5 px-4">Company Name & Slug</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Primary Admin</th>
                <th className="py-3.5 px-4">Timezone / Currency</th>
                <th className="py-3.5 px-4">Branches</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <CompaniesLoadingRow />
              ) : filteredCompanies.length === 0 ? (
                <CompaniesEmptyRow
                  searching={Boolean(searchTerm)}
                  onAdd={() => setShowOnboardDialog(true)}
                />
              ) : (
                filteredCompanies.map((company) => (
                  <CompanyRow
                    company={company}
                    deactivating={deactivatingId === company.id}
                    key={company.id}
                    onDeactivate={handleDeactivate}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Onboard Dialog */}
      {showOnboardDialog && (
        <OnboardCompanyDialog
          onClose={() => setShowOnboardDialog(false)}
          onSuccess={(result) => {
            setShowOnboardDialog(false);
            setOnboardResult(result);
            void fetchCompanies();
          }}
        />
      )}

      {/* Credential Confirmation Dialog */}
      {onboardResult && (
        <CredentialConfirmationDialog
          result={onboardResult}
          onClose={() => setOnboardResult(null)}
        />
      )}
    </section>
  );
}

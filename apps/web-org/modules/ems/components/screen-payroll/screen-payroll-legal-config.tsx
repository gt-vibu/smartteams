'use client';

import React, { useState } from 'react';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Input,
  Select,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@smarteam/ui';
import statutoryFixture from '../../data/fixtures/statutory-rules.json';
import { emsStorageAdapter } from '../../storage/storage.adapter';

const STORAGE_KEY_PAYROLL_CONFIG = 'ems_payroll_statutory_config';

interface ConfigState {
  registeredState: string;
  panNumber: string;
  tanNumber: string;
  epfRegCode: string;
  esiRegCode: string;
  ptRegCode: string;
  payFrequency: string;
  cutOffDay: number;
  payoutDay: number;
  lopMethod: 'CALENDAR_DAYS' | 'FIXED_30' | 'WORKING_DAYS';
  epfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
  gratuityEnabled: boolean;
  defaultTaxRegime: 'NEW_115BAC' | 'OLD_REGIME';
  taxYear: string;
}

const DEFAULT_CONFIG: ConfigState = statutoryFixture.defaultConfig as ConfigState;
const STATUTORY_RULES_CATALOG = statutoryFixture.rulesCatalog;
const STATE_PT_SLABS = statutoryFixture.statePtSlabs;

export function ScreenPayrollLegalConfig() {
  const [config, setConfig] = useState<ConfigState>(() => {
    return emsStorageAdapter.getItem<ConfigState>(STORAGE_KEY_PAYROLL_CONFIG, DEFAULT_CONFIG);
  });

  const [activeTab, setActiveTab] = useState<'RULES' | 'COMPANY_PROFILE' | 'PT_SLABS'>('RULES');
  const [selectedRuleModal, setSelectedRuleModal] = useState<
    (typeof STATUTORY_RULES_CATALOG)[0] | null
  >(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    emsStorageAdapter.setItem(STORAGE_KEY_PAYROLL_CONFIG, config);
    setToastMessage('Statutory parameters and company registrations saved successfully.');
    window.dispatchEvent(new CustomEvent('ems:storage:change'));
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-md shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Statutory Rules & Legal Compliance Engine
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Jurisdiction rules, state Professional Tax slabs, and organization registrations
            governing payroll calculations.
          </p>
        </div>

        <Badge variant="success" className="self-start sm:self-auto font-mono text-[10px]">
          Tax Year {config.taxYear} Compliant
        </Badge>
      </div>

      {/* Tabbed Experience */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === 'RULES' || value === 'COMPANY_PROFILE' || value === 'PT_SLABS') {
            setActiveTab(value);
          }
        }}
      >
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="RULES">
            Statutory Rule Sets ({STATUTORY_RULES_CATALOG.length})
          </TabsTrigger>
          <TabsTrigger value="COMPANY_PROFILE">Company Registrations</TabsTrigger>
          <TabsTrigger value="PT_SLABS">State PT Slabs</TabsTrigger>
        </TabsList>

        {/* TAB 1: STATUTORY RULES CATALOG */}
        <TabsContent value="RULES" className="space-y-4 mt-3">
          <Card>
            <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold">
                  Active Indian Statutory Framework Rules
                </CardTitle>
                <CardDescription className="mt-0.5">
                  Rules applied automatically to employee payroll calculations based on work
                  location and wage thresholds.
                </CardDescription>
              </div>
              <Badge variant="secondary">5 versioned rules</Badge>
            </CardHeader>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Rule Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Employee Share</TableHead>
                  <TableHead>Employer Share</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STATUTORY_RULES_CATALOG.map((rule) => (
                  <TableRow
                    key={rule.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <TableCell className="px-4">
                      <div className="font-semibold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                        <span>{rule.shortName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] font-normal py-0 px-2">
                        {rule.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-rose-600 dark:text-rose-400">
                      {rule.employeeRate}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {rule.employerRate}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {rule.wageThreshold}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedRuleModal(rule)}
                        className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40 h-7 px-2.5 font-medium"
                      >
                        View Info ⓘ
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* TAB 2: COMPANY PROFILE & STATUTORY REGISTRATIONS */}
        <TabsContent value="COMPANY_PROFILE" className="space-y-4 mt-3">
          <Card className="p-5">
            <form onSubmit={handleSaveConfig} className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Organization Statutory Identifiers
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  The payroll engine automatically derives state Professional Tax, EPF filing codes,
                  and TDS deductions from these credentials.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <Label className="text-xs">Primary Registered State</Label>
                  <Select
                    value={config.registeredState}
                    onChange={(e) => setConfig({ ...config, registeredState: e.target.value })}
                  >
                    <option value="Karnataka">Karnataka (Bangalore HQ)</option>
                    <option value="Maharashtra">Maharashtra (Mumbai)</option>
                    <option value="Telangana">Telangana (Hyderabad)</option>
                    <option value="Tamil Nadu">Tamil Nadu (Chennai)</option>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Tax Deduction Account (TAN)</Label>
                  <Input
                    type="text"
                    value={config.tanNumber}
                    onChange={(e) => setConfig({ ...config, tanNumber: e.target.value })}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Company PAN Number</Label>
                  <Input
                    type="text"
                    value={config.panNumber}
                    onChange={(e) => setConfig({ ...config, panNumber: e.target.value })}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">EPF Establishment Code</Label>
                  <Input
                    type="text"
                    value={config.epfRegCode}
                    onChange={(e) => setConfig({ ...config, epfRegCode: e.target.value })}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">ESIC Registration Code</Label>
                  <Input
                    type="text"
                    value={config.esiRegCode}
                    onChange={(e) => setConfig({ ...config, esiRegCode: e.target.value })}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Professional Tax Registration</Label>
                  <Input
                    type="text"
                    value={config.ptRegCode}
                    onChange={(e) => setConfig({ ...config, ptRegCode: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" size="sm">
                  Save Registrations
                </Button>
              </div>
            </form>
          </Card>
        </TabsContent>

        {/* TAB 3: STATE PT SLABS */}
        <TabsContent value="PT_SLABS" className="space-y-4 mt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATE_PT_SLABS.map((stateRule) => (
              <Card key={stateRule.state} className="p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="font-bold text-xs text-slate-900 dark:text-white">
                    {stateRule.state} Slabs
                  </span>
                  <Badge variant="secondary" className="font-mono text-[9px]">
                    {stateRule.ruleCode}
                  </Badge>
                </div>

                <div className="space-y-2 text-[11px] font-mono">
                  {stateRule.slabs.map((slab, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-50 dark:bg-card rounded border border-slate-200 dark:border-slate-800 flex justify-between items-center"
                    >
                      <div>
                        <div className="font-sans font-medium text-slate-700 dark:text-slate-300">
                          {slab.max
                            ? `₹${slab.min.toLocaleString()} – ₹${slab.max.toLocaleString()}`
                            : `Above ₹${slab.min.toLocaleString()}`}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">{slab.notes}</div>
                      </div>
                      <span className="font-bold text-rose-600 dark:text-rose-400">
                        {slab.monthlyAmount === 0 ? '₹0' : `₹${slab.monthlyAmount}/mo`}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Statutory Rule Inspector Modal */}
      {selectedRuleModal && (
        <Dialog open={Boolean(selectedRuleModal)} onOpenChange={() => setSelectedRuleModal(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedRuleModal.ruleName}</DialogTitle>
              <DialogDescription>{selectedRuleModal.act}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Statutory Authority:</span>
                  <span className="font-semibold">{selectedRuleModal.authority}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Employee Contribution:</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {selectedRuleModal.employeeContribution}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Employer Contribution:</span>
                  <span className="font-mono font-bold text-sky-700 dark:text-sky-400">
                    {selectedRuleModal.employerContribution}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Wage Ceiling / Cap:</span>
                  <span className="font-medium">{selectedRuleModal.wageCeiling}</span>
                </div>
              </div>

              <div className="p-3 bg-sky-50 dark:bg-card rounded-lg border border-sky-200 dark:border-sky-800/60 space-y-1">
                <span className="font-bold text-sky-900 dark:text-sky-300 text-[11px] block">
                  Applicability Criteria:
                </span>
                <p className="text-[11px] text-sky-800 dark:text-sky-400 leading-relaxed">
                  {selectedRuleModal.applicability}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setSelectedRuleModal(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
